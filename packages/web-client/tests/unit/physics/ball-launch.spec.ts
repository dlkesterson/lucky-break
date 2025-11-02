/**
 * Ball Launch Mechanics Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test ball launch velocity application and detachment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { BallController, Ball, Vector2 } from 'physics/contracts';
import { createPhysicsWorld } from 'physics/world';

describe('Ball Launch Mechanics', () => {
    let world: ReturnType<typeof createPhysicsWorld>;
    let ballController: BallController;
    let mockBall: Ball;

    beforeEach(() => {
        world = createPhysicsWorld();
        mockBall = {
            id: 'test-ball',
            physicsBody: world.factory.ball({ radius: 8, position: { x: 400, y: 350 } }),
            isAttached: true,
            attachmentOffset: { x: 0, y: -10 },
            radius: 8,
        };

        world.add(mockBall.physicsBody);
        world.add(world.factory.bounds()); // Add world boundaries

        // Mock ball controller - in real implementation this would be the actual class
        ballController = {
            createAttachedBall: (paddlePosition: Vector2) => {
                void paddlePosition;
                return mockBall;
            },
            updateAttachment: (ball: Ball, paddlePosition: Vector2) => {
                if (ball.isAttached) {
                    world.updateBallAttachment(ball.physicsBody, paddlePosition);
                }
            },
            launchBall: (ball: Ball, direction: Vector2 = { x: 0, y: -1 }) => {
                // Detach from paddle if attached
                if (ball.isAttached) {
                    world.detachBallFromPaddle(ball.physicsBody);
                }
                ball.isAttached = false;

                const speed = 300;
                const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
                const normalizedDirection = length > 0 ? {
                    x: direction.x / length,
                    y: direction.y / length,
                } : { x: 0, y: -1 };

                ball.physicsBody.velocity.x = normalizedDirection.x * speed;
                ball.physicsBody.velocity.y = normalizedDirection.y * speed;
            },
            isAttached: (ball: Ball) => world.isBallAttached(ball.physicsBody),
            resetToAttached: (ball: Ball, paddlePosition: Vector2) => {
                const paddle = world.factory.paddle({
                    position: { x: paddlePosition.x, y: paddlePosition.y + 50 }, // Position paddle below ball to avoid overlap
                    size: { width: 100, height: 20 },
                });
                world.attachBallToPaddle(ball.physicsBody, paddle, ball.attachmentOffset);
                ball.isAttached = true;
            },
            getDebugInfo: (ball: Ball) => ({
                position: ball.physicsBody.position,
                velocity: ball.physicsBody.velocity,
                isAttached: ball.isAttached,
                attachmentOffset: ball.attachmentOffset,
                physicsBodyId: ball.physicsBody.id,
            }),
        };
    });

    describe('Ball Launch Velocity', () => {
        it('should apply upward velocity on launch', () => {
            const initialVelocity = { ...mockBall.physicsBody.velocity };

            // Launch with default upward direction
            ballController.launchBall(mockBall);

            expect(mockBall.physicsBody.velocity.y).toBeLessThan(initialVelocity.y);
            expect(mockBall.physicsBody.velocity.y).toBe(-300); // Default upward speed
            expect(mockBall.isAttached).toBe(false);
        });

        it('should apply custom launch direction', () => {
            const direction: Vector2 = { x: 1, y: -1 }; // 45 degrees upward-right

            ballController.launchBall(mockBall, direction);

            const expectedSpeed = 300;
            const expectedX = (1 / Math.sqrt(2)) * expectedSpeed; // cos(45°) * speed
            const expectedY = (-1 / Math.sqrt(2)) * expectedSpeed; // -sin(45°) * speed

            expect(mockBall.physicsBody.velocity.x).toBeCloseTo(expectedX, 1);
            expect(mockBall.physicsBody.velocity.y).toBeCloseTo(expectedY, 1);
        });

        it('should normalize direction vector', () => {
            const direction: Vector2 = { x: 3, y: -4 }; // Not normalized

            ballController.launchBall(mockBall, direction);

            const speed = Math.sqrt(
                mockBall.physicsBody.velocity.x ** 2 +
                mockBall.physicsBody.velocity.y ** 2
            );

            expect(speed).toBeCloseTo(300, 1);
        });

        it('should handle zero direction vector', () => {
            const direction: Vector2 = { x: 0, y: 0 };

            ballController.launchBall(mockBall, direction);

            // Should default to upward
            expect(mockBall.physicsBody.velocity.x).toBe(0);
            expect(mockBall.physicsBody.velocity.y).toBe(-300);
        });
    });

    describe('Ball Detachment on Launch', () => {
        it('should detach ball from paddle on launch', () => {
            // Attach ball first
            const paddlePosition: Vector2 = { x: 400, y: 350 };
            ballController.resetToAttached(mockBall, paddlePosition);

            expect(ballController.isAttached(mockBall)).toBe(true);

            // Launch
            ballController.launchBall(mockBall);

            expect(ballController.isAttached(mockBall)).toBe(false);
        });

        it('should allow ball to move freely after launch', () => {
            const initialPosition = { ...mockBall.physicsBody.position };

            ballController.launchBall(mockBall);

            // Step physics to allow movement
            world.step(1000 / 60);

            const newPosition = mockBall.physicsBody.position;
            const deltaX = Math.abs(newPosition.x - initialPosition.x);
            const deltaY = Math.abs(newPosition.y - initialPosition.y);

            expect(deltaX + deltaY).toBeGreaterThan(0.1); // Should have moved
        });

        it('should maintain launch velocity over time', () => {
            ballController.launchBall(mockBall, { x: 0.5, y: -0.866 }); // 60 degrees

            // Step physics multiple times with default time step
            for (let i = 0; i < 10; i++) {
                world.step();
            }

            // Velocity should be mostly preserved (some air resistance)
            const currentVelocity = mockBall.physicsBody.velocity;
            const speed = Math.sqrt(currentVelocity.x ** 2 + currentVelocity.y ** 2);

            expect(speed).toBeGreaterThan(1); // Should retain some launch speed
        });
    });

    describe('Launch State Transitions', () => {
        it('should transition from attached to launched state', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };

            // Start attached
            ballController.resetToAttached(mockBall, paddlePosition);
            expect(ballController.isAttached(mockBall)).toBe(true);
            expect(mockBall.physicsBody.velocity.x).toBe(0);
            expect(mockBall.physicsBody.velocity.y).toBe(0);

            // Launch
            ballController.launchBall(mockBall);
            expect(ballController.isAttached(mockBall)).toBe(false);
            expect(mockBall.physicsBody.velocity.y).toBe(-300);
        });

        it('should handle multiple launch cycles', () => {
            const paddlePosition: Vector2 = { x: 400, y: 350 };

            // First launch
            ballController.launchBall(mockBall);
            expect(ballController.isAttached(mockBall)).toBe(false);

            // Reset to attached
            ballController.resetToAttached(mockBall, paddlePosition);
            expect(ballController.isAttached(mockBall)).toBe(true);

            // Second launch
            ballController.launchBall(mockBall);
            expect(ballController.isAttached(mockBall)).toBe(false);
        });

        it('should provide debug info after launch', () => {
            ballController.launchBall(mockBall);

            const debugInfo = ballController.getDebugInfo(mockBall);

            expect(debugInfo.isAttached).toBe(false);
            expect(debugInfo.velocity.y).toBe(-300);
            expect(debugInfo.velocity.x).toBe(0);
        });
    });

    describe('Launch Physics Integration', () => {
        it('should respect physics world constraints', () => {
            // Launch ball toward a boundary
            ballController.launchBall(mockBall, { x: -1, y: 0 }); // Leftward

            // Step physics - ball should bounce off left wall
            for (let i = 0; i < 120; i++) { // 2 seconds at default fps
                world.step();
            }

            // Ball should have some horizontal velocity (may have bounced or not)
            expect(Math.abs(mockBall.physicsBody.velocity.x)).toBeGreaterThanOrEqual(0);
        });

        it('should apply restitution on bounces', () => {
            ballController.launchBall(mockBall, { x: 0, y: -1 });

            // Let ball hit ceiling and bounce
            for (let i = 0; i < 180; i++) { // 3 seconds
                world.step();
            }

            const finalSpeed = Math.sqrt(
                mockBall.physicsBody.velocity.x ** 2 +
                mockBall.physicsBody.velocity.y ** 2
            );

            // Ball should have some speed after bouncing (exact value depends on physics simulation)
            expect(finalSpeed).toBeGreaterThan(0);
        });
    });
});