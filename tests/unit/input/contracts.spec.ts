/**
 * Input Contracts Test Suite
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Test the input contracts and interfaces
 */

import { describe, it, expect } from 'vitest';
import type {
    InputManager,
    InputDebugState,
    InputType,
    LaunchIntent,
    LaunchTriggerDetail,
    Vector2,
} from 'input/contracts';

describe('Input Contracts', () => {
    describe('InputManager Interface', () => {
        it('should define required methods', () => {
            // Type-only test - ensures interface compiles correctly
            const inputManager: InputManager = {
                initialize: () => { },
                getPaddleTarget: () => null,
                shouldLaunch: () => false,
                getAimDirection: () => null,
                consumeLaunchIntent: () => null,
                syncPaddlePosition: () => { },
                resetLaunchTrigger: () => { },
                getDebugState: () => ({} as InputDebugState),
                destroy: () => { },
            };

            expect(inputManager).toBeDefined();
            expect(typeof inputManager.initialize).toBe('function');
            expect(typeof inputManager.getPaddleTarget).toBe('function');
            expect(typeof inputManager.shouldLaunch).toBe('function');
            expect(typeof inputManager.resetLaunchTrigger).toBe('function');
            expect(typeof inputManager.getDebugState).toBe('function');
            expect(typeof inputManager.destroy).toBe('function');
        });
    });

    describe('InputDebugState Interface', () => {
        it('should define debug state properties', () => {
            const debugState: InputDebugState = {
                activeInputs: ['mouse', 'keyboard'] as readonly InputType[],
                mousePosition: { x: 100, y: 200 },
                keyboardPressed: ['ArrowLeft', 'Space'] as readonly string[],
                paddleTarget: { x: 300, y: 400 },
                launchPending: true,
            };

            expect(debugState.activeInputs).toEqual(['mouse', 'keyboard']);
            expect(debugState.mousePosition).toEqual({ x: 100, y: 200 });
            expect(debugState.keyboardPressed).toEqual(['ArrowLeft', 'Space']);
            expect(debugState.paddleTarget).toEqual({ x: 300, y: 400 });
            expect(debugState.launchPending).toBe(true);
        });

        it('should allow null values for optional properties', () => {
            const debugState: InputDebugState = {
                activeInputs: [] as readonly InputType[],
                mousePosition: null,
                keyboardPressed: [] as readonly string[],
                paddleTarget: null,
                launchPending: false,
            };

            expect(debugState.mousePosition).toBeNull();
            expect(debugState.paddleTarget).toBeNull();
            expect(debugState.launchPending).toBe(false);
        });
    });

    describe('InputType Type', () => {
        it('should accept valid input types', () => {
            const types: InputType[] = ['mouse', 'keyboard', 'touch'];
            expect(types).toHaveLength(3);
            expect(types).toContain('mouse');
            expect(types).toContain('keyboard');
            expect(types).toContain('touch');
        });
    });

    describe('Vector2 Interface', () => {
        it('should define 2D vector properties', () => {
            const vector: Vector2 = { x: 10, y: 20 };
            expect(vector.x).toBe(10);
            expect(vector.y).toBe(20);
        });
    });

    describe('LaunchIntent Interface', () => {
        it('should describe launch trigger metadata', () => {
            const trigger: LaunchTriggerDetail = {
                type: 'tap',
                position: { x: 0, y: 0 },
                timestamp: 0,
            };

            const intent: LaunchIntent = {
                trigger,
                direction: { x: 0, y: -1 },
            };

            expect(intent.trigger.type).toBe('tap');
            expect(intent.direction.y).toBe(-1);
        });
    });
});