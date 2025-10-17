/**
 * Tests for Paddle Reflection Utilities
 */

import { describe, it, expect } from 'vitest';
import { reflectOffPaddle, calculateReflectionData, getHitOffset } from 'util/paddle-reflection';
import { Bodies, Body } from 'matter-js';

describe('paddle-reflection', () => {
    describe('reflectOffPaddle', () => {
        it('should reflect ball upward from center hit', () => {
            const ball = Bodies.circle(100, 100, 10);
            const paddle = Bodies.rectangle(100, 150, 100, 20, { isStatic: true });
            Body.setVelocity(ball, { x: 0, y: 5 });

            reflectOffPaddle(ball, paddle, {
                paddleWidth: 100,
                minSpeed: 8,
            });

            expect(ball.velocity.x).toBeCloseTo(0, 1);
            expect(ball.velocity.y).toBeLessThan(0); // Upward
            expect(Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2)).toBeCloseTo(8, 1);
        });

        it('should reflect ball at angle from edge hit', () => {
            const ball = Bodies.circle(140, 100, 10); // Right edge
            const paddle = Bodies.rectangle(100, 150, 100, 20, { isStatic: true });
            Body.setVelocity(ball, { x: 0, y: 5 });

            reflectOffPaddle(ball, paddle, {
                paddleWidth: 100,
                minSpeed: 8,
            });

            expect(ball.velocity.x).toBeGreaterThan(0); // Rightward angle
            expect(ball.velocity.y).toBeLessThan(0); // Upward
        });

        it('should enforce minimum speed', () => {
            const ball = Bodies.circle(100, 100, 10);
            const paddle = Bodies.rectangle(100, 150, 100, 20, { isStatic: true });
            Body.setVelocity(ball, { x: 0, y: 1 }); // Slow speed

            reflectOffPaddle(ball, paddle, {
                paddleWidth: 100,
                minSpeed: 8,
            });

            const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
            expect(speed).toBeCloseTo(8, 1);
        });
    });

    describe('calculateReflectionData', () => {
        it('should return zero angle for center hit', () => {
            const data = calculateReflectionData(100, 100, { paddleWidth: 100, minSpeed: 8 });
            expect(data.angle).toBeCloseTo(0, 2);
            expect(data.impactOffset).toBeCloseTo(0, 2);
        });

        it('should return positive angle for right edge hit', () => {
            const data = calculateReflectionData(150, 100, { paddleWidth: 100, minSpeed: 8 });
            expect(data.angle).toBeGreaterThan(0);
            expect(data.impactOffset).toBeCloseTo(1, 1);
        });

        it('should return negative angle for left edge hit', () => {
            const data = calculateReflectionData(50, 100, { paddleWidth: 100, minSpeed: 8 });
            expect(data.angle).toBeLessThan(0);
            expect(data.impactOffset).toBeCloseTo(-1, 1);
        });
    });

    describe('getHitOffset', () => {
        it('should return 0 for center hit', () => {
            const offset = getHitOffset(100, 100, 100);
            expect(offset).toBeCloseTo(0, 2);
        });

        it('should return 1 for right edge', () => {
            const offset = getHitOffset(150, 100, 100);
            expect(offset).toBeCloseTo(1, 1);
        });

        it('should return -1 for left edge', () => {
            const offset = getHitOffset(50, 100, 100);
            expect(offset).toBeCloseTo(-1, 1);
        });

        it('should clamp values beyond edges', () => {
            const offset = getHitOffset(200, 100, 100);
            expect(offset).toBe(1);
        });
    });
});
