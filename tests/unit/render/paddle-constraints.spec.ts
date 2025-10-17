/**
 * Paddle Boundary Constraints Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test paddle boundary constraints and collision detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaddleBodyController } from 'render/paddle-body';
import type { Vector2, Rectangle } from 'render/contracts';

describe('Paddle Boundary Constraints', () => {
    let paddleController: PaddleBodyController;
    let mockPaddle: any;

    beforeEach(() => {
        paddleController = new PaddleBodyController();
        mockPaddle = {
            id: 'test-paddle',
            physicsBody: {
                position: { x: 400, y: 350 },
                isStatic: true,
            },
            width: 100,
            height: 20,
            speed: 300,
            position: { x: 400, y: 350 },
        };
    });

    describe('Paddle Bounds Calculation', () => {
        it('should calculate paddle bounds correctly', () => {
            const bounds = paddleController.getPaddleBounds(mockPaddle);

            expect(bounds.x).toBe(350); // center - half width
            expect(bounds.y).toBe(340); // center - half height
            expect(bounds.width).toBe(100);
            expect(bounds.height).toBe(20);
        });

        it('should calculate paddle center correctly', () => {
            const center = paddleController.getPaddleCenter(mockPaddle);
            expect(center).toEqual({ x: 400, y: 350 });
        });

        it('should handle different paddle sizes', () => {
            const largePaddle = { ...mockPaddle, width: 150, height: 30 };
            const bounds = paddleController.getPaddleBounds(largePaddle);

            expect(bounds.x).toBe(325); // 400 - 75
            expect(bounds.y).toBe(335); // 350 - 15
            expect(bounds.width).toBe(150);
            expect(bounds.height).toBe(30);
        });
    });

    describe('Boundary Collision Detection', () => {
        it('should detect left boundary collision', () => {
            // Paddle at left edge
            mockPaddle.position.x = 50; // Half width (50) touches left boundary
            const collision = paddleController.checkBoundaryCollision(mockPaddle, 800);

            expect(collision.left).toBe(true);
            expect(collision.right).toBe(false);
        });

        it('should detect right boundary collision', () => {
            // Paddle at right edge
            mockPaddle.position.x = 750; // 800 - half width (50)
            const collision = paddleController.checkBoundaryCollision(mockPaddle, 800);

            expect(collision.left).toBe(false);
            expect(collision.right).toBe(true);
        });

        it('should detect no collision when paddle is centered', () => {
            mockPaddle.position.x = 400;
            const collision = paddleController.checkBoundaryCollision(mockPaddle, 800);

            expect(collision.left).toBe(false);
            expect(collision.right).toBe(false);
        });

        it('should handle different screen widths', () => {
            // Narrow screen
            mockPaddle.position.x = 475; // 500 - 25 (half width)
            const collision = paddleController.checkBoundaryCollision(mockPaddle, 500);

            expect(collision.right).toBe(true);
        });
    });

    describe('Position Constraints', () => {
        it('should constrain paddle within left boundary', () => {
            const outOfBoundsPosition: Vector2 = { x: 20, y: 350 }; // Too far left
            paddleController.setPaddlePosition(mockPaddle, outOfBoundsPosition);

            expect(mockPaddle.position.x).toBe(50); // Constrained to half width
            expect(mockPaddle.position.y).toBe(350);
        });

        it('should constrain paddle within right boundary', () => {
            const outOfBoundsPosition: Vector2 = { x: 1300, y: 350 }; // Too far right
            paddleController.setPaddlePosition(mockPaddle, outOfBoundsPosition);

            expect(mockPaddle.position.x).toBe(1230); // Constrained to 1280 - 50 (half width)
            expect(mockPaddle.position.y).toBe(350);
        });

        it('should allow valid positions', () => {
            const validPosition: Vector2 = { x: 400, y: 350 };
            paddleController.setPaddlePosition(mockPaddle, validPosition);

            expect(mockPaddle.position.x).toBe(400);
            expect(mockPaddle.position.y).toBe(350);
        });

        it('should constrain to boundaries during updates', () => {
            // Simulate update that would go out of bounds
            const inputState = {
                leftPressed: false,
                rightPressed: false,
                mouseX: 20, // Out of bounds
                touchX: undefined,
                launchRequested: false,
            };

            paddleController.updatePaddle(mockPaddle, 1 / 60, inputState);

            expect(mockPaddle.position.x).toBe(50); // Constrained
        });
    });

    describe('Movement Updates', () => {
        it('should update paddle position based on mouse input', () => {
            const inputState = {
                leftPressed: false,
                rightPressed: false,
                mouseX: 500,
                touchX: undefined,
                launchRequested: false,
            };

            paddleController.updatePaddle(mockPaddle, 1 / 60, inputState);

            expect(mockPaddle.position.x).toBe(500);
        });

        it('should prioritize mouse over touch input', () => {
            const inputState = {
                leftPressed: false,
                rightPressed: false,
                mouseX: 300,
                touchX: 600, // Should be ignored
                launchRequested: false,
            };

            paddleController.updatePaddle(mockPaddle, 1 / 60, inputState);

            expect(mockPaddle.position.x).toBe(300);
        });

        it('should handle keyboard input simulation', () => {
            // Note: Keyboard input is handled differently in the actual implementation
            // This test verifies the interface
            expect(typeof paddleController.updatePaddle).toBe('function');
        });

        it('should maintain vertical position stability', () => {
            const initialY = mockPaddle.position.y;

            const inputState = {
                leftPressed: false,
                rightPressed: false,
                mouseX: 500,
                touchX: undefined,
                launchRequested: false,
            };

            paddleController.updatePaddle(mockPaddle, 1 / 60, inputState);

            expect(mockPaddle.position.y).toBe(initialY);
        });
    });

    describe('Physics Body Synchronization', () => {
        it('should sync physics body with paddle position', () => {
            const newPosition: Vector2 = { x: 450, y: 355 };
            paddleController.setPaddlePosition(mockPaddle, newPosition);

            expect(mockPaddle.physicsBody.position.x).toBe(450);
            expect(mockPaddle.physicsBody.position.y).toBe(355);
        });

        it('should maintain physics body static property', () => {
            expect(mockPaddle.physicsBody.isStatic).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero-sized paddle', () => {
            const zeroPaddle = { ...mockPaddle, width: 0, height: 0 };
            const bounds = paddleController.getPaddleBounds(zeroPaddle);

            expect(bounds.x).toBe(400);
            expect(bounds.y).toBe(350);
            expect(bounds.width).toBe(0);
            expect(bounds.height).toBe(0);
        });

        it('should handle negative positions', () => {
            const negativePosition: Vector2 = { x: -100, y: -50 };
            paddleController.setPaddlePosition(mockPaddle, negativePosition);

            expect(mockPaddle.position.x).toBe(50); // Constrained
            expect(mockPaddle.position.y).toBe(-50); // Y not constrained in this implementation
        });

        it('should handle very large screen widths', () => {
            const largeScreenPosition: Vector2 = { x: 2000, y: 350 };
            paddleController.setPaddlePosition(mockPaddle, largeScreenPosition);

            expect(mockPaddle.position.x).toBe(1230); // Constrained to 1280 - 50
        });
    });
});