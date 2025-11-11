import { Graphics } from 'pixi.js';
import type { PowerUpType } from 'util/power-ups';
import { mixColors } from './playfield-visuals';

/**
 * Casino-Themed Power-Up Visual Rendering
 *
 * Renders fancy, casino-themed graphics for falling power-up drops:
 * - paddle-width: Shiny gold coin with $ symbol
 * - ball-speed: Lightning ball with electric arcs
 * - multi-ball: Infinity symbol ∞ with glowing orbs
 * - sticky-paddle: Poker chip with stripes
 * - laser: Ruby gem with facets
 */

const GOLD = 0xffd700;
const GOLD_DARK = 0xb8860b;
const GOLD_LIGHT = 0xffeb3b;
const ELECTRIC_BLUE = 0x00d4ff;
const ELECTRIC_WHITE = 0xe0f7ff;
const INFINITY_PURPLE = 0x9c27b0;
const INFINITY_PINK = 0xe91e63;
const CHIP_RED = 0xd32f2f;
const CHIP_WHITE = 0xffffff;
const RUBY_RED = 0xff1744;
const RUBY_DARK = 0xb71c1c;
const RUBY_LIGHT = 0xff8a80;

/**
 * Draw a shiny gold coin with $ symbol (paddle-width power-up)
 */
const drawGoldCoin = (graphics: Graphics, radius: number): void => {
    graphics.clear();

    graphics.circle(0, 0, radius);
    graphics.fill({ color: GOLD_DARK, alpha: 0.95 });

    const faceRadius = radius * 0.88;
    graphics.circle(0, 0, faceRadius);
    graphics.fill({ color: GOLD, alpha: 0.98 });

    graphics.circle(0, -radius * 0.25, faceRadius * 0.7);
    graphics.fill({ color: GOLD_LIGHT, alpha: 0.45 });

    graphics.circle(0, 0, radius);
    graphics.stroke({ color: GOLD_LIGHT, width: 2.5, alpha: 0.6 });

    graphics.circle(0, 0, faceRadius);
    graphics.stroke({ color: GOLD_DARK, width: 1.8, alpha: 0.5 });

    const symbolScale = radius * 0.55;
    const symbolWidth = symbolScale * 0.15;

    graphics.rect(-symbolWidth / 2, -symbolScale * 0.6, symbolWidth, symbolScale * 1.2);
    graphics.fill({ color: GOLD_DARK, alpha: 0.9 });

    graphics.arc(0, -symbolScale * 0.25, symbolScale * 0.25, Math.PI, Math.PI * 2, false);
    graphics.stroke({ color: GOLD_DARK, width: symbolWidth * 1.5, alpha: 0.9 });

    graphics.arc(0, symbolScale * 0.25, symbolScale * 0.25, 0, Math.PI, false);
    graphics.stroke({ color: GOLD_DARK, width: symbolWidth * 1.5, alpha: 0.9 });

    graphics.blendMode = 'normal';
};

/**
 * Draw a lightning ball with electric arcs (ball-speed power-up)
 */
const drawLightningBall = (graphics: Graphics, radius: number): void => {
    graphics.clear();

    graphics.circle(0, 0, radius * 1.15);
    graphics.fill({ color: ELECTRIC_BLUE, alpha: 0.25 });

    graphics.circle(0, 0, radius);
    graphics.fill({ color: ELECTRIC_BLUE, alpha: 0.85 });
    graphics.stroke({ color: ELECTRIC_WHITE, width: 2, alpha: 0.7 });

    graphics.circle(0, -radius * 0.2, radius * 0.5);
    graphics.fill({ color: ELECTRIC_WHITE, alpha: 0.6 });

    const boltCount = 3;
    const boltWidth = 2.5;
    for (let index = 0; index < boltCount; index += 1) {
        const angle = (index * Math.PI * 2) / boltCount + Math.PI / 6;
        const startX = Math.cos(angle) * radius * 0.3;
        const startY = Math.sin(angle) * radius * 0.3;
        const endX = Math.cos(angle) * radius * 0.85;
        const endY = Math.sin(angle) * radius * 0.85;
        const midX = (startX + endX) / 2 + Math.cos(angle + Math.PI / 2) * radius * 0.2;
        const midY = (startY + endY) / 2 + Math.sin(angle + Math.PI / 2) * radius * 0.2;

        graphics.moveTo(startX, startY);
        graphics.lineTo(midX, midY);
        graphics.lineTo(endX, endY);
        graphics.stroke({ color: 0xffff00, width: boltWidth, alpha: 0.95 });

        graphics.moveTo(startX, startY);
        graphics.lineTo(midX, midY);
        graphics.lineTo(endX, endY);
        graphics.stroke({ color: ELECTRIC_WHITE, width: boltWidth * 0.5, alpha: 0.8 });
    }

    graphics.blendMode = 'normal';
};

/**
 * Draw infinity symbol ∞ with glowing orbs (multi-ball power-up)
 */
const drawInfinitySymbol = (graphics: Graphics, radius: number): void => {
    graphics.clear();

    graphics.circle(0, 0, radius * 1.2);
    graphics.fill({ color: INFINITY_PURPLE, alpha: 0.2 });

    graphics.circle(0, 0, radius);
    graphics.fill({ color: INFINITY_PURPLE, alpha: 0.75 });
    graphics.stroke({ color: INFINITY_PINK, width: 2.5, alpha: 0.8 });

    const loopRadius = radius * 0.35;
    const separation = radius * 0.3;

    graphics.circle(-separation, 0, loopRadius);
    graphics.fill({ color: INFINITY_PINK, alpha: 0.95 });
    graphics.stroke({ color: CHIP_WHITE, width: 2, alpha: 0.7 });

    graphics.circle(separation, 0, loopRadius);
    graphics.fill({ color: INFINITY_PINK, alpha: 0.95 });
    graphics.stroke({ color: CHIP_WHITE, width: 2, alpha: 0.7 });

    graphics.rect(-separation * 0.5, -loopRadius * 0.3, separation, loopRadius * 0.6);
    graphics.fill({ color: INFINITY_PINK, alpha: 0.95 });

    graphics.circle(-separation, -loopRadius * 0.35, loopRadius * 0.35);
    graphics.fill({ color: CHIP_WHITE, alpha: 0.55 });

    graphics.circle(separation, -loopRadius * 0.35, loopRadius * 0.35);
    graphics.fill({ color: CHIP_WHITE, alpha: 0.55 });

    graphics.blendMode = 'normal';
};

/**
 * Draw a poker chip with stripes (sticky-paddle power-up)
 */
const drawPokerChip = (graphics: Graphics, radius: number): void => {
    graphics.clear();

    graphics.circle(0, 0, radius);
    graphics.fill({ color: CHIP_WHITE, alpha: 0.95 });

    const faceRadius = radius * 0.8;
    graphics.circle(0, 0, faceRadius);
    graphics.fill({ color: CHIP_RED, alpha: 0.95 });

    const segmentCount = 12;
    for (let index = 0; index < segmentCount; index += 2) {
        const startAngle = (index * Math.PI * 2) / segmentCount;
        const endAngle = ((index + 1) * Math.PI * 2) / segmentCount;
        const outerRadius = radius;
        const innerRadius = faceRadius;

        graphics.moveTo(0, 0);
        graphics.arc(0, 0, outerRadius, startAngle, endAngle, false);
        graphics.lineTo(
            Math.cos(endAngle) * innerRadius,
            Math.sin(endAngle) * innerRadius,
        );
        graphics.arc(0, 0, innerRadius, endAngle, startAngle, true);
        graphics.closePath();
        graphics.fill({ color: CHIP_WHITE, alpha: 0.95 });
    }

    const centerRadius = faceRadius * 0.5;
    graphics.circle(0, 0, centerRadius);
    graphics.fill({ color: CHIP_WHITE, alpha: 0.98 });

    const symbolScale = centerRadius * 0.7;
    const symbolWidth = symbolScale * 0.15;

    graphics.rect(-symbolWidth / 2, -symbolScale * 0.6, symbolWidth, symbolScale * 1.2);
    graphics.fill({ color: CHIP_RED, alpha: 0.95 });

    graphics.arc(0, -symbolScale * 0.25, symbolScale * 0.25, Math.PI, Math.PI * 2, false);
    graphics.stroke({ color: CHIP_RED, width: symbolWidth * 1.5, alpha: 0.95 });

    graphics.arc(0, symbolScale * 0.25, symbolScale * 0.25, 0, Math.PI, false);
    graphics.stroke({ color: CHIP_RED, width: symbolWidth * 1.5, alpha: 0.95 });

    graphics.blendMode = 'normal';
};

/**
 * Draw a ruby gem with facets (laser power-up)
 */
const drawRubyGem = (graphics: Graphics, radius: number): void => {
    graphics.clear();

    graphics.circle(0, 0, radius * 1.15);
    graphics.fill({ color: RUBY_RED, alpha: 0.3 });

    const sides = 8;
    const points: number[] = [];
    const rotation = Math.PI / 8;
    for (let index = 0; index < sides; index += 1) {
        const angle = rotation + (index * Math.PI * 2) / sides;
        points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    graphics.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
        graphics.lineTo(points[index], points[index + 1]);
    }
    graphics.closePath();
    graphics.fill({ color: RUBY_RED, alpha: 0.95 });
    graphics.stroke({ color: RUBY_DARK, width: 2.5, alpha: 0.8 });

    const innerRadius = radius * 0.6;
    const innerPoints: number[] = [];
    for (let index = 0; index < sides; index += 1) {
        const angle = rotation + (index * Math.PI * 2) / sides;
        innerPoints.push(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
    }

    graphics.moveTo(innerPoints[0], innerPoints[1]);
    for (let index = 2; index < innerPoints.length; index += 2) {
        graphics.lineTo(innerPoints[index], innerPoints[index + 1]);
    }
    graphics.closePath();
    graphics.fill({ color: mixColors(RUBY_RED, RUBY_LIGHT, 0.4), alpha: 0.85 });

    graphics.moveTo(0, -radius * 0.7);
    graphics.lineTo(-radius * 0.3, -radius * 0.3);
    graphics.lineTo(radius * 0.3, -radius * 0.3);
    graphics.closePath();
    graphics.fill({ color: RUBY_LIGHT, alpha: 0.75 });

    for (let index = 0; index < sides; index += 2) {
        const angle = rotation + (index * Math.PI * 2) / sides;
        const nextAngle = rotation + ((index + 1) * Math.PI * 2) / sides;
        graphics.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        graphics.lineTo(Math.cos(nextAngle) * radius, Math.sin(nextAngle) * radius);
        graphics.stroke({ color: RUBY_LIGHT, width: 1.5, alpha: 0.6 });
    }

    graphics.blendMode = 'normal';
};

/**
 * Draw casino-themed power-up visual based on type
 *
 * @param graphics - Pixi Graphics object to draw into
 * @param type - Power-up type
 * @param radius - Radius of the power-up drop
 */
export const drawPowerUpVisual = (
    graphics: Graphics,
    type: PowerUpType,
    radius: number,
): void => {
    switch (type) {
        case 'paddle-width':
            drawGoldCoin(graphics, radius);
            break;
        case 'ball-speed':
            drawLightningBall(graphics, radius);
            break;
        case 'multi-ball':
            drawInfinitySymbol(graphics, radius);
            break;
        case 'sticky-paddle':
            drawPokerChip(graphics, radius);
            break;
        case 'laser':
            drawRubyGem(graphics, radius);
            break;
        default:
            graphics.clear();
            graphics.circle(0, 0, radius);
            graphics.fill({ color: 0xffffff, alpha: 0.9 });
            graphics.stroke({ color: 0xcccccc, width: 2, alpha: 0.8 });
            break;
    }
};

/**
 * Get the primary color for a power-up type (for particles, glows, etc.)
 *
 * @param type - Power-up type
 * @returns Hex color number
 */
export const getPowerUpColor = (type: PowerUpType): number => {
    switch (type) {
        case 'paddle-width':
            return GOLD;
        case 'ball-speed':
            return ELECTRIC_BLUE;
        case 'multi-ball':
            return INFINITY_PINK;
        case 'sticky-paddle':
            return CHIP_RED;
        case 'laser':
            return RUBY_RED;
        default:
            return 0xffffff;
    }
};
