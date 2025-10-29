import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine, Events, Bodies, Body } from 'physics/matter';
import type { MatterBody, MatterEngine } from 'physics/matter';
import { createCollisionRuntime } from 'app/runtime/collisions';
import type { CollisionRuntimeDeps } from 'app/runtime/collisions';
import type { LevelHazardDescriptor } from 'app/level-runtime';
import { createMovingBumperHazard, createPortalHazard } from 'physics/hazards';
import type { LuckyBreakEventBus } from 'app/events';
import type { MidiEngine } from 'audio/midi-engine';
import type { RandomManager } from 'util/random';

interface HazardHarnessOptions {
    readonly engine: MatterEngine;
    readonly hazardBody: MatterBody;
    readonly descriptor: LevelHazardDescriptor;
    readonly ballBody: MatterBody;
}

interface HazardHarness {
    readonly runtime: ReturnType<typeof createCollisionRuntime>;
    readonly spawnHeatRipple: ReturnType<typeof vi.fn>;
    readonly flashBallLight: ReturnType<typeof vi.fn>;
    readonly setFrameTime: (value: number) => void;
}

const createStubBus = (): LuckyBreakEventBus => ({
    publish: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    subscribeOnce: vi.fn(() => () => undefined),
    unsubscribe: vi.fn(),
    clear: vi.fn(),
    listeners: vi.fn(() => []),
});

const createStubMidiEngine = (): MidiEngine => ({
    triggerWallHit: vi.fn(),
    triggerBrickAccent: vi.fn(),
    triggerPowerUp: vi.fn(),
    triggerGambleCountdown: vi.fn(),
    dispose: vi.fn(),
});

const createStubRandom = (): RandomManager => ({
    seed: vi.fn(() => 1),
    setSeed: vi.fn((value: number) => value),
    reset: vi.fn(),
    next: vi.fn(() => 0.5),
    random: () => 0.5,
    nextInt: vi.fn(() => 0),
    boolean: vi.fn(() => false),
});

const createHazardCollisionHarness = ({ engine, hazardBody, descriptor, ballBody }: HazardHarnessOptions): HazardHarness => {
    let frameTime = 0;
    const spawnHeatRipple = vi.fn();
    const flashBallLight = vi.fn();

    const context: any = {
        session: {
            snapshot: vi.fn(() => ({ sessionId: 'test-session', brickRemaining: 10, brickTotal: 10 })),
            recordEntropyEvent: vi.fn(),
            recordLifeLost: vi.fn(),
            collectCoins: vi.fn(),
            completeRound: vi.fn(),
        },
        scoring: {
            state: { combo: 0, comboTimer: 0, momentum: { comboTimer: 0 } },
            awardBrick: vi.fn(() => ({ pointsAwarded: 0 })),
            lifeLost: vi.fn(),
        },
        gambleManager: {
            getState: vi.fn(() => null),
            onHit: vi.fn(() => ({ type: 'standard' })),
        },
        levelRuntime: {
            findHazard: vi.fn((body: MatterBody) => (body === hazardBody ? descriptor : null)),
            findPowerUp: vi.fn(() => null),
            removePowerUp: vi.fn(),
            spawnPowerUp: vi.fn(),
            findCoin: vi.fn(() => null),
            removeCoin: vi.fn(),
            spawnCoin: vi.fn(),
            updateBrickDamage: vi.fn(),
            getActiveHazards: vi.fn(() => [descriptor]),
            clearActiveCoins: vi.fn(),
            clearFallingPowerUps: vi.fn(),
        },
        brickHealth: new Map(),
        brickMetadata: new Map(),
        brickVisualState: new Map(),
        powerUpManager: {
            isActive: vi.fn(() => false),
            activate: vi.fn(),
        },
        multiBallController: {
            isExtraBallBody: vi.fn(() => false),
            removeExtraBallByBody: vi.fn(),
        },
        ball: {
            id: 'ball-primary',
            physicsBody: ballBody,
            isAttached: false,
            attachmentOffset: { x: 0, y: 0 },
            radius: ballBody.circleRadius ?? 12,
        },
        paddle: {
            id: 'paddle',
            physicsBody: Bodies.rectangle(0, 0, 100, 20, { label: 'paddle' }),
            width: 100,
            height: 20,
            speed: 0,
            position: { x: 0, y: 0 },
        },
        physics: {
            attachBallToPaddle: vi.fn(),
            remove: vi.fn(),
        },
        inputManager: {
            resetLaunchTrigger: vi.fn(),
        },
        dimensions: {
            brickWidth: 60,
            brickHeight: 24,
            playfieldWidth: 600,
            playfieldHeight: 800,
            playfieldSizeMax: 800,
        },
        thresholds: {
            multiplier: 6,
            powerUpDuration: 12,
            maxLevelBrickHp: 4,
        },
        coins: {
            baseValue: 1,
            minValue: 1,
            maxValue: 10,
        },
    };

    context.functions = {
        getSessionElapsedSeconds: vi.fn(() => 0),
        getFrameTimestampMs: vi.fn(() => frameTime),
        getComboDecayWindow: vi.fn(() => 0),
        getCurrentBaseSpeed: vi.fn(() => 6),
        getCurrentMaxSpeed: vi.fn(() => 12),
        getPowerUpChanceMultiplier: vi.fn(() => 1),
        getDoublePointsMultiplier: vi.fn(() => 1),
        getActiveReward: vi.fn(() => null),
        incrementLevelBricksBroken: vi.fn(),
        updateHighestCombos: vi.fn(),
        refreshAchievementUpgrades: vi.fn(),
        recordBrickBreakAchievements: vi.fn(() => []),
        queueAchievementUnlocks: vi.fn(),
        syncMomentum: vi.fn(),
        releaseForeshadowForBall: vi.fn(),
        computeScheduledAudioTime: vi.fn(() => 0),
        scheduleVisualEffect: vi.fn(),
        spawnHeatRipple,
        emitBrickParticles: vi.fn(),
        flashBallLight,
        flashPaddleLight: vi.fn(),
        hudPulseCombo: vi.fn(),
        applyGambleAppearance: vi.fn(),
        clearGhostEffect: vi.fn(),
        removeBodyVisual: vi.fn(),
        clearExtraBalls: vi.fn(),
        reattachBallToPaddle: vi.fn(),
        removeExtraBallByBody: vi.fn(),
        promoteExtraBallToPrimary: vi.fn(() => false),
        handleLevelComplete: vi.fn(),
        handleGameOver: vi.fn(),
        handlePowerUpActivation: vi.fn(),
        spawnCoin: vi.fn(),
    };

    context.roundMachine = {
        consumeShieldCharge: vi.fn(() => false),
    };

    const deps = {
        engine,
        bus: createStubBus(),
        midiEngine: createStubMidiEngine(),
        random: createStubRandom(),
        context,
    } as unknown as CollisionRuntimeDeps;

    const runtime = createCollisionRuntime(deps);

    return {
        runtime,
        spawnHeatRipple,
        flashBallLight,
        setFrameTime: (value: number) => {
            frameTime = value;
        },
    } satisfies HazardHarness;
};

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('collision hazard interactions', () => {
    it('applies impulse when colliding with a moving bumper', () => {
        const engine = Engine.create();
        const movingBumper = createMovingBumperHazard({
            start: { x: 200, y: 220 },
            end: { x: 360, y: 220 },
            radius: 24,
            speed: 160,
            impulse: 6,
        });
        const hazardBody = movingBumper.body!;
        const descriptor: LevelHazardDescriptor = {
            id: movingBumper.id,
            type: 'moving-bumper',
            position: movingBumper.position,
            radius: movingBumper.radius,
            impulse: movingBumper.impulse,
            direction: { x: movingBumper.direction.x, y: movingBumper.direction.y },
        };

        const ballBody = Bodies.circle(240, 220, 12, { label: 'ball' });
        Body.setVelocity(ballBody, { x: 0, y: 0 });

        const harness = createHazardCollisionHarness({ engine, hazardBody, descriptor, ballBody });
        harness.runtime.wire();

        Events.trigger(engine, 'collisionStart', {
            pairs: [{ bodyA: hazardBody, bodyB: ballBody }],
        } as any);

        expect(ballBody.velocity.x).not.toBe(0);
        expect(harness.spawnHeatRipple).toHaveBeenCalled();
        expect(harness.flashBallLight).toHaveBeenCalled();
        harness.runtime.unwire();
    });

    it('teleports the ball through a portal and observes cooldown', () => {
        const engine = Engine.create();
        const portal = createPortalHazard({
            entry: { x: 200, y: 200 },
            exit: { x: 420, y: 380 },
            radius: 32,
            cooldownSeconds: 0.5,
        });
        const hazardBody = portal.body!;
        const descriptor: LevelHazardDescriptor = {
            id: portal.id,
            type: 'portal',
            position: portal.position,
            radius: portal.radius,
            exit: portal.exit,
            cooldownSeconds: portal.cooldownSeconds,
        };

        const ballBody = Bodies.circle(200, 200, 12, { label: 'ball' });
        Body.setVelocity(ballBody, { x: 2, y: -3 });

        const harness = createHazardCollisionHarness({ engine, hazardBody, descriptor, ballBody });
        harness.runtime.wire();

        Events.trigger(engine, 'collisionStart', {
            pairs: [{ bodyA: hazardBody, bodyB: ballBody }],
        } as any);

        const travelVector = {
            x: descriptor.exit.x - descriptor.position.x,
            y: descriptor.exit.y - descriptor.position.y,
        };
        const travelLength = Math.hypot(travelVector.x, travelVector.y) || 1;
        const travelDirection = {
            x: travelVector.x / travelLength,
            y: travelVector.y / travelLength,
        };
        const circleRadius = typeof ballBody.circleRadius === 'number' ? ballBody.circleRadius : 12;
        const safeOffset = Math.max(circleRadius * 1.75, descriptor.radius * 0.65 + 8);
        const expectedPosition = {
            x: descriptor.exit.x + travelDirection.x * safeOffset,
            y: descriptor.exit.y + travelDirection.y * safeOffset,
        };

        expect(ballBody.position.x).toBeCloseTo(expectedPosition.x, 1);
        expect(ballBody.position.y).toBeCloseTo(expectedPosition.y, 1);
        const firstRippleCount = harness.spawnHeatRipple.mock.calls.length;

        const postTeleportPosition = { x: ballBody.position.x, y: ballBody.position.y };
        harness.setFrameTime(100); // still within cooldown window
        Events.trigger(engine, 'collisionStart', {
            pairs: [{ bodyA: hazardBody, bodyB: ballBody }],
        } as any);

        expect(ballBody.position.x).toBeCloseTo(postTeleportPosition.x, 5);
        expect(ballBody.position.y).toBeCloseTo(postTeleportPosition.y, 5);
        expect(harness.spawnHeatRipple.mock.calls.length).toBe(firstRippleCount);
        expect(harness.flashBallLight).toHaveBeenCalled();
        harness.runtime.unwire();
    });
});
