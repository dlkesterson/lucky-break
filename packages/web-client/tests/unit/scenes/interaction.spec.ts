import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MetaUpgradeManager } from 'app/meta-upgrades';

vi.mock('pixi.js', () => {
    class Container {
        public children: unknown[] = [];
        public eventMode = 'auto';
        public cursor = 'default';
        public interactiveChildren = true;
        public parent: Container | null = null;
        public zIndex = 0;
        public label = '';
        public visible = true;

        public on = vi.fn();
        public off = vi.fn();
        public addChild<T>(...items: T[]): T {
            this.children.push(...items);
            items.forEach((item) => {
                if (item && typeof item === 'object') {
                    (item as { parent?: Container | null }).parent = this;
                }
            });
            return items[0];
        }

        public addChildAt<T>(item: T): T {
            return this.addChild(item);
        }

        public removeChild<T>(item: T): T {
            this.children = this.children.filter((child) => child !== item);
            if (item && typeof item === 'object') {
                (item as { parent?: Container | null }).parent = null;
            }
            return item;
        }

        public removeAllListeners = vi.fn();
        public destroy = vi.fn();
    }

    class Text extends Container {
        public text: string;
        public style: unknown;
        public anchor = { set: vi.fn() };
        public position = { set: vi.fn() };

        public constructor(options: { text?: string; style?: unknown }) {
            super();
            this.text = options?.text ?? '';
            this.style = options?.style ?? {};
        }
    }

    class Graphics extends Container {
        public rect = vi.fn().mockReturnThis();
        public fill = vi.fn().mockReturnThis();
        public clear = vi.fn().mockReturnThis();
        public roundRect = vi.fn().mockReturnThis();
        public stroke = vi.fn().mockReturnThis();
        public moveTo = vi.fn().mockReturnThis();
        public lineTo = vi.fn().mockReturnThis();
        public closePath = vi.fn().mockReturnThis();
    }

    return { Container, Text, Graphics };
});

import type { SceneContext, StageLayers } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { LuckyBreakEventBus } from 'app/events';
import type { ToneScheduler, ReactiveAudioGameState } from 'audio/scheduler';
import type { Subject } from 'util/observable';
import type { MusicDirector } from 'audio/music-director';
import type { RandomManager } from 'util/random';
import type { ReplayBuffer } from 'app/replay-buffer';
import type { FateLedger, FateLedgerSnapshot } from 'app/fate-ledger';
import { createMainMenuScene } from 'scenes/main-menu';
import { createPauseScene } from 'scenes/pause';
import { createGameplayScene } from 'scenes/gameplay';
import { createGameOverScene } from 'scenes/game-over';
import { Container } from 'pixi.js';
import { usePauseUi } from 'ui/state/pause-bridge';
import { useGameOverUi } from 'ui/state/game-over-bridge';
import { useMainMenuUi, mainMenuUiBridge } from 'ui/state/main-menu-bridge';
import * as ThemeModule from 'render/theme';
import * as SettingsModule from 'util/settings';
import type { Application } from 'pixi.js';

interface SceneTestHarness {
    context: SceneContext<GameSceneServices>;
    getLastAdded: () => Container | null;
    services: GameSceneServices;
}

const createSceneHarness = (): SceneTestHarness => {
    const layers: StageLayers = {
        root: new Container(),
        playfield: new Container(),
        effects: new Container(),
        hud: new Container(),
    };

    let lastAdded: Container | null = null;

    const renderStageSoon = vi.fn();

    const noopSubscription = { unsubscribe: vi.fn() };

    const bus: LuckyBreakEventBus = {
        publish: vi.fn(),
        subscribe: vi.fn().mockReturnValue(noopSubscription),
        subscribeOnce: vi.fn().mockReturnValue(noopSubscription),
        unsubscribe: vi.fn(),
        clear: vi.fn(),
        listeners: vi.fn().mockReturnValue([]),
    };

    const scheduler: ToneScheduler = {
        lookAheadMs: 0,
        lookAheadSeconds: 0,
        schedule: vi.fn().mockReturnValue({ id: 0, time: 0 }),
        cancel: vi.fn(),
        dispose: vi.fn(),
        context: {} as AudioContext,
        now: vi.fn().mockReturnValue(0),
        predictAt: vi.fn().mockImplementation((offsetMs?: number) => {
            const offset = typeof offsetMs === 'number' ? offsetMs : 0;
            return offset / 1000;
        }),
    };

    const audioState$: Subject<ReactiveAudioGameState> = {
        next: vi.fn(),
        complete: vi.fn(),
        subscribe: vi.fn().mockReturnValue(noopSubscription),
    };

    const musicDirector: MusicDirector = {
        setState: vi.fn(),
        getState: vi.fn().mockReturnValue(null),
        setEnabled: vi.fn(),
        dispose: vi.fn(),
        setBeatCallback: vi.fn(),
        setMeasureCallback: vi.fn(),
        triggerComboAccent: vi.fn(),
        triggerGambleCountdown: vi.fn(),
    };

    const random: RandomManager = {
        seed: vi.fn().mockReturnValue(1),
        setSeed: vi.fn().mockReturnValue(1),
        reset: vi.fn(),
        next: vi.fn().mockReturnValue(0.5),
        random: vi.fn().mockReturnValue(0.5),
        nextInt: vi.fn().mockReturnValue(0),
        boolean: vi.fn().mockReturnValue(false),
    };

    const replayBuffer: ReplayBuffer = {
        begin: vi.fn(),
        recordSeed: vi.fn(),
        recordPaddleTarget: vi.fn(),
        recordLaunch: vi.fn(),
        recordBiasChoice: vi.fn(),
        markTime: vi.fn(),
        snapshot: vi.fn().mockReturnValue({
            version: 1,
            seed: null,
            durationSeconds: 0,
            events: [],
        }),
        toJSON: vi.fn().mockReturnValue({
            version: 1,
            seed: null,
            durationSeconds: 0,
            events: [],
        }),
    };

    const fateLedgerSnapshot: FateLedgerSnapshot = {
        version: 1,
        entries: [],
        totalIdleRolls: 0,
        totals: {
            durationMs: 0,
            entropyEarned: 0,
            certaintyDustEarned: 0,
        },
        latestEntryTimestamp: null,
    };

    const fateLedger: FateLedger = {
        recordIdleRoll: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue(fateLedgerSnapshot),
        clear: vi.fn(),
        subscribe: vi.fn().mockImplementation((listener: (snapshot: FateLedgerSnapshot) => void) => {
            listener(fateLedgerSnapshot);
            return vi.fn();
        }),
    };

    const metaUpgrades = {
        getSnapshot: vi.fn(),
        getCatalog: vi.fn(),
        getLoadout: vi.fn(),
        grantDust: vi.fn(),
        purchase: vi.fn(),
        equipVisualPalette: vi.fn(),
        equipAudioPalette: vi.fn(),
        toggleTrait: vi.fn(),
        subscribe: vi.fn().mockReturnValue(vi.fn()),
    } as unknown as MetaUpgradeManager;

    const services: GameSceneServices = {
        bus,
        scheduler,
        audioState$,
        musicDirector,
        random,
        replayBuffer,
        renderStageSoon,
        fateLedger,
        metaUpgrades,
    };

    const context: SceneContext<GameSceneServices> = {
        app: {} as Application,
        layers,
        addToLayer: (layer, node) => {
            lastAdded = node;
            layers[layer].addChild(node);
        },
        removeFromLayer: (node) => {
            node.parent?.removeChild(node);
        },
        acquireSprite: vi.fn(),
        releaseSprite: vi.fn(),
        switchScene: vi.fn(),
        pushScene: vi.fn(),
        popScene: vi.fn(),
        transitionScene: vi.fn(),
        designSize: { width: 1280, height: 720 },
        ...services,
    };

    return {
        context,
        getLastAdded: () => lastAdded,
        services,
    };
};

beforeEach(() => {
    mainMenuUiBridge.exit();
});

describe('scene interaction lifecycles', () => {
    it('tracks main menu overlay lifecycle via bridge state', () => {
        const { context, services } = createSceneHarness();
        const scene = createMainMenuScene(context, {
            onStart: vi.fn(),
        });

        void scene.init();

        const initialState = useMainMenuUi.getState();
        expect(initialState.visible).toBe(true);
        expect(initialState.suspended).toBe(false);
        expect(initialState.snapshot).not.toBeNull();
        expect(services.audioState$.next).toHaveBeenCalledWith({
            combo: 0,
            activePowerUps: [],
            lookAheadMs: services.scheduler.lookAheadMs,
        });
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'main-menu',
            action: 'enter',
        });

        void scene.suspend?.();
        expect(useMainMenuUi.getState().suspended).toBe(true);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'main-menu',
            action: 'suspend',
        });

        void scene.resume?.();
        expect(useMainMenuUi.getState().suspended).toBe(false);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'main-menu',
            action: 'resume',
        });

        void scene.destroy?.();
        expect(useMainMenuUi.getState().visible).toBe(false);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'main-menu',
            action: 'exit',
        });
    });

    it('exposes theme and performance controls on the main menu snapshot', () => {
        const toggleSpy = vi.spyOn(ThemeModule, 'toggleTheme').mockImplementation(() => 'colorBlind');
        let performanceEnabled = false;
        const settingsListeners = new Set<(snapshot: SettingsModule.SettingsSnapshot) => void>();

        const getSettingsSpy = vi
            .spyOn(SettingsModule, 'getSettings')
            .mockImplementation(() => ({ version: 1, performance: performanceEnabled }));
        const updateSettingsSpy = vi
            .spyOn(SettingsModule, 'updateSettings')
            .mockImplementation((changes) => {
                if (typeof changes.performance === 'boolean') {
                    performanceEnabled = changes.performance;
                }
                const snapshot: SettingsModule.SettingsSnapshot = { version: 1, performance: performanceEnabled };
                settingsListeners.forEach((listener) => listener(snapshot));
                return snapshot;
            });
        const subscribeSettingsSpy = vi
            .spyOn(SettingsModule, 'subscribeSettings')
            .mockImplementation((listener) => {
                settingsListeners.add(listener);
                listener({ version: 1, performance: performanceEnabled });
                return () => {
                    settingsListeners.delete(listener);
                };
            });

        const { context } = createSceneHarness();
        const scene = createMainMenuScene(context, {
            onStart: vi.fn(),
        });

        void scene.init();

        const snapshot = useMainMenuUi.getState().snapshot;
        expect(snapshot).not.toBeNull();
        void snapshot?.onToggleTheme?.();
        expect(toggleSpy).toHaveBeenCalledTimes(1);

        void snapshot?.onTogglePerformance?.();
        expect(updateSettingsSpy).toHaveBeenCalledWith({ performance: true });
        expect(useMainMenuUi.getState().snapshot?.performanceEnabled).toBe(true);

        void scene.destroy?.();

        toggleSpy.mockRestore();
        getSettingsSpy.mockRestore();
        updateSettingsSpy.mockRestore();
        subscribeSettingsSpy.mockRestore();
    });

    it('disables pause overlay interaction while suspended', () => {
        const { context, getLastAdded, services } = createSceneHarness();
        const scene = createPauseScene(context, {
            resumeLabel: 'Resume',
        });

        usePauseUi.setState({ visible: false, suspended: false, snapshot: null }, true);

        void scene.init({
            score: 42,
            legendTitle: 'Legend',
            legendItems: [{ text: 'A' }, { text: 'B' }],
            onResume: vi.fn(),
            onQuit: vi.fn(),
        });

        const container = getLastAdded();
        expect(container).toBeNull();

        const initialState = usePauseUi.getState();
        expect(initialState.visible).toBe(true);
        expect(initialState.suspended).toBe(false);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'pause',
            action: 'enter',
        });

        void scene.suspend?.();
        expect(usePauseUi.getState().suspended).toBe(true);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'pause',
            action: 'suspend',
        });

        void scene.resume?.();
        expect(usePauseUi.getState().suspended).toBe(false);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'pause',
            action: 'resume',
        });
    });

    it('invokes gameplay suspend and resume callbacks', () => {
        const { context, services } = createSceneHarness();
        const onSuspend = vi.fn();
        const onResume = vi.fn();

        const scene = createGameplayScene(context, {
            onUpdate: vi.fn(),
            onSuspend,
            onResume,
        });

        void scene.suspend?.();
        void scene.resume?.();

        expect(onSuspend).toHaveBeenCalledTimes(1);
        expect(onResume).toHaveBeenCalledTimes(1);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'gameplay',
            action: 'suspend',
        });
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'gameplay',
            action: 'resume',
        });
    });

    it('toggles game-over interaction when suspended and resumed', () => {
        const { context, getLastAdded, services } = createSceneHarness();
        const scene = createGameOverScene(context, {
            onRestart: vi.fn(),
        });

        useGameOverUi.setState({ visible: false, suspended: false, snapshot: null }, true);

        void scene.init({ score: 500 });

        const container = getLastAdded();
        expect(container).toBeNull();

        const initialState = useGameOverUi.getState();
        expect(initialState.visible).toBe(true);
        expect(initialState.suspended).toBe(false);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'game-over',
            action: 'enter',
        });

        void scene.suspend?.();
        expect(useGameOverUi.getState().suspended).toBe(true);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'game-over',
            action: 'suspend',
        });

        void scene.resume?.();
        expect(useGameOverUi.getState().suspended).toBe(false);
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'game-over',
            action: 'resume',
        });
    });

    it('shows a dust summary when certainty dust is awarded', () => {
        const { context, getLastAdded } = createSceneHarness();
        const scene = createGameOverScene(context, {
            onRestart: vi.fn(),
        });

        useGameOverUi.setState({ visible: false, suspended: false, snapshot: null }, true);

        void scene.init({ score: 1200, dustAwarded: 7 });

        const container = getLastAdded();
        expect(container).toBeNull();

        const snapshot = useGameOverUi.getState().snapshot;
        expect(snapshot?.dustAwarded).toBe(7);
    });
});
