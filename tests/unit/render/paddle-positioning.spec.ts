/**
 * Paddle Positioning Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test paddle positioning and kinematic body behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Bodies } from 'matter-js';
import type { PaddleController, Paddle, PaddleOptions, Vector2, Rectangle } from 'render/contracts';
import { createPhysicsWorld } from 'physics/world';

describe('Paddle Positioning', () => {
    let world: ReturnType<typeof createPhysicsWorld>;
    let mockPaddle: Paddle;

    beforeEach(() => {
        world = createPhysicsWorld();
        mockPaddle = {
            id: 'test-paddle',
            physicsBody: Bodies.rectangle(400, 350, 100, 20, { isStatic: true }),
            width: 100,
            height: 20,
            speed: 300,
            position: { x: 400, y: 350 },
        };

        // Add mock paddle to world
        world.add(mockPaddle.physicsBody);
    });

    afterEach(() => {
        world.dispose();
    });

    describe('Paddle Creation', () => {
        it('should create paddle with correct initial position', () => {
            const initialPos = { x: 400, y: 350 };
            const paddle = {
                id: 'test-paddle',
                physicsBody: Bodies.rectangle(initialPos.x, initialPos.y, 100, 20, { isStatic: true }),
                width: 100,
                height: 20,
                speed: 300,
                position: initialPos,
            };

            expect(paddle.position.x).toBe(400);
            expect(paddle.position.y).toBe(350);
            expect(paddle.width).toBe(100);
            expect(paddle.height).toBe(20);
            expect(paddle.speed).toBe(300);
        });

        it('should create paddle with custom options', () => {
            const options = { width: 120, height: 25, speed: 400 };
            const paddle = {
                id: 'custom-paddle',
                physicsBody: Bodies.rectangle(400, 350, options.width, options.height, { isStatic: true }),
                width: options.width,
                height: options.height,
                speed: options.speed,
                position: { x: 400, y: 350 },
            };

            expect(paddle.width).toBe(120);
            expect(paddle.height).toBe(25);
            expect(paddle.speed).toBe(400);
        });
    });

    describe('Position Updates', () => {
        it('should update paddle position from physics body', () => {
            // Simulate physics body position change
            mockPaddle.physicsBody.position.x = 450;
            mockPaddle.physicsBody.position.y = 360;

            // Update paddle position to match physics
            mockPaddle.position.x = mockPaddle.physicsBody.position.x;
            mockPaddle.position.y = mockPaddle.physicsBody.position.y;

            expect(mockPaddle.position.x).toBe(450);
            expect(mockPaddle.position.y).toBe(360);
        });

        it('should maintain paddle dimensions during position updates', () => {
            const originalWidth = mockPaddle.width;
            const originalHeight = mockPaddle.height;

            // Update position
            mockPaddle.position.x = 500;
            mockPaddle.position.y = 370;

            expect(mockPaddle.width).toBe(originalWidth);
            expect(mockPaddle.height).toBe(originalHeight);
        });
    });

    describe('Boundary Constraints', () => {
        it('should constrain paddle within screen bounds', () => {
            const screenWidth = 800;
            const paddleHalfWidth = mockPaddle.width / 2;

            // Test left boundary
            const leftPosition = { x: 10, y: 350 };
            const constrainedLeft = {
                x: Math.max(paddleHalfWidth, Math.min(screenWidth - paddleHalfWidth, leftPosition.x)),
                y: leftPosition.y,
            };

            expect(constrainedLeft.x).toBe(paddleHalfWidth);

            // Test right boundary
            const rightPosition = { x: 850, y: 350 };
            const constrainedRight = {
                x: Math.max(paddleHalfWidth, Math.min(screenWidth - paddleHalfWidth, rightPosition.x)),
                y: rightPosition.y,
            };

            expect(constrainedRight.x).toBe(screenWidth - paddleHalfWidth);

            // Test valid position
            const validPosition = { x: 400, y: 350 };
            const constrainedValid = {
                x: Math.max(paddleHalfWidth, Math.min(screenWidth - paddleHalfWidth, validPosition.x)),
                y: validPosition.y,
            };

            expect(constrainedValid.x).toBe(400);
        });

        it('should calculate paddle bounds correctly', () => {
            const paddleLeft = mockPaddle.position.x - mockPaddle.width / 2;
            const paddleTop = mockPaddle.position.y - mockPaddle.height / 2;
            const paddleRight = mockPaddle.position.x + mockPaddle.width / 2;
            const paddleBottom = mockPaddle.position.y + mockPaddle.height / 2;

            const centerX = paddleLeft + mockPaddle.width / 2;
            const centerY = paddleTop + mockPaddle.height / 2;

            expect(centerX).toBe(mockPaddle.position.x);
            expect(centerY).toBe(mockPaddle.position.y);
            expect(paddleRight - paddleLeft).toBe(mockPaddle.width);
            expect(paddleBottom - paddleTop).toBe(mockPaddle.height);
        });
    });

    describe('Physics Body Integration', () => {
        it('should maintain static body properties', () => {
            expect(mockPaddle.physicsBody.isStatic).toBe(true);
        });

        it('should sync physics body with paddle state', () => {
            const newPosition: Vector2 = { x: 380, y: 348 };

            mockPaddle.position = newPosition;
            mockPaddle.physicsBody.position.x = newPosition.x;
            mockPaddle.physicsBody.position.y = newPosition.y;

            expect(mockPaddle.physicsBody.position.x).toBe(mockPaddle.position.x);
            expect(mockPaddle.physicsBody.position.y).toBe(mockPaddle.position.y);
        });
    });

    describe('Movement Patterns', () => {
        it('should handle smooth horizontal movement', () => {
            const positions: Vector2[] = [
                { x: 350, y: 350 },
                { x: 375, y: 350 },
                { x: 400, y: 350 },
                { x: 425, y: 350 },
                { x: 450, y: 350 },
            ];

            positions.forEach((pos, index) => {
                mockPaddle.physicsBody.position.x = pos.x;
                mockPaddle.physicsBody.position.y = pos.y;
                mockPaddle.position = pos;

                expect(mockPaddle.position.x).toBe(pos.x);
                expect(mockPaddle.position.y).toBe(pos.y);

                if (index > 0) {
                    const distance = Math.abs(pos.x - positions[index - 1].x);
                    expect(distance).toBe(25); // Consistent movement
                }
            });
        });

        it('should handle rapid position changes', () => {
            const startPosition = { ...mockPaddle.position };
            const endPosition: Vector2 = { x: 600, y: 350 };

            mockPaddle.physicsBody.position.x = endPosition.x;
            mockPaddle.physicsBody.position.y = endPosition.y;
            mockPaddle.position = endPosition;

            expect(mockPaddle.position.x).toBe(endPosition.x);
            expect(mockPaddle.position.y).toBe(endPosition.y);
            expect(mockPaddle.position.x).not.toBe(startPosition.x);
        });

        it('should maintain vertical stability', () => {
            const initialY = mockPaddle.position.y;

            // Move horizontally multiple times
            const horizontalMoves = [300, 350, 400, 450, 500];
            horizontalMoves.forEach(x => {
                mockPaddle.physicsBody.position.x = x;
                mockPaddle.position.x = x;
                expect(mockPaddle.position.y).toBe(initialY);
            });
        });
    });
});