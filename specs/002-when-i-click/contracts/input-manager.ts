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
     * Reset launch trigger state after processing
     */
    resetLaunchTrigger(): void;

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
    mousePosition: Vector2 | null;
    keyboardPressed: readonly string[];
    paddleTarget: Vector2 | null;
    launchPending: boolean;
}

export type InputType = 'mouse' | 'keyboard' | 'touch';

export interface Vector2 {
    x: number;
    y: number;
}