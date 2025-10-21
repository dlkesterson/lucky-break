import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('render/effects/filters', () => ({
    createGlowFilter: vi.fn(),
    createDistortionFilter: vi.fn(),
}));

vi.mock('pixi.js', async () => {
    class Container {
        public children: unknown[] = [];
        public sortableChildren = false;
        public label = '';
        public parent: Container | null = null;
        public zIndex = 0;

        addChild<T>(...items: T[]): T {
            this.children.push(...items);
            items.forEach((item) => {
                (item as { parent?: Container | null }).parent = this;
            });
            return items[0];
        }

        removeChild<T>(item: T): T {
            this.children = this.children.filter((child) => child !== item);
            (item as { parent?: Container | null }).parent = null;
            return item;
        }

        removeChildren(): void {
            this.children = [];
        }
    }

    class Sprite extends Container {
        public visible = true;
        public alpha = 1;
        public texture: unknown;
        public destroyed = false;

        public constructor(texture?: unknown) {
            super();
            this.texture = texture;
        }

        public destroy(): void {
            this.destroyed = true;
            this.children = [];
        }
    }

    class Renderer {
        public width: number;
        public height: number;
        public background: { color: number };

        public constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
            this.background = { color: 0 };
        }

        public resize(size: { width: number; height: number }): void {
            this.width = size.width;
            this.height = size.height;
        }

        public generateTexture(): Record<string, unknown> {
            return {};
        }
    }

    class Application {
        public readonly stage: Container;
        public readonly renderer: Renderer;
        public canvas: HTMLCanvasElement;
        public destroyed = false;

        public constructor() {
            this.stage = new Container();
            this.renderer = new Renderer(0, 0);
            this.canvas = ({ width: 0, height: 0 } as HTMLCanvasElement);
        }

        public async init(options: { width: number; height: number; canvas?: HTMLCanvasElement }): Promise<void> {
            this.renderer.width = options.width;
            this.renderer.height = options.height;
            this.canvas = options.canvas ?? ({ width: options.width, height: options.height } as HTMLCanvasElement);
        }

        public destroy(): void {
            this.destroyed = true;
        }
    }

    return {
        Application,
        Container,
        Sprite,
    };
});

import { createSceneManager, type Scene, type SceneRegistrationOptions } from 'render/scene-manager';

describe('createSceneManager', () => {
    let manager: Awaited<ReturnType<typeof createSceneManager>>;

    beforeEach(async () => {
        manager = await createSceneManager({ width: 1024, height: 768, background: 0x112233 });
    });

    it('initialises the stage with layered containers', () => {
        expect(manager.app.renderer.width).toBe(1024);
        expect(manager.app.renderer.height).toBe(768);
        expect(manager.layers.playfield.label).toBe('playfield');
        expect(manager.layers.hud.label).toBe('hud');
        expect(manager.layers.effects.label).toBe('effects');
    });

    it('provides sprite pooling and layer helpers', () => {
        const sprite = manager.acquireSprite();
        manager.addToLayer('hud', sprite);

        expect(manager.layers.hud.children).toContain(sprite);

        manager.releaseSprite(sprite);
        expect(manager.layers.hud.children).not.toContain(sprite);
    });

    it('switches scenes while preserving the Pixi application', async () => {
        const lifecycle: string[] = [];

        const makeScene = (name: string): Scene => ({
            init: () => {
                lifecycle.push(`init:${name}`);
            },
            update: () => {
                lifecycle.push(`update:${name}`);
            },
            destroy: () => {
                lifecycle.push(`destroy:${name}`);
            },
        });

        manager.register('menu', () => makeScene('menu'));
        manager.register('gameplay', () => makeScene('gameplay'));

        await manager.switch('menu');
        manager.update(0.016);
        await manager.switch('gameplay');

        expect(lifecycle).toEqual([
            'init:menu',
            'update:menu',
            'destroy:menu',
            'init:gameplay',
        ]);
        expect(manager.getCurrentScene()).toBe('gameplay');
        expect((manager.app as { destroyed?: boolean }).destroyed).toBeFalsy();
    });

    it('allows scenes to trigger transitions via context', async () => {
        const order: string[] = [];

        manager.register('root', (context) => ({
            init: async () => {
                order.push('init:root');
                await context.switchScene('child');
            },
            update: () => {
                order.push('update:root');
            },
            destroy: () => {
                order.push('destroy:root');
            },
        }));

        manager.register('child', () => ({
            init: () => {
                order.push('init:child');
            },
            update: () => {
                order.push('update:child');
            },
            destroy: () => {
                order.push('destroy:child');
            },
        }));

        await manager.switch('root');
        manager.update(0.02);

        expect(order).toEqual([
            'init:root',
            'destroy:root',
            'init:child',
            'update:child',
        ]);
    });

    it('exposes transition helpers to scenes', async () => {
        const history: string[] = [];

        manager.register('first', (context) => ({
            init: async () => {
                history.push('init:first');
                await context.transitionScene('second', undefined, { durationMs: 0 });
                history.push('after-transition');
            },
            update: () => {
                history.push('update:first');
            },
            destroy: () => {
                history.push('destroy:first');
            },
        }));

        manager.register('second', () => ({
            init: () => {
                history.push('init:second');
            },
            update: () => {
                history.push('update:second');
            },
            destroy: () => {
                history.push('destroy:second');
            },
        }));

        await manager.switch('first');
        manager.update(0.016);

        expect(history).toEqual([
            'init:first',
            'destroy:first',
            'init:second',
            'after-transition',
            'update:second',
        ]);
    });

    it('performs a fade transition and resolves after animation completes', async () => {
        const firstDestroy = vi.fn();
        const secondInit = vi.fn();

        manager.register('first', () => ({
            init: vi.fn(),
            update: vi.fn(),
            destroy: firstDestroy,
        }));

        manager.register('second', () => ({
            init: secondInit,
            update: vi.fn(),
            destroy: vi.fn(),
        }));

        await manager.switch('first');

        let resolved = false;
        const transitionPromise = manager.transition('second', undefined, { durationMs: 500 });
        void transitionPromise.then(() => {
            resolved = true;
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(manager.getCurrentScene()).toBe('second');
        expect(firstDestroy).toHaveBeenCalledTimes(1);
        expect(secondInit).toHaveBeenCalledTimes(1);
        expect(resolved).toBe(false);

        const findOverlay = () =>
            manager.layers.root.children.find(
                (child) => (child as { label?: string }).label === 'scene-transition-overlay',
            ) as { alpha: number } | undefined;

        const overlay = findOverlay();
        expect(overlay).toBeDefined();
        expect(overlay?.alpha).toBeCloseTo(1);

        manager.update(0.1);
        expect(resolved).toBe(false);
        expect(findOverlay()?.alpha).toBeLessThan(1);

        manager.update(1);
        await transitionPromise;

        expect(resolved).toBe(true);
        expect(findOverlay()).toBeUndefined();
    });

    it('throws when switching to an unregistered scene', async () => {
        await expect(manager.switch('missing')).rejects.toThrow('Scene "missing" is not registered');
    });

    it('stops updates when no scene is active', () => {
        expect(() => manager.update(0.016)).not.toThrow();
    });

    it('supports switching while a previous init is pending', async () => {
        const slowDestroy = vi.fn();
        let resolveSlow: (() => void) | undefined;

        manager.register('slow', () => ({
            init: () => new Promise<void>((resolve) => {
                resolveSlow = resolve;
            }),
            update: vi.fn(),
            destroy: slowDestroy,
        }));

        const fastInit = vi.fn();
        manager.register('fast', () => ({
            init: fastInit,
            update: vi.fn(),
            destroy: vi.fn(),
        }));

        const firstSwitch = manager.switch('slow');
        const secondSwitch = manager.switch('fast');

        resolveSlow?.();
        await firstSwitch;
        await secondSwitch;

        expect(slowDestroy).toHaveBeenCalledTimes(1);
        expect(fastInit).toHaveBeenCalledTimes(1);
        expect(manager.getCurrentScene()).toBe('fast');
    });

    it('prevents switching once destroyed', async () => {
        const noopScene: Scene = {
            init: vi.fn(),
            update: vi.fn(),
            destroy: vi.fn(),
        };

        manager.register('noop', () => noopScene);
        await manager.switch('noop');
        manager.destroy();

        await expect(manager.switch('noop')).rejects.toThrow('Scene manager has been destroyed');
    });

    it('resizes the renderer on demand and cleans up', () => {
        manager.resize({ width: 640, height: 360 });

        expect(manager.app.renderer.width).toBe(640);
        expect(manager.app.renderer.height).toBe(360);

        manager.destroy();
        expect((manager.app as { destroyed?: boolean }).destroyed).toBe(true);

        manager.destroy();
        expect((manager.app as { destroyed?: boolean }).destroyed).toBe(true);
        expect(manager.layers.root.children).toHaveLength(0);
    });

    it('supports pushing overlay scenes and resuming the previous scene on pop', async () => {
        const baseUpdate = vi.fn();
        const baseDestroy = vi.fn();
        const baseSuspend = vi.fn();
        const baseResume = vi.fn();

        manager.register('base', () => ({
            init: vi.fn(),
            update: baseUpdate,
            destroy: baseDestroy,
            suspend: baseSuspend,
            resume: baseResume,
        }));

        const overlayInit = vi.fn();
        const overlayUpdate = vi.fn();
        const overlayDestroy = vi.fn();

        manager.register('overlay', () => ({
            init: overlayInit,
            update: overlayUpdate,
            destroy: overlayDestroy,
        }));

        await manager.switch('base');
        expect(manager.getCurrentScene()).toBe('base');

        manager.update(0.016);
        expect(baseUpdate).toHaveBeenCalledTimes(1);

        await manager.push('overlay');
        expect(manager.getCurrentScene()).toBe('overlay');
        expect(baseSuspend).toHaveBeenCalledTimes(1);
        expect(overlayInit).toHaveBeenCalledTimes(1);

        baseUpdate.mockClear();
        overlayUpdate.mockClear();

        manager.update(0.016);
        expect(overlayUpdate).toHaveBeenCalledTimes(1);
        expect(baseUpdate).not.toHaveBeenCalled();

        manager.pop();
        expect(manager.getCurrentScene()).toBe('base');
        expect(overlayDestroy).toHaveBeenCalledTimes(1);
        expect(baseResume).toHaveBeenCalledTimes(1);
        expect(baseDestroy).not.toHaveBeenCalled();

        manager.update(0.016);
        expect(baseUpdate).toHaveBeenCalledTimes(1);
    });

    it('merges scene-specific services while protecting core bindings', async () => {
        const initSpy = vi.fn();

        manager.register('with-services', (context) => ({
            init: () => {
                initSpy(context.tag, context.generate());
            },
            update: vi.fn(),
            destroy: vi.fn(),
        }), {
            provideContext: () => ({
                tag: 'special',
                generate: () => 42,
            }),
        });

        await manager.switch('with-services');
        expect(initSpy).toHaveBeenCalledWith('special', 42);

        manager.register('collision', () => ({
            init: vi.fn(),
            update: vi.fn(),
            destroy: vi.fn(),
        }), {
            provideContext: (() => ({ app: null })) as SceneRegistrationOptions<{ app: null }>['provideContext'],
        });

        await expect(manager.switch('collision')).rejects.toThrow(
            'Scene context provider attempted to override built-in property "app"',
        );
    });
});
