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
    });

    const layers: Record<string, { addChild: ReturnType<typeof vi.fn> }> = {
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

const createGameInitializerMock = vi.hoisted(() =>
    vi.fn(async (options: unknown) => {
        const stage = createStageStub();
        const dispose = vi.fn();
        const renderStageSoon = vi.fn();
        const musicDirector = {
            setState: vi.fn(),
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
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            return Promise.resolve(result).finally(() => {
                toneState.contextState = 'running';
            });
        }
        toneState.contextState = 'running';
        return result;
    });
    const transportStartMock = vi.fn(() => {
        const result = toneState.startImpl();
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
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
        constructor(_options: unknown) { }
        sync() {
            return this;
        }
        start = vi.fn();
        connect = vi.fn();
        dispose = vi.fn();
    }

    class MockVolume {
        constructor(_value: number) { }
        connect = vi.fn();
        dispose = vi.fn();
    }

    class MockPanner {
        constructor(_value: number) { }
        connect = vi.fn();
        toDestination = vi.fn();
        pan = {
            setValueAtTime: vi.fn(),
        };
        dispose = vi.fn();
    }

    type MockTonePlayer = {
        playbackRate: number;
        volume: { value: number };
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
    };

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
    createPhysicsWorld: vi.fn(() => ({
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
    })),
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
        const state = {
            sessionId: 'session-test',
            livesRemaining: 3,
            brickRemaining: 0,
        };
        return {
            startRound: vi.fn((options: { breakableBricks: number }) => {
                state.brickRemaining = options.breakableBricks;
            }),
            snapshot: vi.fn(() => ({ ...state })),
            recordBrickBreak: vi.fn(),
            recordLifeLost: vi.fn(() => {
                state.livesRemaining = Math.max(0, state.livesRemaining - 1);
            }),
            completeRound: vi.fn(() => {
                state.brickRemaining = 0;
            }),
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

vi.mock('physics/ball-attachment', () => {
    class BallAttachmentController {
        createAttachedBall(position: { x: number; y: number }, options: { radius: number }) {
            const physicsBody = {
                label: 'ball',
                position: { ...position },
                velocity: { x: 0, y: 0 },
                angle: 0,
            };
            return {
                physicsBody,
                radius: options.radius,
                isAttached: true,
                attachmentOffset: { x: 0, y: 0 },
                position: { ...position },
            };
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
            return {
                physicsBody,
                width: options.width,
                height: options.height,
                position: { ...position },
            };
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
        update(delta: number) {
            for (const entry of this.#effects.values()) {
                entry.remainingTime = Math.max(0, entry.remainingTime - delta);
                if (entry.remainingTime === 0) {
                    this.#effects.delete(entry.type);
                }
            }
        }
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

    class MockGraphics extends MockContainer {
        clear = vi.fn();
        rect = vi.fn();
        fill = vi.fn();
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
        constructor(_x0: number, _y0: number, _x1: number, _y1: number) { }
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
        Graphics: MockGraphics,
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
    });

    it('resumes Tone audio and starts the transport before creating the runtime', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
            starfieldTexture: null,
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
            starfieldTexture: null,
            onAudioBlocked,
        });

        expect(onAudioBlocked).toHaveBeenCalledTimes(1);
        expect(onAudioBlocked).toHaveBeenCalledWith(blockedError);
        expect(toneState.transportStartMock).not.toHaveBeenCalled();
        expect(initializerState.instances).toHaveLength(1);

        handle.dispose();
    });

    it('disposes initializer resources when handle is disposed', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
            starfieldTexture: null,
        });

        const disposeSpy = initializerState.instances[0]?.dispose;
        expect(disposeSpy).toBeDefined();

        handle.dispose();
        expect(disposeSpy).toHaveBeenCalledTimes(1);
    });
});
