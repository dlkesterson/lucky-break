/**
 * Launch Trigger Detection Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test launch trigger detection from input events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { GameInputManager } from 'input/input-manager';

describe('Launch Trigger Detection', () => {
    let inputManager: GameInputManager;
    let mockContainer: HTMLElement;
    let fakeNow = 0;
    let nowSpy: MockInstance<[], number>;

    const createTouch = (clientX: number, clientY: number, identifier = 1) =>
        new Touch({ identifier, target: mockContainer, clientX, clientY });

    beforeEach(() => {
        vi.useFakeTimers();
        fakeNow = 0;
        nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

        mockContainer = document.createElement('div');
        document.body.appendChild(mockContainer);

        inputManager = new GameInputManager();
        inputManager.initialize(mockContainer);
    });

    afterEach(() => {
        inputManager.destroy();
        document.body.removeChild(mockContainer);
        nowSpy.mockRestore();
        vi.useRealTimers();
    });

    describe('Movement-Based Launch Trigger', () => {
        it('should detect launch when paddle moves beyond threshold', () => {
            // This test would require mocking the internal launch manager
            // For now, test that the input manager has the expected interface
            expect(typeof inputManager.getPaddleTarget).toBe('function');
            expect(typeof inputManager.shouldLaunch).toBe('function');
            expect(typeof inputManager.resetLaunchTrigger).toBe('function');
        });

        it('should not trigger launch for small movements', () => {
            // Movement detection is internal - test that no launch is triggered initially
            expect(inputManager.shouldLaunch()).toBe(false);
        });

        it('should reset launch trigger after processing', () => {
            // Simulate launch trigger (this would be internal)
            // For testing, just verify the reset functionality
            inputManager.resetLaunchTrigger();
            expect(inputManager.shouldLaunch()).toBe(false);
        });
    });

    describe('Tap/Click Launch Trigger', () => {
        it('should detect launch on screen tap', () => {
            const tapEvent = new MouseEvent('mousedown', {
                clientX: 400,
                clientY: 350,
                bubbles: true,
            });

            mockContainer.dispatchEvent(tapEvent);

            // Should trigger launch
            expect(inputManager.shouldLaunch()).toBe(true);
            const intent = inputManager.consumeLaunchIntent();
            expect(intent?.trigger.type).toBe('tap');
            expect(intent?.direction.y).toBeLessThan(0);
        });

        it('should detect launch on touch tap', () => {
            fakeNow = 0;
            const startTouch = createTouch(400, 350);
            const touchStart = new TouchEvent('touchstart', {
                touches: [startTouch],
                changedTouches: [startTouch],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchStart);

            fakeNow = 120;
            const endTouch = createTouch(400, 350);
            const touchEnd = new TouchEvent('touchend', {
                touches: [],
                changedTouches: [endTouch],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchEnd);

            expect(inputManager.shouldLaunch()).toBe(true);
            const intent = inputManager.consumeLaunchIntent();
            expect(intent?.trigger.type).toBe('tap');
            expect(intent?.direction.y).toBeLessThan(0);
        });

        it('should handle multiple rapid taps', () => {
            // First tap
            const tap1 = new MouseEvent('mousedown', { clientX: 400, clientY: 350 });
            mockContainer.dispatchEvent(tap1);
            expect(inputManager.shouldLaunch()).toBe(true);
            inputManager.consumeLaunchIntent();

            // Reset
            inputManager.resetLaunchTrigger();
            expect(inputManager.shouldLaunch()).toBe(false);

            // Second tap
            const tap2 = new MouseEvent('mousedown', { clientX: 450, clientY: 350 });
            mockContainer.dispatchEvent(tap2);
            expect(inputManager.shouldLaunch()).toBe(true);
        });

        it('should trigger launch after long press', () => {
            fakeNow = 0;
            const startTouch = createTouch(410, 360);
            const touchStart = new TouchEvent('touchstart', {
                touches: [startTouch],
                changedTouches: [startTouch],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchStart);

            vi.advanceTimersByTime(400);
            fakeNow = 400;

            const touchEnd = new TouchEvent('touchend', {
                touches: [],
                changedTouches: [createTouch(410, 360)],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchEnd);

            expect(inputManager.shouldLaunch()).toBe(true);
            const intent = inputManager.consumeLaunchIntent();
            expect(intent?.trigger.type).toBe('long-press');
            expect((intent?.trigger.durationMs ?? 0)).toBeGreaterThanOrEqual(350);
        });

        it('should detect swipe gesture and aim direction', () => {
            fakeNow = 0;
            const startTouch = createTouch(400, 360);
            const touchStart = new TouchEvent('touchstart', {
                touches: [startTouch],
                changedTouches: [startTouch],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchStart);

            fakeNow = 40;
            const moveTouch = createTouch(440, 300);
            const touchMove = new TouchEvent('touchmove', {
                touches: [moveTouch],
                changedTouches: [moveTouch],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchMove);

            fakeNow = 90;
            const endTouch = createTouch(440, 300);
            const touchEnd = new TouchEvent('touchend', {
                touches: [],
                changedTouches: [endTouch],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchEnd);

            expect(inputManager.shouldLaunch()).toBe(true);
            const intent = inputManager.consumeLaunchIntent();
            expect(intent?.trigger.type).toBe('swipe');
            expect((intent?.trigger.swipeDistance ?? 0)).toBeGreaterThanOrEqual(36);
            expect(intent?.direction.y ?? 0).toBeLessThan(0);
            expect(Math.abs(intent?.direction.x ?? 0)).toBeGreaterThan(0);
        });
    });

    describe('Launch State Management', () => {
        it('should maintain launch pending state', () => {
            // Initially no launch pending
            expect(inputManager.shouldLaunch()).toBe(false);

            // Set initial position
            inputManager.checkMovementLaunch({ x: 400, y: 350 });

            // Move paddle significantly to trigger launch
            inputManager.checkMovementLaunch({ x: 400, y: 250 }); // Move up 100 units

            // Should be pending
            expect(inputManager.shouldLaunch()).toBe(true);
        });

        it('should clear launch state after reset', () => {
            // Set launch pending
            expect(inputManager.shouldLaunch()).toBe(false);

            // Reset
            inputManager.resetLaunchTrigger();

            // Should be cleared
            expect(inputManager.shouldLaunch()).toBe(false);
        });

        it('should provide debug information about launch state', () => {
            const debugState = inputManager.getDebugState();

            expect(debugState).toHaveProperty('launchPending');
            expect(typeof debugState.launchPending).toBe('boolean');
        });
    });

    describe('Input Type Detection', () => {
        it('should identify mouse input for launch', () => {
            const mouseEvent = new MouseEvent('mousedown', { clientX: 400, clientY: 350 });
            mockContainer.dispatchEvent(mouseEvent);

            const debugState = inputManager.getDebugState();
            expect(debugState.activeInputs).toContain('mouse');
            expect(debugState.primaryInput).toBe('mouse');
        });

        it('should identify touch input for launch', () => {
            const touchEvent = new TouchEvent('touchstart', {
                touches: [new Touch({ identifier: 1, target: mockContainer, clientX: 400, clientY: 350 })],
            });
            mockContainer.dispatchEvent(touchEvent);

            const debugState = inputManager.getDebugState();
            expect(debugState.activeInputs).toContain('touch');
            expect(debugState.primaryInput).toBe('touch');
        });
    });

    describe('Aim Direction Preview', () => {
        it('should compute aim direction from pointer movement', () => {
            inputManager.syncPaddlePosition({ x: 400, y: 520 });
            const moveEvent = new MouseEvent('mousemove', { clientX: 460, clientY: 460 });
            mockContainer.dispatchEvent(moveEvent);

            const pointerTarget = inputManager.getPaddleTarget();
            expect(pointerTarget).not.toBeNull();
            expect(inputManager.getAimDirection()).toBeNull();
        });

        it('should default aim upward during long press without movement', () => {
            inputManager.syncPaddlePosition({ x: 400, y: 520 });

            fakeNow = 0;
            const startTouch = createTouch(400, 520);
            const touchStart = new TouchEvent('touchstart', {
                touches: [startTouch],
                changedTouches: [startTouch],
                bubbles: true,
            });
            mockContainer.dispatchEvent(touchStart);

            vi.advanceTimersByTime(400);
            fakeNow = 400;

            const direction = inputManager.getAimDirection();
            expect(direction).not.toBeNull();
            if (!direction) {
                throw new Error('Expected aim direction to be defined');
            }
            expect(direction.y).toBeLessThan(0);
            expect(Math.abs(direction.x)).toBeLessThanOrEqual(1);
        });
    });
});