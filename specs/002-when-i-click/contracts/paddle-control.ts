/**
 * Paddle Control Contract
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Defines the paddle control interface for movement and constraints
 */

export interface PaddleController {
    /**
     * Create a new paddle with the specified configuration
     * @param config - Paddle configuration
     * @returns Configured paddle instance
     */
    createPaddle(config: PaddleConfig): Paddle;

    /**
     * Update paddle position based on input target
     * @param paddle - Paddle to update
     * @param targetPosition - Desired position from input system
     * @param deltaTime - Time elapsed since last update
     */
    updatePosition(paddle: Paddle, targetPosition: Vector2, deltaTime: number): void;

    /**
     * Constrain paddle position within game boundaries
     * @param paddle - Paddle to constrain
     * @param bounds - Game boundary rectangle
     */
    constrainToBounds(paddle: Paddle, bounds: Rectangle): void;

    /**
     * Check if paddle movement should trigger ball launch
     * @param paddle - Paddle to check
     * @param movementThreshold - Minimum movement to trigger launch
     * @returns True if movement exceeds threshold
     */
    shouldTriggerLaunch(paddle: Paddle, movementThreshold: number): boolean;

    /**
     * Get paddle debug information
     * @param paddle - Paddle to inspect
     */
    getDebugInfo(paddle: Paddle): PaddleDebugInfo;

    /**
     * Reset paddle to initial position
     * @param paddle - Paddle to reset
     * @param initialPosition - Starting position
     */
    resetPosition(paddle: Paddle, initialPosition: Vector2): void;
}

export interface Paddle {
    id: string;
    physicsBody: any; // Matter.js kinematic Body
    position: Vector2;
    size: Vector2;
    velocity: Vector2;
    bounds: Rectangle;
    lastMovedAt: number;
    movementDistance: number; // Accumulated movement for launch detection
}

export interface PaddleConfig {
    size: Vector2;
    initialPosition: Vector2;
    bounds: Rectangle;
    maxSpeed?: number;
    acceleration?: number;
}

export interface PaddleDebugInfo {
    position: Vector2;
    velocity: Vector2;
    bounds: Rectangle;
    movementDistance: number;
    lastMovedAt: number;
    physicsBodyId: number;
}

export interface Vector2 {
    x: number;
    y: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}