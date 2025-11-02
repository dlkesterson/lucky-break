import { Body, Events, Vector as MatterVector } from 'physics/matter';
import type { IEventCollision, MatterBody, MatterEngine } from 'physics/matter';
import { createGameSessionManager, type GameSessionManager } from 'app/state';
import { createEventBus, type EventEnvelope, type LuckyBreakEventBus, type LuckyBreakEventName } from 'app/events';
import { createPhysicsWorld, type PhysicsWorldHandle } from 'physics/world';
import {
    createGravityWellHazard,
    createMovingBumperHazard,
    createPortalHazard,
    type HazardType,
} from 'physics/hazards';
import { gameConfig } from 'config/game';
import { getLevelSpec, getLoopScalingInfo, getPresetLevelCount, remixLevel, generateLevelLayout } from 'util/levels';
import { createRandomManager, type RandomManager } from 'util/random';
import { awardBrickPoints, createScoring, decayCombo, getMomentumMetrics, resetCombo } from 'util/scoring';
import { reflectOffPaddle } from 'util/paddle-reflection';
import { smoothTowards } from 'util/input-helpers';
import type { ReplayEvent, ReplayRecording } from 'app/replay-buffer';

type PhysicsBody = MatterBody;
type PhysicsEngine = MatterEngine;

const config = gameConfig;
const PLAYFIELD_WIDTH = config.playfield.width;
const PLAYFIELD_HEIGHT = config.playfield.height;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const PADDLE_Y = PLAYFIELD_HEIGHT - 70;
const BALL_RADIUS = 10;
const BALL_RESTITUTION = 0.98;
const STEP_MS = 1000 / 120;
const STEP_SECONDS = STEP_MS / 1000;
const AUTO_LAUNCH_DELAY = 0.45;
const MIN_VERTICAL_SPEED = 2.5;

interface BrickState {
    readonly body: PhysicsBody;
    hp: number;
    readonly initialHp: number;
    readonly row: number;
    readonly col: number;
}

interface HazardDescriptor {
    readonly id: string;
    readonly type: HazardType;
    readonly position: { readonly x: number; readonly y: number };
    readonly radius: number;
    readonly strength?: number;
    readonly impulse?: number;
    readonly direction?: { readonly x: number; readonly y: number };
    readonly exit?: { readonly x: number; readonly y: number };
    readonly cooldownSeconds?: number;
}

type HazardLookup = Map<number, HazardDescriptor>;

interface ReplayCursor {
    readonly events: readonly ReplayEvent[];
    index: number;
}

interface HeadlessMetrics {
    frames: number;
    durationMs: number;
    brickBreaks: number;
    paddleHits: number;
    wallHits: number;
    livesLost: number;
    speedSamples: number;
    speedTotal: number;
    currentVolley: number;
    longestVolley: number;
    hazardContacts: number;
    hazardContactsByType: Record<HazardType, number>;
    movingBumperImpacts: number;
    portalTransports: number;
}

export interface HeadlessSimulationOptions {
    readonly seed: number;
    readonly round: number;
    readonly durationMs: number;
    readonly replay?: ReplayRecording;
    readonly telemetry?: boolean;
}

export interface HeadlessSimulationResult {
    readonly sessionId: string;
    readonly seed: number;
    readonly round: number;
    readonly durationMs: number;
    readonly frames: number;
    readonly metrics: {
        readonly bricksBroken: number;
        readonly paddleHits: number;
        readonly wallHits: number;
        readonly livesLost: number;
        readonly averageFps: number;
        readonly bricksPerSecond: number;
        readonly hazardContacts: number;
        readonly hazardContactsByType: Record<HazardType, number>;
        readonly movingBumperImpacts: number;
        readonly portalTransports: number;
    };
    readonly volley: {
        readonly longestVolley: number;
        readonly averageImpactSpeed: number;
    };
    readonly events: readonly EventEnvelope<LuckyBreakEventName>[];
    readonly score: number;
    readonly snapshot: ReturnType<GameSessionManager['snapshot']>;
    readonly hazards: readonly HazardDescriptor[];
}

const collectEvents = (bus: LuckyBreakEventBus, enabled: boolean): (() => EventEnvelope<LuckyBreakEventName>[]) => {
    if (!enabled) {
        return () => [];
    }

    const collected: EventEnvelope<LuckyBreakEventName>[] = [];
    const names: LuckyBreakEventName[] = [
        'BrickBreak',
        'BrickHit',
        'PaddleHit',
        'WallHit',
        'LifeLost',
        'BallLaunched',
        'RoundCompleted',
        'ComboMilestoneReached',
    ];

    const unsubscribes = names.map((name) =>
        bus.subscribe(name, (event) => {
            collected.push(event);
        }),
    );

    return () => {
        unsubscribes.forEach((unsubscribe) => {
            unsubscribe();
        });
        return collected;
    };
};

const clampPaddleX = (value: number, width: number): number => {
    const halfWidth = width / 2;
    return Math.max(halfWidth, Math.min(PLAYFIELD_WIDTH - halfWidth, value));
};

const applySpeedClamps = (ball: PhysicsBody): void => {
    const velocity = ball.velocity;
    const speed = MatterVector.magnitude(velocity);
    if (!Number.isFinite(speed) || speed <= 0) {
        return;
    }

    const targetMin = config.ball.baseSpeed;
    const targetMax = config.ball.maxSpeed;
    let next = velocity;

    if (speed < targetMin) {
        const normalized = MatterVector.normalise(velocity);
        next = MatterVector.mult(normalized, targetMin);
    } else if (speed > targetMax) {
        const normalized = MatterVector.normalise(velocity);
        next = MatterVector.mult(normalized, targetMax);
    }

    if (Math.abs(next.y) < MIN_VERTICAL_SPEED) {
        const sign = next.y >= 0 ? 1 : -1;
        next = { x: next.x, y: sign * MIN_VERTICAL_SPEED };
    }

    Body.setVelocity(ball, next);
};

const createReplayCursor = (recording: ReplayRecording | undefined): ReplayCursor => ({
    events: recording?.events ?? [],
    index: 0,
});

const advanceReplay = (cursor: ReplayCursor, elapsedSeconds: number, random: RandomManager): {
    paddleTarget: number | null;
    launchRequested: boolean;
} => {
    let paddleTarget: number | null = null;
    let launchRequested = false;

    while (cursor.index < cursor.events.length) {
        const event = cursor.events[cursor.index];
        if (event.time > elapsedSeconds + 1e-6) {
            break;
        }

        cursor.index += 1;

        if (event.type === 'paddle-target') {
            paddleTarget = event.position ? event.position.x : null;
        } else if (event.type === 'launch') {
            launchRequested = true;
        } else if (event.type === 'seed-change' && Number.isFinite(event.seed)) {
            random.setSeed(event.seed);
        }
    }

    return { paddleTarget, launchRequested };
};

const setupBricks = (physics: PhysicsWorldHandle, random: RandomManager, round: number): {
    bricks: Map<number, BrickState>;
    total: number;
    hazards: readonly HazardDescriptor[];
    hazardLookup: HazardLookup;
} => {
    const levelIndex = Math.max(0, round - 1);
    const presetCount = getPresetLevelCount();
    const loopCount = Math.floor(levelIndex / presetCount);
    const baseSpec = getLevelSpec(levelIndex);
    const spec = loopCount > 0 ? remixLevel(baseSpec, loopCount) : baseSpec;
    const scaling = getLoopScalingInfo(loopCount);
    const layout = generateLevelLayout(
        spec,
        config.bricks.size.width,
        config.bricks.size.height,
        PLAYFIELD_WIDTH,
        {
            random: random.random,
            fortifiedChance: scaling.fortifiedChance,
            voidColumnChance: scaling.voidColumnChance,
            centerFortifiedBias: scaling.centerFortifiedBias,
            maxVoidColumns: scaling.maxVoidColumns,
        },
    );

    const bricks = new Map<number, BrickState>();
    const hazardLookup: HazardLookup = new Map();
    const hazardSummaries: HazardDescriptor[] = [];
    const brickWidth = config.bricks.size.width;
    const brickHeight = config.bricks.size.height;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    layout.bricks.forEach((brickSpec) => {
        const brickForm = brickSpec.form ?? 'rectangle';
        const body = physics.factory.brick({
            position: { x: brickSpec.x, y: brickSpec.y },
            size: { width: brickWidth, height: brickHeight },
            label: 'brick',
            isSensor: brickSpec.isSensor ?? false,
            shape: brickForm,
        });
        physics.add(body);
        bricks.set(body.id, {
            body,
            hp: brickSpec.hp,
            initialHp: brickSpec.hp,
            row: brickSpec.row,
            col: brickSpec.col,
        });

        if (brickSpec.breakable !== false) {
            const halfWidth = brickWidth / 2;
            const halfHeight = brickHeight / 2;
            minX = Math.min(minX, brickSpec.x - halfWidth);
            maxX = Math.max(maxX, brickSpec.x + halfWidth);
            minY = Math.min(minY, brickSpec.y - halfHeight);
            maxY = Math.max(maxY, brickSpec.y + halfHeight);
        }
    });

    const registerHazard = (descriptor: HazardDescriptor, body: PhysicsBody | undefined) => {
        hazardSummaries.push(descriptor);
        if (body) {
            hazardLookup.set(body.id, descriptor);
        }
    };

    const layoutHasBounds =
        layout.breakableCount > 0 &&
        Number.isFinite(minX) &&
        Number.isFinite(maxX) &&
        Number.isFinite(minY) &&
        Number.isFinite(maxY);

    if (layoutHasBounds) {
        const layoutWidth = Math.max(0, maxX - minX);
        const layoutHeight = Math.max(0, maxY - minY);

        if (loopCount >= 1 && (layoutWidth > 0 || layoutHeight > 0)) {
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const baseRadius = Math.max(layoutWidth, layoutHeight) * 0.35;
            const minRadius = Math.max(brickWidth, brickHeight) * 2.5;
            const maxRadius = Math.max(config.playfield.width, Math.max(brickWidth, brickHeight) * 10) * 0.45;
            const radius = Math.max(minRadius, Math.min(maxRadius, baseRadius));
            const strength = 0.0012 + loopCount * 0.00035;

            const gravityWell = createGravityWellHazard({
                id: `gravity-well-${levelIndex}`,
                position: { x: centerX, y: centerY },
                radius,
                strength,
                falloff: 'linear',
            });

            physics.addHazard(gravityWell);
            registerHazard(
                {
                    id: gravityWell.id,
                    type: 'gravity-well',
                    position: gravityWell.position,
                    radius: gravityWell.radius,
                    strength: gravityWell.strength,
                },
                gravityWell.body,
            );
        }

        if (loopCount >= 2 && layoutWidth > 120) {
            const bumperRadius = Math.max(brickWidth, brickHeight) * 0.6;
            const bumperPadding = Math.max(bumperRadius + 24, brickWidth * 0.75);
            const travelStartX = minX + bumperPadding;
            const travelEndX = maxX - bumperPadding;

            if (travelEndX - travelStartX >= bumperRadius * 0.5) {
                const centerY = (minY + maxY) / 2;
                const descriptorDirection = { x: 0, y: 0 };

                const movingBumper = createMovingBumperHazard({
                    id: `moving-bumper-${levelIndex}`,
                    start: { x: travelStartX, y: centerY },
                    end: { x: travelEndX, y: centerY },
                    radius: bumperRadius,
                    speed: Math.max(80, layoutWidth / 2),
                    impulse: 4 + loopCount * 0.6,
                    onPositionChange: (_pos, direction) => {
                        descriptorDirection.x = direction.x;
                        descriptorDirection.y = direction.y;
                    },
                });

                descriptorDirection.x = movingBumper.direction.x;
                descriptorDirection.y = movingBumper.direction.y;

                physics.addHazard(movingBumper);
                registerHazard(
                    {
                        id: movingBumper.id,
                        type: 'moving-bumper',
                        position: movingBumper.position,
                        radius: movingBumper.radius,
                        impulse: movingBumper.impulse,
                        direction: descriptorDirection,
                    },
                    movingBumper.body,
                );
            }
        }

        if (loopCount >= 3 && layoutWidth > 100 && layoutHeight > 80) {
            const portalRadius = Math.max(brickWidth, brickHeight) * 0.8;
            const centerX = (minX + maxX) / 2;
            const entryY = Math.min(maxY - portalRadius, minY + layoutHeight * 0.4);
            const exitYBase = Math.max(minY - portalRadius * 2, portalRadius + 40);
            const exitY = Math.min(config.playfield.height - portalRadius - 40, Math.max(exitYBase, maxY + portalRadius * 2));
            const portalExit = { x: centerX, y: exitY };

            const portalHazard = createPortalHazard({
                id: `portal-${levelIndex}`,
                entry: { x: centerX, y: entryY },
                exit: portalExit,
                radius: portalRadius,
                cooldownSeconds: 0.45,
            });

            physics.addHazard(portalHazard);
            registerHazard(
                {
                    id: portalHazard.id,
                    type: 'portal',
                    position: portalHazard.position,
                    radius: portalHazard.radius,
                    exit: portalHazard.exit,
                    cooldownSeconds: portalHazard.cooldownSeconds,
                },
                portalHazard.body,
            );
        }
    }

    return {
        bricks,
        total: layout.breakableCount,
        hazards: hazardSummaries,
        hazardLookup,
    };
};

export const runHeadlessEngine = (options: HeadlessSimulationOptions): HeadlessSimulationResult => {
    const durationMs = Math.max(STEP_MS, options.durationMs);
    const random = createRandomManager(options.seed);
    let elapsedMs = 0;
    const bus = createEventBus({ now: () => Math.round(elapsedMs) });
    const physics = createPhysicsWorld({
        gravity: 0,
        timeStepMs: STEP_MS,
        dimensions: {
            width: PLAYFIELD_WIDTH,
            height: PLAYFIELD_HEIGHT,
            wallThickness: 24,
        },
    });

    const session = createGameSessionManager({
        sessionId: `sim-${options.seed}-r${options.round}`,
        eventBus: bus,
        random: random.random,
        now: () => Math.round(elapsedMs),
    });

    const stopCollecting = collectEvents(bus, options.telemetry ?? false);

    const paddle = physics.factory.paddle({
        position: { x: PLAYFIELD_WIDTH / 2, y: PADDLE_Y },
        size: { width: PADDLE_WIDTH, height: PADDLE_HEIGHT },
        label: 'paddle',
    });
    physics.add(paddle);

    const ball = physics.factory.ball({
        position: { x: paddle.position.x, y: paddle.position.y - BALL_RADIUS - PADDLE_HEIGHT / 2 },
        radius: BALL_RADIUS,
        restitution: BALL_RESTITUTION,
        label: 'ball',
    });
    physics.add(ball);

    physics.attachBallToPaddle(ball, paddle, { x: 0, y: -BALL_RADIUS - PADDLE_HEIGHT / 2 });
    let ballAttached = true;
    let pendingLaunch = false;
    let autoLaunchTimer = 0;

    const bounds = physics.factory.bounds();
    physics.add(bounds);

    const replaySeed = options.replay?.seed;
    if (Number.isFinite(replaySeed)) {
        random.setSeed(replaySeed!);
    }

    const { bricks, total, hazards: hazardSummaries, hazardLookup } = setupBricks(physics, random, options.round);
    session.startRound({ breakableBricks: total });

    const scoring = createScoring();
    session.updateMomentum(getMomentumMetrics(scoring));
    const metrics: HeadlessMetrics = {
        frames: 0,
        durationMs: 0,
        brickBreaks: 0,
        paddleHits: 0,
        wallHits: 0,
        livesLost: 0,
        speedSamples: 0,
        speedTotal: 0,
        currentVolley: 0,
        longestVolley: 0,
        hazardContacts: 0,
        hazardContactsByType: {
            'gravity-well': 0,
            'moving-bumper': 0,
            portal: 0,
        },
        movingBumperImpacts: 0,
        portalTransports: 0,
    };

    const portalCooldowns = new Map<string, number>();
    const replayCursor = createReplayCursor(options.replay);
    const paddleTargetState = { x: paddle.position.x };

    let bricksRemaining = total;

    const handleBrickBreak = (brick: BrickState, impactVelocity: number) => {
        physics.remove(brick.body);
        bricks.delete(brick.body.id);
        bricksRemaining = Math.max(0, bricksRemaining - 1);
        metrics.brickBreaks += 1;
        metrics.currentVolley += 1;
        if (metrics.currentVolley > metrics.longestVolley) {
            metrics.longestVolley = metrics.currentVolley;
        }
        metrics.speedSamples += 1;
        metrics.speedTotal += impactVelocity;

        const points = awardBrickPoints(
            scoring,
            { comboDecayTime: config.scoring.comboDecayTime },
            {
                bricksRemaining,
                brickTotal: total,
                impactSpeed: impactVelocity,
                maxSpeed: config.ball.maxSpeed,
            },
        );

        session.recordBrickBreak({
            points,
            event: {
                row: brick.row,
                col: brick.col,
                impactVelocity,
                brickType: 'standard',
                initialHp: brick.initialHp,
                comboHeat: scoring.combo,
            },
            momentum: getMomentumMetrics(scoring),
        });

        session.recordEntropyEvent({
            type: 'brick-break',
            comboHeat: scoring.combo,
            impactVelocity,
            speed: impactVelocity,
        });
    };

    const handleBrickHit = (brick: BrickState, impactVelocity: number) => {
        brick.hp = Math.max(0, brick.hp - 1);
        if (brick.hp <= 0) {
            handleBrickBreak(brick, impactVelocity);
        } else {
            session.recordEntropyEvent({
                type: 'brick-hit',
                comboHeat: scoring.combo,
                impactVelocity,
                speed: impactVelocity,
            });
        }
    };

    const collisionHandler = (event: IEventCollision<PhysicsEngine>) => {
        for (const pair of event.pairs) {
            const { bodyA, bodyB } = pair;

            const resolveBall = () => (bodyA.label === 'ball' ? bodyA : bodyB);
            const resolveBrick = () => (bodyA.label === 'brick' ? bodyA : bodyB);
            const resolveWall = () => (bodyA.label.startsWith('wall-') ? bodyA : bodyB);
            const resolveHazard = () => (bodyA.label.startsWith('hazard-') ? bodyA : bodyB);
            const isHazardLabel = (label: string) => label.startsWith('hazard-');

            if ((bodyA.label === 'ball' && bodyB.label === 'brick') || (bodyB.label === 'ball' && bodyA.label === 'brick')) {
                const brickBody = resolveBrick();
                const brickState = bricks.get(brickBody.id);
                if (!brickState) {
                    continue;
                }
                const ballBody = resolveBall();
                const impactVelocity = MatterVector.magnitude(ballBody.velocity);
                handleBrickHit(brickState, impactVelocity);
            }

            if ((bodyA.label === 'ball' && bodyB.label === 'paddle') || (bodyB.label === 'ball' && bodyA.label === 'paddle')) {
                metrics.paddleHits += 1;
                const ballBody = resolveBall();
                reflectOffPaddle(ballBody, paddle, {
                    paddleWidth: PADDLE_WIDTH,
                    minSpeed: config.ball.baseSpeed,
                });
                session.recordEntropyEvent({
                    type: 'paddle-hit',
                    speed: MatterVector.magnitude(ballBody.velocity),
                    comboHeat: scoring.combo,
                });
            }

            if (
                (bodyA.label === 'ball' && bodyB.label.startsWith('wall-')) ||
                (bodyB.label === 'ball' && bodyA.label.startsWith('wall-'))
            ) {
                const wallBody = resolveWall();
                if (wallBody.label !== 'wall-bottom') {
                    metrics.wallHits += 1;
                }
                session.recordEntropyEvent({
                    type: 'wall-hit',
                    speed: MatterVector.magnitude(resolveBall().velocity),
                });
                continue;
            }

            if (
                (bodyA.label === 'ball' && isHazardLabel(bodyB.label)) ||
                (bodyB.label === 'ball' && isHazardLabel(bodyA.label))
            ) {
                const hazardBody = resolveHazard();
                const descriptor = hazardLookup.get(hazardBody.id);
                if (!descriptor) {
                    continue;
                }

                metrics.hazardContacts += 1;
                metrics.hazardContactsByType[descriptor.type] =
                    (metrics.hazardContactsByType[descriptor.type] ?? 0) + 1;

                if (descriptor.type === 'moving-bumper') {
                    const ballBody = resolveBall();
                    const offsetX = ballBody.position.x - descriptor.position.x;
                    const offsetY = ballBody.position.y - descriptor.position.y;
                    const distance = Math.hypot(offsetX, offsetY);
                    const direction = distance > 0 && Number.isFinite(distance)
                        ? { x: offsetX / distance, y: offsetY / distance }
                        : descriptor.direction ?? { x: 0, y: -1 };
                    const impulse = descriptor.impulse ?? 0;
                    if (impulse > 0) {
                        metrics.movingBumperImpacts += 1;
                        Body.setVelocity(ballBody, {
                            x: ballBody.velocity.x + direction.x * impulse,
                            y: ballBody.velocity.y + direction.y * impulse,
                        });
                    }
                } else if (descriptor.type === 'portal' && descriptor.exit) {
                    const ballBody = resolveBall();
                    const nowMs = elapsedMs;
                    const cooldownMs = Math.max(0, (descriptor.cooldownSeconds ?? 0) * 1000);
                    const lastTrigger = portalCooldowns.get(descriptor.id) ?? Number.NEGATIVE_INFINITY;
                    if (nowMs - lastTrigger >= cooldownMs) {
                        portalCooldowns.set(descriptor.id, nowMs);
                        const travelVector = {
                            x: descriptor.exit.x - descriptor.position.x,
                            y: descriptor.exit.y - descriptor.position.y,
                        };
                        const travelLength = Math.hypot(travelVector.x, travelVector.y);
                        const direction = travelLength > 0 && Number.isFinite(travelLength)
                            ? { x: travelVector.x / travelLength, y: travelVector.y / travelLength }
                            : { x: 0, y: -1 };
                        const safeOffset = Math.max(BALL_RADIUS * 1.75, descriptor.radius * 0.65 + 8);
                        Body.setPosition(ballBody, {
                            x: descriptor.exit.x + direction.x * safeOffset,
                            y: descriptor.exit.y + direction.y * safeOffset,
                        });
                        Body.setVelocity(ballBody, {
                            x: ballBody.velocity.x * 0.85 + direction.x * 2.2,
                            y: ballBody.velocity.y * 0.85 + direction.y * 2.2,
                        });
                        metrics.portalTransports += 1;
                    }
                }

                continue;
            }
        }
    };

    Events.on(physics.engine, 'collisionStart', collisionHandler);

    const detachBall = () => {
        if (!ballAttached) {
            return;
        }
        ballAttached = false;
        physics.detachBallFromPaddle(ball);
    };

    const launchBall = () => {
        detachBall();
        const angle = (Math.PI / 4) * (0.5 + random.random());
        const horizontalSign = random.boolean() ? 1 : -1;
        const direction = {
            x: Math.sin(angle) * horizontalSign,
            y: -Math.cos(angle),
        };
        const speed = config.ball.launchSpeed;
        Body.setVelocity(ball, {
            x: direction.x * speed,
            y: direction.y * speed,
        });
        session.recordEntropyEvent({ type: 'round-start' });
        bus.publish(
            'BallLaunched',
            {
                sessionId: session.snapshot().sessionId,
                position: { x: ball.position.x, y: ball.position.y },
                direction,
                speed,
            },
            Math.round(elapsedMs),
        );
    };

    const reattachBall = () => {
        physics.attachBallToPaddle(ball, paddle, { x: 0, y: -BALL_RADIUS - PADDLE_HEIGHT / 2 });
        ballAttached = true;
        pendingLaunch = false;
        autoLaunchTimer = 0;
        Body.setVelocity(ball, { x: 0, y: 0 });
    };

    const tick = () => {
        const elapsedSeconds = elapsedMs / 1000;
        const replayState = advanceReplay(replayCursor, elapsedSeconds, random);
        if (replayState.paddleTarget !== null) {
            paddleTargetState.x = clampPaddleX(replayState.paddleTarget, PADDLE_WIDTH);
        } else if (!options.replay) {
            const followX = ballAttached ? paddle.position.x : ball.position.x;
            paddleTargetState.x = clampPaddleX(followX, PADDLE_WIDTH);
        }
        if (replayState.launchRequested) {
            pendingLaunch = true;
        }

        if (ballAttached) {
            autoLaunchTimer += STEP_SECONDS;
            if (pendingLaunch || autoLaunchTimer >= AUTO_LAUNCH_DELAY) {
                launchBall();
                pendingLaunch = false;
            }
        }

        const desiredX = clampPaddleX(paddleTargetState.x ?? paddle.position.x, PADDLE_WIDTH);
        const nextX = smoothTowards(paddle.position.x, desiredX, STEP_SECONDS, {
            responsiveness: config.paddle.control.smoothResponsiveness,
            snapThreshold: config.paddle.control.snapThreshold,
        });
        paddleTargetState.x = desiredX;
        Body.setPosition(paddle, { x: clampPaddleX(nextX, PADDLE_WIDTH), y: PADDLE_Y });
        physics.updateBallAttachment(ball, { x: paddle.position.x, y: PADDLE_Y });

        physics.step(STEP_MS);

        if (!ballAttached) {
            applySpeedClamps(ball);
        }

        if (ball.position.y >= PLAYFIELD_HEIGHT + BALL_RADIUS * 2) {
            metrics.livesLost += 1;
            session.recordLifeLost('ball-drop');
            const comboBeforeReset = scoring.combo;
            resetCombo(scoring);
            session.updateMomentum(getMomentumMetrics(scoring));
            if (comboBeforeReset > 0) {
                session.recordEntropyEvent({
                    type: 'combo-reset',
                    comboHeat: comboBeforeReset,
                });
            }
            metrics.currentVolley = 0;
            if (session.snapshot().livesRemaining > 0) {
                reattachBall();
            }
        }

        decayCombo(scoring, STEP_SECONDS);
        session.updateMomentum(getMomentumMetrics(scoring));
        elapsedMs += STEP_MS;
        metrics.frames += 1;
        metrics.durationMs = elapsedMs;
    };

    while (elapsedMs < durationMs) {
        if (session.snapshot().livesRemaining <= 0) {
            break;
        }
        if (bricksRemaining <= 0) {
            session.completeRound();
            break;
        }
        tick();
    }

    Events.off(physics.engine, 'collisionStart', collisionHandler);

    const actualDuration = Math.min(elapsedMs, durationMs);
    const averageFps = metrics.frames > 0 ? metrics.frames / (actualDuration / 1000) : 0;
    const bricksPerSecond = actualDuration > 0 ? metrics.brickBreaks / (actualDuration / 1000) : 0;
    const averageImpactSpeed = metrics.speedSamples > 0 ? metrics.speedTotal / metrics.speedSamples : 0;

    const snapshot = session.snapshot();
    const events = stopCollecting();

    return {
        sessionId: snapshot.sessionId,
        seed: options.seed,
        round: options.round,
        durationMs: actualDuration,
        frames: metrics.frames,
        metrics: {
            bricksBroken: metrics.brickBreaks,
            paddleHits: metrics.paddleHits,
            wallHits: metrics.wallHits,
            livesLost: metrics.livesLost,
            averageFps: Number(averageFps.toFixed(2)),
            bricksPerSecond: Number(bricksPerSecond.toFixed(3)),
            hazardContacts: metrics.hazardContacts,
            hazardContactsByType: {
                'gravity-well': metrics.hazardContactsByType['gravity-well'] ?? 0,
                'moving-bumper': metrics.hazardContactsByType['moving-bumper'] ?? 0,
                portal: metrics.hazardContactsByType.portal ?? 0,
            },
            movingBumperImpacts: metrics.movingBumperImpacts,
            portalTransports: metrics.portalTransports,
        },
        volley: {
            longestVolley: metrics.longestVolley,
            averageImpactSpeed: Number(averageImpactSpeed.toFixed(2)),
        },
        events,
        score: snapshot.score,
        snapshot,
        hazards: hazardSummaries,
    };
};
