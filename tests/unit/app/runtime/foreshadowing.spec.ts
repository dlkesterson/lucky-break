import { describe, expect, it } from 'vitest';
import {
    intersectRayWithExpandedAabb,
    resolveBallRadius,
} from 'app/runtime/foreshadowing';

describe('foreshadowing geometry helpers', () => {
    it('resolves ball radius using circle radius, bounds, and defaults', () => {
        const circleBody = { circleRadius: 1 } as const;
        expect(resolveBallRadius(circleBody as never)).toBe(2);

        const boundsBody = {
            bounds: {
                min: { x: 4, y: 6 },
                max: { x: 14, y: 18 },
            },
        } as const;
        expect(resolveBallRadius(boundsBody as never)).toBe(6);

        const fallbackBody = { bounds: { min: { x: Number.NaN, y: Number.NaN }, max: { x: Number.NaN, y: Number.NaN } } } as const;
        expect(resolveBallRadius(fallbackBody as never)).toBe(10);
    });

    it('computes ray intersections across edge cases', () => {
        const bounds = {
            min: { x: 0, y: 0 },
            max: { x: 10, y: 10 },
        } as const;

        const diagonalHit = intersectRayWithExpandedAabb(
            { x: -5, y: -5 },
            { x: 1, y: 2 },
            bounds,
            0,
        );
        expect(diagonalHit).toBe(5);

        const verticalOutside = intersectRayWithExpandedAabb(
            { x: 15, y: -5 },
            { x: 0, y: 1 },
            bounds,
            0,
        );
        expect(verticalOutside).toBeNull();

        const swappedDirectionHit = intersectRayWithExpandedAabb(
            { x: 15, y: 5 },
            { x: -1, y: 1 },
            bounds,
            0,
        );
        expect(swappedDirectionHit).toBe(5);

        const forwardMiss = intersectRayWithExpandedAabb(
            { x: 5, y: 20 },
            { x: 0, y: 1 },
            bounds,
            0,
        );
        expect(forwardMiss).toBeNull();

        const parallelOutside = intersectRayWithExpandedAabb(
            { x: 5, y: 20 },
            { x: 1, y: 0 },
            bounds,
            0,
        );
        expect(parallelOutside).toBeNull();

        const noOverlap = intersectRayWithExpandedAabb(
            { x: -5, y: 5 },
            { x: -1, y: 0 },
            bounds,
            0,
        );
        expect(noOverlap).toBeNull();

        const horizontalHit = intersectRayWithExpandedAabb(
            { x: -5, y: 5 },
            { x: 1, y: 0 },
            bounds,
            0,
        );
        expect(horizontalHit).toBe(5);

        const verticalSwap = intersectRayWithExpandedAabb(
            { x: 5, y: 15 },
            { x: 0, y: -1 },
            bounds,
            0,
        );
        expect(verticalSwap).toBe(5);
    });
});
