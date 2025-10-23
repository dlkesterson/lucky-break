import { describe, it, expect, vi, type Mock } from 'vitest';

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
import { createMainMenuScene } from 'scenes/main-menu';
import { createPauseScene } from 'scenes/pause';
import { createGameplayScene } from 'scenes/gameplay';
import { createLevelCompleteScene } from 'scenes/level-complete';
import { createGameOverScene } from 'scenes/game-over';
import { Container, Text } from 'pixi.js';
import * as ThemeModule from 'render/theme';
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
        schedule: vi.fn().mockReturnValue({ id: 0, time: 0 }),
        cancel: vi.fn(),
        dispose: vi.fn(),
        context: {} as AudioContext,
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

    const services: GameSceneServices = {
        bus,
        scheduler,
        audioState$,
        musicDirector,
        random,
        replayBuffer,
        renderStageSoon,
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

describe('scene interaction lifecycles', () => {
    it('toggles main menu interaction when suspended and resumed', () => {
        const { context, getLastAdded, services } = createSceneHarness();
        const scene = createMainMenuScene(context, {
            onStart: vi.fn(),
        });

        void scene.init();
        const container = getLastAdded();
        expect(container).not.toBeNull();
        expect(container?.eventMode).toBe('static');
        expect(container?.cursor).toBe('pointer');

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
        expect(container?.eventMode).toBe('none');
        expect(container?.cursor).toBe('default');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'main-menu',
            action: 'suspend',
        });

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
        expect(container?.cursor).toBe('pointer');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'main-menu',
            action: 'resume',
        });

        scene.destroy?.();
    });

    it('provides a clickable color mode toggle on the main menu', () => {
        const toggleSpy = vi.spyOn(ThemeModule, 'toggleTheme').mockImplementation(() => 'colorBlind');
        const { context, getLastAdded } = createSceneHarness();
        const scene = createMainMenuScene(context, {
            onStart: vi.fn(),
        });

        void scene.init();
        const container = getLastAdded();
        expect(container).not.toBeNull();

        const themeNode = container?.children.find(
            (child): child is Text => child instanceof Text && child.text.toUpperCase().includes('COLOR MODE'),
        );
        expect(themeNode).toBeTruthy();
        if (!themeNode) {
            throw new Error('theme toggle label missing');
        }
        expect(themeNode.cursor).toBe('pointer');
        expect(themeNode.eventMode).toBe('static');

        const onMock = Reflect.get(themeNode, 'on') as Mock;
        const handler = onMock.mock.calls.find((call) => call[0] === 'pointertap')?.[1] as
            | ((event: { stopPropagation: () => void }) => void)
            | undefined;
        expect(handler).toBeTypeOf('function');

        handler?.({ stopPropagation: vi.fn() });
        expect(toggleSpy).toHaveBeenCalledTimes(1);

        toggleSpy.mockRestore();
        scene.destroy?.();
    });

    it('disables pause overlay interaction while suspended', () => {
        const { context, getLastAdded, services } = createSceneHarness();
        const scene = createPauseScene(context, {
            resumeLabel: 'Resume',
        });

        void scene.init({
            score: 42,
            legendTitle: 'Legend',
            legendLines: ['A', 'B'],
            onResume: vi.fn(),
            onQuit: vi.fn(),
        });

        const container = getLastAdded();
        expect(container).not.toBeNull();
        expect(container?.eventMode).toBe('static');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'pause',
            action: 'enter',
        });

        void scene.suspend?.();
        expect(container?.eventMode).toBe('none');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'pause',
            action: 'suspend',
        });

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
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

    it('toggles level-complete interaction when suspended and resumed', () => {
        const { context, getLastAdded, services } = createSceneHarness();
        const scene = createLevelCompleteScene(context, {});

        void scene.init({
            level: 1,
            score: 1000,
            onContinue: vi.fn(),
            recap: {
                roundScore: 500,
                totalScore: 1000,
                bricksBroken: 30,
                brickTotal: 30,
                bestCombo: 12,
                volleyLength: 18,
                speedPressure: 0.6,
                coinsCollected: 12,
                durationMs: 90000,
            },
        });

        const container = getLastAdded();
        expect(container).not.toBeNull();
        expect(container?.eventMode).toBe('static');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'level-complete',
            action: 'enter',
        });

        void scene.suspend?.();
        expect(container?.eventMode).toBe('none');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'level-complete',
            action: 'suspend',
        });

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'level-complete',
            action: 'resume',
        });
    });

    it('toggles game-over interaction when suspended and resumed', () => {
        const { context, getLastAdded, services } = createSceneHarness();
        const scene = createGameOverScene(context, {
            onRestart: vi.fn(),
        });

        void scene.init({ score: 500 });

        const container = getLastAdded();
        expect(container).not.toBeNull();
        expect(container?.eventMode).toBe('static');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'game-over',
            action: 'enter',
        });

        void scene.suspend?.();
        expect(container?.eventMode).toBe('none');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'game-over',
            action: 'suspend',
        });

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
        expect(services.bus.publish).toHaveBeenCalledWith('UiSceneTransition', {
            scene: 'game-over',
            action: 'resume',
        });
    });
});
