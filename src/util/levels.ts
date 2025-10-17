/**
 * Level Progression System
 *
 * Adapted from Banana Music Game's level specs
 * Defines preset layouts with increasing difficulty
 */

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
    brickWidth: number = 100,
    brickHeight: number = 40,
    fieldWidth: number = 1280,
): LevelLayout {
    const gap = spec.gap ?? 20;
    const startY = spec.startY ?? 100;

    // Calculate centering offset
    const totalWidth = spec.cols * brickWidth + (spec.cols - 1) * gap;
    const startX = (fieldWidth - totalWidth) / 2 + brickWidth / 2;

    const bricks: BrickSpec[] = [];

    for (let row = 0; row < spec.rows; row++) {
        const hp = spec.hpPerRow ? spec.hpPerRow(row) : 1;

        for (let col = 0; col < spec.cols; col++) {
            const x = startX + col * (brickWidth + gap);
            const y = startY + row * (brickHeight + gap);

            bricks.push({
                row,
                col,
                x,
                y,
                hp,
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
    return 1.0 + loopCount * 0.2; // +20% difficulty per loop
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
} {
    const presetIndex = levelIndex % LEVEL_PRESETS.length;
    const loopCount = Math.floor(levelIndex / LEVEL_PRESETS.length);

    return {
        levelIndex,
        presetIndex,
        isLooped: isLoopedLevel(levelIndex),
        loopCount,
        difficultyMultiplier: getLevelDifficultyMultiplier(levelIndex),
        spec: getLevelSpec(levelIndex),
    };
}
