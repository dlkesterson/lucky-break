import { Body, Events, Vector as MatterVector } from 'physics/matter';
import type { IEventCollision, MatterBody, MatterEngine } from 'physics/matter';
import { createGameSessionManager, type GameSessionManager } from 'app/state';
import { gameConfig } from 'config/game';
import { awardBrickPoints, createScoring, decayCombo, getMomentumMetrics, resetCombo } from 'util/scoring';
import { reflectOffPaddle } from 'util/paddle-reflection';
import { smoothTowards } from 'util/input-helpers';
import type { HazardType } from 'physics/hazards';
import type { RandomManager } from 'util/random';
import type { LuckyBreakEventBus, EventEnvelope, LuckyBreakEventName } from 'app/events';
import {
    applySpeedClamps,
    BALL_RADIUS,
    BALL_RESTITUTION,
    clampPaddleX,
    collectEvents,
    createSimulationBus,
    createSimulationPhysics,
    createSimulationRandom,
    PADDLE_HEIGHT,
    PADDLE_WIDTH,
    PADDLE_Y,
    PLAYFIELD_HEIGHT,
    PLAYFIELD_WIDTH,
    setupBricks,
    STEP_MS,
    STEP_SECONDS,
    type BrickState,
    type EventCollector,
    type HazardDescriptor,
    type HazardLookup,
} from './simulation-shared';

const config = gameConfig;
const DEFAULT_SEED = 1337;
const DEFAULT_ROUND = 1;

export type RLActionId = 0 | 1 | 2 | 3 | 4 | 5;

export interface RLSimulatorOptions {
    readonly seed?: number;
    readonly round?: number;
    readonly telemetry?: boolean;
}

export interface RLObservation {
    readonly frame: number;
    readonly timeMs: number;
    readonly ball: {
        readonly attached: boolean;
        readonly position: { readonly x: number; readonly y: number };
        readonly velocity: { readonly x: number; readonly y: number };
        readonly speed: number;
    };
    readonly paddle: {
        readonly position: { readonly x: number; readonly y: number };
        readonly targetX: number;
        readonly width: number;
        readonly velocityX: number;
    };
    readonly session: {
        readonly score: number;
        readonly livesRemaining: number;
        readonly bricksRemaining: number;
        readonly bricksTotal: number;
        readonly comboHeat: number;
        readonly volleyLength: number;
    };
    readonly hazards: readonly HazardDescriptor[];
}

export interface RLStepInfo {
    readonly frame: number;
    readonly elapsedMs: number;
    readonly score: number;
    readonly livesRemaining: number;
    readonly bricksRemaining: number;
    readonly reward: number;
    readonly done: boolean;
    readonly snapshot: ReturnType<GameSessionManager['snapshot']>;
    readonly events?: readonly EventEnvelope<LuckyBreakEventName>[];
}

export interface RLStepResult {
    readonly observation: RLObservation;
    readonly reward: number;
    readonly done: boolean;
    readonly info: RLStepInfo;
}

type PhysicsBody = MatterBody;
type PhysicsEngine = MatterEngine;

interface InternalMetrics {
    frames: number;
    brickBreaks: number;
    paddleHits: number;
    wallHits: number;
    livesLost: number;
    currentVolley: number;
    longestVolley: number;
    speedSamples: number;
    speedTotal: number;
    hazardContacts: number;
    hazardContactsByType: Record<HazardType, number>;
    movingBumperImpacts: number;
    portalTransports: number;
}

export class RLSimulator {
    private readonly options: Required<RLSimulatorOptions>;
    private telemetryEnabled: boolean;
    private random: RandomManager | null = null;
    private bus: LuckyBreakEventBus | null = null;
    private physics: ReturnType<typeof createSimulationPhysics> | null = null;
    private session: GameSessionManager | null = null;
    private scoring = createScoring();
    private paddle: MatterBody | null = null;
    private ball: MatterBody | null = null;
    private bricks: Map<number, BrickState> = new Map<number, BrickState>();
    private hazards: readonly HazardDescriptor[] = [];
    private hazardLookup: HazardLookup = new Map<number, HazardDescriptor>();
    private bricksRemaining = 0;
    private ballAttached = true;
    private pendingLaunch = false;
    private paddleTargetState = { x: 0 };
    private elapsedMs = 0;
    private frame = 0;
    private lastScore = 0;
    private lastPaddleDeltaX = 0;
    private portalCooldowns = new Map<string, number>();
    private metrics: InternalMetrics = this.createEmptyMetrics();
    private eventCollector: EventCollector | null = null;
    private collisionHandler?: (event: IEventCollision<PhysicsEngine>) => void;
    private disposed = true;

    public constructor(options?: RLSimulatorOptions) {
        const resolvedOptions: Required<RLSimulatorOptions> = {
            seed: options?.seed ?? DEFAULT_SEED,
            round: options?.round ?? DEFAULT_ROUND,
            telemetry: options?.telemetry ?? false,
        };
        this.options = resolvedOptions;
        this.telemetryEnabled = this.options.telemetry;
    }

    public reset(seed?: number): RLObservation {
        const resolvedSeed = typeof seed === 'number' ? seed : this.options.seed;
        this.initialize(resolvedSeed);
        const snapshot = this.session!.snapshot();
        return this.buildObservation(snapshot);
    }

    public step(action: RLActionId): RLStepResult {
        if (!this.session || !this.physics || !this.paddle || !this.ball) {
            throw new Error('RLSimulator requires reset() before calling step().');
        }

        const { move, launch } = this.translateAction(action);
        const currentWidth = this.getPaddleWidth();

        if (move !== 0) {
            this.paddleTargetState.x = clampPaddleX(this.paddleTargetState.x + move, currentWidth);
        } else {
            this.paddleTargetState.x = clampPaddleX(this.paddle.position.x, currentWidth);
        }

        if (launch && this.ballAttached) {
            this.pendingLaunch = true;
        }

        const info = this.advanceFrame();
        const observation = this.buildObservation(info.snapshot);
        return {
            observation,
            reward: info.reward,
            done: info.done,
            info,
        };
    }

    public close(): void {
        this.dispose();
    }

    private initialize(seed: number): void {
        this.dispose();

        this.telemetryEnabled = this.options.telemetry;
        this.random = createSimulationRandom(seed);
        this.elapsedMs = 0;
        this.frame = 0;
        this.lastScore = 0;
        this.lastPaddleDeltaX = 0;
        this.portalCooldowns = new Map();
        this.metrics = this.createEmptyMetrics();
        this.bricksRemaining = 0;
        this.ballAttached = true;
        this.pendingLaunch = false;

        this.bus = createSimulationBus(() => Math.round(this.elapsedMs));
        this.physics = createSimulationPhysics();
        this.eventCollector = collectEvents(this.bus, this.telemetryEnabled);

        const sessionId = `rl-${seed}-r${this.options.round}`;
        this.session = createGameSessionManager({
            sessionId,
            eventBus: this.bus,
            random: this.random.random,
            now: () => Math.round(this.elapsedMs),
        });

        this.scoring = createScoring();
        this.session.updateMomentum(getMomentumMetrics(this.scoring));

        this.paddle = this.physics.factory.paddle({
            position: { x: PLAYFIELD_WIDTH / 2, y: PADDLE_Y },
            size: { width: PADDLE_WIDTH, height: PADDLE_HEIGHT },
            label: 'paddle',
        });
        this.physics.add(this.paddle);

        this.ball = this.physics.factory.ball({
            position: { x: this.paddle.position.x, y: this.paddle.position.y - BALL_RADIUS - PADDLE_HEIGHT / 2 },
            radius: BALL_RADIUS,
            restitution: BALL_RESTITUTION,
            label: 'ball',
        });
        this.physics.add(this.ball);
        this.physics.attachBallToPaddle(this.ball, this.paddle, { x: 0, y: -BALL_RADIUS - PADDLE_HEIGHT / 2 });
        this.ballAttached = true;
        this.pendingLaunch = false;
        this.paddleTargetState = { x: this.paddle.position.x };

        const bounds = this.physics.factory.bounds();
        this.physics.add(bounds);

        const setup = setupBricks(this.physics, this.random, this.options.round);
        this.bricks = setup.bricks;
        this.bricksRemaining = setup.total;
        this.hazards = setup.hazards;
        this.hazardLookup = setup.hazardLookup;

        this.session.startRound({
            breakableBricks: setup.total,
            roundNumber: this.options.round,
        });

        this.registerCollisionHandler();
        this.lastScore = this.session.snapshot().score;
        this.disposed = false;
    }

    private dispose(): void {
        if (this.physics && this.collisionHandler) {
            Events.off(this.physics.engine, 'collisionStart', this.collisionHandler);
        }
        this.collisionHandler = undefined;
        if (this.eventCollector) {
            this.eventCollector.dispose();
            this.eventCollector = null;
        }
        this.physics = null;
        this.session = null;
        this.paddle = null;
        this.ball = null;
        this.bricks = new Map<number, BrickState>();
        this.hazards = [];
        this.hazardLookup = new Map<number, HazardDescriptor>();
        this.random = null;
        this.bus = null;
        this.disposed = true;
    }

    private registerCollisionHandler(): void {
        if (!this.physics) {
            return;
        }

        const handler = (event: IEventCollision<PhysicsEngine>) => {
            if (!this.ball || !this.paddle) {
                return;
            }

            for (const pair of event.pairs) {
                const { bodyA, bodyB } = pair;

                const resolveBall = (): PhysicsBody => (bodyA.label === 'ball' ? bodyA : bodyB);
                const resolveBrick = (): PhysicsBody => (bodyA.label === 'brick' ? bodyA : bodyB);
                const resolveWall = (): PhysicsBody => (bodyA.label.startsWith('wall-') ? bodyA : bodyB);
                const resolveHazard = (): PhysicsBody => (bodyA.label.startsWith('hazard-') ? bodyA : bodyB);
                const isHazardLabel = (label: string) => label.startsWith('hazard-');

                if (
                    (bodyA.label === 'ball' && bodyB.label === 'brick') ||
                    (bodyB.label === 'ball' && bodyA.label === 'brick')
                ) {
                    const brickBody = resolveBrick();
                    const brickState = this.bricks.get(brickBody.id);
                    if (!brickState) {
                        continue;
                    }
                    const ballBody = resolveBall();
                    const impactVelocity = MatterVector.magnitude(ballBody.velocity);
                    this.handleBrickHit(brickState, impactVelocity);
                }

                if (
                    (bodyA.label === 'ball' && bodyB.label === 'paddle') ||
                    (bodyB.label === 'ball' && bodyA.label === 'paddle')
                ) {
                    this.metrics.paddleHits += 1;
                    const ballBody = resolveBall();
                    reflectOffPaddle(ballBody, this.paddle, {
                        paddleWidth: this.getPaddleWidth(),
                        minSpeed: config.ball.baseSpeed,
                    });
                    this.session?.recordEntropyEvent({
                        type: 'paddle-hit',
                        speed: MatterVector.magnitude(ballBody.velocity),
                        comboHeat: this.scoring.combo,
                    });
                }

                if (
                    (bodyA.label === 'ball' && bodyB.label.startsWith('wall-')) ||
                    (bodyB.label === 'ball' && bodyA.label.startsWith('wall-'))
                ) {
                    const wallBody = resolveWall();
                    if (wallBody.label !== 'wall-bottom') {
                        this.metrics.wallHits += 1;
                    }
                    this.session?.recordEntropyEvent({
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
                    const descriptor = this.hazardLookup.get(hazardBody.id);
                    if (!descriptor) {
                        continue;
                    }

                    this.metrics.hazardContacts += 1;
                    this.metrics.hazardContactsByType[descriptor.type] =
                        (this.metrics.hazardContactsByType[descriptor.type] ?? 0) + 1;

                    if (descriptor.type === 'moving-bumper') {
                        const ballBody = resolveBall();
                        const offsetX = ballBody.position.x - descriptor.position.x;
                        const offsetY = ballBody.position.y - descriptor.position.y;
                        const distance = Math.hypot(offsetX, offsetY);
                        const direction =
                            distance > 0 && Number.isFinite(distance)
                                ? { x: offsetX / distance, y: offsetY / distance }
                                : descriptor.direction ?? { x: 0, y: -1 };
                        const impulse = descriptor.impulse ?? 0;
                        if (impulse > 0) {
                            this.metrics.movingBumperImpacts += 1;
                            Body.setVelocity(ballBody, {
                                x: ballBody.velocity.x + direction.x * impulse,
                                y: ballBody.velocity.y + direction.y * impulse,
                            });
                        }
                    } else if (descriptor.type === 'portal' && descriptor.exit) {
                        const ballBody = resolveBall();
                        const nowMs = this.elapsedMs;
                        const cooldownMs = Math.max(0, (descriptor.cooldownSeconds ?? 0) * 1000);
                        const lastTrigger = this.portalCooldowns.get(descriptor.id) ?? Number.NEGATIVE_INFINITY;
                        if (nowMs - lastTrigger >= cooldownMs) {
                            this.portalCooldowns.set(descriptor.id, nowMs);
                            const travelVector = {
                                x: descriptor.exit.x - descriptor.position.x,
                                y: descriptor.exit.y - descriptor.position.y,
                            };
                            const travelLength = Math.hypot(travelVector.x, travelVector.y);
                            const direction =
                                travelLength > 0 && Number.isFinite(travelLength)
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
                            this.metrics.portalTransports += 1;
                        }
                    }

                    continue;
                }
            }
        };

        Events.on(this.physics.engine, 'collisionStart', handler);
        this.collisionHandler = handler;
    }

    private handleBrickHit(brick: BrickState, impactVelocity: number): void {
        if (!this.physics) {
            return;
        }

        if (brick.hp <= 1) {
            this.handleBrickBreak(brick, impactVelocity);
        } else {
            brick.hp = Math.max(0, brick.hp - 1);
            this.session?.recordEntropyEvent({
                type: 'brick-hit',
                comboHeat: this.scoring.combo,
                impactVelocity,
                speed: impactVelocity,
            });
        }
    }

    private handleBrickBreak(brick: BrickState, impactVelocity: number): void {
        if (!this.physics) {
            return;
        }

        this.physics.remove(brick.body);
        this.bricks.delete(brick.body.id);
        this.bricksRemaining = Math.max(0, this.bricksRemaining - 1);
        this.metrics.brickBreaks += 1;
        this.metrics.currentVolley += 1;
        if (this.metrics.currentVolley > this.metrics.longestVolley) {
            this.metrics.longestVolley = this.metrics.currentVolley;
        }
        this.metrics.speedSamples += 1;
        this.metrics.speedTotal += impactVelocity;

        const points = awardBrickPoints(
            this.scoring,
            { comboDecayTime: config.scoring.comboDecayTime },
            {
                bricksRemaining: this.bricksRemaining,
                brickTotal: this.session?.snapshot().brickTotal ?? 0,
                impactSpeed: impactVelocity,
                maxSpeed: config.ball.maxSpeed,
            },
        );

        this.session?.recordBrickBreak({
            points,
            event: {
                row: brick.row,
                col: brick.col,
                impactVelocity,
                brickType: 'standard',
                initialHp: brick.initialHp,
                comboHeat: this.scoring.combo,
            },
            momentum: getMomentumMetrics(this.scoring),
        });

        this.session?.recordEntropyEvent({
            type: 'brick-break',
            comboHeat: this.scoring.combo,
            impactVelocity,
            speed: impactVelocity,
        });
    }

    private advanceFrame(): RLStepInfo {
        if (!this.session || !this.physics || !this.paddle || !this.ball) {
            throw new Error('RLSimulator runtime has not been initialised.');
        }

        const previousPaddleX = this.paddle.position.x;

        const desiredX = clampPaddleX(this.paddleTargetState.x, this.getPaddleWidth());
        const nextX = smoothTowards(this.paddle.position.x, desiredX, STEP_SECONDS, {
            responsiveness: config.paddle.control.smoothResponsiveness,
            snapThreshold: config.paddle.control.snapThreshold,
        });
        const clampedNextX = clampPaddleX(nextX, this.getPaddleWidth());
        Body.setPosition(this.paddle, { x: clampedNextX, y: PADDLE_Y });
        this.physics.updateBallAttachment(this.ball, { x: this.paddle.position.x, y: PADDLE_Y });
        this.lastPaddleDeltaX = this.paddle.position.x - previousPaddleX;

        if (this.ballAttached && this.pendingLaunch) {
            this.launchBall();
            this.pendingLaunch = false;
        }

        this.physics.step(STEP_MS);

        if (!this.ballAttached) {
            applySpeedClamps(this.ball);
        }

        this.checkOutOfBounds();

        decayCombo(this.scoring, STEP_SECONDS);
        this.session.updateMomentum(getMomentumMetrics(this.scoring));
        this.elapsedMs += STEP_MS;
        this.frame += 1;
        this.metrics.frames += 1;

        const snapshot = this.session.snapshot();
        const reward = snapshot.score - this.lastScore;
        this.lastScore = snapshot.score;

        const done = snapshot.livesRemaining <= 0 || this.bricksRemaining <= 0;
        if (done && this.bricksRemaining <= 0 && snapshot.status !== 'completed') {
            this.session.completeRound();
        }

        const events = this.telemetryEnabled ? this.eventCollector?.flush() ?? [] : undefined;

        return {
            frame: this.frame,
            elapsedMs: this.elapsedMs,
            score: snapshot.score,
            livesRemaining: snapshot.livesRemaining,
            bricksRemaining: this.bricksRemaining,
            reward,
            done,
            snapshot,
            events,
        };
    }

    private buildObservation(snapshot: ReturnType<GameSessionManager['snapshot']>): RLObservation {
        if (!this.ball || !this.paddle) {
            throw new Error('RLSimulator runtime has not been initialised.');
        }

        const speed = MatterVector.magnitude(this.ball.velocity);
        const velocityX = this.lastPaddleDeltaX / STEP_SECONDS || 0;

        return {
            frame: this.frame,
            timeMs: this.elapsedMs,
            ball: {
                attached: this.ballAttached,
                position: { x: this.ball.position.x, y: this.ball.position.y },
                velocity: { x: this.ball.velocity.x, y: this.ball.velocity.y },
                speed,
            },
            paddle: {
                position: { x: this.paddle.position.x, y: this.paddle.position.y },
                targetX: this.paddleTargetState.x,
                width: this.getPaddleWidth(),
                velocityX,
            },
            session: {
                score: snapshot.score,
                livesRemaining: snapshot.livesRemaining,
                bricksRemaining: this.bricksRemaining,
                bricksTotal: snapshot.brickTotal,
                comboHeat: this.scoring.combo,
                volleyLength: this.metrics.currentVolley,
            },
            hazards: this.hazards,
        };
    }

    private translateAction(action: RLActionId): { move: number; launch: boolean } {
        const stepMagnitude = Math.max(20, this.getPaddleWidth() * 0.6);
        switch (action) {
            case 1:
                return { move: -stepMagnitude, launch: false };
            case 2:
                return { move: stepMagnitude, launch: false };
            case 3:
                return { move: 0, launch: true };
            case 4:
                return { move: -stepMagnitude, launch: true };
            case 5:
                return { move: stepMagnitude, launch: true };
            case 0:
            default:
                return { move: 0, launch: false };
        }
    }

    private launchBall(): void {
        if (!this.ball || !this.paddle || !this.physics || !this.random) {
            return;
        }
        if (!this.ballAttached) {
            return;
        }
        this.ballAttached = false;
        this.physics.detachBallFromPaddle(this.ball);
        const angle = (Math.PI / 4) * (0.5 + this.random.random());
        const horizontalSign = this.random.boolean() ? 1 : -1;
        const direction = {
            x: Math.sin(angle) * horizontalSign,
            y: -Math.cos(angle),
        };
        const speed = config.ball.launchSpeed;
        Body.setVelocity(this.ball, {
            x: direction.x * speed,
            y: direction.y * speed,
        });
        this.session?.recordEntropyEvent({ type: 'round-start' });
        this.bus?.publish(
            'BallLaunched',
            {
                sessionId: this.session?.snapshot().sessionId ?? 'rl-session',
                position: { x: this.ball.position.x, y: this.ball.position.y },
                direction,
                speed,
            },
            Math.round(this.elapsedMs),
        );
    }

    private reattachBall(): void {
        if (!this.physics || !this.ball || !this.paddle) {
            return;
        }
        this.physics.attachBallToPaddle(this.ball, this.paddle, { x: 0, y: -BALL_RADIUS - PADDLE_HEIGHT / 2 });
        this.ballAttached = true;
        this.pendingLaunch = false;
        Body.setVelocity(this.ball, { x: 0, y: 0 });
        this.paddleTargetState.x = clampPaddleX(this.paddle.position.x, this.getPaddleWidth());
    }

    private checkOutOfBounds(): void {
        if (!this.physics || !this.ball || !this.session) {
            return;
        }

        const currentGravity = this.physics.getGravity();
        const ballDroppedBottom = this.ball.position.y >= PLAYFIELD_HEIGHT + BALL_RADIUS * 2;
        const ballDroppedTop = currentGravity < 0 && this.ball.position.y <= -BALL_RADIUS * 2;

        if (ballDroppedBottom || ballDroppedTop) {
            this.metrics.livesLost += 1;
            this.session.recordLifeLost('ball-drop');
            const comboBeforeReset = this.scoring.combo;
            resetCombo(this.scoring);
            this.session.updateMomentum(getMomentumMetrics(this.scoring));
            if (comboBeforeReset > 0) {
                this.session.recordEntropyEvent({
                    type: 'combo-reset',
                    comboHeat: comboBeforeReset,
                });
            }
            this.metrics.currentVolley = 0;
            if (this.session.snapshot().livesRemaining > 0) {
                this.reattachBall();
            }
        }
    }

    private getPaddleWidth(): number {
        if (!this.paddle) {
            return PADDLE_WIDTH;
        }
        const bounds = this.paddle.bounds;
        return bounds.max.x - bounds.min.x;
    }

    private createEmptyMetrics(): InternalMetrics {
        const hazardContactsByType: Record<HazardType, number> = {
            'gravity-well': 0,
            'moving-bumper': 0,
            portal: 0,
        };

        return {
            frames: 0,
            brickBreaks: 0,
            paddleHits: 0,
            wallHits: 0,
            livesLost: 0,
            currentVolley: 0,
            longestVolley: 0,
            speedSamples: 0,
            speedTotal: 0,
            hazardContacts: 0,
            hazardContactsByType,
            movingBumperImpacts: 0,
            portalTransports: 0,
        };
    }
}
