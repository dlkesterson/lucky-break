import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LOADOUT_BALL_SHAPE,
    normalizeBallShape,
    toPhysicsBallBodyShape,
} from 'app/runtime/ball-shape';

describe('ball-shape', () => {
    describe('normalizeBallShape', () => {
        it('returns the default shape when given null', () => {
            expect(normalizeBallShape(null)).toBe(DEFAULT_LOADOUT_BALL_SHAPE);
        });

        it('returns the default shape when given undefined', () => {
            expect(normalizeBallShape(undefined)).toBe(DEFAULT_LOADOUT_BALL_SHAPE);
        });

        it('returns the provided shape when valid', () => {
            expect(normalizeBallShape('sphere')).toBe('sphere');
            expect(normalizeBallShape('d20')).toBe('d20');
        });
    });

    describe('toPhysicsBallBodyShape', () => {
        it('converts sphere to circle physics shape', () => {
            const result = toPhysicsBallBodyShape('sphere');
            expect(result).toEqual({ type: 'circle' });
        });

        it('converts d20 to regular-polygon physics shape with 20 sides', () => {
            const result = toPhysicsBallBodyShape('d20');
            expect(result).toEqual({ type: 'regular-polygon', sides: 20 });
        });

        it('converts undefined to circle physics shape', () => {
            const result = toPhysicsBallBodyShape(undefined);
            expect(result).toEqual({ type: 'circle' });
        });

        it('converts null to circle physics shape through normalization', () => {
            // Testing through the normalization path
            const normalized = normalizeBallShape(null);
            const result = toPhysicsBallBodyShape(normalized);
            expect(result).toEqual({ type: 'circle' });
        });
    });
});
