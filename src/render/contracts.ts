/**
 * Paddle Control Contract
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Defines the paddle control interface for movement and interaction
 */

import type { Body } from 'matter-js';

export interface PaddleController {
    /**
     * Create a new paddle with physics body
     * @param initialPosition - Starting position for the paddle
     * @param options - Paddle configuration options
     * @returns Paddle instance ready for control
     */
    createPaddle(initialPosition: Vector2, options?: PaddleOptions): Paddle;

    /**
     * Update paddle position based on input
     * @param paddle - Paddle to update
     * @param deltaTime - Time elapsed since last update
     * @param inputState - Current input state
     */
    updatePaddle(
        paddle: Paddle,
        deltaTime: number,
        inputState: InputState,
        playfieldWidth: number,
    ): void;

    /**
     * Set paddle position directly (for initialization or reset)
     * @param paddle - Paddle to position
     * @param position - New position
     */
    setPaddlePosition(paddle: Paddle, position: Vector2, playfieldWidth: number): void;

    /**
     * Get paddle bounds for collision detection
     * @param paddle - Paddle to query
     * @returns Bounding rectangle
     */
    getPaddleBounds(paddle: Paddle): Rectangle;

    /**
     * Get paddle center position
     * @param paddle - Paddle to query
     * @returns Center position
     */
    getPaddleCenter(paddle: Paddle): Vector2;

    /**
     * Check if paddle is at screen boundary
     * @param paddle - Paddle to check
     * @param screenWidth - Screen width
     * @returns Boundary collision info
     */
    checkBoundaryCollision(paddle: Paddle, screenWidth: number): BoundaryCollision;

    /**
     * Get paddle debug information
     * @param paddle - Paddle to inspect
     */
    getDebugInfo(paddle: Paddle): PaddleDebugInfo;
}

export interface Paddle {
    id: string;
    physicsBody: Body;
    width: number;
    height: number;
    speed: number;
    position: Vector2;
}

export interface PaddleOptions {
    width?: number;
    height?: number;
    speed?: number;
    color?: number;
}

export interface InputState {
    leftPressed: boolean;
    rightPressed: boolean;
    mouseX?: number;
    touchX?: number;
    launchRequested: boolean;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BoundaryCollision {
    left: boolean;
    right: boolean;
}

export interface PaddleDebugInfo {
    position: Vector2;
    velocity: Vector2;
    bounds: Rectangle;
    physicsBodyId: number;
    inputState: InputState;
}

export interface Vector2 {
    x: number;
    y: number;
}