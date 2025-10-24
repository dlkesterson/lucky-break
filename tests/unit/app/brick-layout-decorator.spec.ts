import { describe, expect, it } from 'vitest';
import { createBrickDecorator } from 'app/brick-layout-decorator';
import type { BrickDecorationContext } from 'util/levels';

const buildContext = (overrides: Partial<BrickDecorationContext> = {}): BrickDecorationContext => ({
    row: 0,
    col: 0,
    slotIndex: 0,
    slotCount: 1,
    spec: { rows: 1, cols: 1 },
    traits: [],
    random: undefined,
    ...overrides,
});

describe('createBrickDecorator', () => {
    it('creates circular wall bricks near the top corners in portrait layouts', () => {
        const decorate = createBrickDecorator('portrait');
        const result = decorate?.(buildContext({ row: 0, slotIndex: 0, slotCount: 8 }));
        expect(result).toEqual({ form: 'circle', breakable: false });
    });

    it('adds circular bricks near the portrait center rows', () => {
        const decorate = createBrickDecorator('portrait');
        const result = decorate?.(buildContext({ row: 3, slotIndex: 4, slotCount: 9 }));
        expect(result).toEqual({ form: 'circle' });
    });

    it('alternates portrait shapes with randomness', () => {
        const decorate = createBrickDecorator('portrait');
        const result = decorate?.(buildContext({ row: 1, slotIndex: 1, slotCount: 6, random: () => 0.9 }));
        expect(result).toEqual({ form: 'circle' });
    });

    it('skips decoration when traits already modify the brick', () => {
        const decorate = createBrickDecorator('portrait');
        const result = decorate?.(buildContext({ traits: ['gamble'] as const }));
        expect(result).toBeUndefined();
    });

    it('generates alternating diamond bricks in landscape layouts', () => {
        const decorate = createBrickDecorator('landscape');
        const result = decorate?.(buildContext({ row: 2, slotIndex: 1 }));
        expect(result).toEqual({ form: 'diamond' });
    });

    it('creates additional diamonds when the portrait pattern aligns', () => {
        const decorate = createBrickDecorator('portrait');
        const result = decorate?.(buildContext({ row: 2, slotIndex: 2, slotCount: 7 }));
        expect(result).toEqual({ form: 'diamond' });
    });

    it('returns undefined when the portrait random gate fails', () => {
        const decorate = createBrickDecorator('portrait');
        const result = decorate?.(buildContext({ row: 1, slotIndex: 1, slotCount: 6, random: () => 0.2 }));
        expect(result).toBeUndefined();
    });

    it('skips decoration for fortified bricks', () => {
        const decorate = createBrickDecorator('landscape');
        const result = decorate?.(buildContext({ traits: ['fortified'] as const }));
        expect(result).toBeUndefined();
    });

    it('uses randomness for landscape circle placements', () => {
        const decorate = createBrickDecorator('landscape');
        const result = decorate?.(buildContext({ row: 1, slotIndex: 0, random: () => 0.75 }));
        expect(result).toEqual({ form: 'circle' });
        const fallback = decorate?.(buildContext({ row: 1, slotIndex: 0, random: () => 0.2 }));
        expect(fallback).toBeUndefined();
    });
});
