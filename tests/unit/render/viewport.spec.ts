import { describe, expect, it } from 'vitest';
import { computeViewportFit } from '../../../src/render/viewport';

describe('computeViewportFit', () => {
    it('centers content for wider container', () => {
        const result = computeViewportFit({
            containerWidth: 1920,
            containerHeight: 1080,
            contentWidth: 1280,
            contentHeight: 720,
        });

        expect(result.scale).toBeCloseTo(1080 / 720);
        expect(result.offsetX).toBeCloseTo((1920 - 1280 * result.scale) / 2);
        expect(result.offsetY).toBe(0);
    });

    it('centers content for taller container', () => {
        const result = computeViewportFit({
            containerWidth: 800,
            containerHeight: 1200,
            contentWidth: 1280,
            contentHeight: 720,
        });

        expect(result.scale).toBeCloseTo(800 / 1280);
        expect(result.offsetY).toBeCloseTo((1200 - 720 * result.scale) / 2);
        expect(result.offsetX).toBe(0);
    });

    it('returns identity when container collapsed', () => {
        const result = computeViewportFit({
            containerWidth: 0,
            containerHeight: 0,
            contentWidth: 1280,
            contentHeight: 720,
        });

        expect(result).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    });

    it('throws on invalid content dimensions', () => {
        expect(() => computeViewportFit({
            containerWidth: 100,
            containerHeight: 100,
            contentWidth: 0,
            contentHeight: 10,
        })).toThrowError(RangeError);
    });
});
