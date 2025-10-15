/**
 * Paddle Body Controller
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Implements paddle kinematic body with physics integration
 */

import type {
    PaddleController,
    Paddle,
    PaddleOptions,
    Vector2,
    Rectangle,
    BoundaryCollision,
    PaddleDebugInfo,
    InputState
} from './contracts';
import { createPhysicsWorld } from '../physics/world';

export class PaddleBodyController implements PaddleController {
    private physicsWorld = createPhysicsWorld();

    /**
     * Create a new paddle with physics body
     */
    createPaddle(initialPosition: Vector2, options: PaddleOptions = {}): Paddle {
        const width = options.width ?? 100;
        const height = options.height ?? 20;
        const speed = options.speed ?? 300;

        const physicsBody = this.physicsWorld.factory.paddle({
            position: initialPosition,
            size: { width, height },
        });

        return {
            id: `paddle-${Date.now()}`,
            physicsBody,
            width,
            height,
            speed,
            position: { ...initialPosition },
        };
    }

    /**
     * Update paddle position based on input
     */
    updatePaddle(paddle: Paddle, deltaTime: number, inputState: InputState): void {
        let targetX = paddle.position.x;

        // Handle keyboard input
        if (inputState.leftPressed) {
            targetX -= paddle.speed * deltaTime;
        }
        if (inputState.rightPressed) {
            targetX += paddle.speed * deltaTime;
        }

        // Handle mouse/touch input (takes precedence)
        if (inputState.mouseX !== undefined) {
            targetX = inputState.mouseX;
        } else if (inputState.touchX !== undefined) {
            targetX = inputState.touchX;
        }

        // Constrain to screen bounds (assuming 800px width)
        const halfWidth = paddle.width / 2;
        targetX = Math.max(halfWidth, Math.min(800 - halfWidth, targetX));

        // Update physics body position
        paddle.physicsBody.position.x = targetX;
        paddle.physicsBody.position.y = paddle.position.y;

        // Update paddle state
        paddle.position.x = targetX;
    }

    /**
     * Set paddle position directly (for initialization or reset)
     */
    setPaddlePosition(paddle: Paddle, position: Vector2): void {
        // Constrain to screen bounds
        const halfWidth = paddle.width / 2;
        const constrainedX = Math.max(halfWidth, Math.min(800 - halfWidth, position.x));

        paddle.physicsBody.position.x = constrainedX;
        paddle.physicsBody.position.y = position.y;
        paddle.position.x = constrainedX;
        paddle.position.y = position.y;
    }

    /**
     * Get paddle bounds for collision detection
     */
    getPaddleBounds(paddle: Paddle): Rectangle {
        return {
            x: paddle.position.x - paddle.width / 2,
            y: paddle.position.y - paddle.height / 2,
            width: paddle.width,
            height: paddle.height,
        };
    }

    /**
     * Get paddle center position
     */
    getPaddleCenter(paddle: Paddle): Vector2 {
        return { ...paddle.position };
    }

    /**
     * Check if paddle is at screen boundary
     */
    checkBoundaryCollision(paddle: Paddle, screenWidth: number): BoundaryCollision {
        const halfWidth = paddle.width / 2;
        return {
            left: paddle.position.x - halfWidth <= 0,
            right: paddle.position.x + halfWidth >= screenWidth,
        };
    }

    /**
     * Get paddle debug information
     */
    getDebugInfo(paddle: Paddle): PaddleDebugInfo {
        return {
            position: { ...paddle.position },
            velocity: { x: 0, y: 0 }, // Paddle is kinematic, no velocity
            bounds: this.getPaddleBounds(paddle),
            physicsBodyId: paddle.physicsBody.id,
            inputState: {
                leftPressed: false,
                rightPressed: false,
                launchRequested: false,
            }, // This would need to be passed in from actual input state
        };
    }
}