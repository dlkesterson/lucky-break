import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { toneState, resetToneState } from './__helpers__/tone-mock';
import {
    ballState,
    createGameInitializerMock,
    createGameSessionManagerMock,
    highScoreModule,
    initializerState,
    inputManagerState,
    launchControllerState,
    loggerState,
    matterEventsState,
    metaUpgradeState,
    multiBallControllerMockFactory,
    paddleState,
    physicsWorldState,
    powerUpManagerState,
    prestigeModule,
    resetRuntimeFacadeTestState,
    setActiveTheme,
    themeMockState,
} from './__helpers__/runtime-facade-test-harness';

vi.mock('app/metaprogression', () => {
    const state = metaUpgradeState;

    const manager = {
        getLoadout: vi.fn(() => state.loadout),
        getCatalog: vi.fn(() => ({
            visualPalettes: [state.loadout.visualPalette],
            audioPalettes: [state.loadout.audioPalette],
            traits: [],
        })),
        getSnapshot: vi.fn(() => state.snapshot),
        grantDust: vi.fn((amount: number) => {
            if (Number.isFinite(amount) && amount > 0) {
                state.snapshot = {
                    ...state.snapshot,
                    dustBalance: state.snapshot.dustBalance + Math.floor(amount),
                    unlocked: {
                        visualPalettes: [...state.snapshot.unlocked.visualPalettes],
                        audioPalettes: [...state.snapshot.unlocked.audioPalettes],
                        traits: [...state.snapshot.unlocked.traits],
                    },
                    equipped: {
                        visualPalette: state.snapshot.equipped.visualPalette,
                        audioPalette: state.snapshot.equipped.audioPalette,
                        traits: [...state.snapshot.equipped.traits],
                    },
                } satisfies typeof state.snapshot;
            }
            const snapshot = state.cloneSnapshot(state.snapshot);
            state.snapshot = snapshot;
            for (const listener of state.listeners) {
                listener(state.cloneSnapshot(snapshot));
            }
            return {
                dustBalance: snapshot.dustBalance,
                snapshot: state.cloneSnapshot(snapshot),
            };
        }),
        purchase: vi.fn(() => ({ success: false, snapshot: state.cloneSnapshot(state.snapshot) })),
        equipVisualPalette: vi.fn(() => ({ success: true, snapshot: state.cloneSnapshot(state.snapshot) })),
        equipAudioPalette: vi.fn(() => ({ success: true, snapshot: state.cloneSnapshot(state.snapshot) })),
        toggleTrait: vi.fn(() => ({ success: true, snapshot: state.cloneSnapshot(state.snapshot) })),
        subscribe: vi.fn((listener) => {
            state.listeners.add(listener);
            listener(state.cloneSnapshot(state.snapshot));
            return () => {
                state.listeners.delete(listener);
            };
        }),
    };

    state.manager = manager;

    return {
        getMetaUpgradeManager: () => manager,
        setMetaUpgradeManager: vi.fn(),
    };
});

vi.mock('util/prestige', () => prestigeModule);

vi.mock('app/game-initializer', () => ({
    createGameInitializer: createGameInitializerMock,
}));

vi.mock('render/theme', () => ({
    GameTheme: themeMockState.defaultTheme,
    onThemeChange: themeMockState.onThemeChange,
    setActiveTheme: themeMockState.setActiveTheme,
    getActiveThemeName: themeMockState.getActiveThemeName,
    getThemeOptions: themeMockState.getThemeOptions,
    toggleTheme: themeMockState.toggleTheme,
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
            isBallAttached: vi.fn(() => false),
            getBallAttachment: vi.fn(() => null),
            step: vi.fn(),
            engine: {},
            setGravity: vi.fn(),
            getGravity: vi.fn(() => 0),
        };
        physicsWorldState.instances.push(instance);
        return instance;
    }),
}));

vi.mock('app/loop', () => ({
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

vi.mock('app/state', () => ({
    createGameSessionManager: createGameSessionManagerMock,
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
            parent: null as unknown,
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

vi.mock('render/effects/ball-trails', () => ({
    createBallTrailsEffect: vi.fn(() => ({
        container: {
            parent: null as unknown,
            removeFromParent() {
                if (this.parent && typeof (this.parent as any).removeChild === 'function') {
                    (this.parent as any).removeChild(this);
                }
            },
            destroy: vi.fn(),
        },
        update: vi.fn(),
        applyTheme: vi.fn(),
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
            setTheme: vi.fn(),
            setEntropyActionHandler: vi.fn(),
        };
    }),
    HudPowerUpView: vi.fn(),
    HudRewardView: vi.fn(),
}));

vi.mock('util/high-scores', () => highScoreModule);

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
        getDebugInfo = vi.fn(() => ({
            isAttached: true,
            position: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            attachmentOffset: { x: 0, y: 0 },
        }));
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
        getDebugInfo = vi.fn(() => ({
            position: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            physicsBodyId: 0,
            inputState: {
                activeInputs: [],
                primaryInput: null,
                mousePosition: null,
                touchPosition: null,
                gamepadCursor: null,
                gamepadAxisRaw: null,
                gamepadAxisNormalized: null,
                gamepadButtonsPressed: [],
                gamepadLaunchHeld: false,
                keyboardPressed: [],
                paddleTarget: null,
                aimDirection: null,
                launchPending: false,
            },
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
        consumeKeyPress = vi.fn(() => false);
        getDebugState = vi.fn(() => ({
            activeInputs: [],
            primaryInput: null,
            mousePosition: null,
            touchPosition: null,
            gamepadCursor: null,
            gamepadAxisRaw: null,
            gamepadAxisNormalized: null,
            gamepadButtonsPressed: [],
            gamepadLaunchHeld: false,
            keyboardPressed: [],
            paddleTarget: null,
            aimDirection: null,
            launchPending: false,
        }));
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
        momentum: {
            volleyLength: 0,
            speedPressure: 0,
            brickDensity: 1,
            comboHeat: 0,
            comboTimer: 0,
        },
    })),
    awardBrickPoints: vi.fn(() => 100),
    decayCombo: vi.fn((state: { comboTimer: number }, delta: number) => {
        state.comboTimer = Math.max(0, state.comboTimer - delta);
    }),
    resetCombo: vi.fn((state: { combo: number; comboTimer: number }) => {
        state.combo = 0;
        state.comboTimer = 0;
    }),
    getMomentumMetrics: vi.fn((state: { momentum?: Record<string, number> }) => ({
        volleyLength: state.momentum?.volleyLength ?? 0,
        speedPressure: state.momentum?.speedPressure ?? 0,
        brickDensity: state.momentum?.brickDensity ?? 0,
        comboHeat: state.momentum?.comboHeat ?? 0,
        comboTimer: state.momentum?.comboTimer ?? 0,
    })),
}));

vi.mock('app/combo-milestones', () => ({
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
        refresh(type: string, options: { defaultDuration?: number }) {
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
            for (const entry of [...this.#effects.values()]) {
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
        tilingSprite: null,
        overlay: {
            removeFromParent: vi.fn(),
        },
        setTint: vi.fn(),
        setParallaxTarget: vi.fn(),
        applyBeatPulse: vi.fn(),
        update: vi.fn(),
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
        destroy = vi.fn();
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
        roundRect = vi.fn();
        stroke = vi.fn();
        circle = vi.fn();
        moveTo = vi.fn();
        lineTo = vi.fn();
    }
    class MockSprite extends MockContainer { }
    class MockTexture {
        static WHITE = new MockTexture();
    }

    class MockTextStyle {
        constructor(public options: unknown) {
            void options;
        }
    }

    class MockText extends MockContainer {
        style: MockTextStyle;
        private _text = '';
        width = 0;
        height = 0;
        constructor(text: string, style: MockTextStyle) {
            super();
            this.style = style;
            this.text = text;
        }
        get text(): string {
            return this._text;
        }
        set text(value: string) {
            this._text = value;
            const lines = value.split('\n');
            const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
            this.width = maxLineLength * 8;
            this.height = lines.length * 18;
        }
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

    class MockUniformGroup {
        uniforms: Record<string, unknown>;
        constructor(definition: Record<string, { value: unknown }>) {
            this.uniforms = {};
            for (const [key, descriptor] of Object.entries(definition)) {
                const value = descriptor?.value;
                if (value instanceof Float32Array) {
                    this.uniforms[key] = new Float32Array(value);
                } else if (Array.isArray(value)) {
                    this.uniforms[key] = [...value];
                } else if (typeof value === 'object' && value !== null) {
                    const cloneSource = value as Record<string, unknown>;
                    this.uniforms[key] = { ...cloneSource };
                } else {
                    this.uniforms[key] = value;
                }
            }
        }
        update = vi.fn();
    }

    class MockFilter {
        static from(options: { resources?: Record<string, Record<string, { value: unknown }>>; padding?: number }) {
            const source = options?.resources ?? {};
            const resources = Object.fromEntries(
                Object.entries(source).map(([key, value]) => [key, new MockUniformGroup(value)]),
            );
            const instance = new MockFilter(resources);
            instance.padding = options?.padding ?? 0;
            return instance;
        }

        resources: Record<string, MockUniformGroup>;
        enabled = true;
        padding = 0;

        constructor(resources: Record<string, MockUniformGroup>) {
            this.resources = resources;
        }

        destroy = vi.fn();
    }

    return {
        Container: MockContainer,
        Graphics: MockGraphics,
        Sprite: MockSprite,
        Texture: MockTexture,
        ColorMatrixFilter: MockColorMatrixFilter,
        Application: MockApplication,
        FillGradient: MockFillGradient,
        Text: MockText,
        TextStyle: MockTextStyle,
        Filter: MockFilter,
        defaultFilterVert: 'mock-filter-vert',
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
        destroy = vi.fn();
    },
}));

vi.mock('physics/matter', () => {
    const exports = {
        Events: {
            on: matterEventsState.on,
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
    };

    return {
        ...exports,
        default: exports,
    };
});

vi.mock('app/multi-ball-controller', () => ({
    createMultiBallController: multiBallControllerMockFactory,
}));

vi.mock('app/level-runtime', () => ({
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
            setRowColors: vi.fn(),
            setHazardIntensityMultiplier: vi.fn(),
            findPowerUp: vi.fn(() => null),
            removePowerUp: vi.fn(),
            clearGhostEffect: vi.fn(),
            resetGhostBricks: vi.fn(),
            applyGhostBrickReward: vi.fn(),
            updateGhostBricks: vi.fn(),
            getGhostBrickRemainingDuration: vi.fn(() => 0),
            spawnPowerUp: vi.fn(),
            spawnCoin: vi.fn(),
            forceClearBreakableBricks: vi.fn(),
            clearActivePowerUps: vi.fn(),
            clearActiveCoins: vi.fn(),
        };
    }),
}));

vi.mock('game/rewards', () => {
    let override: unknown = null;

    const buildReward = (type: string) => {
        switch (type) {
            case 'sticky-paddle':
                return { type: 'sticky-paddle', duration: 5 } as const;
            case 'double-points':
                return { type: 'double-points', duration: 5, multiplier: 2 } as const;
            case 'ghost-brick':
                return { type: 'ghost-brick', duration: 5, ghostCount: 3 } as const;
            case 'multi-ball':
                return { type: 'multi-ball', duration: 5, extraBalls: 2 } as const;
            case 'slow-time':
                return { type: 'slow-time', duration: 5, timeScale: 0.5 } as const;
            case 'wide-paddle':
                return { type: 'wide-paddle', duration: 5, widthMultiplier: 2 } as const;
            default:
                return { type: 'sticky-paddle', duration: 5 } as const;
        }
    };

    return {
        spinWheel: vi.fn(() => buildReward('double-points')),
        createReward: vi.fn((type: string) => buildReward(type)),
        setRewardOverride: vi.fn((value: unknown) => {
            override = value;
        }),
        getRewardOverride: vi.fn(() => override),
    };
});

vi.mock('util/input-helpers', () => ({
    smoothTowards: vi.fn((_current: number, target: number) => target),
}));

vi.mock('util/log', () => ({
    rootLogger: {
        child: vi.fn((name: string) => {
            const logger = {
                debug: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
            } satisfies Record<'debug' | 'error' | 'info' | 'warn', Mock>;
            if (name === 'game-runtime') {
                loggerState.runtime = logger;
            }
            return logger;
        }),
    },
}));

import { createGameRuntime } from 'app/game-runtime';
import { deriveLayoutSeed } from 'util/levels';
import {
    SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS,
    SYNC_DRIFT_WARN_THRESHOLD_MS,
    SYNC_DRIFT_RECOVERY_THRESHOLD_MS,
    SYNC_DRIFT_HISTORY_SECONDS,
} from 'app/runtime/state-store';
import { createGameplayScene } from 'scenes/gameplay';
import { createMainMenuScene } from 'scenes/main-menu';

describe('runtime facade helpers', () => {
    it('derives layout seeds deterministically and remaps zero hashes', () => {
        const baseSeed = 1234;
        const levelIndex = 2;
        const expected = ((baseSeed ^ Math.imul(levelIndex + 1, 0x9e3779b1)) >>> 0) || 1;
        expect(deriveLayoutSeed(baseSeed, levelIndex)).toBe(expected);

        const zeroHashSeed = Math.imul(1, 0x9e3779b1) >>> 0;
        expect(deriveLayoutSeed(zeroHashSeed, 0)).toBe(1);
    });
});

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
        recordBiasChoice: vi.fn(),
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
        resetToneState();
        resetRuntimeFacadeTestState();
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
        expect(initializerState.instances[0]?.musicDirector.setState).toHaveBeenCalledWith(
            expect.objectContaining({
                lives: 3,
                combo: 0,
            }),
        );

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

    it('provides a deterministic session clock to the session manager', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        expect(createGameSessionManagerMock).toHaveBeenCalled();
        const sessionOptions = createGameSessionManagerMock.mock.calls.at(-1)?.[0] as {
            now?: () => number;
        } | undefined;
        expect(sessionOptions).toBeDefined();
        const nowFn = sessionOptions?.now ?? null;
        expect(typeof nowFn).toBe('function');
        expect(nowFn?.()).toBe(0);

        const stageInstance = initializerState.instances[0]?.stage;
        expect(stageInstance).toBeDefined();
        const registerCalls = stageInstance!.register.mock.calls as [
            string,
            (context: unknown) => unknown,
            unknown?,
        ][];
        const gameplayRegistration = registerCalls.find(([name]) => name === 'gameplay');
        expect(gameplayRegistration).toBeDefined();
        const gameplayFactory = gameplayRegistration?.[1];
        expect(gameplayFactory).toBeInstanceOf(Function);
        gameplayFactory?.({} as never);

        const gameplayOptions = vi.mocked(createGameplayScene).mock.calls.at(-1)?.[1] as {
            onUpdate: (delta: number) => void;
        } | undefined;
        expect(gameplayOptions?.onUpdate).toBeDefined();
        const onUpdate = gameplayOptions!.onUpdate;

        const deltaSeconds = 1 / 60;
        onUpdate(deltaSeconds);

        const expectedMs = Math.floor(deltaSeconds * 1000);
        expect(nowFn?.()).toBe(expectedMs);

        handle.dispose();
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

    it('logs sync drift telemetry samples and warnings', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const originalPerformance = globalThis.performance;
        let wallClockMs = 0;
        const fakePerformanceNow = vi.fn(() => wallClockMs);
        const fakePerformance = originalPerformance
            ? (Object.assign(Object.create(Object.getPrototypeOf(originalPerformance)), originalPerformance) as Performance)
            : ({ now: fakePerformanceNow } as unknown as Performance);

        Object.defineProperty(fakePerformance, 'now', {
            configurable: true,
            value: fakePerformanceNow as Performance['now'],
            writable: true,
        });

        Object.defineProperty(globalThis, 'performance', {
            configurable: true,
            enumerable: true,
            value: fakePerformance,
        });

        let handle: Awaited<ReturnType<typeof createGameRuntime>> | undefined;
        try {
            handle = await createGameRuntime({
                container,
                random: makeRandomManager(),
                replayBuffer: makeReplayBuffer(),
            });

            const stageInstance = initializerState.instances[0]?.stage;
            expect(stageInstance).toBeDefined();
            const registerCalls = stageInstance!.register.mock.calls as [
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

            const scheduler = initializerState.instances[0]?.scheduler;
            expect(scheduler).toBeDefined();
            let audioTime = 0;
            scheduler!.now.mockImplementation(() => audioTime);

            const logger = loggerState.runtime;
            expect(logger).toBeDefined();
            logger!.debug.mockClear();
            logger!.warn.mockClear();
            logger!.info.mockClear();

            const interval = SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
            const warnThreshold = SYNC_DRIFT_WARN_THRESHOLD_MS;
            const recoveryThreshold = SYNC_DRIFT_RECOVERY_THRESHOLD_MS;

            const severeDriftMs = Math.max(1, warnThreshold * 2);
            const mildDriftMs = Math.max(1, recoveryThreshold * 0.25);

            const step = (deltaSeconds: number, driftMs: number) => {
                audioTime += deltaSeconds;
                wallClockMs = (audioTime + driftMs / 1000) * 1000;
                onUpdate(deltaSeconds);
            };

            step(interval / 2, severeDriftMs);
            step(interval / 2, severeDriftMs);
            const warnCall = logger!.warn.mock.calls.find(([message]) => message === 'Audio sync drift above threshold');
            expect(warnCall).toBeDefined();
            expect(warnCall?.[1]).toMatchObject({
                peakMs: expect.any(Number),
                thresholdMs: warnThreshold,
            });

            const debugCall = logger!.debug.mock.calls.find(([message]) => message === 'Sync drift sample');
            expect(debugCall).toBeDefined();
            expect(debugCall?.[1]).toMatchObject({
                sampleCount: expect.any(Number),
                sampleWindowSeconds: SYNC_DRIFT_HISTORY_SECONDS,
            });

            expect(fakePerformanceNow).toHaveBeenCalled();

            step(interval / 2, mildDriftMs);
            step(interval / 2, mildDriftMs);
            step(interval / 2, mildDriftMs);
            step(interval / 2, mildDriftMs);

            const infoCall = logger!.info.mock.calls.find(([message]) => message === 'Audio sync drift recovered');
            expect(infoCall).toBeDefined();
            expect(infoCall?.[1]).toMatchObject({
                peakMs: expect.any(Number),
            });
        } finally {
            Object.defineProperty(globalThis, 'performance', {
                configurable: true,
                enumerable: true,
                value: originalPerformance,
            });
            handle?.dispose();
            container.remove();
        }
    });

    it('toggles the active theme when Shift+C is pressed', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        const themeSetter = setActiveTheme as unknown as Mock;
        themeSetter.mockClear();

        const event = new KeyboardEvent('keydown', { code: 'KeyC', shiftKey: true, cancelable: true });
        document.dispatchEvent(event);

        expect(themeSetter).toHaveBeenCalledWith('colorBlind');
        expect(event.defaultPrevented).toBe(true);

        handle.dispose();

        themeSetter.mockClear();
        setActiveTheme('default');
        themeSetter.mockClear();
    });

    it('provides high score data to the main menu scene factory', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        const stageInstance = initializerState.instances[0]?.stage;
        expect(stageInstance).toBeDefined();
        const registerCalls = stageInstance!.register.mock.calls as [
            string,
            (context: unknown) => unknown,
            unknown?,
        ][];
        const mainMenuRegistration = registerCalls.find(([name]) => name === 'main-menu');
        expect(mainMenuRegistration).toBeDefined();
        const factory = mainMenuRegistration?.[1];
        expect(factory).toBeInstanceOf(Function);
        factory?.({} as never);

        const mainMenuOptions = vi.mocked(createMainMenuScene).mock.calls.at(-1)?.[1] as {
            highScoresProvider?: () => unknown;
        } | undefined;
        expect(mainMenuOptions?.highScoresProvider).toBeInstanceOf(Function);

        const sampleScores = [
            { name: 'ACE', score: 12345, round: 4, achievedAt: 111 },
            { name: 'BEE', score: 8900, round: 3, achievedAt: 222 },
        ];
        highScoreModule.getHighScores.mockReturnValue(sampleScores);

        const provided = mainMenuOptions?.highScoresProvider?.();
        expect(highScoreModule.getHighScores).toHaveBeenCalledTimes(1);
        expect(provided).toEqual(sampleScores);
    });

    it('grants prestige dust and emits analytics when the run ends', async () => {
        prestigeModule.computePrestigeDust.mockReturnValueOnce(42);

        const container = document.createElement('div');
        document.body.appendChild(container);

        await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        const initializerInstance = initializerState.instances[0] as
            | {
                stage: { push: Mock };
                bus: { publish: Mock };
            }
            | undefined;
        expect(initializerInstance).toBeDefined();
        const stage = initializerInstance!.stage;
        const bus = initializerInstance!.bus;

        const manager = metaUpgradeState.manager as { grantDust: Mock } | null;
        expect(manager?.grantDust).toBeDefined();

        const collisionRegistration = matterEventsState.on.mock.calls.find((call) => call[1] === 'collisionStart');
        expect(collisionRegistration).toBeDefined();
        interface CollisionPair {
            bodyA: { label: string; velocity: { x: number; y: number }; position: { x: number; y: number } };
            bodyB: { label: string; velocity: { x: number; y: number }; position: { x: number; y: number } };
        }

        interface CollisionEvent {
            pairs: CollisionPair[];
        }

        const collisionHandler = collisionRegistration?.[2] as ((this: void, event: CollisionEvent) => void) | undefined;
        expect(collisionHandler).toBeInstanceOf(Function);

        const ballBody = { label: 'ball', velocity: { x: 0, y: 10 }, position: { x: 0, y: 0 } };
        const wallBody = { label: 'wall-bottom', velocity: { x: 0, y: 0 }, position: { x: 0, y: 0 } };

        for (let i = 0; i < 3; i += 1) {
            collisionHandler?.call(undefined, { pairs: [{ bodyA: ballBody, bodyB: wallBody }] });
        }

        expect(prestigeModule.computePrestigeDust).toHaveBeenCalledTimes(1);
        expect(prestigeModule.computePrestigeDust).toHaveBeenCalledWith(
            expect.objectContaining({
                score: expect.any(Number),
                roundsCompleted: expect.any(Number),
                highestCombo: expect.any(Number),
                coinsBanked: expect.any(Number),
            }),
            expect.any(Object),
        );

        expect(manager!.grantDust).toHaveBeenCalledTimes(1);
        expect(manager!.grantDust).toHaveBeenCalledWith(42);

        expect(bus.publish).toHaveBeenCalledWith(
            'PrestigeConversion',
            expect.objectContaining({
                sessionId: expect.any(String),
                totalScore: expect.any(Number),
                roundsCompleted: expect.any(Number),
                highestCombo: expect.any(Number),
                coins: expect.any(Number),
                dustAwarded: 42,
                timestamp: expect.any(Number),
            }),
        );

        expect(stage.push).toHaveBeenCalledWith(
            'game-over',
            expect.objectContaining({ dustAwarded: 42 }),
        );
    });

    it('records a high score submission when the game ends', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        await createGameRuntime({
            container,
            random: makeRandomManager(),
            replayBuffer: makeReplayBuffer(),
        });

        const collisionRegistration = matterEventsState.on.mock.calls.find((call) => call[1] === 'collisionStart');
        expect(collisionRegistration).toBeDefined();
        interface CollisionPair {
            bodyA: { label: string; velocity: { x: number; y: number }; position: { x: number; y: number } };
            bodyB: { label: string; velocity: { x: number; y: number }; position: { x: number; y: number } };
        }

        interface CollisionEvent {
            pairs: CollisionPair[];
        }

        const collisionHandler = collisionRegistration?.[2] as ((this: void, event: CollisionEvent) => void) | undefined;
        expect(collisionHandler).toBeInstanceOf(Function);

        const ballBody = { label: 'ball', velocity: { x: 0, y: 10 }, position: { x: 0, y: 0 } };
        const wallBody = { label: 'wall-bottom', velocity: { x: 0, y: 0 }, position: { x: 0, y: 0 } };

        for (let i = 0; i < 3; i += 1) {
            collisionHandler?.call(undefined, { pairs: [{ bodyA: ballBody, bodyB: wallBody }] });
        }

        expect(highScoreModule.recordHighScore).toHaveBeenCalled();
        const recordCall = highScoreModule.recordHighScore.mock.calls.at(-1);
        expect(recordCall).toBeDefined();
        const [scoreArg, recordOptions] = recordCall!;
        expect(typeof scoreArg).toBe('number');
        expect(recordOptions?.round).toBeGreaterThanOrEqual(1);
        expect(recordOptions?.minScore).toBe(1);
    });
});
