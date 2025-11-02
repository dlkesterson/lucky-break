/**
 * Input Normalization Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test input normalization across mouse, keyboard, and touch
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameInputManager } from 'input/input-manager';

describe('Input Normalization', () => {
    let inputManager: GameInputManager;
    let mockContainer: HTMLElement;

    beforeEach(() => {
        mockContainer = document.createElement('div');
        mockContainer.style.width = '800px';
        mockContainer.style.height = '600px';
        document.body.appendChild(mockContainer);
        Object.defineProperty(mockContainer, 'clientWidth', {
            configurable: true,
            get: () => 800,
        });
        Object.defineProperty(mockContainer, 'clientHeight', {
            configurable: true,
            get: () => 600,
        });

        inputManager = new GameInputManager();
        inputManager.initialize(mockContainer);
    });

    afterEach(() => {
        inputManager.destroy();
        document.body.removeChild(mockContainer);
    });

    describe('Mouse Input', () => {
        it('should normalize mouse position to paddle target', () => {
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: 400,
                clientY: 350,
                bubbles: true,
            });

            mockContainer.dispatchEvent(mouseEvent);

            const target = inputManager.getPaddleTarget();
            expect(target).toEqual({ x: 400, y: 350 });
        });

        it('should update paddle target on mouse move', () => {
            // First position
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 200,
                clientY: 300,
                bubbles: true,
            }));
            expect(inputManager.getPaddleTarget()).toEqual({ x: 200, y: 300 });

            // Second position
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 600,
                clientY: 400,
                bubbles: true,
            }));
            expect(inputManager.getPaddleTarget()).toEqual({ x: 600, y: 400 });
        });

        it('should track mouse as active input type', () => {
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 400,
                clientY: 350,
                bubbles: true,
            }));

            const debugState = inputManager.getDebugState();
            expect(debugState.activeInputs).toContain('mouse');
            expect(debugState.primaryInput).toBe('mouse');
            expect(debugState.mousePosition).toEqual({ x: 400, y: 350 });
        });
    });

    describe('Touch Input', () => {
        it('should normalize touch position to paddle target', () => {
            const touchEvent = new TouchEvent('touchmove', {
                touches: [
                    new Touch({
                        identifier: 1,
                        target: mockContainer,
                        clientX: 450,
                        clientY: 375,
                    }),
                ],
                bubbles: true,
            });

            mockContainer.dispatchEvent(touchEvent);

            const target = inputManager.getPaddleTarget();
            expect(target).toEqual({ x: 450, y: 375 });

            const debugState = inputManager.getDebugState();
            expect(debugState.primaryInput).toBe('touch');
            expect(debugState.touchPosition).toEqual({ x: 450, y: 375 });
        });

        it('should handle multiple touch points (use first touch)', () => {
            const touchEvent = new TouchEvent('touchmove', {
                touches: [
                    new Touch({
                        identifier: 1,
                        target: mockContainer,
                        clientX: 300,
                        clientY: 320,
                    }),
                    new Touch({
                        identifier: 2,
                        target: mockContainer,
                        clientX: 500,
                        clientY: 380,
                    }),
                ],
                bubbles: true,
            });

            mockContainer.dispatchEvent(touchEvent);

            const target = inputManager.getPaddleTarget();
            expect(target).toEqual({ x: 300, y: 320 }); // First touch
        });

        it('should track touch as active input type', () => {
            const touchEvent = new TouchEvent('touchmove', {
                touches: [
                    new Touch({
                        identifier: 1,
                        target: mockContainer,
                        clientX: 400,
                        clientY: 350,
                    }),
                ],
                bubbles: true,
            });

            mockContainer.dispatchEvent(touchEvent);

            const debugState = inputManager.getDebugState();
            expect(debugState.activeInputs).toContain('touch');
        });

        it('should keep paddle target in sync while dragging on touch devices', () => {
            const initialTouch = new Touch({
                identifier: 5,
                target: mockContainer,
                clientX: 120,
                clientY: 140,
            });

            mockContainer.dispatchEvent(new TouchEvent('touchstart', {
                touches: [initialTouch],
                changedTouches: [initialTouch],
                targetTouches: [initialTouch],
                bubbles: true,
                cancelable: true,
            }));

            expect(inputManager.getPaddleTarget()).toEqual({ x: 120, y: 140 });

            // Synthetic mouse events emitted by touch interactions should be ignored while touch is active
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 360,
                clientY: 180,
                bubbles: true,
            }));

            expect(inputManager.getPaddleTarget()).toEqual({ x: 120, y: 140 });

            const moveTouch = new Touch({
                identifier: 5,
                target: mockContainer,
                clientX: 260,
                clientY: 180,
            });

            mockContainer.dispatchEvent(new TouchEvent('touchmove', {
                touches: [moveTouch],
                changedTouches: [moveTouch],
                targetTouches: [moveTouch],
                bubbles: true,
                cancelable: true,
            }));

            expect(inputManager.getPaddleTarget()).toEqual({ x: 260, y: 180 });

            mockContainer.dispatchEvent(new TouchEvent('touchend', {
                touches: [],
                changedTouches: [moveTouch],
                targetTouches: [],
                bubbles: true,
                cancelable: true,
            }));

            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 280,
                clientY: 220,
                bubbles: true,
            }));

            expect(inputManager.getPaddleTarget()).toEqual({ x: 280, y: 220 });
        });
    });

    describe('Gamepad Input', () => {
        let restoreNavigator: (() => void) | null = null;
        let currentGamepads: (Gamepad | null)[] = [];

        const createButton = (pressed = false): GamepadButton => ({
            pressed,
            touched: pressed,
            value: pressed ? 1 : 0,
        });

        const createGamepad = (axes: number[], pressedButtons: readonly number[] = []): Gamepad => {
            const buttons = Array.from({ length: 8 }, (_, index) =>
                pressedButtons.includes(index) ? createButton(true) : createButton(false)
            );

            return {
                id: 'Test Gamepad',
                index: 0,
                connected: true,
                mapping: 'standard',
                axes,
                buttons,
                timestamp: 0,
                vibrationActuator: undefined,
            } as unknown as Gamepad;
        };

        beforeEach(() => {
            currentGamepads = [];
            const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
            Object.defineProperty(nav, 'getGamepads', {
                configurable: true,
                value: vi.fn(() => currentGamepads),
            });
            restoreNavigator = () => {
                delete (nav as { getGamepads?: () => (Gamepad | null)[] }).getGamepads;
                restoreNavigator = null;
            };
        });

        afterEach(() => {
            restoreNavigator?.();
        });

        it('should translate analog stick input into paddle movement', () => {
            const nowValues = [0, 16.67, 33.34];
            let nowIndex = 0;
            const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
                const value = nowValues[Math.min(nowIndex, nowValues.length - 1)];
                nowIndex += 1;
                return value;
            });

            currentGamepads = [createGamepad([0.75, 0, 0, 0])];

            // First poll establishes baseline and sets hasReceivedInput
            inputManager.getPaddleTarget();

            // Second poll applies movement with elapsed time
            const target = inputManager.getPaddleTarget();
            expect(target).not.toBeNull();
            if (!target) {
                throw new Error('Expected a paddle target for gamepad input');
            }
            expect(target.x).toBeGreaterThan(400);
            expect(target.x).toBeLessThanOrEqual(800);

            const debugState = inputManager.getDebugState();
            expect(debugState.activeInputs).toContain('gamepad');

            nowSpy.mockRestore();
        });

        it('should trigger launch when launch button is pressed', () => {
            const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => 0);

            currentGamepads = [createGamepad([0, 0, 0, 0])];

            // Initial poll
            inputManager.getPaddleTarget();

            currentGamepads = [createGamepad([0, 0, 0, 0], [0])];

            expect(inputManager.shouldLaunch()).toBe(true);
            const intent = inputManager.consumeLaunchIntent();
            expect(intent).not.toBeNull();
            expect(intent?.trigger.type).toBe('tap');

            nowSpy.mockRestore();
        });
    });

    describe('Keyboard Input', () => {
        it('should track keyboard state for arrow keys', () => {
            // Press left arrow
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));

            let debugState = inputManager.getDebugState();
            expect(debugState.keyboardPressed).toContain('ArrowLeft');
            expect(debugState.primaryInput).toBe('keyboard');

            // Press right arrow
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));

            debugState = inputManager.getDebugState();
            expect(debugState.keyboardPressed).toContain('ArrowLeft');
            expect(debugState.keyboardPressed).toContain('ArrowRight');
            expect(debugState.primaryInput).toBe('keyboard');

            // Release left arrow
            document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));

            debugState = inputManager.getDebugState();
            expect(debugState.keyboardPressed).not.toContain('ArrowLeft');
            expect(debugState.keyboardPressed).toContain('ArrowRight');
            expect(debugState.primaryInput).toBe('keyboard');
        });

        it('should track keyboard state for WASD keys', () => {
            // Press 'A' key
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));

            const debugState = inputManager.getDebugState();
            expect(debugState.keyboardPressed).toContain('KeyA');
            expect(debugState.primaryInput).toBe('keyboard');
        });

        it('should track keyboard as active input type', () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));

            const debugState = inputManager.getDebugState();
            expect(debugState.activeInputs).toContain('keyboard');
            expect(debugState.primaryInput).toBe('keyboard');
        });
    });

    describe('Input Priority', () => {
        it('should prioritize mouse over touch', () => {
            // Touch first
            mockContainer.dispatchEvent(new TouchEvent('touchmove', {
                touches: [new Touch({ identifier: 1, target: mockContainer, clientX: 300, clientY: 320 })],
                bubbles: true,
            }));

            // Mouse second
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 500,
                clientY: 400,
                bubbles: true,
            }));

            const target = inputManager.getPaddleTarget();
            expect(target).toEqual({ x: 500, y: 400 }); // Mouse takes priority

            const debugState = inputManager.getDebugState();
            expect(debugState.primaryInput).toBe('mouse');
        });

        it('should return null when no input is active', () => {
            const target = inputManager.getPaddleTarget();
            expect(target).toBeNull();
        });
    });

    describe('Input State Debug', () => {
        it('should provide comprehensive debug information', () => {
            // Simulate various inputs
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 400,
                clientY: 350,
                bubbles: true,
            }));
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));

            const debugState = inputManager.getDebugState();

            expect(debugState).toHaveProperty('activeInputs');
            expect(debugState).toHaveProperty('primaryInput');
            expect(debugState).toHaveProperty('mousePosition');
            expect(debugState).toHaveProperty('touchPosition');
            expect(debugState).toHaveProperty('gamepadCursor');
            expect(debugState).toHaveProperty('keyboardPressed');
            expect(debugState).toHaveProperty('paddleTarget');
            expect(debugState).toHaveProperty('launchPending');

            expect(debugState.activeInputs).toContain('mouse');
            expect(debugState.activeInputs).toContain('keyboard');
            expect(debugState.primaryInput).toBe('keyboard');
            expect(debugState.mousePosition).toEqual({ x: 400, y: 350 });
            expect(debugState.touchPosition).toBeNull();
            expect(debugState.gamepadCursor).toEqual({ x: 400, y: 510 });
            expect(debugState.keyboardPressed).toContain('ArrowLeft');
            expect(debugState.paddleTarget).toEqual({ x: 400, y: 350 });
        });
    });
});