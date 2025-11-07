import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GradientWaveFilter } from 'render/filters/gradient-wave-filter';

beforeAll(() => {
    vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const getUniforms = (filter: GradientWaveFilter) => {
    const resources = filter.resources as { gradientUniforms?: { uniforms: Record<string, number> } };
    const group = resources.gradientUniforms;
    if (!group) {
        throw new Error('Gradient wave filter missing uniform group');
    }
    return group.uniforms;
};

describe('GradientWaveFilter', () => {
    it('applies constructor options to uniforms', () => {
        const filter = new GradientWaveFilter({
            gridDensity: 5,
            lineWidth: 0.05,
            waveFrequency: 3,
            waveAmplitude: 0.1,
            opacity: 0.42,
        });

        const uniforms = getUniforms(filter);
        expect(uniforms.uGridDensity).toBeCloseTo(5, 5);
        expect(uniforms.uLineWidth).toBeCloseTo(0.05, 5);
        expect(uniforms.uWaveFrequency).toBeCloseTo(3, 5);
        expect(uniforms.uWaveAmplitude).toBeCloseTo(0.1, 5);
        expect(uniforms.uOpacity).toBeCloseTo(0.42, 5);
    });

    it('updates opacity via setter', () => {
        const filter = new GradientWaveFilter({ opacity: 0.1 });

        filter.setOpacity(0.85);

        expect(getUniforms(filter).uOpacity).toBeCloseTo(0.85, 5);
    });

    it('advances time when given positive deltas', () => {
        const filter = new GradientWaveFilter({ speed: 2 });

        filter.update(0.5);
        expect(getUniforms(filter).uTime).toBeCloseTo(1, 5);

        filter.update(NaN);
        filter.update(-1);
        filter.update(0);

        expect(getUniforms(filter).uTime).toBeCloseTo(1, 5);
    });
});
