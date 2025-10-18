import { Container, Graphics } from 'pixi.js';

const clamp = (value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
};

const lerp = (start: number, end: number, alpha: number): number => {
    return start + (end - start) * alpha;
};

export interface DynamicLightOptions {
    readonly color?: number;
    readonly minRadius?: number;
    readonly maxRadius?: number;
    readonly baseRadius?: number;
    readonly minIntensity?: number;
    readonly maxIntensity?: number;
    readonly speedForMaxIntensity?: number;
    readonly radiusLerpSpeed?: number;
    readonly intensityLerpSpeed?: number;
    readonly flashIntensity?: number;
    readonly flashDuration?: number;
    readonly gradientSteps?: number;
}

export interface DynamicLightUpdate {
    readonly position: { readonly x: number; readonly y: number };
    readonly speed: number;
    readonly deltaSeconds: number;
}

export interface DynamicLight {
    readonly container: Container;
    update(payload: DynamicLightUpdate): void;
    flash(intensityBoost?: number): void;
    destroy(): void;
}

const DEFAULT_COLOR = 0xfff0b3;
const DEFAULT_MIN_RADIUS = 100;
const DEFAULT_MAX_RADIUS = 220;
const DEFAULT_MIN_INTENSITY = 0.25;
const DEFAULT_MAX_INTENSITY = 0.85;
const DEFAULT_SPEED_FOR_MAX = 14;
const DEFAULT_RADIUS_LERP = 8;
const DEFAULT_INTENSITY_LERP = 6;
const DEFAULT_FLASH_INTENSITY = 0.35;
const DEFAULT_FLASH_DURATION = 0.25;
const DEFAULT_GRADIENT_STEPS = 4;

export const createDynamicLight = (options: DynamicLightOptions = {}): DynamicLight => {
    const color = options.color ?? DEFAULT_COLOR;
    const configuredMinRadius = options.minRadius ?? DEFAULT_MIN_RADIUS;
    const configuredMaxRadius = options.maxRadius ?? DEFAULT_MAX_RADIUS;
    const baseRadius = Math.max(1, options.baseRadius ?? configuredMaxRadius);
    const minRadius = Math.max(1, Math.min(configuredMinRadius, configuredMaxRadius));
    const maxRadius = Math.max(minRadius, Math.max(configuredMinRadius, configuredMaxRadius));
    const minIntensity = clamp(options.minIntensity ?? DEFAULT_MIN_INTENSITY, 0, 1);
    const maxIntensity = clamp(options.maxIntensity ?? DEFAULT_MAX_INTENSITY, minIntensity, 1);
    const speedForMaxIntensity = Math.max(0.01, options.speedForMaxIntensity ?? DEFAULT_SPEED_FOR_MAX);
    const radiusLerpSpeed = Math.max(0.1, options.radiusLerpSpeed ?? DEFAULT_RADIUS_LERP);
    const intensityLerpSpeed = Math.max(0.1, options.intensityLerpSpeed ?? DEFAULT_INTENSITY_LERP);
    const baseFlashIntensity = Math.max(0, options.flashIntensity ?? DEFAULT_FLASH_INTENSITY);
    const flashDuration = Math.max(0.05, options.flashDuration ?? DEFAULT_FLASH_DURATION);
    const gradientSteps = Math.max(1, Math.floor(options.gradientSteps ?? DEFAULT_GRADIENT_STEPS));

    const root = new Container();
    root.position.set(0, 0);
    root.sortableChildren = false;
    root.eventMode = 'none';

    const light = new Graphics();
    light.eventMode = 'none';
    light.alpha = minIntensity;

    for (let step = gradientSteps; step >= 1; step -= 1) {
        const radiusFactor = step / gradientSteps;
        const radius = baseRadius * radiusFactor;
        const alpha = clamp(radiusFactor ** 2, 0.05, 1);
        light.circle(0, 0, radius);
        light.fill({ color, alpha });
    }

    const initialScale = minRadius / baseRadius;
    light.scale.set(initialScale, initialScale);

    root.addChild(light);

    let currentRadius = minRadius;
    let currentIntensity = minIntensity;
    let flashTimer = 0;
    let flashOverride: number | null = null;
    let destroyed = false;

    const update = (payload: DynamicLightUpdate): void => {
        if (destroyed) {
            return;
        }

        const { position, speed } = payload;
        const deltaSeconds = Math.max(0, payload.deltaSeconds);

        root.position.x = position.x;
        root.position.y = position.y;

        const speedFactor = clamp(speed / speedForMaxIntensity, 0, 1);
        const targetRadius = lerp(minRadius, maxRadius, speedFactor);
        const radiusLerp = clamp(deltaSeconds * radiusLerpSpeed, 0, 1);
        currentRadius = lerp(currentRadius, targetRadius, radiusLerp);

        if (flashTimer > 0) {
            flashTimer = Math.max(0, flashTimer - deltaSeconds);
            if (flashTimer === 0) {
                flashOverride = null;
            }
        }

        const baseIntensity = lerp(minIntensity, maxIntensity, speedFactor);
        const activeFlashIntensity = flashOverride ?? baseFlashIntensity;
        const flashFactor = flashTimer > 0 ? flashTimer / flashDuration : 0;
        const flashContribution = activeFlashIntensity * flashFactor;
        const targetIntensity = clamp(baseIntensity + flashContribution, minIntensity, maxIntensity + activeFlashIntensity);
        const intensityLerp = clamp(deltaSeconds * intensityLerpSpeed, 0, 1);
        currentIntensity = lerp(currentIntensity, targetIntensity, intensityLerp);

        const scale = clamp(currentRadius / baseRadius, 0.01, 50);
        light.scale.set(scale, scale);
        light.alpha = clamp(currentIntensity, 0, 1);
    };

    const flash = (intensityBoost?: number): void => {
        if (destroyed) {
            return;
        }

        flashTimer = flashDuration;
        flashOverride = typeof intensityBoost === 'number' ? Math.max(0, intensityBoost) : null;
    };

    const destroy = (): void => {
        if (destroyed) {
            return;
        }
        destroyed = true;
        light.destroy();
        root.destroy({ children: true });
    };

    return {
        container: root,
        update,
        flash,
        destroy,
    } satisfies DynamicLight;
};
