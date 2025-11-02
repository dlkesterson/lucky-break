/**
 * Launch Manager
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15 (updated 2025-10-20)
 * Purpose: Detects launch triggers from paddle movement or screen taps and gestures
 */

import type { LaunchTriggerDetail, LaunchTriggerType, Vector2 } from './contracts';

interface LaunchTriggerExtras {
    aimDirection?: Vector2;
    durationMs?: number;
    swipeDistance?: number;
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
    triggerTapLaunch(position: Vector2, extras?: LaunchTriggerExtras): void;

    /**
     * Record a long-press launch trigger
     * @param position - Position where the long press occurred
     * @param extras - Additional gesture metadata
     */
    triggerLongPressLaunch(position: Vector2, extras: LaunchTriggerExtras): void;

    /**
     * Record a swipe-based launch trigger
     * @param position - Position where the swipe ended
     * @param extras - Additional gesture metadata
     */
    triggerSwipeLaunch(position: Vector2, extras: LaunchTriggerExtras): void;

    /**
     * Check if launch is pending
     * @returns True if launch is pending
     */
    isLaunchPending(): boolean;

    /**
     * Consume the launch trigger (reset to not pending)
     */
    consumeLaunchTrigger(): LaunchTriggerDetail | null;

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
    lastTrigger?: LaunchTriggerDetail;
    movementThreshold: number;
}

export class PaddleLaunchManager implements LaunchManager {
    private launchPending = false;
    private lastTrigger: LaunchTriggerDetail | null = null;
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
            this.recordTrigger('movement', currentPosition, {
                swipeDistance: movement,
            });
            return true;
        }

        return false;
    }

    triggerTapLaunch(position: Vector2, extras: LaunchTriggerExtras = {}): void {
        this.recordTrigger('tap', position, extras);
    }

    triggerLongPressLaunch(position: Vector2, extras: LaunchTriggerExtras): void {
        this.recordTrigger('long-press', position, extras);
    }

    triggerSwipeLaunch(position: Vector2, extras: LaunchTriggerExtras): void {
        this.recordTrigger('swipe', position, extras);
    }

    isLaunchPending(): boolean {
        return this.launchPending;
    }

    consumeLaunchTrigger(): LaunchTriggerDetail | null {
        if (this.launchPending && this.lastTrigger) {
            const trigger = this.cloneTrigger(this.lastTrigger);
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
        const lastTrigger = this.lastTrigger ? this.cloneTrigger(this.lastTrigger) : undefined;
        return {
            launchPending: this.launchPending,
            lastTrigger,
            movementThreshold: this.movementThreshold,
        };
    }

    private recordTrigger(type: LaunchTriggerType, position: Vector2, extras: LaunchTriggerExtras): void {
        const trigger: LaunchTriggerDetail = {
            type,
            position: { ...position },
            timestamp: Date.now(),
            ...(extras.aimDirection ? { aimDirection: { ...extras.aimDirection } } : undefined),
            ...(typeof extras.durationMs === 'number' ? { durationMs: extras.durationMs } : undefined),
            ...(typeof extras.swipeDistance === 'number' ? { swipeDistance: extras.swipeDistance } : undefined),
        };

        this.launchPending = true;
        this.lastTrigger = trigger;
    }

    private cloneTrigger(trigger: LaunchTriggerDetail): LaunchTriggerDetail {
        return {
            type: trigger.type,
            position: { ...trigger.position },
            timestamp: trigger.timestamp,
            ...(trigger.aimDirection ? { aimDirection: { ...trigger.aimDirection } } : undefined),
            ...(typeof trigger.durationMs === 'number' ? { durationMs: trigger.durationMs } : undefined),
            ...(typeof trigger.swipeDistance === 'number' ? { swipeDistance: trigger.swipeDistance } : undefined),
        };
    }
}