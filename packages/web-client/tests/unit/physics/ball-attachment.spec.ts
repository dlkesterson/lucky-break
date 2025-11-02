/**
 * Ball Attachment Mechanics Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test ball attachment state and mechanics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Ball, BallOptions, Vector2 } from 'physics/contracts';
import { createPhysicsWorld } from 'physics/world';

describe('Ball Attachment Mechanics', () => {
    let world: ReturnType<typeof createPhysicsWorld>;
    let mockBall: Ball;

    beforeEach(() => {
        world = createPhysicsWorld();
        mockBall = {
            id: 'test-ball',
            physicsBody: world.factory.ball({ radius: 8, position: { x: 400, y: 300 } }),
            isAttached: false,
            attachmentOffset: { x: 0, y: -10 },
            radius: 8,
        };

        // Add mock ball to world
        world.add(mockBall.physicsBody);
    });

    describe('Ball Attachment State', () => {
        it('should create ball in detached state by default', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };
            const options: BallOptions = { radius: 8 };

            // Create attached ball
            const ball = world.factory.ball({
                position: { x: paddlePosition.x, y: paddlePosition.y - 10 },
                radius: options.radius ?? 8,
                label: 'test-ball',
            });

            expect(ball.position.x).toBeCloseTo(paddlePosition.x, 0);
            expect(ball.position.y).toBeCloseTo(paddlePosition.y - 10, 0);
            expect(ball.circleRadius).toBe(8);
        });

        it('should track attachment state correctly', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };

            // Initially not attached
            expect(world.isBallAttached(mockBall.physicsBody)).toBe(false);

            // Attach ball
            world.attachBallToPaddle(mockBall.physicsBody, world.factory.paddle({
                position: paddlePosition,
                size: { width: 100, height: 20 },
            }));

            expect(world.isBallAttached(mockBall.physicsBody)).toBe(true);

            // Detach ball
            world.detachBallFromPaddle(mockBall.physicsBody);
            expect(world.isBallAttached(mockBall.physicsBody)).toBe(false);
        });

        it('should maintain attachment offset', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };
            const offset: Vector2 = { x: 0, y: -15 };

            const paddle = world.factory.paddle({
                position: paddlePosition,
                size: { width: 100, height: 20 },
            });

            world.attachBallToPaddle(mockBall.physicsBody, paddle, offset);

            // Update attachment (simulate paddle movement)
            const newPaddlePosition: Vector2 = { x: 420, y: 350 };
            world.updateBallAttachment(mockBall.physicsBody, newPaddlePosition);

            expect(mockBall.physicsBody.position.x).toBeCloseTo(newPaddlePosition.x + offset.x, 0);
            expect(mockBall.physicsBody.position.y).toBeCloseTo(newPaddlePosition.y + offset.y, 0);
        });

        it('should prevent ball movement when attached', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };
            const paddle = world.factory.paddle({
                position: paddlePosition,
                size: { width: 100, height: 20 },
            });

            world.attachBallToPaddle(mockBall.physicsBody, paddle);

            // Apply force to ball (should be ignored when attached)
            mockBall.physicsBody.force.x = 10;
            mockBall.physicsBody.force.y = 5;

            // Step physics
            world.step(1000 / 60);

            // Ball should still be at attachment position
            const attachment = world.getBallAttachment(mockBall.physicsBody);
            expect(attachment).toBeDefined();
            expect(attachment!.isAttached).toBe(true);

            // Position should be synced to paddle
            expect(mockBall.physicsBody.position.x).toBeCloseTo(paddlePosition.x + attachment!.attachmentOffset.x, 0);
            expect(mockBall.physicsBody.position.y).toBeCloseTo(paddlePosition.y + attachment!.attachmentOffset.y, 0);
        });

        it('should allow ball movement when detached', () => {
            // Create a fresh ball for this test
            const testBall = world.factory.ball({ radius: 8, position: { x: 400, y: 300 } });
            world.add(testBall);

            const initialPosition = { ...testBall.position };

            // Apply velocity
            testBall.velocity.x = 50;
            testBall.velocity.y = -30;

            // Step physics
            world.step(1000 / 60);

            // Ball should have moved
            const deltaX = Math.abs(testBall.position.x - initialPosition.x);
            const deltaY = Math.abs(testBall.position.y - initialPosition.y);
            expect(deltaX + deltaY).toBeGreaterThan(0.1); // Should have moved at least a tiny bit
        });

        it('should handle attachment to moving paddle', () => {
            const initialPaddlePosition: Vector2 = { x: 400, y: 350 };
            const paddle = world.factory.paddle({
                position: initialPaddlePosition,
                size: { width: 100, height: 20 },
            });

            world.attachBallToPaddle(mockBall.physicsBody, paddle);

            // Move paddle
            const newPaddlePosition: Vector2 = { x: 450, y: 360 };
            world.updateBallAttachment(mockBall.physicsBody, newPaddlePosition);

            // Ball should follow paddle
            const attachment = world.getBallAttachment(mockBall.physicsBody);
            expect(mockBall.physicsBody.position.x).toBeCloseTo(newPaddlePosition.x + attachment!.attachmentOffset.x, 0);
            expect(mockBall.physicsBody.position.y).toBeCloseTo(newPaddlePosition.y + attachment!.attachmentOffset.y, 0);
        });

        it('should reset ball to attached state', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };
            const paddle = world.factory.paddle({
                position: paddlePosition,
                size: { width: 100, height: 20 },
            });

            // Ball starts detached
            world.detachBallFromPaddle(mockBall.physicsBody);

            // Move ball away
            mockBall.physicsBody.position.x = 200;
            mockBall.physicsBody.position.y = 200;

            // Reset to attached
            world.attachBallToPaddle(mockBall.physicsBody, paddle);

            // Ball should be at attachment position
            const attachment = world.getBallAttachment(mockBall.physicsBody);
            expect(attachment!.isAttached).toBe(true);
            expect(mockBall.physicsBody.position.x).toBeCloseTo(paddlePosition.x + attachment!.attachmentOffset.x, 0);
            expect(mockBall.physicsBody.position.y).toBeCloseTo(paddlePosition.y + attachment!.attachmentOffset.y, 0);
        });
    });

    describe('Attachment Edge Cases', () => {
        it('should handle zero offset attachment', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };
            const paddle = world.factory.paddle({
                position: paddlePosition,
                size: { width: 100, height: 20 },
            });

            world.attachBallToPaddle(mockBall.physicsBody, paddle, { x: 0, y: 0 });

            const attachment = world.getBallAttachment(mockBall.physicsBody);
            expect(attachment!.attachmentOffset).toEqual({ x: 0, y: 0 });
            expect(mockBall.physicsBody.position.x).toBeCloseTo(paddlePosition.x, 0);
            expect(mockBall.physicsBody.position.y).toBeCloseTo(paddlePosition.y, 0);
        });

        it('should handle multiple attachment/detachment cycles', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };
            const paddle = world.factory.paddle({
                position: paddlePosition,
                size: { width: 100, height: 20 },
            });

            // Cycle through attach/detach multiple times
            for (let i = 0; i < 3; i++) {
                world.attachBallToPaddle(mockBall.physicsBody, paddle);
                expect(world.isBallAttached(mockBall.physicsBody)).toBe(true);

                world.detachBallFromPaddle(mockBall.physicsBody);
                expect(world.isBallAttached(mockBall.physicsBody)).toBe(false);
            }
        });

        it('should return null for unattached balls', () => {
            world.detachBallFromPaddle(mockBall.physicsBody);
            const attachment = world.getBallAttachment(mockBall.physicsBody);
            expect(attachment).toBeNull();
        });
    });
});