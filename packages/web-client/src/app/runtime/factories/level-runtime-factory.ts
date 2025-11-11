/**
 * Level Runtime Factory
 *
 * Centralized factory for creating and configuring the level runtime system,
 * including preset offset calculation and brick state initialization.
 */

import type { StageHandle } from 'render/stage';
import type { MatterBody as Body } from 'physics/matter';
import type { Container } from 'pixi.js';
import type { RandomManager } from 'util/random';
import { mulberry32 } from 'util/random';
import { getPresetLevelCount, setLevelPresetOffset, deriveLayoutSeed } from 'util/levels';
import { createLevelRuntime } from 'app/level-runtime';
import type { LevelRuntimeHandle, LevelRuntimeOptions } from 'app/level-runtime';
import type { RuntimeConfigResolver } from '../config-resolver';
import type { PhysicsWorldHandle } from 'physics/world';

/**
 * Brick layout decorator function type.
 */
export type BrickLayoutDecorator = LevelRuntimeOptions['decorateBrick'];

/**
 * Level runtime factory options.
 */
export interface LevelRuntimeFactoryOptions {
    readonly physics: PhysicsWorldHandle;
    readonly stage: StageHandle;
    readonly visualBodies: Map<Body, Container>;
    readonly removeBodyVisual: (body: Body) => void;
    readonly playfieldWidth: number;
    readonly configResolver: RuntimeConfigResolver;
    readonly rowColors: readonly number[];
    readonly sessionOrientation: 'portrait' | 'landscape';
    readonly random: RandomManager;
    readonly layoutDecorator: BrickLayoutDecorator;
}

/**
 * Level runtime factory result containing the runtime and associated state.
 */
export interface LevelRuntimeBundle {
    readonly levelRuntime: LevelRuntimeHandle;
    readonly brickHealth: LevelRuntimeHandle['brickHealth'];
    readonly brickMetadata: LevelRuntimeHandle['brickMetadata'];
    readonly brickVisualState: LevelRuntimeHandle['brickVisualState'];
}

/**
 * Creates and initializes the level runtime system.
 *
 * This factory handles:
 * - Preset level offset calculation and configuration
 * - Level runtime instance creation
 * - Brick state management references
 *
 * The preset offset ensures variety by starting at a random position
 * in the preset level sequence on each new session.
 *
 * @param options - Configuration options for level runtime creation
 * @returns Bundle containing level runtime and associated brick state
 *
 * @example
 * ```typescript
 * const { levelRuntime, brickHealth, brickMetadata } = createLevelRuntimeBundle({
 *   physics,
 *   stage,
 *   visualBodies,
 *   removeBodyVisual,
 *   playfieldWidth: 800,
 *   configResolver,
 *   rowColors,
 *   sessionOrientation: 'landscape',
 *   random,
 *   layoutDecorator,
 * });
 * ```
 */
export const createLevelRuntimeBundle = (
    options: LevelRuntimeFactoryOptions,
): LevelRuntimeBundle => {
    const {
        physics,
        stage,
        visualBodies,
        removeBodyVisual,
        playfieldWidth,
        configResolver,
        rowColors,
        sessionOrientation,
        random,
        layoutDecorator,
    } = options;

    // Configure preset level offset for variety
    const presetCount = getPresetLevelCount();
    if (presetCount > 0) {
        const offsetSource = mulberry32((random.seed() ^ configResolver.presetOffsetSalt) >>> 0);
        const offset = Math.floor(offsetSource() * presetCount);
        setLevelPresetOffset(offset);
    } else {
        setLevelPresetOffset(0);
    }

    // Create level runtime with all dependencies
    const levelRuntime = createLevelRuntime({
        physics,
        stage,
        visualBodies,
        removeBodyVisual,
        playfieldWidth,
        brickSize: {
            width: configResolver.brickWidth,
            height: configResolver.brickHeight,
        },
        brickLighting: {
            radius: configResolver.brickLightRadius,
            restAlpha: configResolver.brickRestAlpha,
        },
        rowColors,
        powerUp: {
            radius: configResolver.powerUpRadius,
            fallSpeed: configResolver.powerUpFallSpeed,
        },
        coin: {
            radius: configResolver.coinRadius,
            fallSpeed: configResolver.coinFallSpeed,
        },
        layoutOrientation: sessionOrientation,
        getLayoutRandom: (levelIndex: number) => mulberry32(deriveLayoutSeed(random.seed(), levelIndex)),
        decorateBrick: layoutDecorator,
    });

    // Return bundle with runtime and state references
    return {
        levelRuntime,
        brickHealth: levelRuntime.brickHealth,
        brickMetadata: levelRuntime.brickMetadata,
        brickVisualState: levelRuntime.brickVisualState,
    };
};
