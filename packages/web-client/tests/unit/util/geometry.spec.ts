import { describe, expect, it } from 'vitest';
import {
    addVectors,
    clamp,
    createRectangle,
    createVector2,
    degreesToRadians,
    distance,
    dotProduct,
    lerp,
    multiplyVector,
    normalizeVector,
    pointInRectangle,
    radiansToDegrees,
    rectangleCenter,
    rectanglesIntersect,
    subtractVectors,
} from 'util/geometry';

describe('geometry utilities', () => {
    it('creates vectors with default zero values', () => {
        expect(createVector2()).toEqual({ x: 0, y: 0 });
        expect(createVector2(3, -2)).toEqual({ x: 3, y: -2 });
    });

    it('performs vector math', () => {
        const a = { x: 4, y: -1 };
        const b = { x: -6, y: 8 };
        expect(addVectors(a, b)).toEqual({ x: -2, y: 7 });
        expect(subtractVectors(a, b)).toEqual({ x: 10, y: -9 });
        expect(multiplyVector(a, 2)).toEqual({ x: 8, y: -2 });
        expect(distance(a, b)).toBeCloseTo(Math.sqrt((4 + 6) ** 2 + (-1 - 8) ** 2));
        expect(dotProduct(a, b)).toBe(4 * -6 + -1 * 8);
    });

    it('normalizes vectors and handles zero length', () => {
        expect(normalizeVector({ x: 3, y: 4 })).toEqual({ x: 3 / 5, y: 4 / 5 });
        expect(normalizeVector({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });

    it('creates rectangles and derives properties', () => {
        const rect = createRectangle(2, 4, 10, 6);
        expect(rectangleCenter(rect)).toEqual({ x: 7, y: 7 });
        expect(pointInRectangle({ x: 2, y: 4 }, rect)).toBe(true);
        expect(pointInRectangle({ x: 12, y: 10 }, rect)).toBe(true);
        expect(pointInRectangle({ x: 12.1, y: 10 }, rect)).toBe(false);
    });

    it('detects rectangle intersections excluding touching edges', () => {
        const a = createRectangle(0, 0, 10, 10);
        const b = createRectangle(10, 0, 5, 5);
        const c = createRectangle(5, 5, 10, 10);
        expect(rectanglesIntersect(a, b)).toBe(false);
        expect(rectanglesIntersect(a, c)).toBe(true);
    });

    it('clamps and interpolates scalars', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
        expect(clamp(6, 0, 10)).toBe(6);
        expect(lerp(0, 10, 0.25)).toBe(2.5);
        expect(lerp(5, 15, 0.5)).toBe(10);
    });

    it('converts angles between degrees and radians', () => {
        expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
        expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
    });
});
