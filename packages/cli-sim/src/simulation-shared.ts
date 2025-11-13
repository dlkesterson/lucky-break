import { Body, Vector as MatterVector, type MatterBody } from 'physics/matter';
import {
    createEventBus,
    type EventEnvelope,
    type LuckyBreakEventBus,
    type LuckyBreakEventName,
} from 'app/events';
import { createPhysicsWorld, type PhysicsWorldHandle } from 'physics/world';
import {
    createGravityWellHazard,
    createMovingBumperHazard,
    createPortalHazard,
    type HazardType,
} from 'physics/hazards';
import { gameConfig } from 'config/game';
import {
    getLevelSpec,
    getLoopScalingInfo,
    getPresetLevelCount,
    remixLevel,
    generateLevelLayout,
    shapeFirstLoopSpec,
} from 'util/levels';
import { createRandomManager, type RandomManager } from 'util/random';

const config = gameConfig;

export const PLAYFIELD_WIDTH = config.playfield.width;
export const PLAYFIELD_HEIGHT = config.playfield.height;
export const PADDLE_WIDTH = 100;
export const PADDLE_HEIGHT = 20;
export const PADDLE_Y = PLAYFIELD_HEIGHT - 70;
export const BALL_RADIUS = 10;
export const BALL_RESTITUTION = 0.98;
export const STEP_MS = 1000 / 120;
export const STEP_SECONDS = STEP_MS / 1000;
const MIN_VERTICAL_SPEED = 2.5;

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

export interface BrickState {
    readonly body: MatterBody;
    hp: number;
    readonly initialHp: number;
    readonly row: number;
    readonly col: number;
}

export interface HazardDescriptor {
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

export type HazardLookup = Map<number, HazardDescriptor>;

export interface EventCollector {
    readonly flush: () => EventEnvelope<LuckyBreakEventName>[];
    readonly dispose: () => void;
}

export const collectEvents = (bus: LuckyBreakEventBus, enabled: boolean): EventCollector => {
    if (!enabled) {
        return {
            flush: () => [],
            dispose: () => {
                // no-op when telemetry disabled
            },
        } as EventCollector;
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

    return {
        flush: () => {
            if (collected.length === 0) {
                return [];
            }
            const emitted = collected.slice();
            collected.length = 0;
            return emitted;
        },
        dispose: () => {
            unsubscribes.forEach((unsubscribe) => {
                unsubscribe();
            });
        },
    } as EventCollector;
};

export const clampPaddleX = (value: number, width: number): number => {
    const halfWidth = width / 2;
    return Math.max(halfWidth, Math.min(PLAYFIELD_WIDTH - halfWidth, value));
};

export const applySpeedClamps = (ball: MatterBody): void => {
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

export const createSimulationBus = (now: () => number): LuckyBreakEventBus => createEventBus({ now });

export const createSimulationPhysics = (): ReturnType<typeof createPhysicsWorld> =>
    createPhysicsWorld({
        gravity: 0,
        timeStepMs: STEP_MS,
        dimensions: {
            width: PLAYFIELD_WIDTH,
            height: PLAYFIELD_HEIGHT,
            wallThickness: 24,
        },
    });

export const createSimulationRandom = (seed: number): RandomManager => createRandomManager(seed);

export const setupBricks = (
    physics: PhysicsWorldHandle,
    random: RandomManager,
    round: number,
): {
    bricks: Map<number, BrickState>;
    total: number;
    hazards: readonly HazardDescriptor[];
    hazardLookup: HazardLookup;
} => {
    const levelIndex = Math.max(0, round - 1);
    const presetCount = getPresetLevelCount();
    const loopCount = Math.floor(levelIndex / presetCount);
    const loopProgress = resolveLoopProgress(levelIndex, presetCount);
    const firstLoopProgress = loopCount === 0 ? loopProgress : 1;
    let baseSpec = getLevelSpec(levelIndex);
    if (loopCount === 0) {
        baseSpec = shapeFirstLoopSpec(baseSpec, firstLoopProgress);
    }
    const spec = loopCount > 0 ? remixLevel(baseSpec, loopCount) : baseSpec;
    const scaling = getLoopScalingInfo(loopCount);
    const easedFortifiedChance =
        loopCount === 0 ? scaling.fortifiedChance * firstLoopProgress : scaling.fortifiedChance;
    const easedVoidColumnChance =
        loopCount === 0 ? scaling.voidColumnChance * firstLoopProgress : scaling.voidColumnChance;
    const easedCenterBias =
        loopCount === 0 ? scaling.centerFortifiedBias * firstLoopProgress : scaling.centerFortifiedBias;
    const easedMaxVoidColumns =
        loopCount === 0 ? Math.max(0, Math.round(scaling.maxVoidColumns * firstLoopProgress)) : scaling.maxVoidColumns;
    const wallDensity = loopCount === 0 ? 0.2 + 0.8 * Math.pow(firstLoopProgress, 1.35) : 1;
    const layout = generateLevelLayout(
        spec,
        config.bricks.size.width,
        config.bricks.size.height,
        PLAYFIELD_WIDTH,
        {
            random: random.random,
            fortifiedChance: clampUnit(easedFortifiedChance),
            voidColumnChance: clampUnit(easedVoidColumnChance),
            centerFortifiedBias: Math.max(0, easedCenterBias),
            maxVoidColumns: Math.max(0, easedMaxVoidColumns),
            wallDensity: clampUnit(wallDensity),
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

    const registerHazard = (descriptor: HazardDescriptor, body: MatterBody | undefined) => {
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

        const hazardDifficultyScore = loopCount + loopProgress;

        if (hazardDifficultyScore >= 0.6 && (layoutWidth > 0 || layoutHeight > 0)) {
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

        if (hazardDifficultyScore >= 2.1 && layoutWidth > 120) {
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

        if (hazardDifficultyScore >= 3.35 && layoutWidth > 100 && layoutHeight > 80) {
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

const resolveLoopProgress = (levelIndex: number, presetCount: number): number => {
    if (presetCount <= 1) {
        return 1;
    }
    const normalized = ((levelIndex % presetCount) + presetCount) % presetCount;
    const denominator = Math.max(1, presetCount - 1);
    return clampUnit(normalized / denominator);
};