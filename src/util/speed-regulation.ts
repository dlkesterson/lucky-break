/**
 * Speed Regulation Utilities
 *
 * Adapted from Cloud Popper's speed regulation system
 * Prevents ball from getting too slow (boring) or too fast (unplayable)
 */

import { Vector, Body } from 'matter-js';

export interface SpeedRegulationConfig {
    /** Base speed to maintain (target speed) */
    readonly baseSpeed: number;
    /** Maximum allowed speed (prevents tunneling) */
    readonly maxSpeed: number;
}

const EPSILON = 1e-6;

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
