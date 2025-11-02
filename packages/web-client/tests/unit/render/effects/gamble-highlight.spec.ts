import { describe, expect, it, vi } from 'vitest';
import { createGambleHighlightEffect } from 'render/effects/gamble-highlight';
import type { Container } from 'pixi.js';

vi.mock('@pixi/filter-glow', () => {
    class MockGlowFilter {
        public enabled = false;
        public padding = 0;
        public color: number;
        public innerStrength: number;
        public outerStrength: number;
        public destroy = vi.fn();

        constructor(options: { distance: number; outerStrength: number; innerStrength: number; color: number; quality: number }) {
            this.outerStrength = options.outerStrength;
            this.innerStrength = options.innerStrength;
            this.color = options.color;
        }
    }

    return { GlowFilter: MockGlowFilter };
});

interface HostWithFilters {
    filters: unknown[] | null;
}

const asHost = (host: HostWithFilters): HostWithFilters & Container => host as HostWithFilters & Container;

const getFilter = (host: HostWithFilters & Container) => (host.filters?.[0] ?? null) as unknown as Record<string, unknown> | null;

describe('createGambleHighlightEffect', () => {
    it('attaches and updates a highlight filter based on state changes', () => {
        const effect = createGambleHighlightEffect();
        const host = asHost({ filters: null });

        effect.apply(host, 'armed', 0.4);
        const initialFilter = getFilter(host);
        expect(initialFilter).toBeTruthy();
        expect(host.filters).toHaveLength(1);
        expect(initialFilter?.enabled).toBe(true);
        expect(initialFilter?.innerStrength).toBeCloseTo(0.05, 5);
        expect(initialFilter?.outerStrength).toBeCloseTo(0.7, 5);

        effect.apply(host, 'primed', 2);
        const updatedFilter = getFilter(host);
        expect(host.filters).toHaveLength(1);
        expect(updatedFilter?.color).toBe(0xff6834);
        expect(updatedFilter?.innerStrength).toBeCloseTo(0.25, 5);

        effect.apply(host, 'primed', 0.3);
        expect(host.filters).toHaveLength(1);
    });

    it('pulses highlight intensity and clamps urgency between entries', () => {
        const effect = createGambleHighlightEffect();
        const armedHost = asHost({ filters: null });
        const primedHost = asHost({ filters: null });

        effect.apply(armedHost, 'armed', 0);
        effect.apply(primedHost, 'primed', 8);

        const armedFilter = getFilter(armedHost);
        const primedFilter = getFilter(primedHost);
        expect(armedFilter?.outerStrength).toBeCloseTo(0.7, 5);
        expect(primedFilter?.outerStrength).toBeCloseTo(1.6, 5);

        effect.update(0);
        expect(primedFilter?.outerStrength).toBeCloseTo(1.6, 5);

        effect.update(0.5);
        const nextArmedStrength = Number(armedFilter?.outerStrength);
        const nextPrimedStrength = Number(primedFilter?.outerStrength);
        expect(nextPrimedStrength).toBeGreaterThan(nextArmedStrength);
        expect(nextPrimedStrength).toBeGreaterThan(1.6);
    });

    it('resets and disposes highlight entries cleanly', () => {
        const effect = createGambleHighlightEffect();
        const host = asHost({ filters: null });
        const otherHost = asHost({ filters: null });

        effect.reset(host);

        effect.apply(host, 'primed', 0.9);
        const filter = getFilter(host);
        const destroySpy = filter?.destroy as ReturnType<typeof vi.fn>;
        expect(host.filters).toHaveLength(1);

        effect.reset(host);
        expect(host.filters).toBeNull();
        expect(destroySpy).toHaveBeenCalled();
        expect(filter?.enabled).toBe(false);
        expect(filter?.outerStrength).toBe(0);

        effect.apply(otherHost, 'armed', 0.2);
        const otherFilter = getFilter(otherHost);
        const otherDestroy = otherFilter?.destroy as ReturnType<typeof vi.fn>;

        effect.dispose();
        expect(otherHost.filters).toBeNull();
        expect(otherDestroy).toHaveBeenCalled();
    });
});
