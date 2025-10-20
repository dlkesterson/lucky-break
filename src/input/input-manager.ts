/**
 * Input Manager Implementation
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Cross-platform input handling for paddle control and launch triggers
 */

import type { InputManager, InputDebugState, InputType, Vector2 } from './contracts';
import { PaddleLaunchManager } from './launch-manager';
import { normalizeMouseEvent } from 'util/input-helpers';

export class GameInputManager implements InputManager {
    private container: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private mousePosition: Vector2 | null = null;
    private touchPosition: Vector2 | null = null;
    private activeTouchId: number | null = null;
    private suppressMouseInput = false;
    private keyboardState = new Map<string, boolean>();
    private activeInputs = new Set<InputType>();
    private launchManager = new PaddleLaunchManager();
    private previousPaddlePosition: Vector2 | null = null;
    private hasReceivedInput = false; // Track if user has moved mouse/touch since initialization
    private mouseEventTarget: HTMLElement | null = null;
    private readonly nonPassiveTouchOptions: AddEventListenerOptions = { passive: false };
    private readonly mouseDownListener: (event: MouseEvent) => void;
    private readonly mouseMoveListener: (event: MouseEvent) => void;
    private readonly mouseUpListener: (event: MouseEvent) => void;
    private readonly touchStartListener: (event: TouchEvent) => void;
    private readonly touchMoveListener: (event: TouchEvent) => void;
    private readonly touchEndListener: (event: TouchEvent) => void;
    private readonly touchCancelListener: (event: TouchEvent) => void;
    private readonly keyDownListener: (event: KeyboardEvent) => void;
    private readonly keyUpListener: (event: KeyboardEvent) => void;
    private readonly contextMenuListener: (event: Event) => void;

    constructor() {
        this.mouseDownListener = this.handleMouseDown.bind(this);
        this.mouseMoveListener = this.handleMouseMove.bind(this);
        this.mouseUpListener = this.handleMouseUp.bind(this);
        this.touchStartListener = this.handleTouchStart.bind(this);
        this.touchMoveListener = this.handleTouchMove.bind(this);
        this.touchEndListener = this.handleTouchEnd.bind(this);
        this.touchCancelListener = this.handleTouchCancel.bind(this);
        this.keyDownListener = this.handleKeyDown.bind(this);
        this.keyUpListener = this.handleKeyUp.bind(this);
        this.contextMenuListener = (event) => event.preventDefault();
    }

    initialize(container: HTMLElement): void {
        this.teardownEventListeners();

        this.container = container;
        // Find the canvas element within the container
        this.canvas = container.querySelector('canvas') ?? null;

        // Clear any stale positions from before initialization
        this.mousePosition = null;
        this.touchPosition = null;
        this.activeTouchId = null;
        this.suppressMouseInput = false;
        this.hasReceivedInput = false;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        if (!this.container) {
            return;
        }

        const mouseTarget = this.canvas ?? this.container;
        this.mouseEventTarget = mouseTarget;

        if (mouseTarget) {
            mouseTarget.addEventListener('mousedown', this.mouseDownListener);
            mouseTarget.addEventListener('mousemove', this.mouseMoveListener);
            mouseTarget.addEventListener('mouseup', this.mouseUpListener);
            mouseTarget.addEventListener('contextmenu', this.contextMenuListener);
        }

        // Touch events
        this.container.addEventListener('touchstart', this.touchStartListener, this.nonPassiveTouchOptions);
        this.container.addEventListener('touchmove', this.touchMoveListener, this.nonPassiveTouchOptions);
        this.container.addEventListener('touchend', this.touchEndListener);
        this.container.addEventListener('touchcancel', this.touchCancelListener);

        // Keyboard events
        document.addEventListener('keydown', this.keyDownListener);
        document.addEventListener('keyup', this.keyUpListener);
    }

    private teardownEventListeners(): void {
        if (this.mouseEventTarget) {
            this.mouseEventTarget.removeEventListener('mousedown', this.mouseDownListener);
            this.mouseEventTarget.removeEventListener('mousemove', this.mouseMoveListener);
            this.mouseEventTarget.removeEventListener('mouseup', this.mouseUpListener);
            this.mouseEventTarget.removeEventListener('contextmenu', this.contextMenuListener);
        }

        if (this.container) {
            this.container.removeEventListener('touchstart', this.touchStartListener, this.nonPassiveTouchOptions);
            this.container.removeEventListener('touchmove', this.touchMoveListener, this.nonPassiveTouchOptions);
            this.container.removeEventListener('touchend', this.touchEndListener);
            this.container.removeEventListener('touchcancel', this.touchCancelListener);
            this.container.removeEventListener('contextmenu', this.contextMenuListener);
        }

        document.removeEventListener('keydown', this.keyDownListener);
        document.removeEventListener('keyup', this.keyUpListener);

        this.mouseEventTarget = null;
    }

    private handleMouseDown(event: MouseEvent): void {
        if (this.suppressMouseInput) {
            return;
        }
        this.activeInputs.add('mouse');
        this.hasReceivedInput = true; // User has interacted

        if (this.canvas) {
            const normalized = normalizeMouseEvent(event, this.canvas);
            this.mousePosition = { x: normalized.x, y: normalized.y };
        } else {
            // Fallback: use raw client coordinates
            this.mousePosition = { x: event.clientX, y: event.clientY };
        }

        this.launchManager.triggerTapLaunch(this.mousePosition);
    }

    private handleMouseMove(event: MouseEvent): void {
        if (this.suppressMouseInput) {
            return;
        }
        this.activeInputs.add('mouse');
        this.hasReceivedInput = true; // User has moved mouse

        if (this.canvas) {
            const normalized = normalizeMouseEvent(event, this.canvas);
            this.mousePosition = { x: normalized.x, y: normalized.y };
        } else {
            // Fallback: use raw client coordinates
            this.mousePosition = { x: event.clientX, y: event.clientY };
        }
    }

    private handleMouseUp(event: MouseEvent): void {
        void event;
        // Mouse up doesn't remove from active inputs as mouse is still available
    }

    private handleTouchStart(event: TouchEvent): void {
        if (event.cancelable) {
            event.preventDefault();
        }
        this.activeInputs.add('touch');
        this.hasReceivedInput = true; // User has touched
        this.suppressMouseInput = true;
        this.mousePosition = null;

        if (event.touches.length > 0) {
            const primaryTouch = event.changedTouches[0] ?? event.touches[0];
            if (primaryTouch) {
                this.activeTouchId = primaryTouch.identifier;
                this.touchPosition = this.getTouchPosition(primaryTouch);
                this.launchManager.triggerTapLaunch(this.touchPosition);
            }
        }
    }

    private handleTouchMove(event: TouchEvent): void {
        if (event.cancelable) {
            event.preventDefault();
        }
        this.activeInputs.add('touch');
        this.hasReceivedInput = true; // User has moved touch

        const activeTouch = this.getActiveTouch(event.touches);
        if (activeTouch) {
            this.activeTouchId = activeTouch.identifier;
            this.touchPosition = this.getTouchPosition(activeTouch);
        }
    }

    private handleTouchEnd(event: TouchEvent): void {
        if (event.touches.length === 0) {
            this.activeTouchId = null;
            this.suppressMouseInput = false;
        } else {
            const remaining = this.getActiveTouch(event.touches);
            if (remaining) {
                this.activeTouchId = remaining.identifier;
                this.touchPosition = this.getTouchPosition(remaining);
            }
        }
    }

    private handleTouchCancel(event: TouchEvent): void {
        void event;
        this.activeTouchId = null;
        this.suppressMouseInput = false;
        this.touchPosition = null;
    }

    private handleKeyDown(event: KeyboardEvent): void {
        this.activeInputs.add('keyboard');
        this.keyboardState.set(event.code, true);
    }

    private handleKeyUp(event: KeyboardEvent): void {
        this.keyboardState.set(event.code, false);
    }

    getPaddleTarget(): Vector2 | null {
        // Don't return mouse/touch position until user has actually moved after initialization
        if (!this.hasReceivedInput) {
            return null;
        }

        // Priority: mouse > touch > keyboard
        if (this.mousePosition) {
            return { ...this.mousePosition };
        }

        if (this.touchPosition) {
            return { ...this.touchPosition };
        }

        // Keyboard control - simulate left/right movement from arrow keys
        const leftPressed = Boolean(this.keyboardState.get('ArrowLeft')) || Boolean(this.keyboardState.get('KeyA'));
        const rightPressed = Boolean(this.keyboardState.get('ArrowRight')) || Boolean(this.keyboardState.get('KeyD'));

        if (leftPressed || rightPressed) {
            // For keyboard, we need the current paddle position to move relative to it
            // This would be passed in from the game loop
            // For now, return null - keyboard movement is handled in the paddle controller
            return null;
        }

        return null;
    }

    shouldLaunch(): boolean {
        return this.launchManager.isLaunchPending();
    }

    resetLaunchTrigger(): void {
        this.launchManager.reset();
    }

    syncPaddlePosition(position: Vector2 | null): void {
        this.previousPaddlePosition = position ? { ...position } : null;
    }

    /**
     * Check for launch based on paddle movement
     * @param currentPaddlePosition - Current paddle position
     * @returns True if launch should be triggered
     */
    checkMovementLaunch(currentPaddlePosition: Vector2): boolean {
        const shouldLaunch = this.launchManager.shouldTriggerLaunch(
            currentPaddlePosition,
            this.previousPaddlePosition,
            5 // movement threshold
        );

        this.previousPaddlePosition = { ...currentPaddlePosition };
        return shouldLaunch;
    }

    getDebugState(): InputDebugState {
        return {
            activeInputs: Array.from(this.activeInputs),
            mousePosition: this.mousePosition,
            keyboardPressed: Array.from(this.keyboardState.entries())
                .filter(([, pressed]) => pressed)
                .map(([key]) => key),
            paddleTarget: this.getPaddleTarget(),
            launchPending: this.shouldLaunch(),
        };
    }

    destroy(): void {
        this.teardownEventListeners();

        this.launchManager.reset();
        this.activeInputs.clear();
        this.keyboardState.clear();
        this.container = null;
        this.canvas = null;
        this.mousePosition = null;
        this.touchPosition = null;
        this.activeTouchId = null;
        this.suppressMouseInput = false;
        this.hasReceivedInput = false;
    }

    private getTouchPosition(touch: Touch): Vector2 {
        if (this.canvas) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = rect.width !== 0 ? this.canvas.width / rect.width : 1;
            const scaleY = rect.height !== 0 ? this.canvas.height / rect.height : 1;

            return {
                x: (touch.clientX - rect.left) * scaleX,
                y: (touch.clientY - rect.top) * scaleY,
            };
        }

        return { x: touch.clientX, y: touch.clientY };
    }

    private getActiveTouch(touches: TouchList): Touch | null {
        if (touches.length === 0) {
            return null;
        }

        if (this.activeTouchId !== null) {
            for (const touch of Array.from(touches)) {
                if (touch.identifier === this.activeTouchId) {
                    return touch;
                }
            }
        }

        return touches[0] ?? null;
    }
}
