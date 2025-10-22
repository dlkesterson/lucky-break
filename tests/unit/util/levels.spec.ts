import { describe, expect, it } from 'vitest';
import { gameConfig } from 'config/game';
import {
    generateLevelLayout,
    getLevelDifficultyMultiplier,
    getLevelSpec,
    getPresetLevelCount,
    getLevelDebugInfo,
    getLoopScalingInfo,
    isLoopedLevel,
    remixLevel,
} from 'util/levels';
import { mulberry32 } from 'util/random';

describe('remixLevel', () => {
    it('returns the original spec when loop count is zero or negative', () => {
        const base = getLevelSpec(0);
        expect(remixLevel(base, 0)).toBe(base);
        expect(remixLevel(base, -1)).toBe(base);
    });

    it('remixes hit points and scales power-up multipliers for looped levels', () => {
        const base = getLevelSpec(1);
        const remixed = remixLevel(base, 1);
        const scaling = getLoopScalingInfo(1);

        expect(remixed).not.toBe(base);

        const baseHp = Array.from({ length: base.rows }, (_, row) => (base.hpPerRow ? base.hpPerRow(row) : 1));
        const remixedHp = Array.from({ length: base.rows }, (_, row) => (remixed.hpPerRow ? remixed.hpPerRow(row) : 1));

        expect(remixedHp).not.toEqual(baseHp);

        remixedHp.forEach((hp, index) => {
            const scaledBase = Math.round(baseHp[index] * scaling.brickHpMultiplier + scaling.brickHpBonus);
            expect(hp).toBeGreaterThanOrEqual(baseHp[index]);
            expect(Math.abs(hp - scaledBase)).toBeLessThanOrEqual(1);
        });

        const baseLayout = generateLevelLayout(base);
        const remixedLayout = generateLevelLayout(remixed);
        expect(remixedLayout.bricks).toHaveLength(baseLayout.bricks.length);

        const baseMultiplier = base.powerUpChanceMultiplier ?? 1;
        const remixedMultiplier = remixed.powerUpChanceMultiplier ?? 1;
        expect(remixedMultiplier).toBeLessThan(baseMultiplier);

        const baseGap = base.gap ?? gameConfig.levels.defaultGap;
        const remixedGap = remixed.gap ?? baseGap;
        expect(remixedGap).toBeLessThan(baseGap);
    });

    it('increases difficulty multiplier after each preset loop', () => {
        const presetCount = getPresetLevelCount();
        expect(getLevelDifficultyMultiplier(presetCount)).toBeGreaterThan(1);
    });

    it('reports looped status via debug info helper', () => {
        const presetCount = getPresetLevelCount();
        const loopedIndex = presetCount + 2;
        const info = getLevelDebugInfo(loopedIndex);
        const scaling = getLoopScalingInfo(1);

        expect(info.levelIndex).toBe(loopedIndex);
        expect(info.presetIndex).toBe(loopedIndex % presetCount);
        expect(info.isLooped).toBe(true);
        expect(info.loopCount).toBe(1);
        expect(info.difficultyMultiplier).toBeCloseTo(getLevelDifficultyMultiplier(loopedIndex));
        expect(info.spec).toEqual(getLevelSpec(loopedIndex));
        expect(info.scaling).toEqual({ ...scaling, loopCount: info.loopCount });
    });

    it('identifies looped levels based on preset count', () => {
        const presetCount = getPresetLevelCount();
        expect(isLoopedLevel(presetCount - 1)).toBe(false);
        expect(isLoopedLevel(presetCount)).toBe(true);
    });
});

describe('generateLevelLayout', () => {
    it('applies deterministic procedural variations based on seeded randomness', () => {
        const config = gameConfig;
        const baseSpec = remixLevel(getLevelSpec(2), 2);
        const randomSeed = 12345;

        const layoutA = generateLevelLayout(
            baseSpec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                random: mulberry32(randomSeed),
                fortifiedChance: 1,
                voidColumnChance: 1,
                centerFortifiedBias: 0.5,
            },
        );

        const layoutB = generateLevelLayout(
            baseSpec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                random: mulberry32(randomSeed),
                fortifiedChance: 1,
                voidColumnChance: 1,
                centerFortifiedBias: 0.5,
            },
        );

        expect(layoutB.bricks).toEqual(layoutA.bricks);
        const totalSlots = baseSpec.rows * baseSpec.cols;
        expect(layoutA.bricks.length).toBeLessThan(totalSlots);
        const fortifiedCount = layoutA.bricks.filter((brick) => brick.traits?.includes('fortified')).length;
        expect(fortifiedCount).toBeGreaterThan(0);
    });
});
