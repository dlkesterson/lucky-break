/**
 * Launch Manager
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Detects launch triggers from paddle movement or screen taps
 */

import type { Vector2 } from '../types';

export interface LaunchTrigger {
    type: 'movement' | 'tap';
    position: Vector2;
    timestamp: number;
}

export interface LaunchManager {
    /**
     * Check if a launch should be triggered
     * @param currentPosition - Current paddle position
     * @param previousPosition - Previous paddle position
     * @param movementThreshold - Minimum movement to trigger launch
     * @returns True if launch conditions are met
     */
    shouldTriggerLaunch(
        currentPosition: Vector2,
        previousPosition: Vector2 | null,
        movementThreshold: number
    ): boolean;

    /**
     * Record a tap/click launch trigger
     * @param position - Position of the tap/click
     */
    triggerTapLaunch(position: Vector2): void;

    /**
     * Check if launch is pending
     * @returns True if launch is pending
     */
    isLaunchPending(): boolean;

    /**
     * Consume the launch trigger (reset to not pending)
     */
    consumeLaunchTrigger(): LaunchTrigger | null;

    /**
     * Reset launch state
     */
    reset(): void;

    /**
     * Get debug information
     */
    getDebugInfo(): LaunchDebugInfo;
}

export interface LaunchDebugInfo {
    launchPending: boolean;
    lastTrigger?: LaunchTrigger;
    movementThreshold: number;
}

export class PaddleLaunchManager implements LaunchManager {
    private launchPending = false;
    private lastTrigger: LaunchTrigger | null = null;
    private readonly movementThreshold: number;

    constructor(movementThreshold = 5) {
        this.movementThreshold = movementThreshold;
    }

    shouldTriggerLaunch(
        currentPosition: Vector2,
        previousPosition: Vector2 | null,
        movementThreshold: number
    ): boolean {
        if (!previousPosition) {
            return false;
        }

        const deltaX = Math.abs(currentPosition.x - previousPosition.x);
        const deltaY = Math.abs(currentPosition.y - previousPosition.y);
        const movement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (movement > movementThreshold) {
            this.launchPending = true;
            this.lastTrigger = {
                type: 'movement',
                position: { ...currentPosition },
                timestamp: Date.now(),
            };
            return true;
        }

        return false;
    }

    triggerTapLaunch(position: Vector2): void {
        this.launchPending = true;
        this.lastTrigger = {
            type: 'tap',
            position: { ...position },
            timestamp: Date.now(),
        };
    }

    isLaunchPending(): boolean {
        return this.launchPending;
    }

    consumeLaunchTrigger(): LaunchTrigger | null {
        if (this.launchPending && this.lastTrigger) {
            const trigger = this.lastTrigger;
            this.launchPending = false;
            this.lastTrigger = null;
            return trigger;
        }
        return null;
    }

    reset(): void {
        this.launchPending = false;
        this.lastTrigger = null;
    }

    getDebugInfo(): LaunchDebugInfo {
        return {
            launchPending: this.launchPending,
            lastTrigger: this.lastTrigger ?? undefined,
            movementThreshold: this.movementThreshold,
        };
    }
}