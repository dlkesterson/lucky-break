/**
 * Speed Regulation Utilities
 *
 * Adapted from Cloud Popper's speed regulation system
 * Prevents ball from getting too slow (boring) or too fast (unplayable)
 */

import { Vector, Body } from 'matter-js';
import { gameConfig } from 'config/game';

export interface AdaptiveSpeedConfig {
    /** Combo count increase required before applying the next speed step */
    readonly comboStep?: number;
    /** Percentage gain per combo step (e.g. 0.05 = +5%) */
    readonly multiplierPerStep?: number;
    /** Hard cap for the adaptive multiplier (defaults to maxSpeed / baseSpeed) */
    readonly maxMultiplier?: number;
}

export interface SpeedRegulationConfig {
    /** Base speed to maintain (target speed) */
    readonly baseSpeed: number;
    /** Maximum allowed speed (prevents tunneling) */
    readonly maxSpeed: number;
}

const EPSILON = 1e-6;
const DEFAULT_COMBO_STEP = gameConfig.speedRegulation.comboStep;
const DEFAULT_MULTIPLIER_PER_STEP = gameConfig.speedRegulation.multiplierPerStep;

/**
 * Regulate ball speed to stay within configured bounds
 * Clamps velocity to [baseSpeed, maxSpeed] range
 *
 * @param body - Physics body to regulate
 * @param config - Speed regulation config
 */
export function regulateSpeed(body: Body, config: SpeedRegulationConfig): void {
    const velocity = body.velocity;
    const speed = Vector.magnitude(velocity);

    // Handle near-zero velocity (avoid division by zero)
    if (speed < EPSILON) {
        const newVelocity = Vector.mult(velocity, config.baseSpeed / EPSILON);
        Body.setVelocity(body, newVelocity);
        return;
    }

    // Speed too slow - boost to base speed
    if (speed < config.baseSpeed) {
        const scaledVelocity = Vector.mult(velocity, config.baseSpeed / speed);
        Body.setVelocity(body, scaledVelocity);
        return;
    }

    // Speed too fast - clamp to max speed
    if (speed > config.maxSpeed) {
        const scaledVelocity = Vector.mult(velocity, config.maxSpeed / speed);
        Body.setVelocity(body, scaledVelocity);
    }
}

/**
 * Check if ball speed is within acceptable range
 *
 * @param body - Physics body to check
 * @param config - Speed regulation config
 * @returns True if speed is within [baseSpeed, maxSpeed]
 */
export function isSpeedWithinRange(body: Body, config: SpeedRegulationConfig): boolean {
    const speed = Vector.magnitude(body.velocity);
    return speed >= config.baseSpeed && speed <= config.maxSpeed;
}

/**
 * Get speed regulation debug info
 *
 * @param body - Physics body to inspect
 * @param config - Speed regulation config
 * @returns Debug information about current speed state
 */
export function getSpeedDebugInfo(
    body: Body,
    config: SpeedRegulationConfig,
): {
    currentSpeed: number;
    baseSpeed: number;
    maxSpeed: number;
    isTooSlow: boolean;
    isTooFast: boolean;
    isWithinRange: boolean;
} {
    const speed = Vector.magnitude(body.velocity);

    return {
        currentSpeed: speed,
        baseSpeed: config.baseSpeed,
        maxSpeed: config.maxSpeed,
        isTooSlow: speed < config.baseSpeed,
        isTooFast: speed > config.maxSpeed,
        isWithinRange: speed >= config.baseSpeed && speed <= config.maxSpeed,
    };
}

/**
 * Calculate base speed scaled by combo-driven adaptive rules.
 */
export function getAdaptiveBaseSpeed(
    baseSpeed: number,
    maxSpeed: number,
    combo: number,
    config: AdaptiveSpeedConfig = {},
): number {
    if (baseSpeed <= 0) {
        return 0;
    }

    const step = Math.max(1, config.comboStep ?? DEFAULT_COMBO_STEP);
    const perStep = config.multiplierPerStep ?? DEFAULT_MULTIPLIER_PER_STEP;
    const maxMultiplier = Math.max(1, config.maxMultiplier ?? maxSpeed / baseSpeed);

    if (combo <= 0 || perStep <= 0) {
        return Math.min(baseSpeed, maxSpeed);
    }

    const stepsReached = Math.floor(combo / step);
    if (stepsReached <= 0) {
        return Math.min(baseSpeed, maxSpeed);
    }

    const comboMultiplier = Math.min(1 + stepsReached * perStep, maxMultiplier);
    return Math.min(baseSpeed * comboMultiplier, maxSpeed);
}
