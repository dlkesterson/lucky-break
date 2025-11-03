import { describe, expect, it } from 'vitest';
import { createHeatDistortionEffect } from 'render/effects/heat-distortion';
import type { HeatDistortionEffect } from 'render/effects';

interface UniformGroup {
    uniforms: {
        uSourceCount: number;
        uStrength: number;
        uTime: number;
        uSources: Float32Array;
    };
}

const getUniforms = (effect: HeatDistortionEffect) => {
    const group = effect.filter.resources.distortionUniforms as UniformGroup | undefined;
    if (!group) {
        throw new Error('Missing distortion uniforms');
    }
    return group.uniforms;
};

describe('createHeatDistortionEffect', () => {
    it('clears uniforms and disables the filter when not enabled', () => {
        const effect = createHeatDistortionEffect({ maxSources: 2 });
        const uniforms = getUniforms(effect);

        effect.setEnabled(false);
        effect.update({
            deltaSeconds: 0.16,
            comboEnergy: 0.5,
            sources: [
                {
                    position: { x: 0.2, y: 0.8 },
                    intensity: 0.9,
                    swirl: 1.2,
                },
            ],
        });

        expect(uniforms.uSourceCount).toBe(0);
        expect(uniforms.uStrength).toBe(0);
        expect(Array.from(uniforms.uSources).every((value) => value === 0)).toBe(true);
        expect(effect.filter.enabled).toBe(false);

        effect.destroy();
    });

    it('normalizes source data and enables the filter when energy is present', () => {
        const effect = createHeatDistortionEffect({ maxSources: 2, responsiveness: 12, strengthScale: 0.04 });
        const uniforms = getUniforms(effect);

        effect.update({
            deltaSeconds: 0.25,
            comboEnergy: 0.6,
            sources: [
                {
                    position: { x: 0.3, y: 0.6 },
                    intensity: 0.85,
                    swirl: 1.1,
                },
                {
                    position: { x: 1.4, y: -0.2 },
                    intensity: 0.5,
                    swirl: 0.25,
                },
                {
                    position: { x: 0.5, y: 0.5 },
                    intensity: 0.3,
                    swirl: 2,
                },
            ],
        });

        expect(uniforms.uSourceCount).toBe(2);
        expect(uniforms.uSources[0]).toBeCloseTo(0.3, 4);
        expect(uniforms.uSources[1]).toBeCloseTo(0.6, 4);
        expect(uniforms.uSources[2]).toBeCloseTo(0.85, 4);
        expect(uniforms.uSources[3]).toBeCloseTo(1.1, 4);
        expect(uniforms.uSources[4]).toBeCloseTo(1, 4);
        expect(uniforms.uSources[5]).toBeCloseTo(0, 4);
        expect(uniforms.uSources[6]).toBeCloseTo(0.5, 4);
        expect(uniforms.uSources[7]).toBeCloseTo(0.5, 4);
        expect(uniforms.uStrength).toBeGreaterThan(0);
        expect(effect.filter.enabled).toBe(true);

        effect.update({ deltaSeconds: 0.1, comboEnergy: 0.3, sources: [] });
        expect(uniforms.uSourceCount).toBe(0);
        expect(Array.from(uniforms.uSources).every((value) => value === 0)).toBe(true);
        expect(effect.filter.enabled).toBe(false);

        effect.destroy();
    });

    it('wraps elapsed time to prevent unbounded growth', () => {
        const effect = createHeatDistortionEffect();
        const uniforms = getUniforms(effect);

        effect.update({ deltaSeconds: 600, comboEnergy: 0, sources: [] });

        expect(uniforms.uTime).toBeLessThan(512);

        effect.destroy();
    });
});
