import { beforeEach, describe, expect, it, vi } from 'vitest';

const pixiState = vi.hoisted(() => {
    class MockGraphics {
        eventMode: string | null = null;
        blendMode: string | null = null;
        moveToCalls: { x: number; y: number }[] = [];
        lineToCalls: { x: number; y: number }[] = [];
        strokeCalls: { color?: number; width?: number; alpha?: number }[] = [];
        circleCalls: { x: number; y: number; radius: number }[] = [];
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

        circle(x: number, y: number, radius: number) {
            this.circleCalls.push({ x, y, radius });
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
        visible = true;
        removeChildren = vi.fn(() => {
            this.children = [];
        });
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

import { createChromaticTrailEffect } from 'render/effects/chromatic-trail';

type PixiState = typeof pixiState;
type MockGraphic = InstanceType<PixiState['TrackingGraphics']>;

const basePalette = {
    red: 0xff6699,
    green: 0x66ffcc,
    blue: 0x6699ff,
};

describe('chromatic-trail effect', () => {
    beforeEach(() => {
        pixiState.reset();
    });

    it('emits trails for the primary ball and decays when idle', () => {
        const effect = createChromaticTrailEffect(basePalette);
        expect(effect.container.visible).toBe(false);

        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: 0.6,
            sources: [
                { id: 1, position: { x: 0, y: 0 }, radius: 8, normalizedSpeed: 0.9, isPrimary: true },
                { id: 2, position: { x: 8, y: 0 }, radius: 8, normalizedSpeed: 0.5, isPrimary: false },
            ],
        });

        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: 0.55,
            sources: [
                { id: 1, position: { x: 12, y: 4 }, radius: 8, normalizedSpeed: 1, isPrimary: true },
                { id: 2, position: { x: 10, y: -2 }, radius: 8, normalizedSpeed: 0.4, isPrimary: false },
            ],
        });

        const channelGraphics = effect.container.children as unknown as MockGraphic[];
        expect(channelGraphics.length).toBe(3);
        channelGraphics.forEach((graphic) => {
            expect(graphic.moveToCalls.length).toBeGreaterThan(0);
            expect(graphic.strokeCalls.length).toBeGreaterThan(0);
        });
        expect(effect.container.visible).toBe(true);

        effect.update({ deltaSeconds: 0.5, comboEnergy: 0, sources: [] });
        channelGraphics.forEach((graphic) => {
            expect(graphic.clearCalls).toBeGreaterThan(0);
        });

        effect.destroy();
        channelGraphics.forEach((graphic) => {
            expect(graphic.destroyCalls).toBeGreaterThan(0);
        });
    });

    it('honors configuration flags and palette updates', () => {
        const effect = createChromaticTrailEffect(basePalette);
        effect.configure({ trackAllSources: true, maxPoints: 6, emissionThreshold: 0.05 });
        effect.update({
            deltaSeconds: 0.1,
            comboEnergy: 0.04,
            sources: [
                { id: 2, position: { x: 0, y: 0 }, radius: 6, normalizedSpeed: 0.4, isPrimary: false },
            ],
        });
        expect(effect.container.visible).toBe(false);

        effect.update({
            deltaSeconds: 0.1,
            comboEnergy: 0.5,
            sources: [
                { id: 2, position: { x: 5, y: 2 }, radius: 6, normalizedSpeed: 0.6, isPrimary: false },
            ],
        });
        expect(effect.container.visible).toBe(true);

        const graphics = effect.container.children as unknown as MockGraphic[];
        const initialStrokeColor = graphics[0]?.strokeCalls.at(-1)?.color;

        const nextPalette = {
            red: 0xff3366,
            green: 0x33ffcc,
            blue: 0x3366ff,
        } as const;
        effect.applyPalette(nextPalette);
        effect.update({
            deltaSeconds: 0.1,
            comboEnergy: 0.6,
            sources: [
                { id: 2, position: { x: 10, y: 4 }, radius: 6, normalizedSpeed: 0.9, isPrimary: false },
            ],
        });
        const updatedStrokeColor = graphics[0]?.strokeCalls.at(-1)?.color;
        expect(initialStrokeColor).not.toBe(updatedStrokeColor);
        expect(updatedStrokeColor).toBe(nextPalette.red);

        effect.configure({ enabled: false });
        effect.update({
            deltaSeconds: 0.1,
            comboEnergy: 1,
            sources: [
                { id: 2, position: { x: 20, y: 10 }, radius: 6, normalizedSpeed: 1, isPrimary: false },
            ],
        });
        expect(effect.container.visible).toBe(false);
    });
});
