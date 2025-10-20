import type { RandomSource } from './random';

/**
 * Power-Up System
 *
 * Adapted from Banana Music Game's power-up mechanics
 * Spawns temporary power-ups on brick breaks with visual and gameplay effects
 */

export type PowerUpType = 'paddle-width' | 'ball-speed' | 'multi-ball' | 'sticky-paddle';

export interface PowerUpEffect {
    /** Type of power-up */
    readonly type: PowerUpType;
    /** Duration in seconds */
    readonly duration: number;
    /** Remaining time (updated each frame) */
    remainingTime: number;
    /** Start timestamp */
    readonly startTime: number;
}

export interface PowerUpConfig {
    /** Probability of spawning power-up on brick break (0-1) */
    readonly spawnChance?: number;
    /** Default duration for power-ups in seconds */
    readonly defaultDuration?: number;
    /** Paddle width multiplier for paddle-width power-up */
    readonly paddleWidthMultiplier?: number;
    /** Ball speed multiplier for ball-speed power-up */
    readonly ballSpeedMultiplier?: number;
}

const DEFAULT_SPAWN_CHANCE = 0.25; // 25% chance
const DEFAULT_DURATION = 2.5; // seconds
const DEFAULT_PADDLE_WIDTH_MULTIPLIER = 1.5;
const DEFAULT_BALL_SPEED_MULTIPLIER = 1.3;

/**
 * Determine if power-up should spawn
 *
 * @param config - Power-up configuration
 * @returns True if power-up should spawn
 */
export function shouldSpawnPowerUp(config: PowerUpConfig = {}, rng: RandomSource = Math.random): boolean {
    const chance = config.spawnChance ?? DEFAULT_SPAWN_CHANCE;
    return rng() < chance;
}

/**
 * Select random power-up type
 *
 * @returns Random power-up type
 */
export function selectRandomPowerUpType(rng: RandomSource = Math.random): PowerUpType {
    const types: PowerUpType[] = ['paddle-width', 'ball-speed', 'multi-ball', 'sticky-paddle'];
    return types[Math.floor(rng() * types.length)];
}

/**
 * Create a new power-up effect
 *
 * @param type - Type of power-up
 * @param config - Power-up configuration
 * @param now - Current timestamp (defaults to Date.now)
 * @returns New power-up effect
 */
export function createPowerUpEffect(
    type: PowerUpType,
    config: PowerUpConfig = {},
    now: () => number = Date.now,
): PowerUpEffect {
    const duration = config.defaultDuration ?? DEFAULT_DURATION;
    const startTime = now();

    return {
        type,
        duration,
        remainingTime: duration,
        startTime,
    };
}

/**
 * Update power-up effect timer
 *
 * @param effect - Power-up effect to update (mutates in place)
 * @param deltaSeconds - Time elapsed since last update
 * @returns True if effect is still active, false if expired
 */
export function updatePowerUpEffect(effect: PowerUpEffect, deltaSeconds: number): boolean {
    effect.remainingTime = Math.max(0, effect.remainingTime - deltaSeconds);
    return effect.remainingTime > 0;
}

/**
 * Check if power-up is in fade-out period (last 25% of duration)
 *
 * @param effect - Power-up effect
 * @returns True if in fade-out period
 */
export function isPowerUpFadingOut(effect: PowerUpEffect): boolean {
    const fadeThreshold = effect.duration * 0.25;
    return effect.remainingTime > 0 && effect.remainingTime <= fadeThreshold;
}

/**
 * Get power-up intensity factor (1.0 at start, fades to 0 during fade-out)
 *
 * @param effect - Power-up effect
 * @returns Intensity factor (0-1)
 */
export function getPowerUpIntensity(effect: PowerUpEffect): number {
    if (effect.remainingTime <= 0) {
        return 0;
    }

    const fadeThreshold = effect.duration * 0.25;
    if (effect.remainingTime <= fadeThreshold) {
        // Fade from 1 to 0 during last 25%
        return effect.remainingTime / fadeThreshold;
    }

    return 1;
}

/**
 * Calculate paddle width scale based on active power-up
 *
 * @param effect - Power-up effect (or null if none active)
 * @param config - Power-up configuration
 * @returns Scale multiplier (1.0 = normal, >1.0 = wider)
 */
export function calculatePaddleWidthScale(effect: PowerUpEffect | null, config: PowerUpConfig = {}): number {
    const activeEffect = effect;
    if (activeEffect?.type !== 'paddle-width') {
        return 1.0;
    }
    if (activeEffect.remainingTime <= 0) {
        return 1.0;
    }

    const maxMultiplier = config.paddleWidthMultiplier ?? DEFAULT_PADDLE_WIDTH_MULTIPLIER;
    const intensity = getPowerUpIntensity(activeEffect);

    // Lerp from 1.0 to maxMultiplier based on intensity
    return 1.0 + (maxMultiplier - 1.0) * intensity;
}

/**
 * Calculate ball speed scale based on active power-up
 *
 * @param effect - Power-up effect (or null if none active)
 * @param config - Power-up configuration
 * @returns Scale multiplier (1.0 = normal, >1.0 = faster)
 */
export function calculateBallSpeedScale(effect: PowerUpEffect | null, config: PowerUpConfig = {}): number {
    const activeEffect = effect;
    if (activeEffect?.type !== 'ball-speed') {
        return 1.0;
    }
    if (activeEffect.remainingTime <= 0) {
        return 1.0;
    }

    const maxMultiplier = config.ballSpeedMultiplier ?? DEFAULT_BALL_SPEED_MULTIPLIER;
    const intensity = getPowerUpIntensity(activeEffect);

    return 1.0 + (maxMultiplier - 1.0) * intensity;
}

/**
 * Power-up manager to track multiple active effects
 */
export class PowerUpManager {
    private effects: Map<PowerUpType, PowerUpEffect> = new Map<PowerUpType, PowerUpEffect>();

    /**
     * Activate a power-up (replaces existing effect of same type)
     *
     * @param type - Power-up type
     * @param config - Power-up configuration
     * @param now - Current timestamp function
     */
    activate(type: PowerUpType, config: PowerUpConfig = {}, now: () => number = Date.now): void {
        const existing = this.effects.get(type);
        const additionalDuration = config.defaultDuration ?? DEFAULT_DURATION;

        if (existing && existing.remainingTime > 0) {
            const extendedDuration = existing.remainingTime + additionalDuration;
            this.effects.set(type, {
                type,
                duration: extendedDuration,
                remainingTime: extendedDuration,
                startTime: now(),
            });
            return;
        }

        const effect = createPowerUpEffect(type, config, now);
        this.effects.set(type, effect);
    }

    /**
     * Update all active power-ups
     *
     * @param deltaSeconds - Time elapsed since last update
     */
    update(deltaSeconds: number): void {
        for (const [type, effect] of this.effects) {
            if (!updatePowerUpEffect(effect, deltaSeconds)) {
                this.effects.delete(type);
            }
        }
    }

    /**
     * Get active effect of specific type
     *
     * @param type - Power-up type
     * @returns Active effect or null
     */
    getEffect(type: PowerUpType): PowerUpEffect | null {
        return this.effects.get(type) ?? null;
    }

    /**
     * Check if power-up is active
     *
     * @param type - Power-up type
     * @returns True if active
     */
    isActive(type: PowerUpType): boolean {
        return (this.effects.get(type)?.remainingTime ?? 0) > 0;
    }

    /**
     * Clear all active power-ups
     */
    clearAll(): void {
        this.effects.clear();
    }

    /**
     * Get all active effects
     */
    getActiveEffects(): PowerUpEffect[] {
        return Array.from(this.effects.values());
    }
}
