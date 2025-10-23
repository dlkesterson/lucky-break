/**
 * Shared Type Definitions
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Common types used across input, physics, and render modules
 */

/**
 * 2D vector with x and y coordinates
 */
export interface Vector2 {
    x: number;
    y: number;
}

/**
 * Rectangle with position and dimensions
 */
export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Input types supported by the game
 */
export type InputType = 'mouse' | 'keyboard' | 'touch' | 'gamepad';

/**
 * Normalized input state for paddle control
 */
export interface InputState {
    leftPressed: boolean;
    rightPressed: boolean;
    mouseX?: number;
    touchX?: number;
    launchRequested: boolean;
}

/**
 * Debug information for input system
 */
export interface InputDebugState {
    activeInputs: readonly InputType[];
    primaryInput?: InputType | null;
    mousePosition: Vector2 | null;
    touchPosition?: Vector2 | null;
    gamepadCursor?: Vector2 | null;
    gamepadAxisRaw?: number | null;
    gamepadAxisNormalized?: number | null;
    gamepadButtonsPressed?: readonly number[];
    gamepadLaunchHeld?: boolean;
    keyboardPressed: readonly string[];
    paddleTarget: Vector2 | null;
    aimDirection?: Vector2 | null;
    launchPending: boolean;
}

/**
 * Physics body identifier
 */
export type PhysicsBodyId = number;

/**
 * Ball attachment state
 */
export interface BallAttachment {
    isAttached: boolean;
    attachmentOffset: Vector2;
    paddlePosition: Vector2;
}

/**
 * Ball launch configuration
 */
export interface BallLaunchConfig {
    initialVelocity: Vector2;
    launchDirection: Vector2;
    launchForce: number;
}

/**
 * Paddle movement constraints
 */
export interface PaddleConstraints {
    minX: number;
    maxX: number;
    speed: number;
}

/**
 * Boundary collision detection
 */
export interface BoundaryCollision {
    left: boolean;
    right: boolean;
}