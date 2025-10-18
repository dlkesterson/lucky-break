import { describe, expect, it } from 'vitest';
import {
    generateLevelLayout,
    getLevelDifficultyMultiplier,
    getLevelSpec,
    getPresetLevelCount,
    remixLevel,
} from 'util/levels';

describe('remixLevel', () => {
    it('returns the original spec when loop count is zero or negative', () => {
        const base = getLevelSpec(0);
        expect(remixLevel(base, 0)).toBe(base);
        expect(remixLevel(base, -1)).toBe(base);
    });

    it('remixes hit points and scales power-up multipliers for looped levels', () => {
        const base = getLevelSpec(1);
        const remixed = remixLevel(base, 1);

        expect(remixed).not.toBe(base);

        const baseHp = Array.from({ length: base.rows }, (_, row) => (base.hpPerRow ? base.hpPerRow(row) : 1));
        const remixedHp = Array.from({ length: base.rows }, (_, row) => (remixed.hpPerRow ? remixed.hpPerRow(row) : 1));

        expect(remixedHp).not.toEqual(baseHp);

        const difficulty = getLevelDifficultyMultiplier(getPresetLevelCount());
        remixedHp.forEach((hp, index) => {
            const scaledBase = Math.round(baseHp[index] * difficulty);
            expect(Math.abs(hp - scaledBase)).toBeLessThanOrEqual(1);
            expect(hp).toBeGreaterThanOrEqual(1);
        });

        const baseLayout = generateLevelLayout(base);
        const remixedLayout = generateLevelLayout(remixed);
        expect(remixedLayout.bricks).toHaveLength(baseLayout.bricks.length);

        const baseMultiplier = base.powerUpChanceMultiplier ?? 1;
        const remixedMultiplier = remixed.powerUpChanceMultiplier ?? 1;
        expect(remixedMultiplier).toBeGreaterThan(baseMultiplier);
    });

    it('increases difficulty multiplier after each preset loop', () => {
        const presetCount = getPresetLevelCount();
        expect(getLevelDifficultyMultiplier(presetCount)).toBeGreaterThan(1);
    });
});
