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
