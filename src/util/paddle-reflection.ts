/**
 * Paddle Reflection Utilities
 *
 * Adapted from Cloud Popper's paddle reflection system
 * Provides tactical depth by varying bounce angle based on paddle hit location
 */

import { Vector, Body } from 'matter-js';
import type { Vector as Vec } from 'matter-js';

export interface PaddleReflectionConfig {
    /** Width of the paddle for hit offset calculation */
    readonly paddleWidth: number;
    /** Minimum ball speed to maintain (prevents stalling) */
    readonly minSpeed: number;
    /** Maximum angle in radians (default ~75 degrees) */
    readonly maxAngle?: number;
}

const DEFAULT_MAX_ANGLE = Math.PI * 0.42; // ~75 degrees

/**
 * Calculate and apply reflection velocity when ball hits paddle
 * Center hits = straight bounces, edge hits = sharper angles
 *
 * @param ball - Ball physics body
 * @param paddle - Paddle physics body
 * @param config - Reflection configuration
 */
export function reflectOffPaddle(ball: Body, paddle: Body, config: PaddleReflectionConfig): void {
    // Calculate hit offset from paddle center (-1 = left edge, +1 = right edge)
    const hitOffset = (ball.position.x - paddle.position.x) / (config.paddleWidth * 0.5);
    const clamped = Math.max(-1, Math.min(1, hitOffset));

    // Convert offset to angle (center = 0°, edges = ±maxAngle)
    const maxAngle = config.maxAngle ?? DEFAULT_MAX_ANGLE;
    const angle = clamped * maxAngle;

    // Calculate current speed (or use minimum)
    const currentSpeed = Vector.magnitude(ball.velocity);
    const speed = Math.max(currentSpeed, config.minSpeed);

    // Create new velocity vector with calculated angle
    // Positive y goes down, so we want negative y for upward bounce
    const newVelocity: Vec = {
        x: Math.sin(angle) * speed,
        y: -Math.abs(Math.cos(angle)) * speed, // Always upward
    };

    Body.setVelocity(ball, newVelocity);
}

/**
 * Calculate reflection data without applying it (for debugging/preview)
 *
 * @param ballX - Ball x position
 * @param paddleX - Paddle x position
 * @param config - Reflection configuration
 * @returns Reflection angle and impact offset
 */
export function calculateReflectionData(
    ballX: number,
    paddleX: number,
    config: PaddleReflectionConfig,
): { angle: number; impactOffset: number } {
    const hitOffset = (ballX - paddleX) / (config.paddleWidth * 0.5);
    const clamped = Math.max(-1, Math.min(1, hitOffset));
    const maxAngle = config.maxAngle ?? DEFAULT_MAX_ANGLE;
    const angle = clamped * maxAngle;

    return {
        angle,
        impactOffset: clamped,
    };
}

/**
 * Get the normalized hit position on paddle (0 = center, ±1 = edges)
 *
 * @param ballX - Ball x position
 * @param paddleX - Paddle x position
 * @param paddleWidth - Paddle width
 * @returns Normalized offset (-1 to +1)
 */
export function getHitOffset(ballX: number, paddleX: number, paddleWidth: number): number {
    const offset = (ballX - paddleX) / (paddleWidth * 0.5);
    return Math.max(-1, Math.min(1, offset));
}
