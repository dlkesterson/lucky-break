import { beforeEach, describe, expect, it, vi } from 'vitest';

const pixiState = vi.hoisted(() => {
    class MockPoint {
        x: number;
        y: number;

        constructor(x = 0, y = x) {
            this.x = x;
            this.y = y;
        }

        set(x: number, y?: number) {
            this.x = x;
            this.y = y ?? x;
        }
    }

    class MockGraphics {
        eventMode: string | null = null;
        blendMode: string | null = null;
        moveToCalls: { x: number; y: number }[] = [];
        lineToCalls: { x: number; y: number }[] = [];
        strokeCalls: { color?: number; width?: number; alpha?: number }[] = [];
        clearCalls = 0;
        destroyCalls = 0;
        parent: { removeChild?: (child: unknown) => void } | null = null;

        moveTo(x: number, y: number) {
            this.moveToCalls.push({ x, y });
        }

        lineTo(x: number, y: number) {
            this.lineToCalls.push({ x, y });
        }

        stroke(options: { color?: number; width?: number; alpha?: number }) {
            this.strokeCalls.push(options);
        }

        clear() {
            this.clearCalls += 1;
        }

        destroy() {
            this.destroyCalls += 1;
        }
    }

    class MockContainer {
        children: unknown[] = [];
        eventMode: string | null = null;
        sortableChildren = false;
        position = new MockPoint();
        removeChildren = vi.fn();
        destroy = vi.fn();
        addChild(child: unknown) {
            this.children.push(child);
            if (child && typeof child === 'object') {
                Object.assign(child as Record<string, unknown>, { parent: this });
            }
            return child;
        }

        removeChild(child: unknown) {
            const index = this.children.indexOf(child);
            if (index >= 0) {
                this.children.splice(index, 1);
            }
            if (child && typeof child === 'object') {
                Object.assign(child as Record<string, unknown>, { parent: null });
            }
            return child;
        }
    }

    const graphics: MockGraphics[] = [];

    class TrackingGraphics extends MockGraphics {
        constructor() {
            super();
            graphics.push(this);
        }
    }

    return {
        MockGraphics,
        TrackingGraphics,
        MockContainer,
        graphics,
        reset() {
            graphics.length = 0;
        },
    };
});

vi.mock('pixi.js', () => ({
    Graphics: pixiState.TrackingGraphics,
    Container: pixiState.MockContainer,
}));

import { createBallTrailsEffect } from 'render/effects/ball-trails';

type PixiState = typeof pixiState;
type MockGraphic = InstanceType<PixiState['MockGraphics']>;

const baseTheme = {
    coreColor: 0xfff2cc,
    auraColor: 0xffe680,
    accentColor: 0xff9f1c,
};

describe('ball-trails effect', () => {
    beforeEach(() => {
        pixiState.reset();
    });

    it('captures source history, fades inactive trails, and removes expired entries', () => {
        const effect = createBallTrailsEffect(baseTheme);

        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: 0.5,
            sources: [
                { id: 1, position: { x: 10, y: 20 }, radius: 8, normalizedSpeed: 0.8, isPrimary: true },
                { id: 2, position: { x: 40, y: -15 }, radius: 6, normalizedSpeed: 0.3, isPrimary: false },
            ],
        });

        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: 0.5,
            sources: [
                { id: 1, position: { x: 12, y: 24 }, radius: 8, normalizedSpeed: 0.9, isPrimary: true },
                { id: 2, position: { x: 42, y: -12 }, radius: 6, normalizedSpeed: 0.25, isPrimary: false },
            ],
        });

        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: 0.5,
            sources: [
                { id: 1, position: { x: 16, y: 28 }, radius: 8, normalizedSpeed: 1, isPrimary: true },
            ],
        });

        const trailGraphics = effect.container.children as unknown as MockGraphic[];
        expect(trailGraphics.length).toBeGreaterThanOrEqual(2);
        const [primary, secondary] = trailGraphics;
        expect(primary.moveToCalls.length).toBeGreaterThan(0);
        expect(primary.strokeCalls.length).toBeGreaterThan(0);
        expect(secondary?.moveToCalls.length ?? 0).toBeGreaterThan(0);
        expect(secondary?.strokeCalls.length ?? 0).toBeGreaterThan(0);
        expect(secondary?.clearCalls ?? 0).toBeGreaterThan(0);
        expect(primary.clearCalls).toBeGreaterThan(0);

        effect.update({
            deltaSeconds: 1,
            comboEnergy: 0.1,
            sources: [],
        });

        expect(secondary.destroyCalls).toBe(1);

        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: 0,
            sources: [
                { id: 1, position: { x: 2, y: 2 }, radius: 4, normalizedSpeed: 0.6, isPrimary: false },
            ],
        });
        expect(effect.container.children.length).toBe(1);

        effect.destroy();
        expect(primary.destroyCalls).toBeGreaterThan(0);
        expect(effect.container.children.length).toBe(0);
    });

    it('responds to theme updates and clamps combo energy across draws', () => {
        const effect = createBallTrailsEffect(baseTheme);
        effect.update({
            deltaSeconds: 0.1,
            comboEnergy: 5,
            sources: [
                { id: 1, position: { x: 0, y: 0 }, radius: 4, normalizedSpeed: 2, isPrimary: false },
                { id: 2, position: { x: 4, y: 0 }, radius: 6, normalizedSpeed: 0.1, isPrimary: true },
            ],
        });

        effect.update({
            deltaSeconds: 0.1,
            comboEnergy: 5,
            sources: [
                { id: 1, position: { x: 3, y: 1.5 }, radius: 4, normalizedSpeed: 2, isPrimary: false },
                { id: 2, position: { x: 7, y: 1.5 }, radius: 6, normalizedSpeed: 0.25, isPrimary: true },
            ],
        });

        effect.update({
            deltaSeconds: 0.1,
            comboEnergy: 4,
            sources: [
                { id: 1, position: { x: 6, y: 3 }, radius: 4, normalizedSpeed: 1.2, isPrimary: false },
                { id: 2, position: { x: 10, y: 3 }, radius: 6, normalizedSpeed: 0.35, isPrimary: true },
            ],
        });

        const graphicsBeforeTheme = effect.container.children as unknown as MockGraphic[];
        expect(graphicsBeforeTheme.some((graphic) => graphic.strokeCalls.length > 0)).toBe(true);

        graphicsBeforeTheme.forEach((graphic) => {
            graphic.strokeCalls.length = 0;
            graphic.clearCalls = 0;
        });

        effect.applyTheme({ coreColor: 0x111111, auraColor: 0x222222, accentColor: 0x333333 });
        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: Number.NaN,
            sources: [
                { id: 1, position: { x: 1, y: 1 }, radius: 4, normalizedSpeed: 0.5, isPrimary: false },
            ],
        });

        const graphicsAfterTheme = effect.container.children as unknown as MockGraphic[];
        expect(graphicsAfterTheme.every((graphic) => graphic.clearCalls > 0)).toBe(true);
        expect(graphicsAfterTheme.some((graphic) => graphic.strokeCalls.length > 0)).toBe(true);
    });
});
