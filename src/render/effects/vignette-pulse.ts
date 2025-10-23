import { Container, Graphics } from 'pixi.js';

const clampUnit = (value: number): number => {
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

export interface VignetteDimensions {
    readonly width: number;
    readonly height: number;
}

export interface VignettePulseOptions extends VignetteDimensions {
    readonly color?: number;
    readonly maxAlpha?: number;
    readonly decayPerSecond?: number;
    readonly baseAlpha?: number;
    readonly layerCount?: number;
}

export interface VignettePulse {
    readonly container: Container;
    pulse(intensity?: number): void;
    update(deltaSeconds: number): void;
    resize(dimensions: VignetteDimensions): void;
    setColor(color: number): void;
    destroy(): void;
}

const DEFAULT_COLOR = 0x02060f;
const DEFAULT_MAX_ALPHA = 0.6;
const DEFAULT_BASE_ALPHA = 0.25;
const DEFAULT_DECAY_PER_SECOND = 2.4;
const DEFAULT_LAYER_COUNT = 4;

const drawVignette = (
    target: Graphics,
    dimensions: VignetteDimensions,
    color: number,
    layers: number,
    baseAlpha: number,
) => {
    target.clear();
    const { width, height } = dimensions;
    const layerThicknessX = (width * 0.18) / layers;
    const layerThicknessY = (height * 0.22) / layers;

    for (let index = 0; index < layers; index += 1) {
        const falloff = 1 - index / layers;
        const alpha = baseAlpha * (falloff ** 1.4);
        const insetX = index * layerThicknessX;
        const insetY = index * layerThicknessY;
        const innerWidth = Math.max(0, width - insetX * 2);
        const innerHeight = Math.max(0, height - insetY * 2);

        // Top band
        if (innerWidth > 0) {
            target.rect(insetX, insetY, innerWidth, layerThicknessY);
            target.fill({ color, alpha });
            // Bottom band
            target.rect(insetX, height - insetY - layerThicknessY, innerWidth, layerThicknessY);
            target.fill({ color, alpha });
        }

        const verticalHeight = Math.max(0, innerHeight - layerThicknessY * 2);
        if (verticalHeight > 0) {
            // Left band
            target.rect(insetX, insetY + layerThicknessY, layerThicknessX, verticalHeight);
            target.fill({ color, alpha: alpha * 0.9 });
            // Right band
            target.rect(width - insetX - layerThicknessX, insetY + layerThicknessY, layerThicknessX, verticalHeight);
            target.fill({ color, alpha: alpha * 0.9 });
        }
    }

    target.blendMode = 'multiply';
};

export const createVignettePulse = (options: VignettePulseOptions): VignettePulse => {
    const maxAlpha = clampUnit(options.maxAlpha ?? DEFAULT_MAX_ALPHA);
    const baseAlpha = clampUnit(options.baseAlpha ?? DEFAULT_BASE_ALPHA);
    const decayPerSecond = Math.max(0.1, options.decayPerSecond ?? DEFAULT_DECAY_PER_SECOND);
    const layerCount = Math.max(1, Math.floor(options.layerCount ?? DEFAULT_LAYER_COUNT));

    let dimensions: VignetteDimensions = {
        width: Math.max(1, options.width),
        height: Math.max(1, options.height),
    } satisfies VignetteDimensions;
    let color = options.color ?? DEFAULT_COLOR;
    let currentAlpha = 0;

    const container = new Container();
    container.eventMode = 'none';
    container.visible = false;
    container.alpha = 0;

    const overlay = new Graphics();
    overlay.eventMode = 'none';
    container.addChild(overlay);

    const redraw = () => {
        drawVignette(overlay, dimensions, color, layerCount, baseAlpha);
    };

    redraw();

    const applyAlpha = () => {
        container.alpha = currentAlpha;
        container.visible = currentAlpha > 0.005;
    };

    const pulse: VignettePulse['pulse'] = (intensity = 1) => {
        const clamped = clampUnit(intensity);
        const target = Math.max(currentAlpha, Math.min(maxAlpha, baseAlpha + clamped * (maxAlpha - baseAlpha)));
        currentAlpha = target;
        applyAlpha();
    };

    const update: VignettePulse['update'] = (deltaSeconds) => {
        if (currentAlpha <= 0) {
            return;
        }
        const safeDelta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
        if (safeDelta === 0) {
            return;
        }
        currentAlpha = Math.max(0, currentAlpha - decayPerSecond * safeDelta);
        applyAlpha();
    };

    const resize: VignettePulse['resize'] = (nextDimensions) => {
        const width = Math.max(1, nextDimensions.width);
        const height = Math.max(1, nextDimensions.height);
        if (width === dimensions.width && height === dimensions.height) {
            return;
        }
        dimensions = { width, height } satisfies VignetteDimensions;
        redraw();
    };

    const setColor: VignettePulse['setColor'] = (nextColor) => {
        if (nextColor === color) {
            return;
        }
        color = nextColor;
        redraw();
    };

    const destroy: VignettePulse['destroy'] = () => {
        overlay.destroy();
        container.destroy({ children: true });
    };

    return {
        container,
        pulse,
        update,
        resize,
        setColor,
        destroy,
    } satisfies VignettePulse;
};
