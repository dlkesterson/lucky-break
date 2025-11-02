import { describe, expect, it } from 'vitest';
import { createHeatRippleEffect } from 'render/effects/heat-ripple';
import type { Filter } from 'pixi.js';

interface RippleUniformGroup {
    uniforms: {
        uRippleCount: number;
        uRipples: Float32Array;
        uRippleParams: Float32Array;
    };
}

describe('heat-ripple effect', () => {
    const getUniforms = (effect: ReturnType<typeof createHeatRippleEffect>) => {
        const filter = effect.filter as Filter & { resources?: Record<string, unknown> };
        const group = filter.resources?.rippleUniforms as RippleUniformGroup | undefined;
        if (!group) {
            throw new Error('Missing ripple uniforms');
        }
        return group.uniforms;
    };

    it('activates and decays a ripple over its lifetime', () => {
        const effect = createHeatRippleEffect({
            maxRipples: 2,
            minDuration: 0.25,
            maxDuration: 0.25,
            minAmplitude: 0.01,
            maxAmplitude: 0.02,
        });

        const uniforms = getUniforms(effect);
        expect(uniforms.uRippleCount).toBe(0);
        expect(effect.filter.enabled).toBe(false);

        effect.spawnRipple({
            position: { x: 0.5, y: 0.5 },
            intensity: 1,
            startRadius: 0.1,
            endRadius: 0.2,
        });

        effect.update(0.1);
        expect(effect.filter.enabled).toBe(true);
        expect(uniforms.uRippleCount).toBe(1);
        const initialAmplitude = uniforms.uRipples[3];
        expect(initialAmplitude).toBeGreaterThan(0);

        effect.update(0.1);
        expect(uniforms.uRipples[3]).toBeLessThan(initialAmplitude);

        effect.update(0.2);
        expect(uniforms.uRippleCount).toBe(0);
        expect(effect.filter.enabled).toBe(false);

        effect.destroy();
    });

    it('replaces the oldest ripple when exceeding capacity', () => {
        const effect = createHeatRippleEffect({
            maxRipples: 1,
            minDuration: 0.5,
            maxDuration: 0.5,
            minAmplitude: 0.01,
            maxAmplitude: 0.03,
        });

        const uniforms = getUniforms(effect);

        effect.spawnRipple({
            position: { x: 0.1, y: 0.1 },
            intensity: 0.25,
            startRadius: 0.05,
            endRadius: 0.1,
        });
        effect.update(0.01);
        const firstCenterX = uniforms.uRipples[0];
        const firstAmplitude = uniforms.uRipples[3];

        effect.spawnRipple({
            position: { x: 0.8, y: 0.4 },
            intensity: 0.9,
            startRadius: 0.08,
            endRadius: 0.2,
        });
        effect.update(0.01);
        const secondCenterX = uniforms.uRipples[0];

        expect(uniforms.uRippleCount).toBe(1);
        expect(secondCenterX).not.toBe(firstCenterX);
        expect(uniforms.uRipples[3]).toBeGreaterThan(firstAmplitude);

        effect.destroy();
    });
});
