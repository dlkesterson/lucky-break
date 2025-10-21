import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('pixi.js', () => {
    class Container {
        public alpha = 1;
        public tint = 0xffffff;
        public blendMode: string | undefined;
        public position = createPoint();
        public anchor = createPoint();
        public eventMode: string | undefined;
        public zIndex = 0;
        public parent: Container | null = null;

        destroy(): void {
            // no-op for tests
        }
    }

    class Graphics extends Container {
        public drawCalls: string[] = [];

        clear(): this {
            this.drawCalls.push('clear');
            return this;
        }

        roundRect(): this {
            this.drawCalls.push('roundRect');
            return this;
        }

        rect(): this {
            this.drawCalls.push('rect');
            return this;
        }

        circle(): this {
            this.drawCalls.push('circle');
            return this;
        }

        fill(): this {
            this.drawCalls.push('fill');
            return this;
        }

        stroke(): this {
            this.drawCalls.push('stroke');
            return this;
        }

        moveTo(): this {
            this.drawCalls.push('moveTo');
            return this;
        }

        lineTo(): this {
            this.drawCalls.push('lineTo');
            return this;
        }
    }

    class FillGradient {
        public readonly stops: { offset: number; color: number }[] = [];

        public constructor(
            public readonly x0: number,
            public readonly y0: number,
            public readonly x1: number,
            public readonly y1: number,
        ) { }

        addColorStop(offset: number, color: number): void {
            this.stops.push({ offset, color });
        }
    }

    class Texture {
        private static nextId = 1;
        public readonly id = Texture.nextId++;
        public destroyed = false;

        destroy(): void {
            this.destroyed = true;
        }
    }

    class Sprite extends Container {
        public texture: Texture;

        public constructor(texture: Texture) {
            super();
            this.texture = texture;
        }

        destroy(): void {
            super.destroy();
        }
    }

    return {
        Container,
        Graphics,
        FillGradient,
        Texture,
        Sprite,
    };
});

import { Texture } from 'pixi.js';
import { createBrickTextureCache } from 'render/brick-texture-cache';

describe('createBrickTextureCache', () => {
    const renderer = {
        generateTexture: vi.fn(() => new Texture()),
    };

    beforeEach(() => {
        renderer.generateTexture.mockClear();
    });

    it('returns cached texture when requesting identical damage state', () => {
        const cache = createBrickTextureCache(renderer);

        const request = {
            baseColor: 0xff8844,
            maxHp: 3,
            currentHp: 3,
            width: 48,
            height: 18,
        } as const;

        const first = cache.get(request);
        const second = cache.get(request);

        expect(first).toBe(second);
        expect(renderer.generateTexture).toHaveBeenCalledTimes(1);
    });

    it('generates separate textures for different damage levels', () => {
        const cache = createBrickTextureCache(renderer);

        const undamaged = cache.get({ baseColor: 0x3399ff, maxHp: 2, currentHp: 2, width: 48, height: 18 });
        const damaged = cache.get({ baseColor: 0x3399ff, maxHp: 2, currentHp: 1, width: 48, height: 18 });

        expect(undamaged).not.toBe(damaged);
        expect(renderer.generateTexture).toHaveBeenCalledTimes(2);
    });

    it('destroys cached textures when cleared', () => {
        const cache = createBrickTextureCache(renderer);

        const textureA = cache.get({ baseColor: 0x11aa44, maxHp: 3, currentHp: 3, width: 60, height: 20 });
        const textureB = cache.get({ baseColor: 0x11aa44, maxHp: 3, currentHp: 2, width: 60, height: 20 });

        cache.clear();

        expect(textureA.destroyed).toBe(true);
        expect(textureB.destroyed).toBe(true);
    });
});
