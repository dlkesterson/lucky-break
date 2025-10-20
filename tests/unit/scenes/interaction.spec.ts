import { describe, it, expect, vi } from 'vitest';

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
        public rect = vi.fn();
        public fill = vi.fn();
        public clear = vi.fn();
    }

    return { Container, Text, Graphics };
});

import type { SceneContext, StageLayers } from 'render/scene-manager';
import { createMainMenuScene } from 'scenes/main-menu';
import { createPauseScene } from 'scenes/pause';
import { createGameplayScene } from 'scenes/gameplay';
import { createLevelCompleteScene } from 'scenes/level-complete';
import { createGameOverScene } from 'scenes/game-over';
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';

interface SceneTestHarness {
    context: SceneContext;
    getLastAdded: () => Container | null;
}

const createSceneHarness = (): SceneTestHarness => {
    const layers: StageLayers = {
        root: new Container(),
        playfield: new Container(),
        effects: new Container(),
        hud: new Container(),
    };

    let lastAdded: Container | null = null;

    const context: SceneContext = {
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
        designSize: { width: 1280, height: 720 },
    };

    return {
        context,
        getLastAdded: () => lastAdded,
    };
};

describe('scene interaction lifecycles', () => {
    it('toggles main menu interaction when suspended and resumed', () => {
        const { context, getLastAdded } = createSceneHarness();
        const scene = createMainMenuScene(context, {
            onStart: vi.fn(),
        });

        void scene.init();
        const container = getLastAdded();
        expect(container).not.toBeNull();
        expect(container?.eventMode).toBe('static');
        expect(container?.cursor).toBe('pointer');

        void scene.suspend?.();
        expect(container?.eventMode).toBe('none');
        expect(container?.cursor).toBe('default');

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
        expect(container?.cursor).toBe('pointer');
    });

    it('disables pause overlay interaction while suspended', () => {
        const { context, getLastAdded } = createSceneHarness();
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

        void scene.suspend?.();
        expect(container?.eventMode).toBe('none');

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
    });

    it('invokes gameplay suspend and resume callbacks', () => {
        const { context } = createSceneHarness();
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
    });

    it('toggles level-complete interaction when suspended and resumed', () => {
        const { context, getLastAdded } = createSceneHarness();
        const scene = createLevelCompleteScene(context, {});

        void scene.init({
            level: 1,
            score: 1000,
            onContinue: vi.fn(),
        });

        const container = getLastAdded();
        expect(container).not.toBeNull();
        expect(container?.eventMode).toBe('static');

        void scene.suspend?.();
        expect(container?.eventMode).toBe('none');

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
    });

    it('toggles game-over interaction when suspended and resumed', () => {
        const { context, getLastAdded } = createSceneHarness();
        const scene = createGameOverScene(context, {
            onRestart: vi.fn(),
        });

        void scene.init({ score: 500 });

        const container = getLastAdded();
        expect(container).not.toBeNull();
        expect(container?.eventMode).toBe('static');

        void scene.suspend?.();
        expect(container?.eventMode).toBe('none');

        void scene.resume?.();
        expect(container?.eventMode).toBe('static');
    });
});
