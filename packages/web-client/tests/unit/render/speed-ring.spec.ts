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

interface CommandRecord {
    readonly type: string;
    readonly args: unknown[];
}

vi.mock('pixi.js', () => {
    class Container {
        public children: unknown[] = [];

        public position = new PointStub();

        public scale = new PointStub(1, 1);

        public visible = true;

        public alpha = 1;

        public eventMode: string | null = null;

        public blendMode: string | null = null;

        public destroyed = false;

        public sortableChildren = false;

        public addChild<T>(child: T): T {
            this.children.push(child);
            (child as { parent?: Container }).parent = this;
            return child;
        }

        public removeChild<T>(child: T): T {
            this.children = this.children.filter((candidate) => candidate !== child);
            return child;
        }

        public removeFromParent(): void {
            if (!(this as { parent?: Container | null }).parent) {
                return;
            }
            (this as { parent?: Container | null }).parent?.removeChild(this);
            (this as { parent?: Container | null }).parent = null;
        }

        public destroy(options?: { children?: boolean }): void {
            this.destroyed = true;
            if (options?.children) {
                this.children = [];
            }
        }
    }

    class Graphics extends Container {
        public commands: CommandRecord[] = [];

        public circle(x: number, y: number, radius: number): this {
            this.commands.push({ type: 'circle', args: [x, y, radius] });
            return this;
        }

        public fill(options: { color: number; alpha?: number }): this {
            this.commands.push({ type: 'fill', args: [options] });
            return this;
        }

        public stroke(options: { color: number; width: number; alpha?: number }): this {
            this.commands.push({ type: 'stroke', args: [options] });
            return this;
        }

        public clear(): this {
            this.commands = [];
            return this;
        }

        public destroy(): void {
            this.destroyed = true;
        }
    }

    class Sprite extends Container { }

    return {
        Container,
        Graphics,
        Sprite,
    };
});

import { createSpeedRing } from 'render/effects/speed-ring';

describe('createSpeedRing', () => {
    const extractCommands = (graphics: unknown): CommandRecord[] => {
        return (graphics as { commands?: CommandRecord[] }).commands ?? [];
    };

    it('responds to speed changes with radius and visibility updates', () => {
        const ringHandle = createSpeedRing({
            minRadius: 10,
            maxRadius: 30,
            activationSpeedMultiplier: 0.5,
            minAlpha: 0.1,
            maxAlpha: 0.9,
            palette: { ringColor: 0xff00ff, haloColor: 0x00ffff },
        });

        const container = ringHandle.container as unknown as {
            position: PointStub;
            visible: boolean;
            children: unknown[];
        };

        ringHandle.update({ position: { x: 4, y: 6 }, speed: 3, baseSpeed: 10, maxSpeed: 20, deltaSeconds: 0.016 });
        expect(container.position.x).toBe(4);
        expect(container.position.y).toBe(6);
        expect(container.visible).toBe(false);

        ringHandle.update({ position: { x: 24, y: 40 }, speed: 20, baseSpeed: 10, maxSpeed: 20, deltaSeconds: 0.5 });
        expect(container.position.x).toBe(24);
        expect(container.position.y).toBe(40);
        expect(container.visible).toBe(true);

        const [halo, outline] = container.children;
        const haloCircle = extractCommands(halo).find((command) => command.type === 'circle');
        expect(haloCircle?.args[2]).toBeCloseTo(40, 3); // radius + halo offset

        const stroke = extractCommands(outline).find((command) => command.type === 'stroke');
        expect(stroke?.args[0]).toMatchObject({ color: 0xff00ff });
        expect((stroke?.args[0] as { alpha?: number }).alpha ?? 0).toBeGreaterThan(0.5);
    });

    it('allows palette changes without recomputing geometry', () => {
        const ringHandle = createSpeedRing({
            minRadius: 8,
            maxRadius: 20,
            palette: { ringColor: 0xffffff, haloColor: 0x123456 },
        });

        ringHandle.update({ position: { x: 0, y: 0 }, speed: 18, baseSpeed: 10, maxSpeed: 20, deltaSeconds: 0.5 });

        ringHandle.setPalette({ ringColor: 0x222222, haloColor: 0xabcdef });

        const [halo, outline] = (ringHandle.container as { children: unknown[] }).children;
        const haloFill = extractCommands(halo).find((command) => command.type === 'fill');
        expect(haloFill?.args[0]).toMatchObject({ color: 0xabcdef });

        const stroke = extractCommands(outline).find((command) => command.type === 'stroke');
        expect(stroke?.args[0]).toMatchObject({ color: 0x222222 });
    });

    it('destroys Pixi resources and ignores further updates once disposed', () => {
        const ringHandle = createSpeedRing();
        const container = ringHandle.container as unknown as { destroyed: boolean; children: unknown[] };
        const [halo, outline] = container.children as { destroyed?: boolean }[];

        ringHandle.destroy();

        expect(container.destroyed).toBe(true);
        expect(halo.destroyed).toBe(true);
        expect(outline.destroyed).toBe(true);

        expect(() => ringHandle.update({ position: { x: 0, y: 0 }, speed: 10, baseSpeed: 10, maxSpeed: 20, deltaSeconds: 0.016 })).not.toThrow();
        expect(() => ringHandle.reset()).not.toThrow();
        expect(() => ringHandle.setPalette({ ringColor: 0xffffff })).not.toThrow();
    });
});
