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
const WALL_BRICK_HP = 9999;
export const MAX_LEVEL_BRICK_HP = 2;

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
    readonly decorateBrick?: (context: BrickDecorationContext) => BrickDecorationResult | void;
}

export interface LevelTransformPlan {
    readonly directives: readonly LayoutTransformDirective[];
    readonly applyPhaseIndex?: number;
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
    /** Optional metadata describing how the layout was derived */
    readonly metadata?: LevelLayoutMetadata;
}

export interface LevelLayoutMetadata {
    readonly phase: string;
    readonly index: number;
    readonly total: number;
}

export type BrickTrait = 'fortified' | 'gamble' | 'wall';

export type BrickForm = 'rectangle' | 'diamond' | 'circle';

export interface BrickDecorationContext {
    readonly row: number;
    readonly col: number;
    readonly slotIndex: number;
    readonly slotCount: number;
    readonly spec: LevelSpec;
    readonly traits: readonly BrickTrait[];
    readonly random?: RandomSource;
}

export interface BrickDecorationResult {
    readonly form?: BrickForm;
    readonly traits?: readonly BrickTrait[];
    readonly breakable?: boolean;
    readonly isSensor?: boolean;
    readonly hp?: number;
}

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
    /** Visual and physics form */
    readonly form?: BrickForm;
    /** Whether this brick counts toward level completion */
    readonly breakable?: boolean;
    /** Whether the physics body should behave as a sensor */
    readonly isSensor?: boolean;
}

type MutableBrickSpec = {
    -readonly [Key in keyof BrickSpec]: BrickSpec[Key];
};

let levelPresetOffset = 0;

export const setLevelPresetOffset = (offset: number): void => {
    const presetCount = LEVEL_PRESETS.length;
    if (presetCount <= 0) {
        levelPresetOffset = 0;
        return;
    }
    if (!Number.isFinite(offset)) {
        levelPresetOffset = 0;
        return;
    }
    const rounded = Math.round(offset);
    const modulo = ((rounded % presetCount) + presetCount) % presetCount;
    levelPresetOffset = modulo;
};

export const getLevelPresetOffset = (): number => levelPresetOffset;

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
    const presetCount = LEVEL_PRESETS.length;
    if (presetCount === 0) {
        throw new Error('No level presets defined.');
    }
    const normalizedIndex = index % presetCount;
    const effectiveIndex = (normalizedIndex + levelPresetOffset) % presetCount;
    return LEVEL_PRESETS[effectiveIndex];
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
        decorateBrick,
    } = options;

    const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

    const pickFromList = (list: number[], rng: RandomSource | undefined): number | null => {
        if (list.length === 0) {
            return null;
        }
        const index = rng ? Math.floor(rng() * list.length) : Math.floor(list.length / 2);
        const safeIndex = Math.max(0, Math.min(list.length - 1, index));
        const [value] = list.splice(safeIndex, 1);
        return value ?? null;
    };

    const removeValue = (list: number[], value: number): void => {
        const index = list.indexOf(value);
        if (index >= 0) {
            list.splice(index, 1);
        }
    };

    // Distribute non-breakable wall columns away from the edges to keep layouts open.
    // Wide desktop layouts still anchor edge walls even when every column fits on screen.
    const planWallSlots = (slotCount: number, trimmed: boolean, rng: RandomSource | undefined): Set<number> => {
        if (slotCount <= 0) {
            return new Set<number>();
        }

        if (!trimmed && slotCount < 6) {
            return new Set<number>();
        }

        const interiorSlots = Array.from({ length: Math.max(slotCount - 2, 0) }, (_unused, index) => index + 1);
        const edgeSlots = slotCount === 1 ? [0] : slotCount === 2 ? [0, 1] : [0, slotCount - 1];
        const availableInterior = [...interiorSlots];
        const availableEdges = [...edgeSlots];
        const planned = new Set<number>();

        const pruneAdjacent = (slot: number) => {
            removeValue(availableInterior, slot);
            removeValue(availableEdges, slot);
            removeValue(availableInterior, slot - 1);
            removeValue(availableInterior, slot + 1);
            removeValue(availableEdges, slot - 1);
            removeValue(availableEdges, slot + 1);
        };

        const markSlot = (slot: number | null | undefined) => {
            if (slot === null || slot === undefined) {
                return;
            }
            const normalized = Math.max(0, Math.min(slotCount - 1, slot));
            planned.add(normalized);
            pruneAdjacent(normalized);
        };

        edgeSlots.forEach(markSlot);

        const allowInteriorWalls = slotCount >= 5;
        const interiorBudget = allowInteriorWalls ? Math.max(1, Math.floor(slotCount / 3)) : 0;
        const trimmedCap = slotCount >= 9 ? 3 : 2;
        const baselineCap = Math.max(1, Math.floor(slotCount / 5));
        let remaining = Math.min(interiorBudget, trimmed ? trimmedCap : baselineCap);

        while (remaining > 0) {
            const edgeChance = rng ? rng() : 0;
            const useEdgePool = availableEdges.length > 0 && (availableInterior.length === 0 || edgeChance < 0.18);
            const source = useEdgePool ? availableEdges : availableInterior;
            if (source.length === 0) {
                break;
            }
            const slot = pickFromList(source, rng);
            if (slot === null) {
                break;
            }
            markSlot(slot);
            remaining -= 1;
        }

        return planned;
    };

    if (fieldWidth <= 0 || brickWidth <= 0) {
        return { bricks: [], breakableCount: 0, spec };
    }

    const gapBase = spec.gap ?? DEFAULT_GAP;
    const desiredGap = Math.max(MIN_GAP, gapBase);
    const startY = spec.startY ?? DEFAULT_START_Y;

    const widthForColumns = (columnCount: number, gapSize: number): number => {
        if (columnCount <= 0) {
            return 0;
        }
        if (columnCount === 1) {
            return brickWidth;
        }
        return columnCount * brickWidth + (columnCount - 1) * gapSize;
    };

    const computeGapFor = (columnCount: number): number => {
        if (columnCount <= 1) {
            return 0;
        }
        const maxGapToFit = (fieldWidth - columnCount * brickWidth) / (columnCount - 1);
        if (!Number.isFinite(maxGapToFit)) {
            return desiredGap;
        }
        const cappedGap = Math.min(desiredGap, maxGapToFit);
        if (!Number.isFinite(cappedGap)) {
            return desiredGap;
        }
        return Math.max(MIN_GAP, cappedGap);
    };

    if (widthForColumns(1, 0) > fieldWidth) {
        return { bricks: [], breakableCount: 0, spec };
    }

    const requestedColumns = Math.max(0, Math.floor(spec.cols));
    let columnsToPlace = requestedColumns;
    if (columnsToPlace <= 0) {
        return { bricks: [], breakableCount: 0, spec };
    }

    let gap = computeGapFor(columnsToPlace);
    let totalWidth = widthForColumns(columnsToPlace, gap);
    const widthTolerance = 0.5;

    while (columnsToPlace > 1 && totalWidth - fieldWidth > widthTolerance) {
        columnsToPlace -= 1;
        gap = computeGapFor(columnsToPlace);
        totalWidth = widthForColumns(columnsToPlace, gap);
    }

    if (columnsToPlace === 0) {
        return { bricks: [], breakableCount: 0, spec };
    }

    // Final pass: if a single column still overflows, bail out.
    if (columnsToPlace === 1 && totalWidth - fieldWidth > widthTolerance) {
        return { bricks: [], breakableCount: 0, spec };
    }

    const trimmedForWidth = columnsToPlace < requestedColumns;

    const remainingColumns = Math.max(0, requestedColumns - columnsToPlace);
    let firstColumnIndex = Math.floor(remainingColumns / 2);
    const maxFirstColumn = Math.max(0, requestedColumns - columnsToPlace);
    if (firstColumnIndex > maxFirstColumn) {
        firstColumnIndex = maxFirstColumn;
    }

    const visibleColumns = Array.from({ length: columnsToPlace }, (_unused, index) => index + firstColumnIndex);
    const startX = (fieldWidth - totalWidth) / 2 + brickWidth / 2;

    const bricks: BrickSpec[] = [];
    const voidColumns = new Set<number>();
    const gambleAssignments = new Map<number, number>();
    const normalizedGambleChance = Math.max(0, Math.min(1, gambleChance));
    const gambleLimit = Math.max(0, Math.floor(maxGambleBricks));
    let gambleCount = 0;

    const slotCount = visibleColumns.length;
    const plannedWallSlots = planWallSlots(slotCount, trimmedForWidth, random);

    if (random && voidColumnChance > 0 && slotCount > 1) {
        const limit = Math.min(slotCount - 1, Math.max(0, Math.floor(maxVoidColumns)));
        if (limit > 0) {
            const chance = clampUnit(voidColumnChance);
            for (let index = 0; index < slotCount; index++) {
                if (voidColumns.size >= limit) {
                    break;
                }
                const originalColumn = visibleColumns[index];
                if (originalColumn === undefined) {
                    continue;
                }
                if (random() < chance) {
                    voidColumns.add(originalColumn);
                }
            }
            if (voidColumns.size >= slotCount) {
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
    const midSlot = (slotCount - 1) / 2;

    for (let row = 0; row < spec.rows; row++) {
        const hp = spec.hpPerRow ? spec.hpPerRow(row) : 1;

        for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
            const originalColumn = visibleColumns[slotIndex];
            if (originalColumn === undefined || voidColumns.has(originalColumn)) {
                continue;
            }

            const x = startX + slotIndex * (brickWidth + gap);
            const y = startY + row * (brickHeight + gap);

            let brickHp = hp;
            const baseTraits: BrickTrait[] = [];

            if (random && fortifiedBaseChance > 0) {
                const normalizedDistance = slotCount <= 1 ? 0 : Math.abs(slotIndex - midSlot) / Math.max(1, midSlot);
                const biasBonus = biasFactor * (1 - normalizedDistance);
                const fortifiedChanceAdjusted = clampUnit(fortifiedBaseChance * (1 + biasBonus));
                if (random() < fortifiedChanceAdjusted) {
                    const fortifiedStep = Math.max(1, Math.round(Math.max(0, hp) * 0.35));
                    brickHp += fortifiedStep;
                    baseTraits.push('fortified');
                }
            }

            const canAssignGamble =
                random !== undefined &&
                normalizedGambleChance > 0 &&
                gambleCount < gambleLimit &&
                !baseTraits.includes('fortified');

            if (canAssignGamble) {
                const perRowAssigned = gambleAssignments.get(row) ?? 0;
                if (perRowAssigned < 1 && random() < normalizedGambleChance) {
                    baseTraits.push('gamble');
                    gambleAssignments.set(row, perRowAssigned + 1);
                    gambleCount += 1;
                    brickHp = Math.max(1, Math.round(GAMBLE_CONFIG.primeResetHp));
                }
            }

            if (baseTraits.includes('gamble')) {
                plannedWallSlots.delete(slotIndex);
            }

            const decoration = decorateBrick?.({
                row,
                col: originalColumn,
                slotIndex,
                slotCount,
                spec,
                traits: Object.freeze([...baseTraits]),
                random,
            }) ?? {};

            const mergedTraits = [...baseTraits];
            if (decoration.traits && decoration.traits.length > 0) {
                decoration.traits.forEach((trait) => {
                    if (!mergedTraits.includes(trait)) {
                        mergedTraits.push(trait);
                    }
                });
            }

            const decoratedHp = decoration.hp;
            let finalHp: number;
            if (decoratedHp === undefined || Number.isNaN(decoratedHp)) {
                finalHp = Math.max(1, Math.round(brickHp));
            } else if (!Number.isFinite(decoratedHp)) {
                finalHp = decoratedHp > 0 ? decoratedHp : 1;
            } else {
                finalHp = Math.max(1, Math.round(decoratedHp));
            }

            let finalForm = decoration.form ?? 'rectangle';
            let finalBreakable = decoration.breakable ?? true;
            const finalSensor = decoration.isSensor ?? false;

            if (decoration.breakable === undefined && plannedWallSlots.has(slotIndex)) {
                finalBreakable = false;
            }

            if (!finalBreakable) {
                finalForm = decoration.form === 'circle' || finalForm === 'circle' ? 'circle' : 'rectangle';
            }

            if (!finalBreakable && !mergedTraits.includes('wall')) {
                mergedTraits.push('wall');
            }

            if (!finalBreakable && decoratedHp === undefined) {
                finalHp = WALL_BRICK_HP;
            }

            if (finalBreakable) {
                finalHp = Math.min(MAX_LEVEL_BRICK_HP, finalHp);
            }

            const resolvedTraits = mergedTraits.length > 0 ? mergedTraits : undefined;

            bricks.push({
                row,
                col: originalColumn,
                x,
                y,
                hp: finalHp,
                traits: resolvedTraits,
                form: finalForm,
                breakable: finalBreakable,
                isSensor: finalSensor,
            });
        }
    }

    const breakableCount = bricks.reduce((count, brick) => (brick.breakable === false ? count : count + 1), 0);

    return {
        bricks,
        breakableCount,
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
    fortifiedChance: 0.1,
    voidColumnChance: 0.06,
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

export type LayoutTransformDirective =
    | {
        readonly type: 'shiftRows';
        readonly rows?: 'all' | readonly number[];
        readonly steps: number;
        readonly label?: string;
    }
    | {
        readonly type: 'shiftColumns';
        readonly columns?: 'all' | readonly number[];
        readonly steps: number;
        readonly label?: string;
    }
    | {
        readonly type: 'swapBands';
        readonly first: { readonly start: number; readonly end: number };
        readonly second: { readonly start: number; readonly end: number };
        readonly label?: string;
    }
    | {
        readonly type: 'applyPattern';
        readonly pattern: 'checker' | 'hollow';
        readonly invert?: boolean;
        readonly label?: string;
    };

export interface TransformingLayoutOptions extends LevelGenerationOptions {
    readonly brickWidth?: number;
    readonly brickHeight?: number;
    readonly fieldWidth?: number;
}

export interface TransformingLayoutPhase extends LevelLayout {
    readonly metadata: LevelLayoutMetadata;
}

const rotateArray = <T>(values: readonly T[], steps: number): T[] => {
    const length = values.length;
    if (length === 0) {
        return [];
    }
    const normalized = ((Math.trunc(steps) % length) + length) % length;
    if (normalized === 0) {
        return [...values];
    }
    return [...values.slice(-normalized), ...values.slice(0, length - normalized)];
};

const cloneBrick = (brick: BrickSpec): MutableBrickSpec => ({
    row: brick.row,
    col: brick.col,
    x: brick.x,
    y: brick.y,
    hp: brick.hp,
    traits: brick.traits ? [...brick.traits] : undefined,
    form: brick.form,
    breakable: brick.breakable,
    isSensor: brick.isSensor,
});

const computeBreakableCount = (bricks: readonly BrickSpec[]): number =>
    bricks.reduce((count, brick) => (brick.breakable === false ? count : count + 1), 0);

const uniqueSorted = (values: Iterable<number>): number[] => {
    const unique = new Set<number>();
    for (const value of values) {
        unique.add(Math.floor(value));
    }
    return [...unique].sort((a, b) => a - b);
};

const resolveRows = (layout: LevelLayout, rows: 'all' | readonly number[] | undefined): number[] => {
    if (!rows || rows === 'all') {
        return uniqueSorted(layout.bricks.filter((brick) => brick.breakable !== false).map((brick) => brick.row));
    }
    return uniqueSorted(rows);
};

const resolveColumns = (layout: LevelLayout, columns: 'all' | readonly number[] | undefined): number[] => {
    if (!columns || columns === 'all') {
        return uniqueSorted(layout.bricks.filter((brick) => brick.breakable !== false).map((brick) => brick.col));
    }
    return uniqueSorted(columns);
};

const applyShiftRows = (
    layout: LevelLayout,
    steps: number,
    rows: 'all' | readonly number[] | undefined,
): MutableBrickSpec[] => {
    const normalizedSteps = Math.trunc(steps);
    if (!Number.isFinite(normalizedSteps) || normalizedSteps === 0) {
        return layout.bricks.map(cloneBrick);
    }

    const targetRows = resolveRows(layout, rows);
    if (targetRows.length === 0) {
        return layout.bricks.map(cloneBrick);
    }

    const clones: MutableBrickSpec[] = layout.bricks.map(cloneBrick);
    const rowToIndices = new Map<number, number[]>();
    clones.forEach((brick, index) => {
        if (brick.breakable === false) {
            return;
        }
        if (!rowToIndices.has(brick.row)) {
            rowToIndices.set(brick.row, []);
        }
        rowToIndices.get(brick.row)?.push(index);
    });

    for (const row of targetRows) {
        const indices = rowToIndices.get(row);
        if (!indices || indices.length <= 1) {
            continue;
        }

        const sorted = [...indices].sort((a, b) => clones[a].x - clones[b].x);
        const columns = sorted.map((index) => clones[index].col);
        const positions = sorted.map((index) => clones[index].x);
        const rotatedColumns = rotateArray(columns, normalizedSteps);
        const rotatedPositions = rotateArray(positions, normalizedSteps);

        sorted.forEach((brickIndex, positionIndex) => {
            const brick = clones[brickIndex];
            brick.col = rotatedColumns[positionIndex] ?? brick.col;
            brick.x = rotatedPositions[positionIndex] ?? brick.x;
        });
    }

    return clones;
};

const applyShiftColumns = (
    layout: LevelLayout,
    steps: number,
    columns: 'all' | readonly number[] | undefined,
): MutableBrickSpec[] => {
    const normalizedSteps = Math.trunc(steps);
    if (!Number.isFinite(normalizedSteps) || normalizedSteps === 0) {
        return layout.bricks.map(cloneBrick);
    }

    const targetColumns = resolveColumns(layout, columns);
    if (targetColumns.length === 0) {
        return layout.bricks.map(cloneBrick);
    }

    const clones: MutableBrickSpec[] = layout.bricks.map(cloneBrick);
    const columnToIndices = new Map<number, number[]>();
    clones.forEach((brick, index) => {
        if (brick.breakable === false) {
            return;
        }
        if (!columnToIndices.has(brick.col)) {
            columnToIndices.set(brick.col, []);
        }
        columnToIndices.get(brick.col)?.push(index);
    });

    for (const column of targetColumns) {
        const indices = columnToIndices.get(column);
        if (!indices || indices.length <= 1) {
            continue;
        }

        const sorted = [...indices].sort((a, b) => clones[a].y - clones[b].y);
        const rows = sorted.map((index) => clones[index].row);
        const positions = sorted.map((index) => clones[index].y);
        const rotatedRows = rotateArray(rows, normalizedSteps);
        const rotatedPositions = rotateArray(positions, normalizedSteps);

        sorted.forEach((brickIndex, positionIndex) => {
            const brick = clones[brickIndex];
            brick.row = rotatedRows[positionIndex] ?? brick.row;
            brick.y = rotatedPositions[positionIndex] ?? brick.y;
        });
    }

    return clones;
};

const withinRange = (value: number, bounds: { readonly start: number; readonly end: number }): boolean => {
    const min = Math.min(bounds.start, bounds.end);
    const max = Math.max(bounds.start, bounds.end);
    return value >= min && value <= max;
};

const applySwapBands = (
    layout: LevelLayout,
    first: { readonly start: number; readonly end: number },
    second: { readonly start: number; readonly end: number },
): MutableBrickSpec[] => {
    const clones: MutableBrickSpec[] = layout.bricks.map(cloneBrick);
    const firstRows = uniqueSorted(
        clones.filter((brick) => withinRange(brick.row, first)).map((brick) => brick.row),
    );
    const secondRows = uniqueSorted(
        clones.filter((brick) => withinRange(brick.row, second)).map((brick) => brick.row),
    );

    if (firstRows.length === 0 || secondRows.length === 0) {
        return clones;
    }

    const rowPositions = new Map<number, number>();
    clones.forEach((brick) => {
        if (!rowPositions.has(brick.row)) {
            rowPositions.set(brick.row, brick.y);
        }
    });

    const mapping = new Map<number, number>();
    const pairCount = Math.min(firstRows.length, secondRows.length);
    for (let index = 0; index < pairCount; index++) {
        const firstRow = firstRows[index];
        const secondRow = secondRows[index];
        mapping.set(firstRow, secondRow);
        mapping.set(secondRow, firstRow);
    }

    clones.forEach((brick) => {
        const targetRow = mapping.get(brick.row);
        if (targetRow === undefined) {
            return;
        }
        const targetY = rowPositions.get(targetRow);
        brick.row = targetRow;
        if (targetY !== undefined) {
            brick.y = targetY;
        }
    });

    return clones;
};

const applyPattern = (
    layout: LevelLayout,
    pattern: 'checker' | 'hollow',
    invert: boolean,
): MutableBrickSpec[] => {
    const clones = layout.bricks.map(cloneBrick);

    if (pattern === 'checker') {
        clones.forEach((brick) => {
            if (brick.breakable === false) {
                return;
            }
            const parity = Math.abs(brick.row + brick.col) % 2 === 0;
            const shouldSolidify = invert ? !parity : parity;
            if (!shouldSolidify) {
                return;
            }
            const traits = new Set(brick.traits ?? []);
            traits.add('wall');
            brick.breakable = false;
            brick.traits = [...traits];
            brick.hp = WALL_BRICK_HP;
            brick.form = brick.form ?? 'rectangle';
            brick.isSensor = false;
        });
        return clones;
    }

    const rows = uniqueSorted(clones.map((brick) => brick.row));
    const cols = uniqueSorted(clones.map((brick) => brick.col));
    const minRow = rows[0] ?? 0;
    const maxRow = rows.at(-1) ?? 0;
    const minCol = cols[0] ?? 0;
    const maxCol = cols.at(-1) ?? 0;

    clones.forEach((brick) => {
        if (brick.breakable === false) {
            return;
        }
        const isEdge = brick.row === minRow || brick.row === maxRow || brick.col === minCol || brick.col === maxCol;
        const shouldSolidify = invert ? isEdge : !isEdge;
        if (!shouldSolidify) {
            return;
        }
        const traits = new Set(brick.traits ?? []);
        traits.add('wall');
        brick.breakable = false;
        brick.traits = [...traits];
        brick.hp = WALL_BRICK_HP;
        brick.form = brick.form ?? 'rectangle';
        brick.isSensor = false;
    });

    return clones;
};

const getDirectivePhaseCount = (directive: LayoutTransformDirective): number => {
    if (directive.type === 'shiftRows' || directive.type === 'shiftColumns') {
        return Math.abs(Math.trunc(directive.steps));
    }
    return 1;
};

const resolveShiftDirectionLabel = (directive: LayoutTransformDirective, stepSign: number): string => {
    if (directive.type === 'shiftRows') {
        if (stepSign > 0) {
            return 'shiftRows:right';
        }
        if (stepSign < 0) {
            return 'shiftRows:left';
        }
        return 'shiftRows';
    }
    if (directive.type === 'shiftColumns') {
        if (stepSign > 0) {
            return 'shiftColumns:down';
        }
        if (stepSign < 0) {
            return 'shiftColumns:up';
        }
        return 'shiftColumns';
    }
    return directive.type;
};

const createPhaseLabel = (
    directive: LayoutTransformDirective,
    stepIndex: number,
    stepCount: number,
    stepSign: number,
): string => {
    const baseLabel = directive.label ?? resolveShiftDirectionLabel(directive, stepSign);
    if (stepCount <= 1) {
        return baseLabel;
    }
    return `${baseLabel}#${stepIndex + 1}`;
};

const asReadonly = (bricks: MutableBrickSpec[]): readonly BrickSpec[] =>
    bricks.map((brick) => ({
        row: brick.row,
        col: brick.col,
        x: brick.x,
        y: brick.y,
        hp: brick.hp,
        traits: brick.traits ? [...brick.traits] : undefined,
        form: brick.form,
        breakable: brick.breakable,
        isSensor: brick.isSensor,
    } satisfies BrickSpec));

export function generateTransformingLayouts(
    spec: LevelSpec,
    directives: readonly LayoutTransformDirective[],
    options: TransformingLayoutOptions = {},
): readonly TransformingLayoutPhase[] {
    const {
        brickWidth = DEFAULT_BRICK_WIDTH,
        brickHeight = DEFAULT_BRICK_HEIGHT,
        fieldWidth = DEFAULT_FIELD_WIDTH,
        ...generationOptions
    } = options;

    const baseLayout = generateLevelLayout(spec, brickWidth, brickHeight, fieldWidth, generationOptions);
    const totalPhases = 1 + directives.reduce((sum, directive) => sum + getDirectivePhaseCount(directive), 0);

    const results: TransformingLayoutPhase[] = [];

    const basePhase: TransformingLayoutPhase = {
        ...baseLayout,
        metadata: {
            phase: 'base',
            index: 0,
            total: totalPhases,
        },
    };
    results.push(basePhase);

    let currentLayout: TransformingLayoutPhase = basePhase;
    let phaseIndex = 1;

    for (const directive of directives) {
        if (directive.type === 'shiftRows' || directive.type === 'shiftColumns') {
            const stepSign = Math.sign(Math.trunc(directive.steps)) || 0;
            const iterations = Math.abs(Math.trunc(directive.steps));
            if (stepSign === 0 || iterations === 0) {
                continue;
            }

            for (let iteration = 0; iteration < iterations; iteration++) {
                const bricks = directive.type === 'shiftRows'
                    ? applyShiftRows(currentLayout, stepSign, directive.rows)
                    : applyShiftColumns(currentLayout, stepSign, directive.columns);

                const readOnlyBricks = asReadonly(bricks);
                const nextLayout: TransformingLayoutPhase = {
                    bricks: readOnlyBricks,
                    breakableCount: computeBreakableCount(readOnlyBricks),
                    spec,
                    metadata: {
                        phase: createPhaseLabel(directive, iteration, iterations, stepSign),
                        index: phaseIndex,
                        total: totalPhases,
                    },
                };

                results.push(nextLayout);
                currentLayout = nextLayout;
                phaseIndex += 1;
            }
            continue;
        }

        if (directive.type === 'swapBands') {
            const bricks = applySwapBands(currentLayout, directive.first, directive.second);
            const readOnlyBricks = asReadonly(bricks);
            const nextLayout: TransformingLayoutPhase = {
                bricks: readOnlyBricks,
                breakableCount: computeBreakableCount(readOnlyBricks),
                spec,
                metadata: {
                    phase: directive.label ?? 'swapBands',
                    index: phaseIndex,
                    total: totalPhases,
                },
            };
            results.push(nextLayout);
            currentLayout = nextLayout;
            phaseIndex += 1;
            continue;
        }

        if (directive.type === 'applyPattern') {
            const bricks = applyPattern(currentLayout, directive.pattern, directive.invert ?? false);
            const readOnlyBricks = asReadonly(bricks);
            const nextLayout: TransformingLayoutPhase = {
                bricks: readOnlyBricks,
                breakableCount: computeBreakableCount(readOnlyBricks),
                spec,
                metadata: {
                    phase: directive.label ?? `pattern:${directive.pattern}`,
                    index: phaseIndex,
                    total: totalPhases,
                },
            };
            results.push(nextLayout);
            currentLayout = nextLayout;
            phaseIndex += 1;
            continue;
        }
    }

    return results;
}

const LEVEL_TRANSFORM_PLAN_PRESETS = new Map<number, LevelTransformPlan>([
    [
        4,
        {
            directives: [
                { type: 'shiftRows', rows: 'all', steps: 1, label: 'scroll-right' },
                { type: 'shiftColumns', columns: 'all', steps: -1, label: 'stagger-down' },
                { type: 'applyPattern', pattern: 'hollow', label: 'hollow-core' },
            ],
        },
    ],
]);

export function getLevelTransformPlan(levelIndex: number): LevelTransformPlan | null {
    if (LEVEL_PRESETS.length === 0) {
        return null;
    }

    const normalized = ((Math.trunc(levelIndex) % LEVEL_PRESETS.length) + LEVEL_PRESETS.length) % LEVEL_PRESETS.length;
    const plan = LEVEL_TRANSFORM_PLAN_PRESETS.get(normalized);
    if (!plan) {
        return null;
    }
    return plan;
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
    const presetCount = LEVEL_PRESETS.length;
    const rawIndex = presetCount === 0 ? 0 : levelIndex % presetCount;
    const presetIndex = presetCount === 0 ? 0 : (rawIndex + levelPresetOffset) % presetCount;
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
