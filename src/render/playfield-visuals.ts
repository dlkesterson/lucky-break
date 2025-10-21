import { Container, FillGradient, Graphics, Texture, TilingSprite } from 'pixi.js';

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

    const skyGradient = new FillGradient(0, 0, 0, dimensions.height);
    skyGradient.addColorStop(0, 0x1b2757);
    skyGradient.addColorStop(0.35, 0x2f5ec6);
    skyGradient.addColorStop(0.7, 0x69b8ff);
    skyGradient.addColorStop(1, 0xf6fbff);

    overlay.rect(0, 0, dimensions.width, dimensions.height);
    overlay.fill(skyGradient);

    overlay.circle(dimensions.width * 0.5, dimensions.height * 0.28, dimensions.width * 0.65);
    overlay.fill({ color: 0xffffff, alpha: 0.1 });
    overlay.blendMode = 'normal';

    overlay.rect(0, dimensions.height * 0.58, dimensions.width, dimensions.height * 0.42);
    overlay.fill({ color: 0xffffff, alpha: 0.16 });

    const clouds = [
        { width: 0.72, height: 0.04, y: 0.22, offset: -0.18 },
        { width: 0.58, height: 0.035, y: 0.32, offset: 0.12 },
        { width: 0.66, height: 0.038, y: 0.4, offset: -0.05 },
        { width: 0.54, height: 0.03, y: 0.48, offset: 0.18 },
    ] as const;

    for (const cloud of clouds) {
        const bandWidth = dimensions.width * cloud.width;
        const bandHeight = dimensions.height * cloud.height;
        const bandY = dimensions.height * cloud.y;
        const bandX = (dimensions.width - bandWidth) / 2 + dimensions.width * cloud.offset * 0.25;

        overlay.roundRect(bandX, bandY, bandWidth, bandHeight, bandHeight * 0.45);
        overlay.fill({ color: 0xffffff, alpha: 0.1 });
    }

    overlay.circle(dimensions.width * 0.5, dimensions.height * 0.62, dimensions.width * 0.55);
    overlay.fill({ color: 0xffffff, alpha: 0.08 });
    overlay.blendMode = 'add';

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
