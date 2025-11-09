/**
 * Shared brick rendering utilities for Storybook stories.
 * These implementations mirror the web-client rendering code exactly,
 * avoiding duplication while maintaining canonical design data.
 */

import { FillGradient, Graphics } from 'pixi.js';
import type { BrickForm } from '@lucky-break/core-domain/src/util/levels';

export interface BrickVisualOverrides {
    readonly strokeColor?: number;
    readonly fillColor?: number;
    readonly useFlatFill?: boolean;
}

export const clampUnit = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
};

export const mixColors = (source: number, target: number, amount: number): number => {
    const t = clampUnit(amount);
    const sr = (source >> 16) & 0xff;
    const sg = (source >> 8) & 0xff;
    const sb = source & 0xff;
    const tr = (target >> 16) & 0xff;
    const tg = (target >> 8) & 0xff;
    const tb = target & 0xff;

    const r = Math.round(sr + (tr - sr) * t);
    const g = Math.round(sg + (tg - sg) * t);
    const b = Math.round(sb + (tb - sb) * t);

    return (r << 16) | (g << 8) | b;
};

export const computeBrickFillColor = (baseColor: number, remainingHp: number, maxHp: number): number => {
    if (maxHp <= 1) {
        return baseColor;
    }
    const healthRatio = clampUnit(remainingHp / maxHp);
    const damageInfluence = 1 - healthRatio;
    if (damageInfluence <= 0) {
        return baseColor;
    }
    const warmed = mixColors(baseColor, 0xffe4c8, 0.4 + damageInfluence * 0.45);
    const cooled = mixColors(baseColor, 0x07121f, damageInfluence * 0.35);
    return mixColors(warmed, cooled, damageInfluence * 0.4);
};

export const paintBrickVisual = (
    graphics: Graphics,
    width: number,
    height: number,
    color: number,
    damageLevel: number,
    restAlpha: number,
    form: BrickForm = 'rectangle',
    overrides?: BrickVisualOverrides,
): void => {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const damage = clampUnit(damageLevel);
    const baseColor = overrides?.fillColor ?? color;
    const useFlatFill = overrides?.useFlatFill ?? false;
    const highlightColor = useFlatFill ? baseColor : mixColors(baseColor, 0xffffff, 0.45 + damage * 0.35);
    const shadowColor = useFlatFill ? baseColor : mixColors(baseColor, 0x001020, 0.55 + damage * 0.15);

    const gradient = new FillGradient(-halfWidth, -halfHeight, halfWidth, halfHeight);
    gradient.addColorStop(0, highlightColor);
    gradient.addColorStop(1, shadowColor);

    graphics.clear();

    const strokeAlpha = overrides?.strokeColor !== undefined ? 0.9 : 0.45 + damage * 0.2;
    const strokeColor = overrides?.strokeColor ?? highlightColor;
    const strokeOptions = { color: strokeColor, width: 2, alignment: 0.5, alpha: strokeAlpha } as const;

    if (form === 'circle') {
        const radius = Math.max(4, Math.min(halfWidth, halfHeight));
        graphics.circle(0, 0, radius);
        graphics.fill(gradient);
        graphics.stroke(strokeOptions);

        if (!useFlatFill) {
            const highlightRadius = radius * 0.65;
            graphics.ellipse(0, -radius * 0.25, highlightRadius, highlightRadius * 0.45);
            graphics.fill({ color: 0xffffff, alpha: 0.12 + damage * 0.16 });

            const shadowRadius = radius * 0.75;
            graphics.ellipse(0, radius * 0.3, shadowRadius, shadowRadius * 0.45);
            graphics.fill({ color: baseColor, alpha: 0.18 + damage * 0.22 });
        }

        if (!useFlatFill && damage > 0.01) {
            const crackAlpha = 0.12 + damage * 0.32;
            graphics.moveTo(-radius * 0.6, -radius * 0.2);
            graphics.lineTo(-radius * 0.15, radius * 0.05);
            graphics.lineTo(radius * 0.1, radius * 0.45);
            graphics.stroke({ color: 0xffffff, width: 1.2, alpha: crackAlpha });

            graphics.moveTo(-radius * 0.3, radius * 0.55);
            graphics.lineTo(radius * 0.05, radius * 0.1);
            graphics.lineTo(radius * 0.55, -radius * 0.15);
            graphics.stroke({ color: 0x010a16, width: 1.1, alpha: crackAlpha * 0.6 });
        }
    } else if (form === 'diamond') {
        const vertices = [
            { x: 0, y: -halfHeight },
            { x: halfWidth, y: 0 },
            { x: 0, y: halfHeight },
            { x: -halfWidth, y: 0 },
        ];
        graphics.moveTo(vertices[0].x, vertices[0].y);
        for (let index = 1; index < vertices.length; index++) {
            graphics.lineTo(vertices[index].x, vertices[index].y);
        }
        graphics.closePath();
        graphics.fill(gradient);
        graphics.stroke(strokeOptions);

        if (!useFlatFill) {
            graphics.moveTo(0, -halfHeight * 0.6);
            graphics.lineTo(halfWidth * 0.45, -halfHeight * 0.05);
            graphics.lineTo(0, -halfHeight * 0.1);
            graphics.lineTo(-halfWidth * 0.45, -halfHeight * 0.05);
            graphics.closePath();
            graphics.fill({ color: 0xffffff, alpha: 0.12 + damage * 0.16 });

            graphics.moveTo(0, halfHeight * 0.75);
            graphics.lineTo(halfWidth * 0.6, halfHeight * 0.1);
            graphics.lineTo(0, halfHeight * 0.2);
            graphics.lineTo(-halfWidth * 0.6, halfHeight * 0.1);
            graphics.closePath();
            graphics.fill({ color: baseColor, alpha: 0.18 + damage * 0.22 });
        }

        if (!useFlatFill && damage > 0.01) {
            const crackAlpha = 0.12 + damage * 0.32;
            graphics.moveTo(-halfWidth * 0.35, -halfHeight * 0.45);
            graphics.lineTo(-halfWidth * 0.1, -halfHeight * 0.05);
            graphics.lineTo(halfWidth * 0.25, halfHeight * 0.45);
            graphics.stroke({ color: 0xffffff, width: 1.2, alpha: crackAlpha });

            graphics.moveTo(-halfWidth * 0.1, halfHeight * 0.55);
            graphics.lineTo(halfWidth * 0.35, 0);
            graphics.lineTo(halfWidth * 0.6, -halfHeight * 0.35);
            graphics.stroke({ color: 0x010a16, width: 1.1, alpha: crackAlpha * 0.6 });
        }
    } else {
        const cornerRadius = Math.min(halfHeight, 12);
        graphics.roundRect(-halfWidth, -halfHeight, width, height, cornerRadius);
        graphics.fill(gradient);
        graphics.stroke(strokeOptions);

        if (!useFlatFill) {
            const innerHighlightHeight = height * 0.32;
            graphics.roundRect(-halfWidth + 3, -halfHeight + 3, width - 6, innerHighlightHeight, cornerRadius * 0.6);
            graphics.fill({ color: 0xffffff, alpha: 0.12 + damage * 0.16 });

            graphics.roundRect(-halfWidth + 4, halfHeight - innerHighlightHeight + 2, width - 8, innerHighlightHeight, cornerRadius * 0.6);
            graphics.fill({ color: baseColor, alpha: 0.18 + damage * 0.22 });
        }

        if (!useFlatFill && damage > 0.01) {
            const crackAlpha = 0.12 + damage * 0.32;
            graphics.moveTo(-halfWidth + 6, -halfHeight + 10);
            graphics.lineTo(-halfWidth * 0.2, -halfHeight * 0.1);
            graphics.lineTo(halfWidth * 0.1, halfHeight * 0.25);
            graphics.lineTo(halfWidth - 12, halfHeight - 8);
            graphics.stroke({ color: 0xffffff, width: 1.4, alpha: crackAlpha });

            graphics.moveTo(-halfWidth + 18, halfHeight - 10);
            graphics.lineTo(-halfWidth * 0.05, halfHeight * 0.1);
            graphics.lineTo(halfWidth * 0.45, -halfHeight * 0.05);
            graphics.stroke({ color: 0x010a16, width: 1.2, alpha: crackAlpha * 0.6 });
        }
    }

    graphics.alpha = restAlpha;
    graphics.tint = 0xffffff;
};

export const toColorNumber = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

export const WALL_BRICK_COLOR = 0xffffff;
export const WALL_STROKE_COLOR = 0xa4acb6;
