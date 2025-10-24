import { afterEach, describe, expect, it } from 'vitest';
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
    setLevelPresetOffset,
    getLevelPresetOffset,
    MAX_LEVEL_BRICK_HP,
} from 'util/levels';
import { mulberry32 } from 'util/random';

afterEach(() => {
    setLevelPresetOffset(0);
});

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

describe('level preset offset', () => {
    it('wraps rounded offsets within preset count', () => {
        const presetCount = getPresetLevelCount();
        const offset = presetCount * 2 + 1.7;

        setLevelPresetOffset(offset);

        const expected = ((Math.round(offset) % presetCount) + presetCount) % presetCount;
        expect(getLevelPresetOffset()).toBe(expected);
    });

    it('handles negative and non-finite offsets gracefully', () => {
        const presetCount = getPresetLevelCount();
        const negativeOffset = -presetCount - 2.4;

        setLevelPresetOffset(negativeOffset);

        const expectedNegative = ((Math.round(negativeOffset) % presetCount) + presetCount) % presetCount;
        expect(getLevelPresetOffset()).toBe(expectedNegative);

        setLevelPresetOffset(Number.POSITIVE_INFINITY);
        expect(getLevelPresetOffset()).toBe(0);

        setLevelPresetOffset(Number.NaN);
        expect(getLevelPresetOffset()).toBe(0);
    });

    it('shifts preset selection when applied', () => {
        const presetCount = getPresetLevelCount();
        const baselineSpec = getLevelSpec(0);
        const nextSpec = getLevelSpec(1);

        setLevelPresetOffset(1);
        const shiftedSpec = getLevelSpec(0);

        if (presetCount > 1) {
            expect(shiftedSpec).toBe(nextSpec);
        }
        expect(shiftedSpec).not.toBe(baselineSpec);
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
    it('returns empty layouts when bricks cannot be placed', () => {
        const specA = { rows: 2, cols: 3 } as const;

        const zeroWidthLayout = generateLevelLayout(specA, 0, 20, 200);
        expect(zeroWidthLayout.bricks).toHaveLength(0);

        const negativeFieldLayout = generateLevelLayout(specA, 30, 20, -10);
        expect(negativeFieldLayout.bricks).toHaveLength(0);

        const singleBrickTooWide = generateLevelLayout(specA, 100, 20, 40);
        expect(singleBrickTooWide.bricks).toHaveLength(0);

        const zeroColumnSpec = { rows: 3, cols: 0 } as const;
        const zeroColumnLayout = generateLevelLayout(zeroColumnSpec, 30, 20, 300);
        expect(zeroColumnLayout.bricks).toHaveLength(0);
    });

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

    it('omits bricks that would overflow a narrow playfield while keeping survivors centered', () => {
        const config = gameConfig;
        const baseSpec = getLevelSpec(0);
        const brickWidth = config.bricks.size.width;
        const brickHeight = config.bricks.size.height;
        const narrowFieldWidth = brickWidth * 3 + config.levels.minGap * 2 - 12;

        const layout = generateLevelLayout(baseSpec, brickWidth, brickHeight, narrowFieldWidth);

        expect(layout.bricks.length).toBeGreaterThan(0);

        const uniqueColumns = new Set(layout.bricks.map((brick) => brick.col));
        expect(uniqueColumns.size).toBeLessThan(baseSpec.cols);

        const halfWidth = brickWidth / 2;
        layout.bricks.forEach((brick) => {
            expect(brick.x - halfWidth).toBeGreaterThanOrEqual(0);
            expect(brick.x + halfWidth).toBeLessThanOrEqual(narrowFieldWidth);
        });

        const minColumn = Math.min(...uniqueColumns);
        const maxColumn = Math.max(...uniqueColumns);
        expect(maxColumn - minColumn + 1).toBe(uniqueColumns.size);

        [minColumn, maxColumn].forEach((edgeColumn) => {
            const edgeBricks = layout.bricks.filter((brick) => brick.col === edgeColumn);
            expect(edgeBricks.length).toBeGreaterThan(0);
            edgeBricks.forEach((brick) => {
                expect(brick.breakable).toBe(false);
                expect(brick.form).toBe('rectangle');
                expect(brick.traits?.includes('wall')).toBe(true);
                expect(brick.hp).toBeGreaterThan(1000);
            });
        });
    });

    it('allows decorators to change brick forms, traits, and breakable flags', () => {
        const config = gameConfig;
        const baseSpec = getLevelSpec(0);

        const layout = generateLevelLayout(
            baseSpec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                decorateBrick: ({ col }) => {
                    if (col % 3 === 0) {
                        return { form: 'diamond', breakable: true };
                    }
                    if (col % 3 === 1) {
                        return { form: 'circle', breakable: false, traits: ['wall'] };
                    }
                    return undefined;
                },
            },
        );

        expect(layout.bricks.some((brick) => brick.form === 'diamond')).toBe(true);
        expect(layout.bricks.some((brick) => brick.form === 'circle')).toBe(true);
        expect(layout.bricks.some((brick) => brick.traits?.includes('wall'))).toBe(true);
        expect(layout.breakableCount).toBeLessThan(layout.bricks.length);
    });

    it('normalizes decorated hit points and wall traits for extreme decorator outputs', () => {
        const config = gameConfig;
        const spec = { rows: 1, cols: 4, hpPerRow: () => 2 } as const;

        const layout = generateLevelLayout(
            spec,
            config.bricks.size.width,
            config.bricks.size.height,
            config.playfield.width,
            {
                random: () => 0.25,
                fortifiedChance: 0,
                gambleChance: 1,
                maxGambleBricks: 0,
                decorateBrick: ({ slotIndex }) => {
                    if (slotIndex === 0) {
                        return { hp: Number.NaN };
                    }
                    if (slotIndex === 1) {
                        return { hp: Number.POSITIVE_INFINITY };
                    }
                    if (slotIndex === 2) {
                        return { hp: Number.NEGATIVE_INFINITY };
                    }
                    if (slotIndex === 3) {
                        return { breakable: false, hp: 5 };
                    }
                    return undefined;
                },
            },
        );

        expect(layout.bricks).toHaveLength(4);

        const ordered = [...layout.bricks].sort((a, b) => a.col - b.col);
        const [first, second, third, fourth] = ordered;

        expect(first.hp).toBe(2);
        expect(first.breakable).toBe(true);

        expect(second.hp).toBe(MAX_LEVEL_BRICK_HP);
        expect(second.breakable).toBe(true);

        expect(third.hp).toBe(1);
        expect(third.breakable).toBe(true);

        expect(fourth.breakable).toBe(false);
        expect(fourth.hp).toBe(5);
        expect(fourth.form).toBe('rectangle');
        const fourthTraits = fourth.traits ?? [];
        expect(fourthTraits).toContain('wall');

        expect(layout.breakableCount).toBe(3);
        expect(layout.bricks.some((brick) => brick.traits?.includes('gamble'))).toBe(false);
    });
});
