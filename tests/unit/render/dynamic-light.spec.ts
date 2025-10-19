import { describe, expect, it, vi } from 'vitest';

class PointStub {
    public x: number;

    public y: number;

    public constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    public set(x: number, y = x): void {
        this.x = x;
        this.y = y;
    }
}

vi.mock('pixi.js', () => {
    class Container {
        public children: unknown[] = [];

        public position = new PointStub();

        public scale = new PointStub(1, 1);

        public sortableChildren = false;

        public eventMode: string | null = null;

        public destroyed = false;

        public addChild<T>(child: T): T {
            this.children.push(child);
            (child as { parent?: Container }).parent = this;
            return child;
        }

        public removeChild<T>(child: T): T {
            this.children = this.children.filter((candidate) => candidate !== child);
            return child;
        }

        public destroy(options?: { children?: boolean }): void {
            this.destroyed = true;
            if (options?.children) {
                this.children = [];
            }
        }
    }

    class Graphics extends Container {
        public alpha = 1;

    public commands: { readonly type: string; readonly args: unknown[] }[] = [];

        public circle(x: number, y: number, radius: number): this {
            this.commands.push({ type: 'circle', args: [x, y, radius] });
            return this;
        }

        public fill(options: { color: number; alpha?: number }): this {
            this.commands.push({ type: 'fill', args: [options] });
            return this;
        }

        public clear(): void {
            this.commands.push({ type: 'clear', args: [] });
        }

        public override destroy(options?: { children?: boolean }): void {
            super.destroy(options);
        }
    }

    class Sprite extends Container { }

    class Application {
        public renderer = {};
    }

    return {
        Container,
        Graphics,
        Sprite,
        Application,
    };
});

import { createDynamicLight } from 'render/effects/dynamic-light';

const getSprite = (light: ReturnType<typeof createDynamicLight>) => {
    const container = light.container as unknown as { children: unknown[] };
    return container.children[0] as {
        alpha: number;
        scale: { x: number; y: number; set: (x: number, y?: number) => void };
    commands: { readonly type: string; readonly args: unknown[] }[];
    };
};

describe('createDynamicLight', () => {
    it('updates position, radius, and intensity based on speed changes', () => {
        const light = createDynamicLight({
            minRadius: 80,
            maxRadius: 160,
            baseRadius: 160,
            minIntensity: 0.2,
            maxIntensity: 0.9,
            speedForMaxIntensity: 10,
        });

        const container = light.container as unknown as { position: PointStub };
        const sprite = getSprite(light);

        light.update({ position: { x: 10, y: 20 }, speed: 0, deltaSeconds: 1 });

        expect(container.position.x).toBe(10);
        expect(container.position.y).toBe(20);
        expect(sprite.scale.x).toBeCloseTo(0.5, 3);
        expect(sprite.scale.y).toBeCloseTo(0.5, 3);
        const baselineAlpha = sprite.alpha;
        expect(baselineAlpha).toBeCloseTo(0.2, 2);

        light.update({ position: { x: 30, y: 40 }, speed: 10, deltaSeconds: 1 });

        expect(container.position.x).toBe(30);
        expect(container.position.y).toBe(40);
        expect(sprite.scale.x).toBeCloseTo(1, 3);
        expect(sprite.scale.y).toBeCloseTo(1, 3);
        expect(sprite.alpha).toBeGreaterThan(baselineAlpha);
        expect(sprite.alpha).toBeLessThanOrEqual(0.9 + 1e-6);
    });

    it('applies temporary flash intensity that decays over time', () => {
        const light = createDynamicLight({
            minRadius: 60,
            maxRadius: 120,
            baseRadius: 120,
            minIntensity: 0.1,
            maxIntensity: 0.4,
            flashDuration: 0.5,
            flashIntensity: 0.5,
        });

        const sprite = getSprite(light);

        light.update({ position: { x: 0, y: 0 }, speed: 2, deltaSeconds: 1 });
        const baselineAlpha = sprite.alpha;

        light.flash();
        light.update({ position: { x: 0, y: 0 }, speed: 2, deltaSeconds: 0.1 });
        expect(sprite.alpha).toBeGreaterThan(baselineAlpha);

        light.update({ position: { x: 0, y: 0 }, speed: 2, deltaSeconds: 1 });
        expect(sprite.alpha).toBeLessThanOrEqual(baselineAlpha + 0.01);
    });

    it('destroys underlying Pixi objects when disposed', () => {
        const light = createDynamicLight();
        const container = light.container as unknown as { destroyed: boolean };
        const sprite = getSprite(light) as unknown as { destroyed?: boolean };

        light.destroy();

        expect(container.destroyed).toBe(true);
        expect(sprite.destroyed).toBe(true);
    });
});
