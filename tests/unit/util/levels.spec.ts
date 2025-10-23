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

describe('loop scaling info', () => {
    it('expands void column allowance on later loops', () => {
        const base = getLoopScalingInfo(0);
        const secondLoop = getLoopScalingInfo(2);

        expect(secondLoop.maxVoidColumns).toBeGreaterThan(base.maxVoidColumns);
    });

    it('caps void column allowance using fallback configuration', () => {
        const progressionLength = gameConfig.levels.loopProgression.length;
        const farLoopInfo = getLoopScalingInfo(progressionLength + 7);
        expect(farLoopInfo.maxVoidColumns).toBeLessThanOrEqual(gameConfig.levels.loopFallback.maxVoidColumnsCap);
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

    it('assigns gamble bricks within configured limits deterministically', () => {
        const config = gameConfig;
        const baseSpec = getLevelSpec(0);
        const chance = 1;
        const maxGamble = 2;
        const seed = 20251023;

        const layoutA = generateLevelLayout(
            baseSpec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                random: mulberry32(seed),
                gambleChance: chance,
                maxGambleBricks: maxGamble,
            },
        );

        const layoutB = generateLevelLayout(
            baseSpec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                random: mulberry32(seed),
                gambleChance: chance,
                maxGambleBricks: maxGamble,
            },
        );

        expect(layoutB.bricks).toEqual(layoutA.bricks);
        const gambleBricks = layoutA.bricks.filter((brick) => brick.traits?.includes('gamble'));
        expect(gambleBricks.length).toBeLessThanOrEqual(maxGamble);
        gambleBricks.forEach((brick) => {
            expect(brick.hp).toBe(1);
        });
    });

    it('respects the maxVoidColumns option when carving gaps', () => {
        const config = gameConfig;
        const baseSpec = getLevelSpec(0);
        const randomAlwaysVoid = () => 0;

        const layoutLimited = generateLevelLayout(
            baseSpec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                random: randomAlwaysVoid,
                voidColumnChance: 1,
                maxVoidColumns: 1,
            },
        );

        const layoutExpanded = generateLevelLayout(
            baseSpec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                random: randomAlwaysVoid,
                voidColumnChance: 1,
                maxVoidColumns: 3,
            },
        );

        const uniqueColumnCount = (layout: ReturnType<typeof generateLevelLayout>) =>
            new Set(layout.bricks.map((brick) => brick.col)).size;

        expect(uniqueColumnCount(layoutLimited)).toBe(baseSpec.cols - 1);
        expect(uniqueColumnCount(layoutExpanded)).toBe(baseSpec.cols - 3);
    });
});
