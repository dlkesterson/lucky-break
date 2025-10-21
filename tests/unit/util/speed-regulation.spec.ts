/**
 * Tests for Speed Regulation Utilities
 */

import { describe, it, expect } from 'vitest';
import { regulateSpeed, isSpeedWithinRange, getSpeedDebugInfo, getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { Bodies, Body, Vector } from 'matter-js';

describe('speed-regulation', () => {
    describe('regulateSpeed', () => {
        it('should boost slow speeds to base speed', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 2, y: 2 }); // Slow

            regulateSpeed(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            const speed = Vector.magnitude(body.velocity);
            expect(speed).toBeCloseTo(8, 1);
        });

        it('should clamp fast speeds to max speed', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 10, y: 10 }); // Fast

            regulateSpeed(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            const speed = Vector.magnitude(body.velocity);
            expect(speed).toBeCloseTo(14, 1);
        });

        it('should maintain speeds within range', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 6, y: 6 }); // 8.49 units/s, above base

            const initialSpeed = Vector.magnitude(body.velocity);
            expect(initialSpeed).toBeCloseTo(8.49, 1);

            regulateSpeed(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            // Speed is above base (8.49 > 8) so it shouldn't change
            const finalSpeed = Vector.magnitude(body.velocity);
            expect(finalSpeed).toBeCloseTo(8.49, 1);
        });

        it('should handle near-zero velocity', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 0.0001, y: 0.0001 });

            regulateSpeed(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            const speed = Vector.magnitude(body.velocity);
            expect(speed).toBeGreaterThan(0);
        });

        it('should preserve velocity direction', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 3, y: 4 }); // 5 units/s at specific angle

            regulateSpeed(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            // Should scale to base speed while preserving direction
            const ratio = body.velocity.y / body.velocity.x;
            expect(ratio).toBeCloseTo(4 / 3, 1);
        });
    });

    describe('isSpeedWithinRange', () => {
        it('should return true for speed within range', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 6, y: 6 }); // 8.49 units/s

            const result = isSpeedWithinRange(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            expect(result).toBe(true); // 8.49 is within [8, 14]
        });

        it('should return false for speed too slow', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 2, y: 2 });

            const result = isSpeedWithinRange(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            expect(result).toBe(false);
        });

        it('should return false for speed too fast', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 12, y: 12 });

            const result = isSpeedWithinRange(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            expect(result).toBe(false);
        });
    });

    describe('getSpeedDebugInfo', () => {
        it('should provide accurate debug information', () => {
            const body = Bodies.circle(0, 0, 10);
            Body.setVelocity(body, { x: 3, y: 4 }); // 5 units/s

            const info = getSpeedDebugInfo(body, {
                baseSpeed: 8,
                maxSpeed: 14,
            });

            expect(info.currentSpeed).toBeCloseTo(5, 1);
            expect(info.baseSpeed).toBe(8);
            expect(info.maxSpeed).toBe(14);
            expect(info.isTooSlow).toBe(true);
            expect(info.isTooFast).toBe(false);
            expect(info.isWithinRange).toBe(false);
        });
    });

    describe('getAdaptiveBaseSpeed', () => {
        it('should return base speed when combo below first step', () => {
            const result = getAdaptiveBaseSpeed(8, 14, 7);
            expect(result).toBe(8);
        });

        it('should increase base speed by 5 percent per combo step', () => {
            const result = getAdaptiveBaseSpeed(8, 14, 16); // two steps at default config
            expect(result).toBeCloseTo(8 * 1.1, 5);
        });

        it('should clamp adaptive speed to max speed', () => {
            const result = getAdaptiveBaseSpeed(10, 12, 64); // large combo should cap at 12
            expect(result).toBe(12);
        });
    });
});
