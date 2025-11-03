import { vi, type Mock } from 'vitest';
import type { MetaUpgradeListener, MetaUpgradeLoadout, MetaUpgradeSnapshot } from 'app/meta-upgrades';
import type { LoadoutSelection, LoadoutSessionEffects } from 'config/loadouts';

const baseMetaSnapshot: MetaUpgradeSnapshot = {
    version: 1,
    dustBalance: 0,
    unlocked: {
        visualPalettes: ['baseline'],
        audioPalettes: ['baseline'],
        traits: [],
    },
    equipped: {
        visualPalette: 'baseline',
        audioPalette: 'baseline',
        traits: [],
    },
};

const cloneSnapshot = (snapshot: MetaUpgradeSnapshot): MetaUpgradeSnapshot => ({
    version: snapshot.version,
    dustBalance: snapshot.dustBalance,
    unlocked: {
        visualPalettes: [...snapshot.unlocked.visualPalettes],
        audioPalettes: [...snapshot.unlocked.audioPalettes],
        traits: [...snapshot.unlocked.traits],
    },
    equipped: {
        visualPalette: snapshot.equipped.visualPalette,
        audioPalette: snapshot.equipped.audioPalette,
        traits: [...snapshot.equipped.traits],
    },
});

const baseLoadout: MetaUpgradeLoadout = {
    visualPalette: {
        id: 'baseline',
        label: 'Baseline Prism',
        description: 'Default palette for tests',
        cost: 0,
        previewAccent: '#FFFFFF',
        ball: {
            core: '#FFFFFF',
            aura: '#FFFFFF',
            highlight: '#FFFFFF',
            baseAlpha: 0.78,
            rimAlpha: 0.38,
            innerAlpha: 0.32,
            innerScale: 0.5,
        },
        paddle: {
            gradient: ['#FFFFFF', '#DDDDDD'],
            accentColor: '#FFFFFF',
        },
        accents: {
            combo: '#FFFFFF',
            powerUp: '#FFFFFF',
            background: ['#101010', '#303030'],
        },
    },
    audioPalette: {
        id: 'baseline',
        label: 'Baseline Ensemble',
        description: 'Default audio palette for tests',
        cost: 0,
        config: {},
    },
    traitEffects: {
        extraLives: 0,
        comboDecayMultiplier: 1,
    },
};

export const metaUpgradeState = {
    baseSnapshot: cloneSnapshot(baseMetaSnapshot),
    snapshot: cloneSnapshot(baseMetaSnapshot),
    baseLoadout,
    loadout: baseLoadout,
    listeners: new Set<MetaUpgradeListener>(),
    manager: null as any,
    cloneSnapshot,
};

export const prestigeModule = {
    computePrestigeDust: vi.fn(() => 0),
};

export const createStageStub = () => {
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
        applyTheme: vi.fn(),
        register: vi.fn(),
        transitionTo: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockResolvedValue(undefined),
        pop: vi.fn(),
        getCurrentScene: vi.fn(() => 'main-menu'),
        toPlayfield: vi.fn((point: { x: number; y: number }) => ({ ...point })),
        update: vi.fn(),
    };
};

export const initializerState = { instances: [] as any[] };

export const powerUpManagerState = { instances: [] as any[] };

export const inputManagerState = { instances: [] as any[] };

export const paddleState = { instances: [] as any[] };

export const ballState = { instances: [] as any[] };

export const physicsWorldState = { instances: [] as any[] };

export const launchControllerState = { instances: [] as any[] };

export const loggerState = {
    runtime: null as {
        debug: Mock;
        error: Mock;
        info: Mock;
        warn: Mock;
    } | null,
};

export const sessionManagerState = {
    instances: [] as any[],
    options: [] as Record<string, unknown>[],
};

export const createGameSessionManagerMock = vi.fn((options: Record<string, unknown> = {}) => {
    const state: any = {
        sessionId: 'session-test',
        livesRemaining: 3,
        brickRemaining: 0,
        brickTotal: 0,
        round: 1,
        status: 'active',
        score: 0,
        coins: 0,
        momentum: {
            volleyLength: 0,
            speedPressure: 0,
            brickDensity: 1,
            comboHeat: 0,
            comboTimer: 0,
            updatedAt: Date.now(),
        },
        entropy: {
            charge: 0,
            stored: 0,
            trend: 'stable',
            lastEvent: null,
            updatedAt: Date.now(),
        },
        loadout: null as LoadoutSelection | null,
    };

    let loadoutEffects: LoadoutSessionEffects | null = null;

    const handle = {
        startRound: vi.fn((roundOptions: { breakableBricks: number }) => {
            state.brickRemaining = roundOptions.breakableBricks;
            state.brickTotal = roundOptions.breakableBricks;
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
                    volleyLength: state.momentum.volleyLength,
                    speedPressure: state.momentum.speedPressure,
                    brickDensity: state.momentum.brickDensity,
                    comboHeat: state.momentum.comboHeat,
                    comboTimer: state.momentum.comboTimer,
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
            loadout: state.loadout,
            updatedAt: Date.now(),
            elapsedTimeMs: 0,
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
        updateMomentum: vi.fn((snapshot: Partial<Record<string, number>>) => {
            state.momentum = {
                volleyLength: Math.max(0, Math.round(snapshot?.volleyLength ?? 0)),
                speedPressure: Math.max(0, Math.min(1, snapshot?.speedPressure ?? 0)),
                brickDensity: Math.max(0, Math.min(1, snapshot?.brickDensity ?? state.momentum.brickDensity ?? 0)),
                comboHeat: Math.max(0, Math.min(1, snapshot?.comboHeat ?? 0)),
                comboTimer: Math.max(0, snapshot?.comboTimer ?? 0),
                updatedAt: Date.now(),
            };
        }),
        setLoadout: vi.fn((selection: LoadoutSelection, effects: LoadoutSessionEffects) => {
            state.loadout = {
                form: selection.form,
                trait: selection.trait,
                sigil: selection.sigil,
                voice: selection.voice,
            } satisfies LoadoutSelection;
            loadoutEffects = {
                coinMultiplier: effects.coinMultiplier,
                entropyGainMultiplier: effects.entropyGainMultiplier,
                entropyLossMultiplier: effects.entropyLossMultiplier,
                idleGrantBonus: effects.idleGrantBonus,
                comboWindowBonusSeconds: effects.comboWindowBonusSeconds,
            } satisfies LoadoutSessionEffects;
        }),
        getLoadout: vi.fn(() => {
            if (!state.loadout || !loadoutEffects) {
                return null;
            }
            return {
                selection: {
                    form: state.loadout.form,
                    trait: state.loadout.trait,
                    sigil: state.loadout.sigil,
                    voice: state.loadout.voice,
                } satisfies LoadoutSelection,
                effects: {
                    coinMultiplier: loadoutEffects.coinMultiplier,
                    entropyGainMultiplier: loadoutEffects.entropyGainMultiplier,
                    entropyLossMultiplier: loadoutEffects.entropyLossMultiplier,
                    idleGrantBonus: loadoutEffects.idleGrantBonus,
                    comboWindowBonusSeconds: loadoutEffects.comboWindowBonusSeconds,
                } satisfies LoadoutSessionEffects,
            } as const;
        }),
    };

    sessionManagerState.instances.push(handle);
    sessionManagerState.options.push(options);
    return handle;
});

export const createGameInitializerMock = vi.fn(async (options: unknown) => {
    const stage = createStageStub();
    const dispose = vi.fn();
    const renderStageSoon = vi.fn();
    const bus = { publish: vi.fn() };
    const musicDirector = {
        setState: vi.fn(),
        getState: vi.fn(() => null),
        setEnabled: vi.fn(),
        setBeatCallback: vi.fn(),
        setMeasureCallback: vi.fn(),
        triggerComboAccent: vi.fn(),
        dispose: vi.fn(),
    };
    const scheduler = {
        lookAheadMs: 120,
        lookAheadSeconds: 0.12,
        schedule: vi.fn().mockReturnValue({ id: 0, time: 0 }),
        cancel: vi.fn(),
        dispose: vi.fn(),
        context: { currentTime: 0 } as unknown as AudioContext,
        now: vi.fn().mockReturnValue(0),
        predictAt: vi.fn().mockImplementation((offsetMs?: number) => 0.12 + (typeof offsetMs === 'number' ? offsetMs / 1000 : 0)),
    };

    initializerState.instances.push({
        stage,
        dispose,
        musicDirector,
        renderStageSoon,
        scheduler,
        bus,
        options,
    });
    return {
        stage,
        bus,
        scheduler,
        audioState$: { next: vi.fn() },
        musicDirector,
        renderStageSoon,
        dispose,
    };
});

export interface ThemeMock {
    brickColors: string[];
    ball: { core: string; aura: string; highlight: string };
    paddle: { gradient: string[]; glow: number };
    accents: { combo: string; powerUp: string };
    background: { from: number; to: number; starAlpha: number };
    font: string;
    monoFont: string;
    hud: {
        panelFill: string;
        panelLine: string;
        textPrimary: string;
        textSecondary: string;
        accent: string;
        danger: string;
    };
}

const createThemeMockState = () => {
    const defaultTheme: ThemeMock = {
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
            starAlpha: 0.2,
        },
        font: 'Test Font',
        monoFont: 'Test Mono',
        hud: {
            panelFill: '#101010',
            panelLine: '#202020',
            textPrimary: '#ffffff',
            textSecondary: '#cccccc',
            accent: '#ff8800',
            danger: '#ff0000',
        },
    };

    const highContrastTheme: ThemeMock = {
        ...defaultTheme,
        brickColors: ['#123123', '#321321', '#654654'],
        accents: {
            combo: '#00ffaa',
            powerUp: '#aa00ff',
        },
    };

    let activeName: 'default' | 'colorBlind' = 'default';
    let activeTheme: ThemeMock = defaultTheme;
    const listeners = new Set<(theme: ThemeMock, name: 'default' | 'colorBlind') => void>();

    const notify = () => {
        listeners.forEach((listener) => listener(activeTheme, activeName));
    };

    const setActiveTheme = vi.fn((name: 'default' | 'colorBlind') => {
        activeName = name;
        activeTheme = name === 'colorBlind' ? highContrastTheme : defaultTheme;
        notify();
    });

    const onThemeChange = (listener: (theme: ThemeMock, name: 'default' | 'colorBlind') => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };

    const themeOptions = [
        { name: 'default' as const, label: 'Vibrant' },
        { name: 'colorBlind' as const, label: 'High Contrast' },
    ];

    const getThemeOptions = vi.fn(() => themeOptions);
    const getActiveThemeName = () => activeName;

    const toggleTheme = vi.fn((name?: 'default' | 'colorBlind') => {
        const next = name ?? (activeName === 'default' ? 'colorBlind' : 'default');
        setActiveTheme(next);
        return activeName;
    });

    const reset = () => {
        listeners.clear();
        activeName = 'default';
        activeTheme = defaultTheme;
    };

    return {
        defaultTheme,
        highContrastTheme,
        setActiveTheme,
        onThemeChange,
        getActiveThemeName,
        getThemeOptions,
        toggleTheme,
        reset,
    };
};

export const themeMockState = createThemeMockState();
export const setActiveTheme = themeMockState.setActiveTheme;

export const highScoreModule = {
    getHighScores: vi.fn<[], { score: number; name: string; round: number; achievedAt: number }[]>(() => []),
    recordHighScore: vi.fn<
        [number, { round?: number; minScore?: number; achievedAt?: number; name?: string }?],
        { accepted: boolean; position: number | null; entries: unknown[] }
    >(() => ({ accepted: false, position: null, entries: [] })),
};

export const matterEventsState = {
    on: vi.fn(),
};

export const createMultiBallControllerStub = () => ({
    promoteExtraBallToPrimary: vi.fn(() => false),
    removeExtraBallByBody: vi.fn(),
    clear: vi.fn(),
    spawnExtraBalls: vi.fn(),
    count: vi.fn(() => 0),
    isExtraBallBody: vi.fn(() => false),
    applyTheme: vi.fn(),
    setRestitution: vi.fn(),
    updateSpeedIndicators: vi.fn(),
    visitActiveBalls: vi.fn((visitor?: (entry: { body: { id: number; position: { x: number; y: number }; velocity: { x: number; y: number } }; isPrimary: boolean }) => void) => {
        if (typeof visitor === 'function') {
            visitor({
                body: {
                    id: 1,
                    position: { x: 0, y: 0 },
                    velocity: { x: 0, y: 0 },
                },
                isPrimary: true,
            });
        }
    }),
});

export const multiBallControllerMockFactory = vi.fn(createMultiBallControllerStub);

const createLoggerStub = () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
});

export const resetRuntimeFacadeTestState = () => {
    initializerState.instances.length = 0;
    powerUpManagerState.instances.length = 0;
    inputManagerState.instances.length = 0;
    paddleState.instances.length = 0;
    ballState.instances.length = 0;
    physicsWorldState.instances.length = 0;
    launchControllerState.instances.length = 0;
    sessionManagerState.instances.length = 0;
    sessionManagerState.options.length = 0;
    createGameSessionManagerMock.mockClear();
    createGameInitializerMock.mockClear();
    multiBallControllerMockFactory.mockReset();
    multiBallControllerMockFactory.mockImplementation(createMultiBallControllerStub);
    highScoreModule.getHighScores.mockClear();
    highScoreModule.getHighScores.mockReturnValue([]);
    highScoreModule.recordHighScore.mockClear();
    highScoreModule.recordHighScore.mockReturnValue({ accepted: false, position: null, entries: [] });
    matterEventsState.on.mockClear();
    if (loggerState.runtime) {
        loggerState.runtime.debug.mockReset();
        loggerState.runtime.error.mockReset();
        loggerState.runtime.info.mockReset();
        loggerState.runtime.warn.mockReset();
    } else {
        loggerState.runtime = createLoggerStub();
    }

    prestigeModule.computePrestigeDust.mockReset();
    prestigeModule.computePrestigeDust.mockReturnValue(0);

    metaUpgradeState.baseSnapshot = cloneSnapshot(baseMetaSnapshot);
    metaUpgradeState.snapshot = cloneSnapshot(baseMetaSnapshot);
    metaUpgradeState.baseLoadout = baseLoadout;
    metaUpgradeState.loadout = baseLoadout;
    metaUpgradeState.listeners.clear();
    if (metaUpgradeState.manager) {
        Object.values(metaUpgradeState.manager).forEach((possibleMock) => {
            const candidate = possibleMock as { mockClear?: () => void };
            candidate.mockClear?.();
        });
    }

    themeMockState.reset();
    const themeSetter = setActiveTheme as unknown as Mock;
    themeSetter.mockClear?.();
    setActiveTheme('default');
    themeSetter.mockClear?.();
    themeMockState.toggleTheme.mockClear();
    themeMockState.getThemeOptions.mockClear();
};
