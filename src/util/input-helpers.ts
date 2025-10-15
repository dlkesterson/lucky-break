/**
 * Input Event Normalization Helpers
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Normalize browser input events into game input state
 */

import type { Vector2, InputState, InputType } from '../types';

/**
 * Mouse event data
 */
export interface MouseEventData {
    x: number;
    y: number;
    button: 'left' | 'right' | 'middle';
    pressed: boolean;
}

/**
 * Keyboard event data
 */
export interface KeyboardEventData {
    key: string;
    pressed: boolean;
}

/**
 * Touch event data
 */
export interface TouchEventData {
    touches: readonly Vector2[];
}

/**
 * Normalize mouse event to game coordinates
 */
export function normalizeMouseEvent(event: MouseEvent, canvas: HTMLCanvasElement): MouseEventData {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
        button: getMouseButton(event.button),
        pressed: event.type === 'mousedown' || event.type === 'mousemove',
    };
}

/**
 * Normalize keyboard event
 */
export function normalizeKeyboardEvent(event: KeyboardEvent): KeyboardEventData {
    return {
        key: event.code, // Use code for physical key location
        pressed: event.type === 'keydown',
    };
}

/**
 * Normalize touch event to game coordinates
 */
export function normalizeTouchEvent(event: TouchEvent, canvas: HTMLCanvasElement): TouchEventData {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const touches: Vector2[] = [];
    for (let i = 0; i < event.touches.length; i++) {
        const touch = event.touches[i];
        touches.push({
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY,
        });
    }

    return { touches };
}

/**
 * Convert normalized input events to game input state
 */
export function eventsToInputState(
    mouseEvent?: MouseEventData,
    keyboardEvents: readonly KeyboardEventData[] = [],
    touchEvent?: TouchEventData
): InputState {
    // Check keyboard input
    const leftPressed = keyboardEvents.some(e => e.pressed && (e.key === 'ArrowLeft' || e.key === 'KeyA'));
    const rightPressed = keyboardEvents.some(e => e.pressed && (e.key === 'ArrowRight' || e.key === 'KeyD'));

    // Get mouse position
    const mouseX = mouseEvent?.x;

    // Get touch position (use first touch)
    const touchX = touchEvent?.touches[0]?.x;

    // Launch requested if space pressed or screen tapped
    const spacePressed = keyboardEvents.some(e => e.pressed && e.key === 'Space');
    const screenTapped = touchEvent !== undefined || (mouseEvent && mouseEvent.pressed && mouseEvent.button === 'left');

    return {
        leftPressed,
        rightPressed,
        mouseX,
        touchX,
        launchRequested: spacePressed || screenTapped,
    };
}

/**
 * Get active input types from current events
 */
export function getActiveInputTypes(
    mouseEvent?: MouseEventData,
    keyboardEvents: readonly KeyboardEventData[] = [],
    touchEvent?: TouchEventData
): readonly InputType[] {
    const activeInputs: InputType[] = [];

    if (mouseEvent) activeInputs.push('mouse');
    if (keyboardEvents.length > 0) activeInputs.push('keyboard');
    if (touchEvent) activeInputs.push('touch');

    return activeInputs;
}

/**
 * Convert mouse button number to string
 */
function getMouseButton(button: number): 'left' | 'right' | 'middle' {
    switch (button) {
        case 0: return 'left';
        case 1: return 'middle';
        case 2: return 'right';
        default: return 'left';
    }
}

/**
 * Check if input state indicates paddle movement
 */
export function hasPaddleMovement(inputState: InputState): boolean {
    return inputState.leftPressed || inputState.rightPressed || inputState.mouseX !== undefined || inputState.touchX !== undefined;
}

/**
 * Get target paddle position from input state
 */
export function getPaddleTarget(inputState: InputState, screenWidth: number, paddleWidth: number): Vector2 | null {
    // Keyboard input takes precedence
    if (inputState.leftPressed) {
        return { x: paddleWidth / 2, y: 0 }; // Left edge
    }
    if (inputState.rightPressed) {
        return { x: screenWidth - paddleWidth / 2, y: 0 }; // Right edge
    }

    // Mouse/touch input
    const inputX = inputState.mouseX ?? inputState.touchX;
    if (inputX !== undefined) {
        return { x: Math.max(paddleWidth / 2, Math.min(screenWidth - paddleWidth / 2, inputX)), y: 0 };
    }

    return null;
}