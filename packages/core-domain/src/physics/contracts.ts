/**
 * Ball Physics Contract
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Defines the ball physics interface for attachment and launch mechanics
 */

import type { MatterBody as Body } from 'physics/matter';

export interface BallController {
    /**
     * Create a new ball attached to the paddle
     * @param paddlePosition - Current paddle center position
     * @param options - Ball configuration options
     * @returns Ball instance ready for attachment
     */
    createAttachedBall(paddlePosition: Vector2, options?: BallOptions): Ball;

    /**
     * Update ball position to stay attached to paddle
     * @param ball - Ball to update
     * @param paddlePosition - Current paddle center position
     */
    updateAttachment(ball: Ball, paddlePosition: Vector2): void;

    /**
     * Launch the ball with upward velocity
     * @param ball - Ball to launch
     * @param direction - Optional launch direction (default: upward)
     */
    launchBall(ball: Ball, direction?: Vector2): void;

    /**
     * Check if ball is currently attached to paddle
     * @param ball - Ball to check
     * @returns True if ball is attached
     */
    isAttached(ball: Ball): boolean;

    /**
     * Reset ball to attached state
     * @param ball - Ball to reset
     * @param paddlePosition - Paddle position for attachment
     */
    resetToAttached(ball: Ball, paddlePosition: Vector2): void;

    /**
     * Get ball debug information
     * @param ball - Ball to inspect
     */
    getDebugInfo(ball: Ball): BallDebugInfo;
}

export interface Ball {
    id: string;
    physicsBody: Body;
    isAttached: boolean;
    attachmentOffset: Vector2;
    radius: number;
}

export interface BallOptions {
    radius?: number;
    restitution?: number;
    friction?: number;
}

export interface BallDebugInfo {
    position: Vector2;
    velocity: Vector2;
    isAttached: boolean;
    attachmentOffset: Vector2;
    physicsBodyId: number;
}

export interface Vector2 {
    x: number;
    y: number;
}