import { Container, FillGradient, Graphics, TilingSprite, Texture } from 'pixi.js';

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
    const accentColor = palette.accentColor ?? defaults.accentColor;
    const pulseStrength = Math.max(0, Math.min(1, palette.pulseStrength ?? 0));

    const gradient = new FillGradient(-halfWidth, -halfHeight, halfWidth, halfHeight);
    gradient.addColorStop(0, gradientStops[0] ?? defaults.gradient[0]);
    gradient.addColorStop(1, gradientStops[gradientStops.length - 1] ?? defaults.gradient[defaults.gradient.length - 1]);

    graphics.clear();
    graphics.roundRect(-halfWidth, -halfHeight, width, height, cornerRadius);
    graphics.fill(gradient);
    graphics.stroke({ color: accentColor, width: 2, alpha: 0.4 + pulseStrength * 0.4 });

    const topBandAlpha = 0.16 + pulseStrength * 0.12;
    graphics.rect(-halfWidth + 3, -halfHeight + 2, width - 6, height * 0.35);
    graphics.fill({ color: 0xffffff, alpha: topBandAlpha });

    const baseBandAlpha = 0.1 + pulseStrength * 0.1;
    graphics.rect(-halfWidth + 2, halfHeight - height * 0.28, width - 4, height * 0.28);
    graphics.fill({ color: accentColor, alpha: baseBandAlpha });

    graphics.alpha = 0.96;
    graphics.blendMode = 'normal';
};

const drawBackgroundOverlay = (graphics: Graphics, dimensions: PlayfieldDimensions): void => {
    const { width, height } = dimensions;
    graphics.clear();
    graphics.rect(0, 0, width, height);
    graphics.fill({ color: 0x05060d, alpha: 0.55 });
    graphics.stroke({ color: 0x2a2a2a, width: 4, alignment: 0, alpha: 0.35 });

    graphics.rect(0, 0, width, height * 0.45);
    graphics.fill({ color: 0x0c1830, alpha: 0.25 });

    const gridSpacing = 80;
    for (let y = gridSpacing; y < height; y += gridSpacing) {
        graphics.rect(0, y, width, 1);
        graphics.fill({ color: 0x10172a, alpha: 0.12 });
    }

    for (let x = gridSpacing; x < width; x += gridSpacing) {
        graphics.rect(x, 0, 1, height);
        graphics.fill({ color: 0x10172a, alpha: 0.1 });
    }
};

export const createPlayfieldBackgroundLayer = (
    dimensions: PlayfieldDimensions,
    texture: Texture,
): { readonly container: Container; readonly tiling: TilingSprite } => {
    const container = new Container();
    container.eventMode = 'none';
    container.zIndex = -100;

    const tiling = new TilingSprite({
        texture,
        width: dimensions.width,
        height: dimensions.height,
    });
    tiling.eventMode = 'none';
    tiling.alpha = 0.78;
    tiling.tileScale.set(0.9, 0.9);
    tiling.tint = 0x2b4a7a;

    const overlay = new Graphics();
    overlay.eventMode = 'none';
    drawBackgroundOverlay(overlay, dimensions);

    container.addChild(tiling, overlay);

    return { container, tiling };
};

export const paintBrickVisual = (
    graphics: Graphics,
    width: number,
    height: number,
    color: number,
    damageLevel: number,
    restAlpha: number,
): void => {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const cornerRadius = Math.min(halfHeight, 12);

    const damage = clampUnit(damageLevel);
    const highlightColor = mixColors(color, 0xffffff, 0.45 + damage * 0.35);
    const shadowColor = mixColors(color, 0x001020, 0.55 + damage * 0.15);

    const gradient = new FillGradient(-halfWidth, -halfHeight, halfWidth, halfHeight);
    gradient.addColorStop(0, highlightColor);
    gradient.addColorStop(1, shadowColor);

    graphics.clear();
    graphics.roundRect(-halfWidth, -halfHeight, width, height, cornerRadius);
    graphics.fill(gradient);
    graphics.stroke({ color: highlightColor, width: 2, alignment: 0.5, alpha: 0.45 + damage * 0.2 });

    const innerHighlightHeight = height * 0.32;
    graphics.roundRect(-halfWidth + 3, -halfHeight + 3, width - 6, innerHighlightHeight, cornerRadius * 0.6);
    graphics.fill({ color: 0xffffff, alpha: 0.12 + damage * 0.16 });

    graphics.roundRect(-halfWidth + 4, halfHeight - innerHighlightHeight + 2, width - 8, innerHighlightHeight, cornerRadius * 0.6);
    graphics.fill({ color, alpha: 0.18 + damage * 0.22 });

    if (damage > 0.01) {
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

    graphics.alpha = restAlpha;
    graphics.tint = 0xffffff;
};
