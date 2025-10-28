import { Container, Graphics } from 'pixi.js';
import { clamp, clampUnit } from 'util/math';

export interface SpeedRingPalette {
    readonly ringColor: number;
    readonly haloColor?: number;
}

export interface SpeedRingOptions {
    readonly minRadius?: number;
    readonly maxRadius?: number;
    readonly haloRadiusOffset?: number;
    readonly ringThickness?: number;
    readonly minAlpha?: number;
    readonly maxAlpha?: number;
    readonly activationSpeedMultiplier?: number;
    readonly radiusLerpSpeed?: number;
    readonly alphaLerpSpeed?: number;
    readonly palette?: SpeedRingPalette;
}

export interface SpeedRingUpdate {
    readonly position: { readonly x: number; readonly y: number };
    readonly speed: number;
    readonly baseSpeed: number;
    readonly maxSpeed: number;
    readonly deltaSeconds: number;
}

export interface SpeedRingHandle {
    readonly container: Container;
    update(payload: SpeedRingUpdate): void;
    setPalette(palette: SpeedRingPalette): void;
    reset(): void;
    destroy(): void;
}

const DEFAULT_MIN_RADIUS = 14;
const DEFAULT_MAX_RADIUS = 30;
const DEFAULT_HALO_OFFSET = 10;
const DEFAULT_RING_THICKNESS = 3;
const DEFAULT_MIN_ALPHA = 0;
const DEFAULT_MAX_ALPHA = 0.65;
const DEFAULT_ACTIVATION_MULTIPLIER = 0.6;
const DEFAULT_RADIUS_LERP = 10;
const DEFAULT_ALPHA_LERP = 12;

export const createSpeedRing = (options: SpeedRingOptions = {}): SpeedRingHandle => {
    const minRadius = Math.max(1, options.minRadius ?? DEFAULT_MIN_RADIUS);
    const maxRadius = Math.max(minRadius, options.maxRadius ?? DEFAULT_MAX_RADIUS);
    const haloRadiusOffset = Math.max(0, options.haloRadiusOffset ?? DEFAULT_HALO_OFFSET);
    const ringThickness = Math.max(0.5, options.ringThickness ?? DEFAULT_RING_THICKNESS);
    const minAlpha = clampUnit(options.minAlpha ?? DEFAULT_MIN_ALPHA);
    const maxAlpha = clampUnit(Math.max(minAlpha, options.maxAlpha ?? DEFAULT_MAX_ALPHA));
    const activationSpeedMultiplier = clampUnit(options.activationSpeedMultiplier ?? DEFAULT_ACTIVATION_MULTIPLIER);
    const radiusLerpSpeed = Math.max(0.1, options.radiusLerpSpeed ?? DEFAULT_RADIUS_LERP);
    const alphaLerpSpeed = Math.max(0.1, options.alphaLerpSpeed ?? DEFAULT_ALPHA_LERP);

    const root = new Container();
    root.eventMode = 'none';
    root.visible = false;

    const halo = new Graphics();
    halo.eventMode = 'none';
    halo.blendMode = 'add';

    const ring = new Graphics();
    ring.eventMode = 'none';

    root.addChild(halo);
    root.addChild(ring);

    let palette: SpeedRingPalette = {
        ringColor: options.palette?.ringColor ?? 0xffffff,
        haloColor: options.palette?.haloColor ?? options.palette?.ringColor ?? 0xffffff,
    };

    let currentRadius = minRadius;
    let currentAlpha = 0;
    let lastIntensity = 0;
    let destroyed = false;

    const redraw = () => {
        if (destroyed) {
            return;
        }
        halo.clear();
        ring.clear();

        if (currentAlpha <= 0.001) {
            return;
        }

        const haloBase = palette.haloColor ?? palette.ringColor;
        const haloAlpha = clampUnit(currentAlpha * 0.55 + lastIntensity * 0.2);
        const haloRadius = currentRadius + haloRadiusOffset;

        halo.circle(0, 0, haloRadius);
        halo.fill({ color: haloBase, alpha: haloAlpha });

        const ringAlpha = clamp(currentAlpha, minAlpha, 1);
        ring.circle(0, 0, currentRadius);
        ring.stroke({ color: palette.ringColor, width: ringThickness, alpha: ringAlpha });
    };

    const reset = (): void => {
        if (destroyed) {
            return;
        }
        currentRadius = minRadius;
        currentAlpha = 0;
        lastIntensity = 0;
        root.visible = false;
        redraw();
    };

    const update: SpeedRingHandle['update'] = ({ position, speed, baseSpeed, maxSpeed, deltaSeconds }) => {
        if (destroyed) {
            return;
        }

        const safeDelta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
        root.position.set(position.x, position.y);

        const effectiveMax = Math.max(0, Number.isFinite(maxSpeed) ? maxSpeed : 0);
        const effectiveBase = clamp(Math.max(0, Number.isFinite(baseSpeed) ? baseSpeed : 0), 0, effectiveMax);
        const activationThreshold = clamp(effectiveBase * activationSpeedMultiplier, 0, effectiveMax);
        const range = Math.max(0.01, effectiveMax - activationThreshold);
        const clampedSpeed = Math.max(0, Number.isFinite(speed) ? speed : 0);
        const normalized = clampUnit((clampedSpeed - activationThreshold) / range);
        lastIntensity = normalized;

        const easedRadiusFactor = normalized ** 0.6;
        const targetRadius = minRadius + (maxRadius - minRadius) * easedRadiusFactor;
        const targetAlpha = normalized <= 0 ? 0 : minAlpha + (maxAlpha - minAlpha) * normalized;

        const radiusLerp = safeDelta > 0 ? clampUnit(safeDelta * radiusLerpSpeed) : 1;
        const alphaLerp = safeDelta > 0 ? clampUnit(safeDelta * alphaLerpSpeed) : 1;

        currentRadius = currentRadius + (targetRadius - currentRadius) * radiusLerp;
        currentAlpha = currentAlpha + (targetAlpha - currentAlpha) * alphaLerp;

        redraw();

        const visible = currentAlpha > 0.02 && normalized > 0.01;
        root.visible = visible;
    };

    const setPalette: SpeedRingHandle['setPalette'] = (nextPalette) => {
        if (destroyed) {
            return;
        }

        palette = {
            ringColor: nextPalette.ringColor,
            haloColor: nextPalette.haloColor ?? nextPalette.ringColor,
        };
        redraw();
    };

    const destroy = (): void => {
        if (destroyed) {
            return;
        }
        destroyed = true;
        halo.destroy();
        ring.destroy();
        root.destroy({ children: true });
    };

    reset();

    return {
        container: root,
        update,
        setPalette,
        reset,
        destroy,
    } satisfies SpeedRingHandle;
};
