/**
 * Input System Contract
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15 (updated 2025-10-20)
 * Purpose: Defines the public interface for input handling and paddle control
 */

export type LaunchTriggerType = 'movement' | 'tap' | 'long-press' | 'swipe';

export interface Vector2 {
    x: number;
    y: number;
}

export interface LaunchTriggerDetail {
    readonly type: LaunchTriggerType;
    readonly position: Vector2;
    readonly timestamp: number;
    readonly aimDirection?: Vector2;
    readonly durationMs?: number;
    readonly swipeDistance?: number;
}

export interface LaunchIntent {
    readonly trigger: LaunchTriggerDetail;
    readonly direction: Vector2;
}
/**
 * Input System Contract
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Defines the public interface for input handling and paddle control
 */

export interface InputManager {
    /**
     * Initialize input handling for the given container
     * @param container - DOM element to attach input listeners to
     */
    initialize(container: HTMLElement): void;

    /**
     * Get the current target position for paddle movement
     * @returns Target position in game coordinates, or null if no input
     */
    getPaddleTarget(): Vector2 | null;

    /**
     * Check if a launch should be triggered
     * @returns True if launch conditions are met
     */
    shouldLaunch(): boolean;

    /**
     * Get the current aiming direction if the player is preparing a launch
     * @returns Normalized launch vector or null when no aim is active
     */
    getAimDirection(): Vector2 | null;

    /**
     * Consume and return the pending launch intent if available
     * @returns Launch intent data or null when no launch is pending
     */
    consumeLaunchIntent(): LaunchIntent | null;

    /**
     * Reset launch trigger state after processing
     */
    resetLaunchTrigger(): void;

    /**
     * Sync the internal paddle reference used for movement-based launch triggers
     * @param position - Current paddle position or null to clear tracking
     */
    syncPaddlePosition(position: Vector2 | null): void;

    /**
     * Get current input state for debugging
     */
    getDebugState(): InputDebugState;

    /**
     * Clean up input listeners
     */
    destroy(): void;
}

export interface InputDebugState {
    activeInputs: readonly InputType[];
    primaryInput: InputType | null;
    mousePosition: Vector2 | null;
    touchPosition: Vector2 | null;
    gamepadCursor: Vector2 | null;
    keyboardPressed: readonly string[];
    paddleTarget: Vector2 | null;
    launchPending: boolean;
}

export type InputType = 'mouse' | 'keyboard' | 'touch' | 'gamepad';