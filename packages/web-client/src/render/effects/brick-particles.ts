import { Container, Sprite, Texture } from 'pixi.js';
import { clampUnit, lerp } from 'util/math';

const DEFAULT_BURST_COUNT = 36;
const DEFAULT_MAX_PARTICLES = 96;
const DEFAULT_GRAVITY = 1100;
const DEFAULT_LIFETIME = { min: 0.28, max: 0.55 } as const;
const DEFAULT_SPEED = { min: 190, max: 420 } as const;
const DEFAULT_SCALE = { min: 0.8, max: 1.85 } as const;
const DEFAULT_SPIN = { min: -8, max: 8 } as const;
const CHROMATIC_OFFSET_SCALE = 6; // Pixel offset for chromatic separation

interface Particle {
    sprite: Sprite;
    vx: number;
    vy: number;
    angularVelocity: number;
    lifetime: number;
    age: number;
    startScale: number;
    endScale: number;
    startAlpha: number;
    endAlpha: number;
    chromaticChannel?: 'red' | 'green' | 'blue';
    chromaticOffsetAngle?: number;
}

export interface BrickBurstEmitPayload {
    readonly position: { readonly x: number; readonly y: number };
    readonly baseColor: number;
    readonly intensity?: number;
    readonly impactSpeed?: number;
    readonly chromaticColors?: readonly [number, number, number]; // [red, green, blue] for chromatic effect
    readonly isBreak?: boolean; // true for brick destruction, false/undefined for hits
}

export interface BrickParticleSystemOptions {
    readonly maxParticles?: number;
    readonly gravity?: number;
    readonly baseBurstCount?: number;
    readonly texture?: Texture;
    readonly random?: () => number;
}

export interface BrickParticleSystem {
    readonly container: Container;
    emit(payload: BrickBurstEmitPayload): void;
    update(deltaSeconds: number): void;
    reset(): void;
    setBudget(options: { readonly maxParticles?: number; readonly baseBurstCount?: number }): void;
    destroy(): void;
}

const pick = (min: number, max: number, random: () => number): number => {
    if (min >= max) {
        return min;
    }
    const t = clampUnit(random());
    return lerp(min, max, t);
};

export const createBrickParticleSystem = (options: BrickParticleSystemOptions = {}): BrickParticleSystem => {
    let maxParticles = Math.max(1, Math.floor(options.maxParticles ?? DEFAULT_MAX_PARTICLES));
    const gravity = Math.max(0, options.gravity ?? DEFAULT_GRAVITY);
    let baseBurstCount = Math.max(4, Math.floor(options.baseBurstCount ?? DEFAULT_BURST_COUNT));
    const texture = options.texture ?? Texture.WHITE;
    const random = options.random ?? Math.random;

    const root = new Container();
    root.eventMode = 'none';
    root.sortableChildren = false;
    root.visible = false;

    const active: Particle[] = [];
    const pool: Particle[] = [];

    const acquireParticle = (): Particle => {
        if (pool.length > 0) {
            return pool.pop()!;
        }
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.eventMode = 'none';
        sprite.visible = false;
        sprite.alpha = 0;
        sprite.blendMode = 'normal';
        root.addChild(sprite);
        return {
            sprite,
            vx: 0,
            vy: 0,
            angularVelocity: 0,
            lifetime: 0.5,
            age: 0,
            startScale: 1,
            endScale: 0.4,
            startAlpha: 1,
            endAlpha: 0,
        } satisfies Particle;
    };

    const releaseParticle = (particle: Particle) => {
        particle.sprite.visible = false;
        particle.sprite.alpha = 0;
        particle.age = 0;
        pool.push(particle);
    };

    const emit: BrickParticleSystem['emit'] = ({ position, baseColor, intensity = 0.5, impactSpeed, chromaticColors, isBreak = false }) => {
        const normalizedIntensity = clampUnit(intensity);
        const energyFactor = clampUnit((impactSpeed ?? 0) / 18);
        const totalIntensity = clampUnit(normalizedIntensity * 0.75 + energyFactor * 0.6);
        const available = maxParticles - active.length;
        if (available <= 0) {
            return;
        }

        // Increase particle count for brick breaks vs hits
        const burstMultiplier = isBreak ? 2.2 : 1.2;
        const burstCount = Math.max(2, Math.min(available, Math.round(baseBurstCount * burstMultiplier + totalIntensity * 9)));

        // Enable chromatic separation if colors are provided
        const useChromaticEffect = chromaticColors?.length === 3;
        const channels: ('red' | 'green' | 'blue')[] = ['red', 'green', 'blue'];

        for (let index = 0; index < burstCount; index += 1) {
            const particle = acquireParticle();
            const angle = pick(0, Math.PI * 2, random);
            const speedMultiplier = isBreak ? 1.35 : 1.0; // Keep hits energetic with larger bursts
            const speed = pick(DEFAULT_SPEED.min, DEFAULT_SPEED.max, random) * (0.45 + totalIntensity * 0.9) * speedMultiplier;
            const scaleMultiplier = isBreak ? 1.7 : 1.35; // Larger sprites across both hit and break effects
            const scale = pick(DEFAULT_SCALE.min, DEFAULT_SCALE.max, random) * scaleMultiplier;
            const shrink = pick(0.2, 0.55, random);
            const spin = pick(DEFAULT_SPIN.min, DEFAULT_SPIN.max, random);
            const lifetimeMultiplier = isBreak ? 1.3 : 0.85; // Shorter-lived particles for hits
            const lifetime = pick(DEFAULT_LIFETIME.min, DEFAULT_LIFETIME.max, random) * lifetimeMultiplier;

            // Assign chromatic channel if using chromatic effect
            let particleColor = baseColor;
            let chromaticOffsetAngle: number | undefined;
            let chromaticChannel: 'red' | 'green' | 'blue' | undefined;

            if (useChromaticEffect && chromaticColors) {
                // Distribute particles across RGB channels
                const channelIndex = index % 3;
                chromaticChannel = channels[channelIndex];
                particleColor = chromaticColors[channelIndex];
                // Rotating offset angle for chromatic separation (varies per particle for visual diversity)
                chromaticOffsetAngle = angle + (channelIndex * Math.PI * 0.666);
                particle.sprite.blendMode = 'add'; // Additive blending for chromatic effect
            } else {
                particle.sprite.blendMode = 'normal';
            }

            particle.sprite.position.set(position.x, position.y);
            particle.sprite.tint = particleColor;
            particle.sprite.scale.set(scale);
            particle.sprite.rotation = pick(0, Math.PI * 2, random);
            particle.sprite.visible = true;

            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed * 0.75;
            particle.angularVelocity = spin;
            particle.lifetime = lifetime;
            particle.startScale = scale;
            particle.endScale = Math.max(0.1, scale * shrink * 0.6);
            particle.startAlpha = useChromaticEffect ? 0.7 + totalIntensity * 0.15 : 0.85 + totalIntensity * 0.1;
            particle.endAlpha = 0;
            particle.age = 0;
            particle.chromaticChannel = chromaticChannel;
            particle.chromaticOffsetAngle = chromaticOffsetAngle;

            active.push(particle);
        }

        root.visible = active.length > 0;
    };

    const update: BrickParticleSystem['update'] = (deltaSeconds) => {
        if (!root.visible || active.length === 0) {
            return;
        }

        const safeDelta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
        if (safeDelta === 0) {
            return;
        }

        for (let index = active.length - 1; index >= 0; index -= 1) {
            const particle = active[index];
            particle.age += safeDelta;
            const progress = clampUnit(particle.age / particle.lifetime);
            if (progress >= 1) {
                active.splice(index, 1);
                releaseParticle(particle);
                continue;
            }

            const eased = progress ** 1.45;
            const sprite = particle.sprite;

            // Apply chromatic offset if this particle has chromatic data
            let offsetX = 0;
            let offsetY = 0;
            if (particle.chromaticChannel !== undefined && particle.chromaticOffsetAngle !== undefined) {
                // Chromatic offset decreases as particle ages (separation effect diminishes)
                const offsetMagnitude = CHROMATIC_OFFSET_SCALE * (1 - progress * 0.7) * particle.startScale;
                const channelOffset = particle.chromaticChannel === 'red' ? 0 : particle.chromaticChannel === 'green' ? 0.5 : 1.0;
                const offsetAngle = particle.chromaticOffsetAngle + channelOffset * Math.PI * 0.25;
                offsetX = Math.cos(offsetAngle) * offsetMagnitude;
                offsetY = Math.sin(offsetAngle) * offsetMagnitude;
            }

            sprite.x += particle.vx * safeDelta + offsetX;
            sprite.y += particle.vy * safeDelta + offsetY;
            particle.vy += gravity * safeDelta;
            sprite.rotation += particle.angularVelocity * safeDelta;
            const nextScale = lerp(particle.startScale, particle.endScale, eased);
            sprite.scale.set(nextScale, nextScale);
            sprite.alpha = lerp(particle.startAlpha, particle.endAlpha, eased);
        }

        root.visible = active.length > 0;
    };

    const reset: BrickParticleSystem['reset'] = () => {
        while (active.length > 0) {
            const particle = active.pop();
            if (!particle) {
                continue;
            }
            releaseParticle(particle);
        }
        root.visible = false;
    };

    const setBudget: BrickParticleSystem['setBudget'] = ({ maxParticles: nextMax, baseBurstCount: nextBurst }) => {
        if (nextMax !== undefined) {
            const candidate = Math.max(1, Math.floor(nextMax));
            maxParticles = Number.isFinite(candidate) ? candidate : maxParticles;
            if (active.length > maxParticles) {
                const overflow = active.splice(maxParticles);
                overflow.forEach((particle) => {
                    releaseParticle(particle);
                });
            }
        }
        if (nextBurst !== undefined) {
            const candidate = Math.max(2, Math.floor(nextBurst));
            baseBurstCount = Number.isFinite(candidate) ? candidate : baseBurstCount;
        }
    };

    const destroy: BrickParticleSystem['destroy'] = () => {
        reset();
        root.destroy({ children: true });
        pool.length = 0;
    };

    return {
        container: root,
        emit,
        update,
        reset,
        setBudget,
        destroy,
    } satisfies BrickParticleSystem;
};
