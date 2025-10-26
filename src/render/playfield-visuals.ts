import { Container, FillGradient, Graphics, Texture, TilingSprite } from 'pixi.js';
import type { BrickForm } from 'util/levels';

export const toColorNumber = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

export const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

export interface BallVisualPalette {
    readonly baseColor: number;
    readonly baseAlpha?: number;
    readonly rimColor?: number;
    readonly rimAlpha?: number;
    readonly innerColor?: number;
    readonly innerAlpha?: number;
    readonly innerScale?: number;
}

export interface PaddleVisualPalette {
    readonly gradient?: readonly number[];
    readonly accentColor?: number;
    readonly pulseStrength?: number;
    readonly motionGlow?: number;
}

export interface BallVisualDefaults {
    readonly baseColor: number;
    readonly auraColor: number;
    readonly highlightColor: number;
    readonly baseAlpha?: number;
    readonly rimAlpha?: number;
    readonly innerAlpha?: number;
    readonly innerScale?: number;
}

export interface PaddleVisualDefaults {
    readonly gradient: readonly number[];
    readonly accentColor: number;
}

export interface PlayfieldDimensions {
    readonly width: number;
    readonly height: number;
}

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

export const drawBallVisual = (
    graphics: Graphics,
    radius: number,
    defaults: BallVisualDefaults,
    palette?: Partial<BallVisualPalette>,
): void => {
    const settings: Required<BallVisualPalette> = {
        baseColor: palette?.baseColor ?? defaults.baseColor,
        baseAlpha: palette?.baseAlpha ?? defaults.baseAlpha ?? 0.78,
        rimColor: palette?.rimColor ?? defaults.highlightColor,
        rimAlpha: palette?.rimAlpha ?? defaults.rimAlpha ?? 0.38,
        innerColor: palette?.innerColor ?? defaults.auraColor,
        innerAlpha: palette?.innerAlpha ?? defaults.innerAlpha ?? 0.32,
        innerScale: palette?.innerScale ?? defaults.innerScale ?? 0.5,
    };

    graphics.clear();
    graphics.circle(0, 0, radius);
    graphics.fill({ color: settings.baseColor, alpha: settings.baseAlpha });
    graphics.stroke({ color: settings.rimColor, width: 3, alpha: settings.rimAlpha });

    const innerRadius = Math.max(1, radius * settings.innerScale);
    graphics.circle(0, -radius * 0.25, innerRadius);
    graphics.fill({ color: settings.innerColor, alpha: settings.innerAlpha });

    graphics.blendMode = 'normal';
};

export const drawPaddleVisual = (
    graphics: Graphics,
    width: number,
    height: number,
    defaults: PaddleVisualDefaults,
    palette: PaddleVisualPalette = {},
): void => {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const cornerRadius = Math.min(halfHeight, 14);
    const gradientStops = palette.gradient ?? defaults.gradient;
    const motionGlow = clampUnit(palette.motionGlow ?? 0);
    const accentBase = palette.accentColor ?? defaults.accentColor;
    const accentColor = motionGlow > 0 ? mixColors(accentBase, 0xffffff, 0.35 * motionGlow) : accentBase;
    const pulseStrength = Math.max(0, Math.min(1, palette.pulseStrength ?? 0));

    const brighten = (color: number) => (motionGlow > 0 ? mixColors(color, 0xffffff, 0.45 * motionGlow) : color);
    const startColor = brighten(gradientStops[0] ?? defaults.gradient[0]);
    const endColor = brighten(
        gradientStops[gradientStops.length - 1] ?? defaults.gradient[defaults.gradient.length - 1],
    );

    const gradient = new FillGradient(-halfWidth, -halfHeight, halfWidth, halfHeight);
    gradient.addColorStop(0, startColor);
    gradient.addColorStop(1, endColor);

    graphics.clear();
    graphics.roundRect(-halfWidth, -halfHeight, width, height, cornerRadius);
    graphics.fill(gradient);
    graphics.stroke({ color: accentColor, width: 2, alpha: 0.4 + pulseStrength * 0.4 });

    const topBandAlpha = 0.16 + pulseStrength * 0.12 + motionGlow * 0.25;
    graphics.rect(-halfWidth + 3, -halfHeight + 2, width - 6, height * 0.35);
    graphics.fill({ color: 0xffffff, alpha: topBandAlpha });

    const baseBandAlpha = 0.1 + pulseStrength * 0.1 + motionGlow * 0.2;
    graphics.rect(-halfWidth + 2, halfHeight - height * 0.28, width - 4, height * 0.28);
    graphics.fill({ color: accentColor, alpha: baseBandAlpha });

    if (motionGlow > 0.01) {
        const glowAlpha = 0.08 + motionGlow * 0.18;
        graphics.roundRect(-halfWidth + 1.5, -halfHeight + 1.5, width - 3, height - 3, Math.max(2, cornerRadius * 0.7));
        graphics.fill({ color: 0xffffff, alpha: glowAlpha });
    }

    graphics.alpha = 0.96;
    graphics.blendMode = 'normal';
};

export interface PlayfieldBackgroundLayer {
    readonly container: Container;
    readonly tilingSprite: TilingSprite | null;
    readonly overlay: Graphics;
}

export const createPlayfieldBackgroundLayer = (
    dimensions: PlayfieldDimensions,
    texture?: Texture | null,
): PlayfieldBackgroundLayer => {
    const container = new Container();
    container.eventMode = 'none';
    container.zIndex = -100;

    let tilingSprite: TilingSprite | null = null;
    if (texture) {
        tilingSprite = new TilingSprite({
            texture,
            width: dimensions.width,
            height: dimensions.height,
        });
        tilingSprite.eventMode = 'none';
        tilingSprite.alpha = 0.78;
        tilingSprite.tileScale.set(0.45);
        container.addChild(tilingSprite);
    }

    const overlay = new Graphics();
    overlay.eventMode = 'none';
    overlay.clear();

    const baseGradient = new FillGradient(0, 0, 0, dimensions.height);
    baseGradient.addColorStop(0, 0x0c172f);
    baseGradient.addColorStop(1, 0x04070f);

    overlay.rect(0, 0, dimensions.width, dimensions.height);
    overlay.fill(baseGradient);
    overlay.tint = 0xffffff;
    overlay.alpha = 1;
    overlay.blendMode = 'normal';

    container.addChild(overlay);

    return {
        container,
        tilingSprite,
        overlay,
    };
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

export interface BrickVisualOverrides {
    readonly strokeColor?: number;
    readonly fillColor?: number;
    readonly useFlatFill?: boolean;
}
