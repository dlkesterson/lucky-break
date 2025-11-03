import { describe, expect, it } from 'vitest';
import { computeViewportFit, resolveViewportSize } from 'render/viewport';

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

    it('throws when content aspect ratio is not finite', () => {
        expect(() => computeViewportFit({
            containerWidth: 100,
            containerHeight: 100,
            contentWidth: Number.NaN,
            contentHeight: 50,
        })).toThrowError(RangeError);
    });
});

describe('resolveViewportSize', () => {
    const createRect = (width: number, height: number): DOMRectReadOnly => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
    });

    it('returns container bounds when available', () => {
        const element = {
            getBoundingClientRect: () => createRect(321.8, 480.3),
        } as unknown as Element;

        const result = resolveViewportSize({
            container: element,
            fallbackWidth: 100,
            fallbackHeight: 100,
        });

        expect(result).toEqual({ width: 322, height: 480 });
    });

    it('falls back when container reports zero size', () => {
        const element = {
            getBoundingClientRect: () => createRect(0, 0),
        } as unknown as Element;

        const result = resolveViewportSize({
            container: element,
            fallbackWidth: 640,
            fallbackHeight: 480,
        });

        expect(result).toEqual({ width: 640, height: 480 });
    });

    it('falls back when container missing', () => {
        const result = resolveViewportSize({
            container: null,
            fallbackWidth: 320,
            fallbackHeight: 180,
        });

        expect(result).toEqual({ width: 320, height: 180 });
    });

    it('rounds fallback dimensions when measurement fails', () => {
        const element = {
            getBoundingClientRect: () => {
                throw new Error('unavailable');
            },
        } as unknown as Element;

        const result = resolveViewportSize({
            container: element,
            fallbackWidth: 200.6,
            fallbackHeight: 99.2,
        });

        expect(result).toEqual({ width: 201, height: 99 });
    });

    it('coerces fallback dimensions to non-negative values', () => {
        const result = resolveViewportSize({
            container: null,
            fallbackWidth: Number.POSITIVE_INFINITY,
            fallbackHeight: -45,
        });

        expect(result).toEqual({ width: 0, height: 0 });
    });
});
