import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', async () => {
    class Container {
        public children: unknown[] = [];
        public sortableChildren = false;
        public name = '';
        public label = '';
        public parent: Container | null = null;

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

import { createStage } from 'render/stage';

describe('createStage', () => {
    it('initialises the stage with layered containers', async () => {
        const stage = await createStage({ width: 1024, height: 768, background: 0x112233 });

        expect(stage.app.renderer.width).toBe(1024);
        expect(stage.app.renderer.height).toBe(768);
        expect(stage.layers.playfield.label).toBe('playfield');
        expect(stage.layers.hud.label).toBe('hud');
        expect(stage.layers.effects.label).toBe('effects');

        stage.destroy();
        expect((stage.app as { destroyed?: boolean }).destroyed).toBe(true);
    });

    it('provides sprite pooling and layer management helpers', async () => {
        const stage = await createStage({ width: 640, height: 360 });

        const sprite = stage.acquireSprite();
        stage.addToLayer('hud', sprite);

        expect(stage.layers.hud.children).toContain(sprite);

        stage.releaseSprite(sprite);
        expect(stage.layers.hud.children).not.toContain(sprite);

        stage.destroy();
    });

    it('resizes the renderer on demand', async () => {
        const stage = await createStage({ width: 400, height: 300 });

        stage.resize({ width: 800, height: 600 });

        expect(stage.app.renderer.width).toBe(800);
        expect(stage.app.renderer.height).toBe(600);

        stage.destroy();
    });
});
