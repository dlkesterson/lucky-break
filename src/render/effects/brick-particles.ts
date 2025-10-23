import { Container, Sprite, Texture } from 'pixi.js';

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

const DEFAULT_BURST_COUNT = 12;
const DEFAULT_MAX_PARTICLES = 24;
const DEFAULT_GRAVITY = 1100;
const DEFAULT_LIFETIME = { min: 0.28, max: 0.55 } as const;
const DEFAULT_SPEED = { min: 190, max: 420 } as const;
const DEFAULT_SCALE = { min: 0.55, max: 1.25 } as const;
const DEFAULT_SPIN = { min: -8, max: 8 } as const;

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
}

export interface BrickBurstEmitPayload {
    readonly position: { readonly x: number; readonly y: number };
    readonly baseColor: number;
    readonly intensity?: number;
    readonly impactSpeed?: number;
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
    destroy(): void;
}

const lerp = (start: number, end: number, alpha: number): number => start + (end - start) * alpha;
const pick = (min: number, max: number, random: () => number): number => {
    if (min >= max) {
        return min;
    }
    const t = clampUnit(random());
    return lerp(min, max, t);
};

export const createBrickParticleSystem = (options: BrickParticleSystemOptions = {}): BrickParticleSystem => {
    const maxParticles = Math.max(1, Math.floor(options.maxParticles ?? DEFAULT_MAX_PARTICLES));
    const gravity = Math.max(0, options.gravity ?? DEFAULT_GRAVITY);
    const baseBurstCount = Math.max(4, Math.floor(options.baseBurstCount ?? DEFAULT_BURST_COUNT));
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

    const emit: BrickParticleSystem['emit'] = ({ position, baseColor, intensity = 0.5, impactSpeed }) => {
        const normalizedIntensity = clampUnit(intensity);
        const energyFactor = clampUnit((impactSpeed ?? 0) / 18);
        const totalIntensity = clampUnit(normalizedIntensity * 0.75 + energyFactor * 0.6);
        const available = maxParticles - active.length;
        if (available <= 0) {
            return;
        }

        const burstCount = Math.max(2, Math.min(available, Math.round(baseBurstCount + totalIntensity * 9)));

        for (let index = 0; index < burstCount; index += 1) {
            const particle = acquireParticle();
            const angle = pick(0, Math.PI * 2, random);
            const speed = pick(DEFAULT_SPEED.min, DEFAULT_SPEED.max, random) * (0.45 + totalIntensity * 0.9);
            const scale = pick(DEFAULT_SCALE.min, DEFAULT_SCALE.max, random);
            const shrink = pick(0.2, 0.55, random);
            const spin = pick(DEFAULT_SPIN.min, DEFAULT_SPIN.max, random);
            const lifetime = pick(DEFAULT_LIFETIME.min, DEFAULT_LIFETIME.max, random);

            particle.sprite.position.set(position.x, position.y);
            particle.sprite.tint = baseColor;
            particle.sprite.scale.set(scale);
            particle.sprite.rotation = pick(0, Math.PI * 2, random);
            particle.sprite.visible = true;

            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed * 0.75;
            particle.angularVelocity = spin;
            particle.lifetime = lifetime;
            particle.startScale = scale;
            particle.endScale = Math.max(0.1, scale * shrink * 0.6);
            particle.startAlpha = 0.85 + totalIntensity * 0.1;
            particle.endAlpha = 0;
            particle.age = 0;

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
            sprite.x += particle.vx * safeDelta;
            sprite.y += particle.vy * safeDelta;
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
        destroy,
    } satisfies BrickParticleSystem;
};
