/**
 * Physics Contracts Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test the physics contracts and interfaces
 */

import { describe, it, expect } from 'vitest';
import type { BallController, Ball, BallOptions, BallDebugInfo, Vector2 } from '../../../src/physics/contracts';

describe('Physics Contracts', () => {
    describe('BallController Interface', () => {
        it('should define required methods', () => {
            // Type-only test - ensures interface compiles correctly
            const ballController: BallController = {
                createAttachedBall: () => ({} as Ball),
                updateAttachment: () => { },
                launchBall: () => { },
                isAttached: () => false,
                resetToAttached: () => { },
                getDebugInfo: () => ({} as BallDebugInfo),
            };

            expect(ballController).toBeDefined();
            expect(typeof ballController.createAttachedBall).toBe('function');
            expect(typeof ballController.updateAttachment).toBe('function');
            expect(typeof ballController.launchBall).toBe('function');
            expect(typeof ballController.isAttached).toBe('function');
            expect(typeof ballController.resetToAttached).toBe('function');
            expect(typeof ballController.getDebugInfo).toBe('function');
        });
    });

    describe('Ball Interface', () => {
        it('should define ball properties', () => {
            const ball: Ball = {
                id: 'ball-1',
                physicsBody: { id: 123 }, // Mock Matter.js body
                isAttached: true,
                attachmentOffset: { x: 0, y: -10 },
                radius: 8,
            };

            expect(ball.id).toBe('ball-1');
            expect(ball.physicsBody).toBeDefined();
            expect(ball.isAttached).toBe(true);
            expect(ball.attachmentOffset).toEqual({ x: 0, y: -10 });
            expect(ball.radius).toBe(8);
        });
    });

    describe('BallOptions Interface', () => {
        it('should define optional ball configuration', () => {
            const options: BallOptions = {
                radius: 10,
                restitution: 0.8,
                friction: 0.1,
            };

            expect(options.radius).toBe(10);
            expect(options.restitution).toBe(0.8);
            expect(options.friction).toBe(0.1);
        });

        it('should allow partial configuration', () => {
            const options: BallOptions = {
                radius: 12,
            };

            expect(options.radius).toBe(12);
            expect(options.restitution).toBeUndefined();
            expect(options.friction).toBeUndefined();
        });
    });

    describe('BallDebugInfo Interface', () => {
        it('should define debug information structure', () => {
            const debugInfo: BallDebugInfo = {
                position: { x: 100, y: 200 },
                velocity: { x: 5, y: -3 },
                isAttached: false,
                attachmentOffset: { x: 0, y: 0 },
                physicsBodyId: 456,
            };

            expect(debugInfo.position).toEqual({ x: 100, y: 200 });
            expect(debugInfo.velocity).toEqual({ x: 5, y: -3 });
            expect(debugInfo.isAttached).toBe(false);
            expect(debugInfo.attachmentOffset).toEqual({ x: 0, y: 0 });
            expect(debugInfo.physicsBodyId).toBe(456);
        });
    });

    describe('Vector2 Interface', () => {
        it('should define 2D vector properties', () => {
            const vector: Vector2 = { x: 15, y: 25 };
            expect(vector.x).toBe(15);
            expect(vector.y).toBe(25);
        });
    });
});