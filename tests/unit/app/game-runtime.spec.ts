import { beforeEach, describe, expect, it, vi } from 'vitest';

const toneState = vi.hoisted(() => ({
    contextState: 'suspended' as 'suspended' | 'running',
    transportState: 'stopped' as 'stopped' | 'started',
    resumeImpl: () => {
        toneState.contextState = 'running';
        return Promise.resolve();
    },
    startImpl: () => {
        toneState.transportState = 'started';
        return Promise.resolve();
    },
    resumeMock: vi.fn(),
    transportStartMock: vi.fn(),
}));

const createStageStub = () => {
    const makeLifecycleContainer = () => ({
        addChild: vi.fn(),
        addChildAt: vi.fn(),
    });

    const layers: Record<string, { addChild: ReturnType<typeof vi.fn>; addChildAt: ReturnType<typeof vi.fn> }> = {
        root: makeLifecycleContainer(),
        playfield: makeLifecycleContainer(),
        effects: makeLifecycleContainer(),
        hud: makeLifecycleContainer(),
    };

    return {
        addToLayer: vi.fn((layer: string, child: unknown) => {
            if (!layers[layer]) {
                layers[layer] = makeLifecycleContainer();
            }
            layers[layer].addChild(child);
        }),
        layers,
        app: {
            renderer: {},
            render: vi.fn(),
            stage: {
                root: {
                    addChildAt: vi.fn(),
                },
            },
            screen: {
                width: 800,
                height: 600,
            },
        },
        register: vi.fn(),
        transitionTo: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockResolvedValue(undefined),
        pop: vi.fn(),
        getCurrentScene: vi.fn(() => 'main-menu'),
        toPlayfield: vi.fn((point: { x: number; y: number }) => ({ ...point })),
        update: vi.fn(),
    };
};

const initializerState = vi.hoisted(() => ({
    instances: [] as any[],
}));

const powerUpManagerState = vi.hoisted(() => ({
    instances: [] as any[],
}));

const inputManagerState = vi.hoisted(() => ({
    instances: [] as any[],
}));

const paddleState = vi.hoisted(() => ({
    instances: [] as any[],
}));

const ballState = vi.hoisted(() => ({
    instances: [] as any[],
}));

const physicsWorldState = vi.hoisted(() => ({
    instances: [] as any[],
}));

const launchControllerState = vi.hoisted(() => ({
    instances: [] as any[],
}));

const createGameInitializerMock = vi.hoisted(() =>
    vi.fn(async (options: unknown) => {
        const stage = createStageStub();
        const dispose = vi.fn();
        const renderStageSoon = vi.fn();
        const musicDirector = {
            setState: vi.fn(),
            getState: vi.fn(() => null),
            setEnabled: vi.fn(),
            dispose: vi.fn(),
        };
        initializerState.instances.push({
            stage,
            dispose,
            musicDirector,
            renderStageSoon,
            options,
        });
        return {
            stage,
            bus: { publish: vi.fn() },
            scheduler: { lookAheadMs: 120 },
            audioState$: { next: vi.fn() },
            musicDirector,
            renderStageSoon,
            dispose,
        };
    }),
);

vi.mock('app/game-initializer', () => ({
    createGameInitializer: createGameInitializerMock,
}));
vi.mock('./game-initializer', () => ({
    createGameInitializer: createGameInitializerMock,
}));

vi.mock('tone', () => {
    const resumeMock = vi.fn(() => {
        const result = toneState.resumeImpl();
        if (typeof result === 'object' && result !== null && 'then' in result && typeof (result as PromiseLike<unknown>).then === 'function') {
            return Promise.resolve(result).finally(() => {
                toneState.contextState = 'running';
            });
        }
        toneState.contextState = 'running';
        return result;
    });
    const transportStartMock = vi.fn(() => {
        const result = toneState.startImpl();
        if (typeof result === 'object' && result !== null && 'then' in result && typeof (result as PromiseLike<unknown>).then === 'function') {
            return Promise.resolve(result).finally(() => {
                toneState.transportState = 'started';
            });
        }
        toneState.transportState = 'started';
        return result;
    });
    toneState.resumeMock = resumeMock;
    toneState.transportStartMock = transportStartMock;

    class MockGain {
        public readonly gain = {
            value: 0,
            cancelAndHoldAtTime: vi.fn(),
            setValueAtTime: vi.fn(),
            getValueAtTime: vi.fn(() => 0),
            linearRampToValueAtTime: vi.fn(),
        };
        connect = vi.fn();
        toDestination = vi.fn();
        dispose = vi.fn();
    }

    class MockPlayer {
        constructor(options: unknown) {
            void options;
        }
        sync() {
            return this;
        }
        start = vi.fn();
        connect = vi.fn();
        dispose = vi.fn();
    }

    class MockVolume {
        constructor(value: number) {
            void value;
        }
        connect = vi.fn();
        dispose = vi.fn();
    }

    class MockPanner {
        constructor(value: number) {
            void value;
        }
        connect = vi.fn();
        toDestination = vi.fn();
        pan = {
            setValueAtTime: vi.fn(),
        };
        dispose = vi.fn();
    }

    interface MockTonePlayer {
        playbackRate: number;
        volume: { value: number };
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
    }

    class MockPlayers {
        private readonly players: Record<string, MockTonePlayer>;
        constructor(urls: Record<string, string>, onload?: () => void) {
            this.players = Object.keys(urls).reduce<Record<string, MockTonePlayer>>((acc, id) => {
                acc[id] = {
                    playbackRate: 1,
                    volume: { value: 0 },
                    start: vi.fn(),
                    stop: vi.fn(),
                };
                return acc;
            }, {});
            if (onload) {
                queueMicrotask(onload);
            }
        }
        connect = vi.fn();
        dispose = vi.fn();
        player = vi.fn((id: string): MockTonePlayer | undefined => this.players[id]);
    }

    const transport = {
        get state() {
            return toneState.transportState;
        },
        start: transportStartMock,
    };

    return {
        Gain: MockGain,
        Player: MockPlayer,
        Transport: transport,
        getContext: () => ({
            rawContext: {
                get state() {
                    return toneState.contextState;
                },
                resume: resumeMock,
            },
        }),
        now: vi.fn(() => 0),
        Volume: MockVolume,
        Panner: MockPanner,
        Players: MockPlayers,
    };
});

vi.mock('render/theme', () => ({
    GameTheme: {
        brickColors: ['#ff0000', '#00ff00', '#0000ff'],
        ball: {
            core: '#cccccc',
            aura: '#eeeeee',
            highlight: '#ffffff',
        },
        paddle: {
            gradient: ['#123456', '#654321'],
            glow: 0.4,
        },
        accents: {
            combo: '#abcdef',
            powerUp: '#fedcba',
        },
        background: {
            from: 0x111111,
            to: 0x222222,
        },
    },
}));

vi.mock('physics/world', () => ({
    createPhysicsWorld: vi.fn(() => {
        const instance = {
            factory: {
                bounds: vi.fn(() => ({ label: 'bounds', position: { x: 0, y: 0 }, angle: 0 })),
            },
            add: vi.fn(),
            remove: vi.fn(),
            attachBallToPaddle: vi.fn(),
            detachBallFromPaddle: vi.fn(),
            updateBallAttachment: vi.fn(),
            step: vi.fn(),
            engine: {},
        };
        physicsWorldState.instances.push(instance);
        return instance;
    }),
}));

vi.mock('./loop', () => ({
    createGameLoop: vi.fn((update: (delta: number) => void, render: () => void) => {
        let running = false;
        return {
            start: vi.fn(() => {
                running = true;
                update(0);
                render();
            }),
            stop: vi.fn(() => {
                running = false;
            }),
            isRunning: vi.fn(() => running),
        };
    }),
}));

vi.mock('./state', () => ({
    createGameSessionManager: vi.fn(() => {
        const state: any = {
            sessionId: 'session-test',
            livesRemaining: 3,
            brickRemaining: 0,
            brickTotal: 0,
            round: 1,
            status: 'active',
            score: 0,
            coins: 0,
            entropy: {
                charge: 0,
                stored: 0,
                trend: 'stable',
                lastEvent: null,
                updatedAt: Date.now(),
            },
        };
        return {
            startRound: vi.fn((options: { breakableBricks: number }) => {
                state.brickRemaining = options.breakableBricks;
                state.brickTotal = options.breakableBricks;
            }),
            snapshot: vi.fn(() => ({
                ...state,
                hud: {
                    score: state.score,
                    coins: state.coins,
                    lives: state.livesRemaining,
                    round: state.round,
                    brickRemaining: state.brickRemaining,
                    brickTotal: state.brickTotal,
                    momentum: {
                        volleyLength: 0,
                        speedPressure: 0,
                        brickDensity: state.brickTotal === 0 ? 0 : state.brickRemaining / state.brickTotal,
                        comboHeat: 0,
                        comboTimer: 0,
                    },
                    entropy: {
                        charge: state.entropy.charge,
                        stored: state.entropy.stored,
                        trend: state.entropy.trend,
                    },
                    audio: {
                        scene: 'calm',
                        nextScene: null,
                        barCountdown: 0,
                    },
                    prompts: [],
                    settings: {
                        muted: false,
                        masterVolume: 1,
                        reducedMotion: false,
                    },
                },
            })),
            recordBrickBreak: vi.fn(),
            recordLifeLost: vi.fn(() => {
                state.livesRemaining = Math.max(0, state.livesRemaining - 1);
            }),
            completeRound: vi.fn(() => {
                state.brickRemaining = 0;
            }),
            recordEntropyEvent: vi.fn((event: { type?: string }) => {
                state.entropy.lastEvent = event?.type ?? null;
            }),
            collectCoins: vi.fn((amount: number) => {
                const safeAmount = Math.max(0, Math.floor(amount));
                state.coins += safeAmount;
                state.score += safeAmount;
            }),
            getEntropyState: vi.fn(() => ({ ...state.entropy })),
        };
    }),
}));

vi.mock('render/hud', () => ({
    buildHudScoreboard: vi.fn(() => ({
        score: 0,
        livesRemaining: 3,
        combo: 0,
    })),
}));

vi.mock('render/effects/dynamic-light', () => ({
    createDynamicLight: vi.fn(() => ({
        container: {
            zIndex: 0,
            alpha: 1,
            parent: null,
            removeFromParent() {
                if (this.parent && typeof (this.parent as any).removeChild === 'function') {
                    (this.parent as any).removeChild(this);
                }
            },
        },
        flash: vi.fn(),
        update: vi.fn(),
        destroy: vi.fn(),
    })),
}));

vi.mock('render/hud-display', () => ({
    createHudDisplay: vi.fn(() => {
        const container = {
            scale: { set: vi.fn() },
            position: { set: vi.fn() },
            addChild: vi.fn(),
        };
        return {
            container,
            width: 200,
            getHeight: () => 90,
            update: vi.fn(),
            pulseCombo: vi.fn(),
        };
    }),
    HudPowerUpView: vi.fn(),
    HudRewardView: vi.fn(),
}));

const createMockScene = () => ({
    destroy: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    update: vi.fn(),
    init: vi.fn(),
});

vi.mock('scenes/main-menu', () => ({
    createMainMenuScene: vi.fn(() => createMockScene()),
}));

vi.mock('scenes/gameplay', () => ({
    createGameplayScene: vi.fn(() => createMockScene()),
}));

vi.mock('scenes/level-complete', () => ({
    createLevelCompleteScene: vi.fn(() => createMockScene()),
}));

vi.mock('scenes/game-over', () => ({
    createGameOverScene: vi.fn(() => createMockScene()),
}));

vi.mock('scenes/pause', () => ({
    createPauseScene: vi.fn(() => createMockScene()),
}));

vi.mock('render/effects/starfield', () => ({
    createStarfield: vi.fn(() => ({
        children: [],
    })),
    updateStarfieldColor: vi.fn(),
}));

vi.mock('physics/ball-attachment', () => {
    class BallAttachmentController {
        createAttachedBall(position: { x: number; y: number }, options: { radius: number }) {
            const physicsBody = {
                label: 'ball',
                position: { ...position },
                velocity: { x: 0, y: 0 },
                angle: 0,
            };
            const ball = {
                physicsBody,
                radius: options.radius,
                isAttached: true,
                attachmentOffset: { x: 0, y: 0 },
                position: { ...position },
            };
            ballState.instances.push(ball);
            return ball;
        }
        updateAttachment = vi.fn();
    }
    return { BallAttachmentController };
});

vi.mock('render/paddle-body', () => {
    class PaddleBodyController {
        createPaddle(position: { x: number; y: number }, options: { width: number; height: number }) {
            const physicsBody = {
                label: 'paddle',
                position: { ...position },
                velocity: { x: 0, y: 0 },
                angle: 0,
            };
            const paddle = {
                physicsBody,
                width: options.width,
                height: options.height,
                position: { ...position },
            };
            paddleState.instances.push(paddle);
            return paddle;
        }
        getPaddleCenter = vi.fn((paddle: { physicsBody: { position: { x: number; y: number } } }) => ({
            x: paddle.physicsBody.position.x,
            y: paddle.physicsBody.position.y,
        }));
    }
    return { PaddleBodyController };
});

vi.mock('input/input-manager', () => {
    class GameInputManager {
        constructor() {
            inputManagerState.instances.push(this);
        }
        initialize = vi.fn();
        resetLaunchTrigger = vi.fn();
        syncPaddlePosition = vi.fn();
        getPaddleTarget = vi.fn(() => null);
        shouldLaunch = vi.fn(() => false);
        consumeLaunchIntent = vi.fn(() => ({ direction: { x: 0, y: -1 } }));
    }
    return { GameInputManager };
});

vi.mock('physics/ball-launch', () => ({
    PhysicsBallLaunchController: class {
        constructor() {
            launchControllerState.instances.push(this);
        }
        launch = vi.fn();
    },
}));

vi.mock('util/paddle-reflection', () => ({
    reflectOffPaddle: vi.fn(),
    calculateReflectionData: vi.fn(() => ({
        angle: 0,
        impactOffset: 0,
    })),
}));

vi.mock('util/speed-regulation', () => ({
    regulateSpeed: vi.fn(),
    getAdaptiveBaseSpeed: vi.fn((target: number, max: number) => Math.min(max, target)),
}));

vi.mock('util/scoring', () => ({
    createScoring: vi.fn(() => ({
        score: 0,
        combo: 0,
        comboTimer: 0,
    })),
    awardBrickPoints: vi.fn(() => 100),
    decayCombo: vi.fn((state: { comboTimer: number }, delta: number) => {
        state.comboTimer = Math.max(0, state.comboTimer - delta);
    }),
    resetCombo: vi.fn((state: { combo: number; comboTimer: number }) => {
        state.combo = 0;
        state.comboTimer = 0;
    }),
}));

vi.mock('./combo-milestones', () => ({
    publishComboMilestoneIfNeeded: vi.fn(),
}));

vi.mock('util/power-ups', () => {
    class PowerUpManager {
        constructor() {
            powerUpManagerState.instances.push(this);
        }
        #effects = new Map<string, { type: string; remainingTime: number }>();
        activate(type: string, options: { defaultDuration?: number }) {
            const remainingTime = options.defaultDuration ?? 0;
            this.#effects.set(type, { type, remainingTime });
        }
        clearAll() {
            this.#effects.clear();
        }
        getActiveEffects() {
            return Array.from(this.#effects.values());
        }
        getEffect(type: string) {
            return this.#effects.get(type) ?? null;
        }
        isActive(type: string) {
            return this.#effects.has(type);
        }
        update = vi.fn((delta: number) => {
            for (const entry of this.#effects.values()) {
                entry.remainingTime = Math.max(0, entry.remainingTime - delta);
                if (entry.remainingTime === 0) {
                    this.#effects.delete(entry.type);
                }
            }
        });
    }
    return {
        PowerUpManager,
        shouldSpawnPowerUp: vi.fn(() => false),
        selectRandomPowerUpType: vi.fn(() => 'paddle-width'),
        calculatePaddleWidthScale: vi.fn((effect: { remainingTime: number } | null, options: { paddleWidthMultiplier: number }) =>
            (effect ? options.paddleWidthMultiplier : 1)
        ),
        calculateBallSpeedScale: vi.fn((effect: { remainingTime: number } | null) => (effect ? 1.2 : 1)),
    };
});

vi.mock('render/playfield-visuals', () => ({
    toColorNumber: (value: string) => parseInt(value.replace('#', ''), 16),
    clampUnit: (value: number) => Math.max(0, Math.min(1, value)),
    mixColors: vi.fn(() => 0xff00ff),
    drawBallVisual: vi.fn(),
    drawPaddleVisual: vi.fn(),
    createPlayfieldBackgroundLayer: vi.fn(() => ({
        container: {
            addChild: vi.fn(),
            removeChild: vi.fn(),
        },
        tiling: {
            tilePosition: { x: 0, y: 0 },
        },
    })),
}));

vi.mock('render/combo-ring', () => ({
    createComboRing: vi.fn(() => ({
        container: {
            zIndex: 0,
            removeFromParent: vi.fn(),
        },
        update: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
    })),
}));

vi.mock('pixi.js', () => {
    class MockContainer {
        children: unknown[] = [];
        parent: MockContainer | null = null;
        zIndex = 0;
        visible = true;
        sortableChildren = false;
        eventMode: string | undefined;
        alpha = 1;
        x = 0;
        y = 0;
        rotation = 0;
        position = { set: vi.fn() };
        scale = { set: vi.fn() };
        addChild(...children: any[]) {
            for (const child of children) {
                if (!child) {
                    continue;
                }
                child.parent = this;
                this.children.push(child);
            }
            return children.at(-1);
        }
        removeChild(...children: any[]) {
            for (const child of children) {
                this.children = this.children.filter((entry) => entry !== child);
                if (child) {
                    child.parent = null;
                }
            }
            return children.at(-1);
        }
        addChildAt(child: any, index: number) {
            if (!child) {
                return child;
            }
            child.parent = this;
            const targetIndex = Math.max(0, Math.min(index, this.children.length));
            this.children.splice(targetIndex, 0, child);
            return child;
        }
        removeFromParent() {
            if (this.parent) {
                this.parent.removeChild(this);
            }
        }
    }

    class MockSprite extends MockContainer { }
    class MockTexture {
        static WHITE = new MockTexture();
    }

    class MockColorMatrixFilter {
        reset = vi.fn();
        hue = vi.fn();
        saturate = vi.fn();
    }

    class MockFillGradient {
        constructor(x0: number, y0: number, x1: number, y1: number) {
            void x0;
            void y0;
            void x1;
            void y1;
        }
        addColorStop = vi.fn();
    }

    class MockApplication {
        renderer = {
            background: { color: 0 },
            generateTexture: vi.fn(() => ({})),
        };
        canvas = document.createElement('canvas');
        stage = new MockContainer();
        render = vi.fn();
        destroy = vi.fn();
        async init() {
            return Promise.resolve();
        }
    }

    return {
        Container: MockContainer,
        Graphics: vi.fn(() => ({
            beginFill: vi.fn().mockReturnThis(),
            drawCircle: vi.fn().mockReturnThis(),
            endFill: vi.fn().mockReturnThis(),
            lineStyle: vi.fn().mockReturnThis(),
            drawRect: vi.fn().mockReturnThis(),
            addChild: vi.fn().mockReturnThis(),
            destroy: vi.fn().mockReturnThis(),
        })),
        Sprite: MockSprite,
        Texture: MockTexture,
        ColorMatrixFilter: MockColorMatrixFilter,
        Application: MockApplication,
        FillGradient: MockFillGradient,
    };
});

vi.mock('@pixi/filter-glow', () => ({
    GlowFilter: class {
        distance: number;
        outerStrength: number;
        innerStrength: number;
        color: number;
        quality: number;
        constructor(options: { distance: number; outerStrength: number; innerStrength: number; color: number; quality: number }) {
            this.distance = options.distance;
            this.outerStrength = options.outerStrength;
            this.innerStrength = options.innerStrength;
            this.color = options.color;
            this.quality = options.quality;
        }
    },
}));

vi.mock('matter-js', () => ({
    Events: {
        on: vi.fn(),
    },
    Body: {
        setVelocity: vi.fn((body: any, velocity: { x: number; y: number }) => {
            body.velocity = { ...velocity };
        }),
        setAngularVelocity: vi.fn((body: any, velocity: number) => {
            body.angularVelocity = velocity;
        }),
        setPosition: vi.fn((body: any, position: { x: number; y: number }) => {
            body.position = { ...position };
        }),
    },
    Vector: {
        magnitude: ({ x = 0, y = 0 }: { x?: number; y?: number }) => Math.hypot(x, y),
    },
}));

vi.mock('./multi-ball-controller', () => ({
    createMultiBallController: vi.fn(() => ({
        promoteExtraBallToPrimary: vi.fn(() => false),
        removeExtraBallByBody: vi.fn(),
        clear: vi.fn(),
        spawnExtraBalls: vi.fn(),
        count: vi.fn(() => 0),
        isExtraBallBody: vi.fn(() => false),
    })),
}));

vi.mock('./level-runtime', () => ({
    createLevelRuntime: vi.fn(() => {
        const brickHealth = new Map();
        const brickMetadata = new Map();
        const brickVisualState = new Map();
        return {
            brickHealth,
            brickMetadata,
            brickVisualState,
            loadLevel: vi.fn(() => ({
                powerUpChanceMultiplier: 1,
                difficultyMultiplier: 1,
                layoutBounds: {
                    minX: 100,
                    maxX: 300,
                    minY: 150,
                    maxY: 400,
                },
                breakableBricks: 5,
            })),
            updateBrickLighting: vi.fn(),
            updateBrickDamage: vi.fn(),
            findPowerUp: vi.fn(() => null),
            removePowerUp: vi.fn(),
            clearGhostEffect: vi.fn(),
            resetGhostBricks: vi.fn(),
            applyGhostBrickReward: vi.fn(),
            updateGhostBricks: vi.fn(),
            getGhostBrickRemainingDuration: vi.fn(() => 0),
            spawnPowerUp: vi.fn(),
        };
    }),
}));

vi.mock('game/rewards', () => ({
    spinWheel: vi.fn(() => ({
        type: 'double-points',
        duration: 5,
        multiplier: 2,
    })),
}));

vi.mock('util/input-helpers', () => ({
    smoothTowards: vi.fn((_current: number, target: number) => target),
}));

vi.mock('util/log', () => ({
    rootLogger: {
        child: vi.fn(() => ({
            error: vi.fn(),
            info: vi.fn(),
        })),
    },
}));

import { createGameRuntime } from 'app/game-runtime';
import { createGameplayScene } from 'scenes/gameplay';

describe('createGameRuntime', () => {
    const makeRandomManager = () => ({
        reset: vi.fn(),
        seed: vi.fn(() => 123),
        setSeed: vi.fn(() => 123),
        next: vi.fn(() => 0.5),
        random: vi.fn(() => 0.5),
        nextInt: vi.fn(() => 0),
        boolean: vi.fn(() => false),
    });

    const makeReplayBuffer = () => ({
        begin: vi.fn(),
        recordSeed: vi.fn(),
        markTime: vi.fn(),
        recordPaddleTarget: vi.fn(),
        recordLaunch: vi.fn(),
        snapshot: vi.fn(() => ({
            version: 1 as const,
            seed: null,
            durationSeconds: 0,
            events: [] as const,
        })),
        toJSON: vi.fn(() => ({
            version: 1 as const,
            seed: null,
            durationSeconds: 0,
            events: [] as const,
        })),
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        toneState.contextState = 'suspended';
        toneState.transportState = 'stopped';
        toneState.resumeImpl = () => {
            toneState.contextState = 'running';
            return Promise.resolve();
        };
        toneState.startImpl = () => {
            toneState.transportState = 'started';
            return Promise.resolve();
        };
        toneState.resumeMock.mockClear();
        toneState.transportStartMock.mockClear();
        initializerState.instances.length = 0;
        powerUpManagerState.instances.length = 0;
        inputManagerState.instances.length = 0;
        paddleState.instances.length = 0;
        ballState.instances.length = 0;
        physicsWorldState.instances.length = 0;
        launchControllerState.instances.length = 0;
    });

    it('resumes Tone audio and starts the transport before creating the runtime', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        expect(toneState.resumeMock).toHaveBeenCalledTimes(1);
        expect(toneState.transportStartMock).toHaveBeenCalledTimes(1);
        expect(initializerState.instances).toHaveLength(1);
        expect(initializerState.instances[0]?.musicDirector.setState).toHaveBeenCalledWith({
            lives: 3,
            combo: 0,
        });

        handle.dispose();
    });

    it('skips Tone resume and transport start when audio is already running', async () => {
        toneState.contextState = 'running';
        toneState.transportState = 'started';

        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        expect(toneState.resumeMock).not.toHaveBeenCalled();
        expect(toneState.transportStartMock).not.toHaveBeenCalled();

        handle.dispose();
    });

    it('handles synchronous Tone resume and transport responses', async () => {
        toneState.resumeImpl = () => {
            toneState.contextState = 'running';
            return undefined as unknown as Promise<void>;
        };
        toneState.startImpl = () => {
            toneState.transportState = 'started';
            return undefined as unknown as Promise<void>;
        };

        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        expect(toneState.resumeMock).toHaveBeenCalledTimes(1);
        expect(toneState.transportStartMock).toHaveBeenCalledTimes(1);

        handle.dispose();
    });

    it('continues initialization if Tone resume never settles', async () => {
        vi.useFakeTimers();
        toneState.resumeImpl = () => new Promise(() => {/* intentional no-op */ });

        const container = document.createElement('div');
        document.body.appendChild(container);

        const runtimePromise = createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        try {
            await vi.advanceTimersByTimeAsync(250);
            const handle = await runtimePromise;

            expect(toneState.resumeMock).toHaveBeenCalledTimes(1);
            expect(toneState.transportStartMock).toHaveBeenCalledTimes(1);

            handle.dispose();
        } finally {
            vi.useRealTimers();
        }
    });

    it('invokes onAudioBlocked when autoplay is prevented and continues initialization', async () => {
        const blockedError = Object.assign(new Error('NotAllowed'), { name: 'NotAllowedError' });
        toneState.resumeImpl = () => Promise.reject(blockedError);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const onAudioBlocked = vi.fn();

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
            onAudioBlocked,
        });

        expect(onAudioBlocked).toHaveBeenCalledTimes(1);
        expect(onAudioBlocked).toHaveBeenCalledWith(blockedError);
        expect(toneState.transportStartMock).not.toHaveBeenCalled();
        expect(initializerState.instances).toHaveLength(1);

        handle.dispose();
    });

    it('invokes onAudioBlocked for autoplay errors identified by message', async () => {
        const blockedError = new Error('Audio context was not allowed to start automatically.');
        toneState.resumeImpl = () => Promise.reject(blockedError);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const onAudioBlocked = vi.fn();

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
            onAudioBlocked,
        });

        expect(onAudioBlocked).toHaveBeenCalledTimes(1);
        expect(onAudioBlocked).toHaveBeenCalledWith(blockedError);
        expect(toneState.transportStartMock).not.toHaveBeenCalled();

        handle.dispose();
    });

    it('rethrows unexpected Tone resume errors', async () => {
        const unexpectedError = new Error('Network failure');
        toneState.resumeImpl = () => Promise.reject(unexpectedError);

        const container = document.createElement('div');
        document.body.appendChild(container);

        await expect(
            createGameRuntime({
                container,
                random: makeRandomManager(),
                replayBuffer: makeReplayBuffer(),
            }),
        ).rejects.toBe(unexpectedError);

        expect(toneState.transportStartMock).not.toHaveBeenCalled();
    });

    it('disposes initializer resources when handle is disposed', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        const disposeSpy = initializerState.instances[0]?.dispose;
        expect(disposeSpy).toBeDefined();

        handle.dispose();
        expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('executes gameplay update to advance physics, input, and replay state', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const replayBuffer = makeReplayBuffer();
        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer,
        });

        const stageInstance = initializerState.instances[0]?.stage;
        expect(stageInstance).toBeDefined();
        const stage = stageInstance!;

        const registerCalls = stage.register.mock.calls as [
            string,
            (context: unknown) => unknown,
            unknown?,
        ][];
        const gameplayRegistration = registerCalls.find(([name]) => name === 'gameplay');
        expect(gameplayRegistration).toBeDefined();
        const gameplayFactory = gameplayRegistration?.[1];
        expect(gameplayFactory).toBeInstanceOf(Function);

        gameplayFactory?.({} as never);

        const gameplayMock = vi.mocked(createGameplayScene);
        const gameplayOptions = gameplayMock.mock.calls.at(-1)?.[1] as { onUpdate: (delta: number) => void } | undefined;
        expect(gameplayOptions?.onUpdate).toBeDefined();
        const onUpdate = gameplayOptions!.onUpdate;

        const powerManager = powerUpManagerState.instances[0];
        const physicsWorld = physicsWorldState.instances[0];
        const inputManager = inputManagerState.instances[0];
        const launchController = launchControllerState.instances[0];
        const paddle = paddleState.instances[0];
        const ball = ballState.instances[0];

        expect(powerManager).toBeDefined();
        expect(physicsWorld).toBeDefined();
        expect(inputManager).toBeDefined();
        expect(launchController).toBeDefined();
        expect(paddle).toBeDefined();
        expect(ball).toBeDefined();

        const paddleTarget = { x: 600, y: 680 };
        inputManager!.getPaddleTarget.mockReturnValue(paddleTarget);
        stage.toPlayfield.mockImplementation((point: { x: number; y: number }) => point);
        inputManager!.shouldLaunch.mockReturnValue(true);
        inputManager!.consumeLaunchIntent.mockReturnValue({ direction: { x: 0, y: -1 } });

        const resetCallsBefore = inputManager!.resetLaunchTrigger.mock.calls.length;

        onUpdate(0.016);

        expect(powerManager!.update).toHaveBeenCalledWith(0.016);
        expect(replayBuffer.markTime).toHaveBeenCalledTimes(1);
        expect(replayBuffer.markTime.mock.calls[0]?.[0]).toBeCloseTo(0.016, 5);
        expect(replayBuffer.recordPaddleTarget).toHaveBeenCalledTimes(1);
        const [targetTime, targetPoint] = replayBuffer.recordPaddleTarget.mock.calls[0]!;
        expect(targetTime).toBeCloseTo(0.016, 5);
        expect(targetPoint).toEqual(paddleTarget);
        expect(physicsWorld!.updateBallAttachment).toHaveBeenCalledWith(ball!.physicsBody, expect.objectContaining({ x: paddle!.physicsBody.position.x, y: paddle!.physicsBody.position.y }));
        expect(inputManager!.syncPaddlePosition).toHaveBeenCalledWith(expect.objectContaining({ x: paddle!.physicsBody.position.x }));
        expect(replayBuffer.recordLaunch).toHaveBeenCalledTimes(1);
        expect(physicsWorld!.detachBallFromPaddle).toHaveBeenCalledWith(ball!.physicsBody);
        expect(launchController!.launch).toHaveBeenCalledTimes(1);
        const [, , launchSpeed] = launchController!.launch.mock.calls[0]!;
        expect(launchSpeed).toBeCloseTo(9, 5);
        expect(physicsWorld!.step).toHaveBeenCalledTimes(1);
        expect(physicsWorld!.step.mock.calls[0]?.[0]).toBeCloseTo(16, 5);
        expect(inputManager!.resetLaunchTrigger.mock.calls.length).toBe(resetCallsBefore + 1);

        handle.dispose();
    });
});
