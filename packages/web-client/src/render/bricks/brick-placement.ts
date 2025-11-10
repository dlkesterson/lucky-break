import { Container, Sprite } from 'pixi.js';
import { attachBrickFX } from './brick-fx';
import type { BrickVariant, BrickStyle, BrickVariantSets } from './brick-variants';
import type { RandomSource } from 'util/random';

/**
 * Weighted random picker for brick variants.
 */
function weightedPick<T extends { rarity: number }>(items: T[], rng: RandomSource): T {
    const total = items.reduce((sum, item) => sum + item.rarity, 0);
    let r = rng() * total;
    for (const item of items) {
        r -= item.rarity;
        if (r <= 0) return item;
    }
    return items[items.length - 1];
}

/**
 * Determine brick style for a grid position using a distribution pattern.
 */
function pickBrickStyle(x: number, y: number): BrickStyle {
    // Every 3rd row uses neon; otherwise alternate mosaic/marble by position
    if (y % 3 === 0) return 'neon';
    return (x + y) % 2 === 0 ? 'mosaic' : 'marble';
}

/**
 * Place bricks in a grid with weighted variant selection and neighbor de-duplication.
 */
export function placeBricks(
    gridWidth: number,
    gridHeight: number,
    brickSize: number,
    sets: BrickVariantSets,
    rng?: RandomSource
): Container {
    const container = new Container();
    const random = rng ?? (() => Math.random());

    // Track last variant per cell for de-duplication
    const lastByCell: (BrickVariant | null)[][] = Array.from(
        { length: gridHeight },
        () => Array<BrickVariant | null>(gridWidth).fill(null)
    );

    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const style = pickBrickStyle(x, y);
            const pool = sets[style];

            // Pick a variant with weighted probability
            let pick = weightedPick(pool, random);

            // Attempt to avoid identical neighbors (simple de-dupe)
            const left = x > 0 ? lastByCell[y][x - 1] : null;
            const up = y > 0 ? lastByCell[y - 1][x] : null;

            for (
                let tries = 0;
                tries < 3 && (pick === left || pick === up);
                tries++
            ) {
                pick = weightedPick(pool, random);
            }

            lastByCell[y][x] = pick;

            // Create sprite from baked texture
            const brick = new Sprite(pick.texture);
            brick.x = x * brickSize;
            brick.y = y * brickSize;
            brick.width = brickSize;
            brick.height = brickSize;

            container.addChild(brick);

            // Attach FX based on style
            attachBrickFX(brick, {
                twinkle: style === 'mosaic',
                sweep: style !== 'mosaic',
                rng: random,
            });
        }
    }

    return container;
}
