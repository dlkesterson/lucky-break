/**
 * Level Progression System
 *
 * Adapted from Banana Music Game's level specs
 * Defines preset layouts with increasing difficulty
 */

import { gameConfig } from 'config/game';
import type { RandomSource } from 'util/random';

const config = gameConfig;
const DEFAULT_BRICK_WIDTH = config.bricks.size.width;
const DEFAULT_BRICK_HEIGHT = config.bricks.size.height;
const DEFAULT_FIELD_WIDTH = config.playfield.width;
const DEFAULT_GAP = config.levels.defaultGap;
const DEFAULT_START_Y = config.levels.defaultStartY;
const MIN_GAP = config.levels.minGap;
const MAX_VOID_COLUMNS = config.levels.maxVoidColumns;
const LOOP_PROGRESSIONS = config.levels.loopProgression;
const LOOP_FALLBACK = config.levels.loopFallback;
const GAMBLE_CONFIG = config.levels.gamble;

export interface LoopScalingInfo {
    readonly loopCount: number;
    readonly speedMultiplier: number;
    readonly brickHpMultiplier: number;
    readonly brickHpBonus: number;
    readonly powerUpChanceMultiplier: number;
    readonly gapScale: number;
    readonly fortifiedChance: number;
    readonly voidColumnChance: number;
    readonly centerFortifiedBias: number;
    readonly maxVoidColumns: number;
}

export interface LevelGenerationOptions {
    readonly random?: RandomSource;
    readonly fortifiedChance?: number;
    readonly voidColumnChance?: number;
    readonly maxVoidColumns?: number;
    readonly centerFortifiedBias?: number;
    readonly gambleChance?: number;
    readonly maxGambleBricks?: number;
}

export interface LevelSpec {
    /** Number of brick rows */
    readonly rows: number;
    /** Number of brick columns */
    readonly cols: number;
    /** Function to calculate HP per row (optional, defaults to 1) */
    readonly hpPerRow?: (row: number) => number;
    /** Starting Y position for brick field */
    readonly startY?: number;
    /** Gap between bricks */
    readonly gap?: number;
    /** Power-up spawn chance multiplier (1.0 = normal) */
    readonly powerUpChanceMultiplier?: number;
}

export interface LevelLayout {
    /** Brick positions and properties */
    readonly bricks: readonly BrickSpec[];
    /** Total breakable bricks count */
    readonly breakableCount: number;
    /** Level specification used */
    readonly spec: LevelSpec;
}

export type BrickTrait = 'fortified' | 'gamble';

export interface BrickSpec {
    /** Grid row index */
    readonly row: number;
    /** Grid column index */
    readonly col: number;
    /** World X position */
    readonly x: number;
    /** World Y position */
    readonly y: number;
    /** Hit points (how many hits to break) */
    readonly hp: number;
    /** Optional brick traits applied during procedural remix */
    readonly traits?: readonly BrickTrait[];
}

/** Default level presets with progressive difficulty */
const LEVEL_PRESETS: readonly LevelSpec[] = [
    // Level 1: Simple 3x6 grid, all 1 HP
    {
        rows: 3,
        cols: 6,
        hpPerRow: () => 1,
        startY: 100,
        gap: 20,
    },
    // Level 2: 4x6 grid, bottom 2 rows have 2 HP
    {
        rows: 4,
        cols: 6,
        hpPerRow: (row) => (row >= 2 ? 2 : 1),
        startY: 100,
        gap: 20,
    },
    // Level 3: 5x7 grid, HP increases with row
    {
        rows: 5,
        cols: 7,
        hpPerRow: (row) => 1 + Math.floor(row / 2),
        startY: 80,
        gap: 18,
        powerUpChanceMultiplier: 1.2,
    },
    // Level 4: 6x8 grid, more variety
    {
        rows: 6,
        cols: 8,
        hpPerRow: (row) => 1 + Math.floor(row / 2),
        startY: 80,
        gap: 16,
        powerUpChanceMultiplier: 1.3,
    },
    // Level 5: Dense 7x9 grid
    {
        rows: 7,
        cols: 9,
        hpPerRow: (row) => Math.max(1, Math.floor(row / 1.5)),
        startY: 60,
        gap: 14,
        powerUpChanceMultiplier: 1.5,
    },
];

/**
 * Get level spec for given index (wraps around after running out of presets)
 *
 * @param levelIndex - Zero-based level index
 * @returns Level specification
 */
export function getLevelSpec(levelIndex: number): LevelSpec {
    const index = Math.max(0, levelIndex);
    return LEVEL_PRESETS[index % LEVEL_PRESETS.length];
}

/**
 * Generate brick layout from level spec
 *
 * @param spec - Level specification
 * @param brickWidth - Width of each brick (default: 100)
 * @param brickHeight - Height of each brick (default: 40)
 * @param fieldWidth - Width of play field (default: 1280)
 * @returns Generated level layout
 */
export function generateLevelLayout(
    spec: LevelSpec,
    brickWidth: number = DEFAULT_BRICK_WIDTH,
    brickHeight: number = DEFAULT_BRICK_HEIGHT,
    fieldWidth: number = DEFAULT_FIELD_WIDTH,
    options: LevelGenerationOptions = {},
): LevelLayout {
    const {
        random,
        fortifiedChance = 0,
        voidColumnChance = 0,
        maxVoidColumns = MAX_VOID_COLUMNS,
        centerFortifiedBias = 0,
        gambleChance = 0,
        maxGambleBricks = Number.POSITIVE_INFINITY,
    } = options;

    const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

    const gapBase = spec.gap ?? DEFAULT_GAP;
    const gap = Math.max(MIN_GAP, gapBase);
    const startY = spec.startY ?? DEFAULT_START_Y;

    // Calculate centering offset
    const totalWidth = spec.cols * brickWidth + (spec.cols - 1) * gap;
    const startX = (fieldWidth - totalWidth) / 2 + brickWidth / 2;

    const bricks: BrickSpec[] = [];
    const voidColumns = new Set<number>();
    const gambleAssignments = new Map<number, number>();
    const normalizedGambleChance = Math.max(0, Math.min(1, gambleChance));
    const gambleLimit = Math.max(0, Math.floor(maxGambleBricks));
    let gambleCount = 0;

    if (random && voidColumnChance > 0 && spec.cols > 1) {
        const limit = Math.min(spec.cols - 1, Math.max(0, Math.floor(maxVoidColumns)));
        if (limit > 0) {
            const chance = clampUnit(voidColumnChance);
            for (let col = 0; col < spec.cols; col++) {
                if (voidColumns.size >= limit) {
                    break;
                }
                if (random() < chance) {
                    voidColumns.add(col);
                }
            }
            if (voidColumns.size >= spec.cols) {
                // Always leave at least one column intact
                const [first] = voidColumns;
                if (first !== undefined) {
                    voidColumns.delete(first);
                }
            }
        }
    }

    const fortifiedBaseChance = clampUnit(fortifiedChance);
    const biasFactor = Math.max(0, centerFortifiedBias);
    const midColumn = (spec.cols - 1) / 2;

    for (let row = 0; row < spec.rows; row++) {
        const hp = spec.hpPerRow ? spec.hpPerRow(row) : 1;

        for (let col = 0; col < spec.cols; col++) {
            if (voidColumns.has(col)) {
                continue;
            }

            const x = startX + col * (brickWidth + gap);
            const y = startY + row * (brickHeight + gap);

            let brickHp = hp;
            const traits: BrickTrait[] = [];

            if (random && fortifiedBaseChance > 0) {
                const normalizedDistance = spec.cols <= 1 ? 0 : Math.abs(col - midColumn) / Math.max(1, midColumn);
                const biasBonus = biasFactor * (1 - normalizedDistance);
                const fortifiedChanceAdjusted = clampUnit(fortifiedBaseChance * (1 + biasBonus));
                if (random() < fortifiedChanceAdjusted) {
                    const fortifiedStep = Math.max(1, Math.round(Math.max(0, hp) * 0.35));
                    brickHp += fortifiedStep;
                    traits.push('fortified');
                }
            }

            const canAssignGamble =
                random !== undefined &&
                normalizedGambleChance > 0 &&
                gambleCount < gambleLimit &&
                !traits.includes('fortified');

            if (canAssignGamble) {
                const perRowAssigned = gambleAssignments.get(row) ?? 0;
                if (perRowAssigned < 1 && random() < normalizedGambleChance) {
                    traits.push('gamble');
                    gambleAssignments.set(row, perRowAssigned + 1);
                    gambleCount += 1;
                    brickHp = Math.max(1, Math.round(GAMBLE_CONFIG.primeResetHp));
                }
            }

            bricks.push({
                row,
                col,
                x,
                y,
                hp: Math.max(1, Math.round(brickHp)),
                traits: traits.length > 0 ? traits : undefined,
            });
        }
    }

    return {
        bricks,
        breakableCount: bricks.length,
        spec,
    };
}

/**
 * Get total number of preset levels
 *
 * @returns Number of preset levels
 */
export function getPresetLevelCount(): number {
    return LEVEL_PRESETS.length;
}

/**
 * Check if level index is beyond presets (will loop)
 *
 * @param levelIndex - Zero-based level index
 * @returns True if beyond original presets
 */
export function isLoopedLevel(levelIndex: number): boolean {
    return levelIndex >= LEVEL_PRESETS.length;
}

/**
 * Calculate difficulty multiplier for level
 * Increases for looped levels to maintain challenge
 *
 * @param levelIndex - Zero-based level index
 * @returns Difficulty multiplier (1.0 = normal)
 */
export function getLevelDifficultyMultiplier(levelIndex: number): number {
    const loopCount = Math.floor(levelIndex / LEVEL_PRESETS.length);
    const scaling = getLoopScalingInfo(loopCount);
    return scaling.speedMultiplier;
}

const clampHp = (value: number): number => Math.max(1, Math.round(value));

const computeRowJitter = (row: number, loopCount: number): number => {
    const sequence = (loopCount * 17 + row * 13) % 3;
    return sequence - 1; // -1, 0, 1
};

export function remixLevel(spec: LevelSpec, loopCount: number): LevelSpec {
    if (loopCount <= 0) {
        return spec;
    }

    const scaling = getLoopScalingInfo(loopCount);
    const hpPerRowValues = Array.from({ length: spec.rows }, (_unused, row) => {
        const baseHp = spec.hpPerRow ? spec.hpPerRow(row) : 1;
        const jitter = computeRowJitter(row, loopCount);
        const scaledBase = baseHp * scaling.brickHpMultiplier + scaling.brickHpBonus;
        const remixed = clampHp(scaledBase + jitter);
        return remixed;
    });

    const powerUpMultiplierBase = spec.powerUpChanceMultiplier ?? 1;
    const remixedPowerUpMultiplier = Number((powerUpMultiplierBase * scaling.powerUpChanceMultiplier).toFixed(3));

    const baseGap = spec.gap ?? DEFAULT_GAP;
    const scaledGap = Math.max(MIN_GAP, Number((baseGap * scaling.gapScale).toFixed(2)));

    return {
        ...spec,
        gap: scaledGap,
        powerUpChanceMultiplier: Math.max(0.05, remixedPowerUpMultiplier),
        hpPerRow: (row: number) => {
            const index = Math.max(0, Math.min(hpPerRowValues.length - 1, row));
            return hpPerRowValues[index];
        },
    };
}

const BASE_SCALING: LoopScalingInfo = {
    loopCount: 0,
    speedMultiplier: 1,
    brickHpMultiplier: 1,
    brickHpBonus: 0,
    powerUpChanceMultiplier: 1,
    gapScale: 1,
    fortifiedChance: 0,
    voidColumnChance: 0,
    centerFortifiedBias: 0,
    maxVoidColumns: MAX_VOID_COLUMNS,
};

const createBaselineStep = (): LoopScalingInfo => ({ ...BASE_SCALING });

const clampValue = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

const clampVoidColumnLimit = (value: number, maxCap: number): number => {
    if (!Number.isFinite(value)) {
        return MAX_VOID_COLUMNS;
    }
    const safeCap = Math.max(0, Math.floor(maxCap));
    const rounded = Math.max(0, Math.floor(value));
    return Math.min(rounded, safeCap);
};

export function getLoopScalingInfo(loopCount: number): LoopScalingInfo {
    if (loopCount <= 0) {
        return BASE_SCALING;
    }

    const resolvedLoop = Math.floor(loopCount);
    const definedIndex = resolvedLoop - 1;

    if (definedIndex >= 0 && definedIndex < LOOP_PROGRESSIONS.length) {
        const descriptor = LOOP_PROGRESSIONS[definedIndex];
        return {
            loopCount: resolvedLoop,
            speedMultiplier: descriptor.speedMultiplier,
            brickHpMultiplier: descriptor.brickHpMultiplier,
            brickHpBonus: descriptor.brickHpBonus,
            powerUpChanceMultiplier: descriptor.powerUpChanceMultiplier,
            gapScale: descriptor.gapScale,
            fortifiedChance: descriptor.fortifiedChance,
            voidColumnChance: descriptor.voidColumnChance,
            centerFortifiedBias: descriptor.centerFortifiedBias,
            maxVoidColumns: clampVoidColumnLimit(
                descriptor.maxVoidColumns ?? MAX_VOID_COLUMNS,
                LOOP_FALLBACK.maxVoidColumnsCap,
            ),
        } satisfies LoopScalingInfo;
    }

    const initialDescriptor = (() => {
        const lastDefined = LOOP_PROGRESSIONS[LOOP_PROGRESSIONS.length - 1];
        if (!lastDefined) {
            return createBaselineStep();
        }
        return {
            loopCount: resolvedLoop,
            speedMultiplier: lastDefined.speedMultiplier,
            brickHpMultiplier: lastDefined.brickHpMultiplier,
            brickHpBonus: lastDefined.brickHpBonus,
            powerUpChanceMultiplier: lastDefined.powerUpChanceMultiplier,
            gapScale: lastDefined.gapScale,
            fortifiedChance: lastDefined.fortifiedChance,
            voidColumnChance: lastDefined.voidColumnChance,
            centerFortifiedBias: lastDefined.centerFortifiedBias,
            maxVoidColumns: clampVoidColumnLimit(
                lastDefined.maxVoidColumns ?? MAX_VOID_COLUMNS,
                LOOP_FALLBACK.maxVoidColumnsCap,
            ),
        } satisfies LoopScalingInfo;
    })();

    const extraLoops = Math.max(0, resolvedLoop - LOOP_PROGRESSIONS.length);
    const fallback = LOOP_FALLBACK;

    let speed = initialDescriptor.speedMultiplier;
    let brickHpMultiplier = initialDescriptor.brickHpMultiplier;
    let brickHpBonus = initialDescriptor.brickHpBonus;
    let powerUpChance = initialDescriptor.powerUpChanceMultiplier;
    let gapScale = initialDescriptor.gapScale;
    let fortifiedChance = initialDescriptor.fortifiedChance;
    let voidColumnChance = initialDescriptor.voidColumnChance;
    let centerBias = initialDescriptor.centerFortifiedBias;
    let maxVoidColumns = initialDescriptor.maxVoidColumns;

    for (let index = 0; index < extraLoops; index++) {
        speed = clampValue(speed + fallback.speedMultiplierIncrement, 1, fallback.maxSpeedMultiplier);
        brickHpMultiplier += fallback.brickHpMultiplierIncrement;
        brickHpBonus += fallback.brickHpBonusIncrement;
        powerUpChance = clampValue(powerUpChance + fallback.powerUpChanceMultiplierStep, fallback.minPowerUpChanceMultiplier, 2);
        gapScale = clampValue(gapScale + fallback.gapScaleStep, fallback.minGapScale, 2);
        fortifiedChance = clampValue(fortifiedChance + fallback.fortifiedChanceIncrement, 0, fallback.maxFortifiedChance);
        voidColumnChance = clampValue(voidColumnChance + fallback.voidColumnChanceIncrement, 0, fallback.maxVoidColumnChance);
        centerBias = clampValue(centerBias + fallback.centerFortifiedBiasIncrement, 0, fallback.maxCenterFortifiedBias);
        maxVoidColumns = clampVoidColumnLimit(maxVoidColumns + fallback.maxVoidColumnsIncrement, fallback.maxVoidColumnsCap);
    }

    return {
        loopCount: resolvedLoop,
        speedMultiplier: speed,
        brickHpMultiplier,
        brickHpBonus,
        powerUpChanceMultiplier: powerUpChance,
        gapScale,
        fortifiedChance,
        voidColumnChance,
        centerFortifiedBias: centerBias,
        maxVoidColumns,
    } satisfies LoopScalingInfo;
}

/**
 * Get debug info for level
 *
 * @param levelIndex - Zero-based level index
 * @returns Level debug information
 */
export function getLevelDebugInfo(levelIndex: number): {
    levelIndex: number;
    presetIndex: number;
    isLooped: boolean;
    loopCount: number;
    difficultyMultiplier: number;
    spec: LevelSpec;
    scaling: LoopScalingInfo;
} {
    const presetIndex = levelIndex % LEVEL_PRESETS.length;
    const loopCount = Math.floor(levelIndex / LEVEL_PRESETS.length);
    const scaling = getLoopScalingInfo(loopCount);

    return {
        levelIndex,
        presetIndex,
        isLooped: isLoopedLevel(levelIndex),
        loopCount,
        difficultyMultiplier: scaling.speedMultiplier,
        spec: getLevelSpec(levelIndex),
        scaling,
    };
}
