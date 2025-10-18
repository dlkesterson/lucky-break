/**
 * Ball Attachment Controller
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Implements ball attachment mechanics for paddle control
 */

import type { BallController, Ball, BallOptions, Vector2, BallDebugInfo } from './contracts';
import { Body } from 'matter-js';
import { createPhysicsWorld } from './world';

export class BallAttachmentController implements BallController {
    private physicsWorld = createPhysicsWorld();

    /**
     * Create a new ball attached to the paddle
     */
    createAttachedBall(paddlePosition: Vector2, options: BallOptions = {}): Ball {
        const radius = options.radius ?? 10;
        const attachmentOffset = { x: 0, y: -radius - 10 }; // Position ball above paddle

        const physicsBody = this.physicsWorld.factory.ball({
            position: {
                x: paddlePosition.x + attachmentOffset.x,
                y: paddlePosition.y + attachmentOffset.y,
            },
            radius,
            restitution: options.restitution ?? 0.98,
        });

        // Create a temporary paddle body for attachment
        const tempPaddleBody = this.physicsWorld.factory.paddle({
            position: paddlePosition,
            size: { width: 100, height: 20 },
        });

        // Attach the ball to the temporary paddle
        this.physicsWorld.attachBallToPaddle(physicsBody, tempPaddleBody, attachmentOffset);

        return {
            id: `ball-${Date.now()}`,
            physicsBody,
            isAttached: true,
            attachmentOffset,
            radius,
        };
    }

    /**
     * Update ball position to stay attached to paddle
     */
    updateAttachment(ball: Ball, paddlePosition: Vector2): void {
        if (!ball.isAttached) {
            return;
        }

        Body.setPosition(ball.physicsBody, {
            x: paddlePosition.x + ball.attachmentOffset.x,
            y: paddlePosition.y + ball.attachmentOffset.y,
        });
        Body.setVelocity(ball.physicsBody, { x: 0, y: 0 });
        Body.setAngularVelocity(ball.physicsBody, 0);
    }

    /**
     * Launch the ball with upward velocity
     */
    launchBall(ball: Ball, direction: Vector2 = { x: 0, y: -1 }): void {
        if (ball.isAttached) {
            ball.isAttached = false;
        }

        // Normalize direction and apply velocity
        const speed = 300; // Launch speed
        const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
        const normalizedDirection = length > 0 ? {
            x: direction.x / length,
            y: direction.y / length,
        } : { x: 0, y: -1 };

        ball.physicsBody.velocity.x = normalizedDirection.x * speed;
        ball.physicsBody.velocity.y = normalizedDirection.y * speed;
    }

    /**
     * Check if ball is currently attached to paddle
     */
    isAttached(ball: Ball): boolean {
        return ball.isAttached;
    }

    /**
     * Reset ball to attached state
     */
    resetToAttached(ball: Ball, paddlePosition: Vector2): void {
        const attachmentOffset = { x: 0, y: -ball.radius - 10 };
        ball.attachmentOffset = attachmentOffset;
        ball.isAttached = true;

        Body.setPosition(ball.physicsBody, {
            x: paddlePosition.x + attachmentOffset.x,
            y: paddlePosition.y + attachmentOffset.y,
        });
        Body.setVelocity(ball.physicsBody, { x: 0, y: 0 });
        Body.setAngularVelocity(ball.physicsBody, 0);
        if (ball.physicsBody.force) {
            ball.physicsBody.force.x = 0;
            ball.physicsBody.force.y = 0;
        }
    }

    /**
     * Get ball debug information
     */
    getDebugInfo(ball: Ball): BallDebugInfo {
        if (typeof this.physicsWorld.getBallAttachment === 'function') {
            this.physicsWorld.getBallAttachment(ball.physicsBody);
        }

        return {
            position: ball.physicsBody.position,
            velocity: ball.physicsBody.velocity,
            isAttached: ball.isAttached,
            attachmentOffset: ball.attachmentOffset,
            physicsBodyId: ball.physicsBody.id,
        };
    }
}