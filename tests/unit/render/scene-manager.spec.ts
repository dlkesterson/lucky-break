import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { createSceneManager, type Scene } from 'render/scene-manager';

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

    it('resizes the renderer on demand and cleans up', () => {
        manager.resize({ width: 640, height: 360 });

        expect(manager.app.renderer.width).toBe(640);
        expect(manager.app.renderer.height).toBe(360);

        manager.destroy();
        expect((manager.app as { destroyed?: boolean }).destroyed).toBe(true);
    });
});
