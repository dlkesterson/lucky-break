import { describe, expect, it, vi } from 'vitest';
import { Bodies, Engine, Events } from 'physics/matter';
import { createCollisionRuntime } from 'app/runtime/collisions';
import type { LuckyBreakEventBus } from 'app/events';
import type { MidiEngine } from 'audio/midi-engine';
import type { RandomManager } from 'util/random';

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

describe('collision death wall handling', () => {
    const createHarness = (gravity: number) => {
        const engine = Engine.create();
        const paddleBody = Bodies.rectangle(0, 0, 100, 20, { label: 'paddle' });
        const bus = createStubBus();
        const midiEngine = createStubMidiEngine();
        const random = createStubRandom();
        const ballBody = Bodies.circle(100, 100, 12, { label: 'ball' });
        const topWall = Bodies.rectangle(100, -16, 600, 32, { label: 'wall-top', isStatic: true });

        const recordLifeLost = vi.fn();

        const context: any = {
            session: {
                snapshot: vi.fn(() => ({
                    sessionId: 'session-1',
                    livesRemaining: 2,
                })),
                recordEntropyEvent: vi.fn(),
                recordLifeLost,
                collectCoins: vi.fn(),
                completeRound: vi.fn(),
            },
            scoring: {
                state: {
                    combo: 0,
                    comboTimer: 0,
                    momentum: { comboTimer: 0 },
                },
                awardBrick: vi.fn(() => ({ pointsAwarded: 0 })),
                lifeLost: vi.fn(),
            },
            gambleManager: {
                getState: vi.fn(() => null),
                onHit: vi.fn(() => ({ type: 'standard' })),
            },
            levelRuntime: {
                findHazard: vi.fn(() => null),
                findPowerUp: vi.fn(() => null),
                removePowerUp: vi.fn(),
                spawnPowerUp: vi.fn(),
                findCoin: vi.fn(() => null),
                removeCoin: vi.fn(),
                spawnCoin: vi.fn(),
                updateBrickDamage: vi.fn(),
                getActiveHazards: vi.fn(() => []),
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
            } as any,
            ball: {
                id: 'ball-primary',
                physicsBody: ballBody,
                isAttached: false,
                attachmentOffset: { x: 0, y: 0 },
                radius: ballBody.circleRadius ?? 12,
            },
            paddle: {
                id: 'paddle',
                physicsBody: paddleBody,
                width: 100,
                height: 20,
                speed: 0,
                position: { x: 0, y: 0 },
            },
            physics: {
                attachBallToPaddle: vi.fn(),
                remove: vi.fn(),
                isBallAttached: vi.fn(() => false),
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
            getGravity: () => gravity,
            functions: {
                getSessionElapsedSeconds: vi.fn(() => 0),
                getFrameTimestampMs: vi.fn(() => 0),
                getComboDecayWindow: vi.fn(() => 0),
                getCurrentBaseSpeed: vi.fn(() => 6),
                getCurrentMaxSpeed: vi.fn(() => 10),
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
                spawnHeatRipple: vi.fn(),
                emitBrickParticles: vi.fn(),
                flashBallLight: vi.fn(),
                flashPaddleLight: vi.fn(),
                hudPulseCombo: vi.fn(),
                clearExtraBalls: vi.fn(),
                reattachBallToPaddle: vi.fn(),
                removeExtraBallByBody: vi.fn(),
                promoteExtraBallToPrimary: vi.fn(() => false),
                handleGameOver: vi.fn(),
                handlePowerUpActivation: vi.fn(),
            },
            roundMachine: {
                consumeShieldCharge: vi.fn(() => false),
                clearRoundRules: vi.fn(),
                getLevelDifficultyMultiplier: vi.fn(() => 1),
                setLevelDifficultyMultiplier: vi.fn(),
                getPowerUpChanceMultiplier: vi.fn(() => 1),
                setPowerUpChanceMultiplier: vi.fn(),
                setRoundRules: vi.fn(),
                getCurrentLevelIndex: vi.fn(() => 0),
            },
        };

        const runtime = createCollisionRuntime({ engine, bus, midiEngine, random, context });
        runtime.wire();

        const triggerTopCollision = () => {
            Events.trigger(engine, 'collisionStart', {
                pairs: [
                    {
                        bodyA: ballBody,
                        bodyB: topWall,
                    },
                ],
            } as any);
        };

        return { triggerTopCollision, bus, midiEngine, recordLifeLost };
    };

    it('keeps the bottom wall as the death wall for mild upward gravity', () => {
        const { triggerTopCollision, bus, midiEngine, recordLifeLost } = createHarness(-0.1);

        triggerTopCollision();

        expect(recordLifeLost).not.toHaveBeenCalled();
        expect(bus.publish).toHaveBeenCalledWith(
            'WallHit',
            expect.objectContaining({ side: 'top', sessionId: 'session-1' }),
            0,
        );
        expect(midiEngine.triggerWallHit).toHaveBeenCalledTimes(1);
    });

    it('flips the death wall when gravity is strongly upward', () => {
        const { triggerTopCollision, bus, midiEngine, recordLifeLost } = createHarness(-0.35);

        triggerTopCollision();

        expect(recordLifeLost).toHaveBeenCalledWith('ball-drop');
        expect(bus.publish).not.toHaveBeenCalledWith('WallHit', expect.anything(), expect.anything());
        expect(midiEngine.triggerWallHit).not.toHaveBeenCalled();
    });
});

describe('laser strike handling', () => {
    it('applies laser strike damage to bricks', () => {
        const engine = Engine.create();
        const bus = createStubBus();
        const midiEngine = createStubMidiEngine();
        const random = createStubRandom();

        const brick = Bodies.rectangle(100, 100, 60, 24, { label: 'brick' });
        const brickHealth = new Map([[brick, 1]]);  // Changed to 1 HP so it breaks
        const brickMetadata = new Map([[brick, { row: 3, col: 5, hp: 1, breakable: true }]]);  // Changed to 1 HP
        const brickVisualState = new Map();

        const incrementLevelBricksBroken = vi.fn();
        const removeBodyVisual = vi.fn();
        const physics = { remove: vi.fn(), attachBallToPaddle: vi.fn(), isBallAttached: vi.fn(() => false) };

        const context: any = {
            session: {
                snapshot: vi.fn(() => ({
                    sessionId: 'session-1',
                    brickRemaining: 10,
                    brickTotal: 50,
                })),
                recordBrickBreak: vi.fn(),
                recordEntropyEvent: vi.fn(),
                incrementMirageStacks: vi.fn(),
                grantStoredEntropy: vi.fn(),
                getEntropyState: vi.fn(() => ({ charge: 50, stored: 100 })),
            },
            scoring: {
                state: { combo: 0, comboTimer: 0, momentum: {} },
                awardBrick: vi.fn(() => ({ pointsAwarded: 100 })),
            },
            gambleManager: {
                getState: vi.fn(() => null),
                onHit: vi.fn(() => ({ type: 'standard' })),
            },
            echoTrailManager: { register: vi.fn() },
            phantomBrickManager: { isPhantom: vi.fn(() => false), unregister: vi.fn(), getEntropyReward: vi.fn(() => 10) },
            vortexFieldManager: { spawn: vi.fn() },
            levelRuntime: {
                spawnPowerUp: vi.fn(),
                updateBrickDamage: vi.fn(),
                getActiveHazards: vi.fn(() => []),
                spawnCoin: vi.fn(),
            },
            brickHealth,
            brickMetadata,
            brickVisualState,
            powerUpManager: {},
            multiBallController: {},
            ball: { radius: 12 },
            paddle: {},
            physics,
            inputManager: {},
            dimensions: {
                brickWidth: 60,
                brickHeight: 24,
                playfieldWidth: 600,
                playfieldHeight: 800,
                playfieldSizeMax: 800,
            },
            thresholds: { multiplier: 6, maxLevelBrickHp: 4 },
            coins: { baseValue: 1, minValue: 1, maxValue: 10 },
            getGravity: () => 1,
            getRuleEffects: () => ({ echoPhaseChance: 0, vortexPullStrength: 0 }),
            functions: {
                incrementLevelBricksBroken,
                removeBodyVisual,
                getSessionElapsedSeconds: vi.fn(() => 0),
                getFrameTimestampMs: vi.fn(() => 0),
                getComboDecayWindow: vi.fn(() => 5),
                getCurrentBaseSpeed: vi.fn(() => 6),
                getCurrentMaxSpeed: vi.fn(() => 10),
                getPowerUpChanceMultiplier: vi.fn(() => 1),
                getDoublePointsMultiplier: vi.fn(() => 1),
                getActiveReward: vi.fn(() => null),
                updateHighestCombos: vi.fn(),
                refreshAchievementUpgrades: vi.fn(),
                recordBrickBreakAchievements: vi.fn(() => []),
                queueAchievementUnlocks: vi.fn(),
                syncMomentum: vi.fn(),
                releaseForeshadowForBall: vi.fn(),
                computeScheduledAudioTime: vi.fn(() => 0),
                scheduleVisualEffect: vi.fn(),
                spawnHeatRipple: vi.fn(),
                emitBrickParticles: vi.fn(),
                flashBallLight: vi.fn(),
                clearGhostEffect: vi.fn(),
                getChromaticColors: vi.fn(() => [0xff0000, 0x00ff00, 0x0000ff]),
                applyGambleAppearance: vi.fn(),
                spawnCoin: vi.fn(),
                refreshHud: vi.fn(),
            },
            roundMachine: {},
        };

        const runtime = createCollisionRuntime({ engine, bus, midiEngine, random, context });
        runtime.wire();

        runtime.applyLaserStrike({
            brick,
            origin: { x: 100, y: 120 },
            impactVelocity: 8,
        });

        expect(context.scoring.awardBrick).toHaveBeenCalled();
        expect(physics.remove).toHaveBeenCalledWith(brick);
        expect(removeBodyVisual).toHaveBeenCalledWith(brick);
        expect(incrementLevelBricksBroken).toHaveBeenCalled();
    });

    it('handles laser strikes on multi-hit bricks', () => {
        const engine = Engine.create();
        const bus = createStubBus();
        const midiEngine = createStubMidiEngine();
        const random = createStubRandom();

        const brick = Bodies.rectangle(100, 100, 60, 24, { label: 'brick' });
        const brickHealth = new Map([[brick, 3]]);
        const brickMetadata = new Map([[brick, { row: 2, col: 4, hp: 3, breakable: true, traits: ['fortified'] }]]);
        const brickVisualState = new Map();

        const updateBrickDamage = vi.fn();

        const context: any = {
            session: {
                snapshot: vi.fn(() => ({
                    sessionId: 'session-1',
                    brickRemaining: 15,
                    brickTotal: 50,
                })),
                recordEntropyEvent: vi.fn(),
            },
            scoring: {
                state: { combo: 0, comboTimer: 0, momentum: {} },
                awardBrick: vi.fn(() => ({ pointsAwarded: 50 })),
            },
            gambleManager: {
                getState: vi.fn(() => null),
                onHit: vi.fn(() => ({ type: 'standard' })),
            },
            echoTrailManager: {},
            phantomBrickManager: { isPhantom: vi.fn(() => false) },
            vortexFieldManager: {},
            levelRuntime: {
                updateBrickDamage,
            },
            brickHealth,
            brickMetadata,
            brickVisualState,
            powerUpManager: {},
            multiBallController: {},
            ball: { radius: 12 },
            physics: { remove: vi.fn(), attachBallToPaddle: vi.fn(), isBallAttached: vi.fn(() => false) },
            dimensions: {
                brickWidth: 60,
                brickHeight: 24,
                playfieldWidth: 600,
                playfieldHeight: 800,
                playfieldSizeMax: 800,
            },
            thresholds: { multiplier: 6, maxLevelBrickHp: 4 },
            coins: { baseValue: 1, minValue: 1, maxValue: 10 },
            getGravity: () => 1,
            getRuleEffects: () => ({ echoPhaseChance: 0, vortexPullStrength: 0 }),
            functions: {
                getSessionElapsedSeconds: vi.fn(() => 0),
                getFrameTimestampMs: vi.fn(() => 0),
                getComboDecayWindow: vi.fn(() => 5),
                getCurrentBaseSpeed: vi.fn(() => 6),
                getCurrentMaxSpeed: vi.fn(() => 10),
                computeScheduledAudioTime: vi.fn(() => 0),
                scheduleVisualEffect: vi.fn(),
                releaseForeshadowForBall: vi.fn(),
                getChromaticColors: vi.fn(() => [0xff0000]),
                applyGambleAppearance: vi.fn(),
            },
        };

        const runtime = createCollisionRuntime({ engine, bus, midiEngine, random, context });
        runtime.wire();

        runtime.applyLaserStrike({
            brick,
            origin: { x: 100, y: 120 },
        });

        // Should damage but not destroy the brick
        expect(brickHealth.get(brick)).toBe(2);
        expect(updateBrickDamage).toHaveBeenCalledWith(brick, 2);
        expect(bus.publish).toHaveBeenCalledWith(
            'BrickHit',
            expect.objectContaining({
                brickType: 'multi-hit',
                remainingHp: 2,
            }),
            0,
        );
    });
});

describe('coin and powerup collisions', () => {
    it('handles coin collection by paddle', () => {
        const engine = Engine.create();
        const bus = createStubBus();
        const midiEngine = createStubMidiEngine();
        const random = createStubRandom();

        const paddle = Bodies.rectangle(200, 500, 80, 20, { label: 'paddle', isStatic: true });
        const coin = Bodies.circle(200, 480, 8, { label: 'coin' });

        const physics = { remove: vi.fn() };
        const removeBodyVisual = vi.fn();
        const incrementCoins = vi.fn();

        const context: any = {
            session: {
                snapshot: vi.fn(() => ({ sessionId: 'session-1', coins: 5 })),
                incrementCoins,
                collectCoins: vi.fn(),
                recordEntropyEvent: vi.fn(),
            },
            coinBodies: [coin],
            brickHealth: new Map(),
            brickMetadata: new Map(),
            brickVisualState: new Map(),
            powerUpBodies: [],
            hazardManager: { hazards: [] },
            physics,
            paddle,
            ball: { radius: 12 },
            functions: {
                removeBodyVisual,
                getSessionElapsedSeconds: vi.fn(() => 0),
                getFrameTimestampMs: vi.fn(() => 0),
                computeScheduledAudioTime: vi.fn(() => 0),
                hudPulseCombo: vi.fn(),
            },
            scoring: { awardCoin: vi.fn(), state: { combo: 0 } },
            powerUpManager: { collect: vi.fn() },
            levelRuntime: { spawnCoin: vi.fn(), findCoin: vi.fn(() => ({ body: coin, value: 1 })), removeCoin: vi.fn() },
            phantomBrickManager: { getEntropyReward: vi.fn() },
        };

        const runtime = createCollisionRuntime({ engine, bus, midiEngine, random, context });
        runtime.wire();

        // Simulate coin-paddle collision
        Events.trigger(engine, 'collisionStart', {
            pairs: [{ bodyA: paddle, bodyB: coin, collision: {} }],
        } as any);

        expect(context.session.collectCoins).toHaveBeenCalledWith(1);
        expect(context.levelRuntime.removeCoin).toHaveBeenCalled();
        expect(context.functions.hudPulseCombo).toHaveBeenCalledWith(0.4);
    });

    it('handles powerup collection by paddle', () => {
        const engine = Engine.create();
        const bus = createStubBus();
        const midiEngine = createStubMidiEngine();
        const random = createStubRandom();

        const paddle = Bodies.rectangle(200, 500, 80, 20, { label: 'paddle', isStatic: true });
        const powerup = Bodies.circle(200, 480, 10, { label: 'powerup' });

        const physics = { remove: vi.fn() };
        const removeBodyVisual = vi.fn();
        const powerUpCollect = vi.fn();

        const context: any = {
            session: { snapshot: vi.fn(() => ({ sessionId: 'session-1' })) },
            coinBodies: [],
            powerUpBodies: [powerup],
            brickHealth: new Map(),
            brickMetadata: new Map(),
            brickVisualState: new Map(),
            hazardManager: { hazards: [] },
            physics,
            paddle,
            ball: { radius: 12 },
            functions: {
                removeBodyVisual,
                getSessionElapsedSeconds: vi.fn(() => 0),
                getFrameTimestampMs: vi.fn(() => 0),
                computeScheduledAudioTime: vi.fn(() => 0),
                handlePowerUpActivation: vi.fn(),
            },
            scoring: { awardCoin: vi.fn(), state: { combo: 0 } },
            powerUpManager: { collect: powerUpCollect, activate: vi.fn() },
            levelRuntime: {
                spawnCoin: vi.fn(),
                findPowerUp: vi.fn(() => ({ body: powerup, type: 'expand-paddle' })),
                removePowerUp: vi.fn(),
            },
            phantomBrickManager: { getEntropyReward: vi.fn() },
            thresholds: { powerUpDuration: 10 },
        };

        const runtime = createCollisionRuntime({ engine, bus, midiEngine, random, context });
        runtime.wire();

        // Simulate powerup-paddle collision
        Events.trigger(engine, 'collisionStart', {
            pairs: [{ bodyA: paddle, bodyB: powerup, collision: {} }],
        } as any);

        expect(context.levelRuntime.removePowerUp).toHaveBeenCalled();
        expect(context.powerUpManager.activate).toHaveBeenCalledWith('expand-paddle', { defaultDuration: 10 });
        expect(context.functions.handlePowerUpActivation).toHaveBeenCalledWith('expand-paddle');
    });
});
