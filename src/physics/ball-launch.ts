/**
 * Ball Launch Controller
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Applies launch velocity to balls and manages launch state
 */

import type { Ball, Vector2 } from './contracts';
import { Body, Vector } from 'physics/matter';
import type { MatterVector } from 'physics/matter';

export interface BallLaunchController {
    /**
     * Launch a ball with specified direction and speed
     * @param ball - Ball to launch
     * @param direction - Launch direction (normalized automatically)
     * @param speed - Launch speed (default: 8)
     */
    launch(ball: Ball, direction?: Vector2, speed?: number): void;

    /**
     * Check if ball can be launched (is attached)
     * @param ball - Ball to check
     * @returns True if ball is in launchable state
     */
    canLaunch(ball: Ball): boolean;

    /**
     * Get launch velocity for given direction and speed
     * @param direction - Launch direction
     * @param speed - Launch speed
     * @returns Velocity vector
     */
    calculateLaunchVelocity(direction: Vector2, speed: number): Vector2;

    /**
     * Get debug information about launch state
     * @param ball - Ball to inspect
     */
    getLaunchDebugInfo(ball: Ball): BallLaunchDebugInfo;
}

export interface BallLaunchDebugInfo {
    canLaunch: boolean;
    currentVelocity: Vector2;
    launchSpeed: number;
    lastLaunchDirection?: Vector2;
}

export class PhysicsBallLaunchController implements BallLaunchController {
    private readonly defaultLaunchSpeed = 8; // Consistent speed for Breakout-style game
    private lastLaunchDirection: Vector2 | null = null;

    launch(ball: Ball, direction: Vector2 = { x: 0, y: -1 }, speed = this.defaultLaunchSpeed): void {
        if (!this.canLaunch(ball)) {
            return;
        }

        // Detach ball from paddle if attached
        if (ball.isAttached) {
            // Detach will be handled by physics world in main.ts
            ball.isAttached = false;
        }

        // Calculate and apply launch velocity using setVelocity for consistent speed
        const normalized = Vector.normalise(direction as MatterVector);
        const velocity = Vector.mult(normalized, speed);
        Body.setVelocity(ball.physicsBody, velocity);

        this.lastLaunchDirection = { ...direction };
    }

    canLaunch(ball: Ball): boolean {
        // Ball can be launched if it's attached to paddle
        return ball.isAttached;
    }

    calculateLaunchVelocity(direction: Vector2, speed: number): Vector2 {
        // Normalize direction vector
        const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);

        if (length === 0) {
            // Default to upward if zero vector provided
            return { x: 0, y: -speed };
        }

        const normalizedX = direction.x / length;
        const normalizedY = direction.y / length;

        return {
            x: normalizedX * speed,
            y: normalizedY * speed,
        };
    }

    getLaunchDebugInfo(ball: Ball): BallLaunchDebugInfo {
        return {
            canLaunch: this.canLaunch(ball),
            currentVelocity: {
                x: ball.physicsBody.velocity.x,
                y: ball.physicsBody.velocity.y,
            },
            launchSpeed: this.defaultLaunchSpeed,
            lastLaunchDirection: this.lastLaunchDirection ?? undefined,
        };
    }
}