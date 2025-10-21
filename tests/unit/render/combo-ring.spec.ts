import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
    const createPoint = () => {
        return {
            x: 0,
            y: 0,
            set(x: number, y?: number) {
                this.x = x;
                this.y = y ?? x;
            },
        };
    };

    class MockContainer {
        public children: unknown[] = [];
        public visible = true;
        public alpha = 1;
        public eventMode: string | undefined;
        public position = createPoint();
        public scale = createPoint();
        public parent: MockContainer | null = null;

        addChild<T>(...items: T[]): T {
            this.children.push(...items);
            items.forEach((item) => {
                if (item && typeof item === 'object') {
                    (item as { parent?: MockContainer | null }).parent = this;
                }
            });
            return items[0];
        }

        removeChild<T>(item: T): T {
            this.children = this.children.filter((candidate) => candidate !== item);
            if (item && typeof item === 'object') {
                (item as { parent?: MockContainer | null }).parent = null;
            }
            return item;
        }

        removeChildren(): void {
            this.children.forEach((child) => {
                if (child && typeof child === 'object') {
                    (child as { parent?: MockContainer | null }).parent = null;
                }
            });
            this.children = [];
        }
    }

    class Graphics extends MockContainer {
        public destroyed = false;
        public circle = vi.fn(() => this);
        public fill = vi.fn(() => this);
        public stroke = vi.fn(() => this);
        public clear = vi.fn(() => this);
        public destroy = vi.fn(() => {
            this.destroyed = true;
        });
    }

    class Sprite extends MockContainer {
        public anchor = { set: vi.fn((x: number, y?: number) => { this.anchorX = x; this.anchorY = y ?? x; }) } as any;
        public scale = createPoint();
        public blendMode: string | undefined;
        public tint = 0xffffff;
        public alpha = 1;
        public destroyed = false;

        private anchorX = 0;
        private anchorY = 0;

        public constructor(public readonly texture: Texture) {
            super();
        }

        public destroy = vi.fn(() => {
            this.destroyed = true;
        });
    }

    class Texture {
        public destroyed = false;
        public constructor(public readonly label: string) { }

        destroy(destroyTexture?: boolean): void {
            void destroyTexture;
            this.destroyed = true;
        }
    }

    return {
        Container: MockContainer,
        Graphics,
        Sprite,
        Texture,
    };
});

import { createComboRing } from 'render/combo-ring';

interface TextureWithDestroy {
    destroy: (destroyTexture?: boolean) => void;
}

describe('createComboRing', () => {
    let textures: TextureWithDestroy[];
    let renderer: { generateTexture: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        textures = [
            { destroy: vi.fn() },
            { destroy: vi.fn() },
            { destroy: vi.fn() },
        ];
        let index = 0;
        renderer = {
            generateTexture: vi.fn(() => textures[index++] as unknown as any),
        };
    });

    it('updates sprites based on the provided options', () => {
        const handle = createComboRing(renderer as unknown as { generateTexture: (graphics: any) => any });
        expect(renderer.generateTexture).toHaveBeenCalledTimes(3);

        const [fillSprite, outerSprite, innerSprite] = handle.container.children as any[];

        handle.update({
            position: { x: 420, y: 160 },
            radius: 64,
            outerColor: 0xff33aa,
            outerAlpha: 1.5,
            innerColor: 0x119933,
            innerAlpha: -0.3,
            fillAlpha: 0.6,
            overallAlpha: 1.25,
        });

        expect(handle.container.visible).toBe(true);
        expect(handle.container.alpha).toBe(1);
        expect(handle.container.position.x).toBe(420);
        expect(handle.container.position.y).toBe(160);

        const expectedScale = 64 / 128;
        expect(fillSprite.scale.x).toBeCloseTo(expectedScale, 6);
        expect(fillSprite.alpha).toBeCloseTo(0.6, 6);

        expect(outerSprite.tint).toBe(0xff33aa);
        expect(outerSprite.alpha).toBeCloseTo(1, 6);
        expect(outerSprite.scale.x).toBeCloseTo(expectedScale, 6);

        expect(innerSprite.tint).toBe(0x119933);
        expect(innerSprite.alpha).toBeCloseTo(0, 6);
        expect(innerSprite.scale.x).toBeCloseTo(expectedScale, 6);

        handle.update({
            position: { x: 10, y: 20 },
            radius: 32,
            outerColor: 0,
            outerAlpha: 0.5,
            innerColor: 0,
            innerAlpha: 0.5,
            fillAlpha: 0.4,
            overallAlpha: 0,
        });

        expect(handle.container.visible).toBe(false);
        expect(handle.container.alpha).toBe(0);
    });

    it('hides and disposes sprites idempotently', () => {
        const handle = createComboRing(renderer as unknown as { generateTexture: (graphics: any) => any });
        const [fillSprite, outerSprite, innerSprite] = handle.container.children as any[];

        handle.hide();
        expect(handle.container.visible).toBe(false);
        expect(handle.container.alpha).toBe(0);

        handle.dispose();
        handle.dispose();

        expect(handle.container.children).toHaveLength(0);
        expect(fillSprite.destroy).toHaveBeenCalledTimes(1);
        expect(outerSprite.destroy).toHaveBeenCalledTimes(1);
        expect(innerSprite.destroy).toHaveBeenCalledTimes(1);
        textures.forEach((texture) => {
            expect(texture.destroy).toHaveBeenCalledTimes(1);
            expect(texture.destroy).toHaveBeenCalledWith(true);
        });
    });
});
