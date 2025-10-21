/**
 * Input Manager Implementation
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Cross-platform input handling for paddle control and launch triggers
 */

import type { InputManager, InputDebugState, InputType, LaunchIntent, Vector2 } from './contracts';
import { PaddleLaunchManager } from './launch-manager';
import { normalizeMouseEvent } from 'util/input-helpers';

const DEFAULT_DIRECTION: Vector2 = { x: 0, y: -1 };
const LONG_PRESS_THRESHOLD_MS = 350;
const LONG_PRESS_MOVE_TOLERANCE = 20;
const TAP_MAX_DURATION_MS = 250;
const SWIPE_MIN_DISTANCE = 36;
const MIN_AIM_DISTANCE = 8;
const MIN_UPWARD_COMPONENT = 0.25;
const GAMEPAD_DEADZONE = 0.2;
const GAMEPAD_MOVE_SPEED_PX_PER_SECOND = 1600;
const GAMEPAD_PRIMARY_AXIS_INDEX = 0;
const GAMEPAD_LAUNCH_BUTTONS: readonly number[] = [0, 1, 6, 7];

const cloneVector = (value: Vector2): Vector2 => ({ x: value.x, y: value.y });
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export class GameInputManager implements InputManager {
    private container: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private mousePosition: Vector2 | null = null;
    private touchPosition: Vector2 | null = null;
    private touchStartPosition: Vector2 | null = null;
    private touchStartTimestampMs: number | null = null;
    private activeTouchId: number | null = null;
    private suppressMouseInput = false;
    private keyboardState = new Map<string, boolean>();
    private activeInputs = new Set<InputType>();
    private launchManager = new PaddleLaunchManager();
    private previousPaddlePosition: Vector2 | null = null;
    private hasReceivedInput = false; // Track if user has moved mouse/touch since initialization
    private mouseEventTarget: HTMLElement | null = null;
    private longPressTimer: ReturnType<typeof setTimeout> | null = null;
    private longPressEligible = false;
    private longPressReady = false;
    private currentAimDirection: Vector2 | null = null;
    private gamepadIndex: number | null = null;
    private gamepadCursorX: number | null = null;
    private gamepadCursorY: number | null = null;
    private gamepadLastTimestampMs: number | null = null;
    private gamepadLaunchHeld = false;
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
    private readonly gamepadConnectedListener: (event: GamepadEvent) => void;
    private readonly gamepadDisconnectedListener: (event: GamepadEvent) => void;

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
    this.gamepadConnectedListener = this.handleGamepadConnected.bind(this);
    this.gamepadDisconnectedListener = this.handleGamepadDisconnected.bind(this);
    }

    initialize(container: HTMLElement): void {
        this.teardownEventListeners();

        this.container = container;
        // Find the canvas element within the container
        this.canvas = container.querySelector('canvas') ?? null;

        // Clear any stale positions from before initialization
        this.mousePosition = null;
        this.touchPosition = null;
        this.resetTouchGestureState();
        this.activeTouchId = null;
        this.suppressMouseInput = false;
        this.hasReceivedInput = false;
        this.gamepadIndex = null;
        const { width, height } = this.getCanvasSize();
        this.gamepadCursorX = width > 0 ? width / 2 : null;
        this.gamepadCursorY = height > 0 ? Math.max(0, height * 0.85) : null;
        this.gamepadLastTimestampMs = null;
        this.gamepadLaunchHeld = false;

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

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('gamepadconnected', this.gamepadConnectedListener);
            window.addEventListener('gamepaddisconnected', this.gamepadDisconnectedListener);
        }
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

        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('gamepadconnected', this.gamepadConnectedListener);
            window.removeEventListener('gamepaddisconnected', this.gamepadDisconnectedListener);
        }

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

        const primaryTouch = this.getPrimaryTouch(event);
        if (!primaryTouch) {
            return;
        }

        this.activeTouchId = primaryTouch.identifier;
        const position = this.getTouchPosition(primaryTouch);
        this.touchPosition = position;
        this.touchStartPosition = cloneVector(position);
        this.touchStartTimestampMs = this.getTimestamp();
        this.longPressEligible = true;
        this.longPressReady = false;
        this.currentAimDirection = null;
        this.scheduleLongPressCheck();
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
            const position = this.getTouchPosition(activeTouch);
            this.touchPosition = position;

            if (this.touchStartPosition) {
                const movement = this.distanceBetween(this.touchStartPosition, position);
                if (this.longPressEligible && movement > LONG_PRESS_MOVE_TOLERANCE) {
                    this.longPressEligible = false;
                    this.longPressReady = false;
                    this.clearLongPressTimer();
                }

                const aimDirection = this.computeAimDirection(this.touchStartPosition, position);
                this.currentAimDirection = aimDirection;
            }
        }
    }

    private handleTouchEnd(event: TouchEvent): void {
        if (event.cancelable) {
            event.preventDefault();
        }

        const endedTouch = this.getTouchById(event.changedTouches, this.activeTouchId);
        if (endedTouch) {
            const endPosition = this.getTouchPosition(endedTouch);
            this.touchPosition = endPosition;
            this.processTouchRelease(endPosition);
            this.resetTouchGestureState();
        } else {
            this.clearLongPressTimer();
        }

        if (event.touches.length === 0) {
            this.activeTouchId = null;
            this.suppressMouseInput = false;
            this.touchPosition = null;
        } else {
            const remaining = this.getActiveTouch(event.touches);
            if (remaining) {
                this.activeTouchId = remaining.identifier;
                const nextPosition = this.getTouchPosition(remaining);
                this.touchPosition = nextPosition;
                this.touchStartPosition = cloneVector(nextPosition);
                this.touchStartTimestampMs = this.getTimestamp();
                this.longPressEligible = true;
                this.longPressReady = false;
                this.currentAimDirection = null;
                this.scheduleLongPressCheck();
            }
        }
    }

    private handleTouchCancel(event: TouchEvent): void {
        void event;
        this.resetTouchGestureState();
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
        this.updateGamepadState();

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

        const gamepadTarget = this.getGamepadTarget();
        if (gamepadTarget) {
            return { ...gamepadTarget };
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
        this.updateGamepadState();
        return this.launchManager.isLaunchPending();
    }

    getAimDirection(): Vector2 | null {
        if (this.currentAimDirection) {
            return cloneVector(this.currentAimDirection);
        }

        return this.longPressReady ? cloneVector(DEFAULT_DIRECTION) : null;
    }

    consumeLaunchIntent(): LaunchIntent | null {
        const trigger = this.launchManager.consumeLaunchTrigger();
        if (!trigger) {
            return null;
        }

        const directionSource = trigger.aimDirection ?? this.currentAimDirection ?? this.getDefaultLaunchDirection();
        const direction = this.normalizeDirection(directionSource);

        return {
            trigger,
            direction,
        };
    }

    resetLaunchTrigger(): void {
        this.launchManager.reset();
        this.currentAimDirection = null;
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
        this.updateGamepadState();
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
        this.resetTouchGestureState();
        this.container = null;
        this.canvas = null;
        this.mousePosition = null;
        this.touchPosition = null;
        this.activeTouchId = null;
        this.suppressMouseInput = false;
        this.hasReceivedInput = false;
        this.gamepadIndex = null;
        this.gamepadCursorX = null;
        this.gamepadCursorY = null;
        this.gamepadLastTimestampMs = null;
        this.gamepadLaunchHeld = false;
    }

    private updateGamepadState(): void {
        const gamepad = this.readActiveGamepad();
        if (!gamepad) {
            this.gamepadLastTimestampMs = null;
            this.gamepadLaunchHeld = false;
            return;
        }

        const nowMs = this.getTimestamp();
        const elapsedMs = this.gamepadLastTimestampMs !== null ? Math.max(0, nowMs - this.gamepadLastTimestampMs) : 0;
        this.gamepadLastTimestampMs = nowMs;
        const deltaSeconds = elapsedMs / 1000;

        const { width, height } = this.getCanvasSize();
        if (this.gamepadCursorX === null && width > 0) {
            this.gamepadCursorX = width / 2;
        }
        if (this.gamepadCursorY === null && height > 0) {
            this.gamepadCursorY = Math.max(0, height * 0.85);
        }

        const axisRaw = gamepad.axes[GAMEPAD_PRIMARY_AXIS_INDEX] ?? 0;
        const axisValue = this.applyGamepadDeadZone(axisRaw);
        if (axisValue !== 0) {
            this.activeInputs.add('gamepad');
            this.hasReceivedInput = true;

            if (deltaSeconds > 0 && width > 0 && this.gamepadCursorX !== null) {
                const deltaPixels = axisValue * GAMEPAD_MOVE_SPEED_PX_PER_SECOND * deltaSeconds;
                this.gamepadCursorX = clamp(this.gamepadCursorX + deltaPixels, 0, width);
            }
        }

        const launchPressed = this.isGamepadLaunchPressed(gamepad);
        if (launchPressed) {
            this.activeInputs.add('gamepad');
            this.hasReceivedInput = true;
        }

        if (launchPressed && !this.gamepadLaunchHeld) {
            this.triggerGamepadLaunch();
        }

        this.gamepadLaunchHeld = launchPressed;
    }

    private readActiveGamepad(): Gamepad | null {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
            return null;
        }

        const gamepads = navigator.getGamepads();
        if (!gamepads) {
            return null;
        }

        if (this.gamepadIndex !== null) {
            const existing = gamepads[this.gamepadIndex];
            if (existing?.connected) {
                return existing;
            }
        }

        for (const candidate of Array.from(gamepads)) {
            if (candidate?.connected) {
                this.gamepadIndex = candidate.index;
                return candidate;
            }
        }

        this.gamepadIndex = null;
        return null;
    }

    private handleGamepadConnected(event: GamepadEvent): void {
        if (event.gamepad && Number.isInteger(event.gamepad.index)) {
            this.gamepadIndex = event.gamepad.index;
        }
    }

    private handleGamepadDisconnected(event: GamepadEvent): void {
        if (this.gamepadIndex === event.gamepad.index) {
            this.gamepadIndex = null;
        }
    }

    private applyGamepadDeadZone(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }

        const magnitude = Math.abs(value);
        if (magnitude < GAMEPAD_DEADZONE) {
            return 0;
        }

        const adjusted = (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
        return value < 0 ? -adjusted : adjusted;
    }

    private isGamepadLaunchPressed(gamepad: Gamepad): boolean {
        for (const index of GAMEPAD_LAUNCH_BUTTONS) {
            const button = gamepad.buttons[index];
            if (button?.pressed) {
                return true;
            }
        }
        return false;
    }

    private getGamepadTarget(): Vector2 | null {
        if (this.gamepadCursorX === null) {
            return null;
        }

        const { height } = this.getCanvasSize();
        const y = this.gamepadCursorY ?? (height > 0 ? Math.max(0, height * 0.85) : 0);
        return { x: this.gamepadCursorX, y };
    }

    private triggerGamepadLaunch(): void {
        const target = this.getGamepadTarget() ?? this.mousePosition ?? this.touchPosition ?? this.getFallbackLaunchPosition();
        this.launchManager.triggerTapLaunch(target, {
            aimDirection: this.getDefaultLaunchDirection(),
        });
    }

    private getFallbackLaunchPosition(): Vector2 {
        const { width, height } = this.getCanvasSize();
        return {
            x: width > 0 ? width / 2 : 0,
            y: height > 0 ? Math.max(0, height * 0.85) : 0,
        };
    }

    private getCanvasSize(): { width: number; height: number } {
        if (this.canvas) {
            return { width: this.canvas.width, height: this.canvas.height };
        }

        if (this.container) {
            return { width: this.container.clientWidth, height: this.container.clientHeight };
        }

        return { width: 0, height: 0 };
    }

    private scheduleLongPressCheck(): void {
        if (!this.touchStartPosition) {
            return;
        }

        this.clearLongPressTimer();
        this.longPressTimer = setTimeout(() => {
            if (this.longPressEligible && this.touchStartPosition) {
                this.longPressReady = true;
            }
        }, LONG_PRESS_THRESHOLD_MS);
    }

    private clearLongPressTimer(): void {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    private resetTouchGestureState(): void {
        this.clearLongPressTimer();
        this.touchStartPosition = null;
        this.touchStartTimestampMs = null;
        this.longPressEligible = false;
        this.longPressReady = false;
        this.currentAimDirection = null;
    }

    private processTouchRelease(endPosition: Vector2): void {
        const start = this.touchStartPosition ?? endPosition;
        const durationMs = this.getGestureDurationMs();
        const distance = this.distanceBetween(start, endPosition);
        const aimDirection = this.currentAimDirection ?? this.computeAimDirection(start, endPosition);

        if (this.longPressReady) {
            this.launchManager.triggerLongPressLaunch(endPosition, {
                durationMs,
                ...(aimDirection ? { aimDirection: cloneVector(aimDirection) } : {}),
            });
            return;
        }

        if (distance >= SWIPE_MIN_DISTANCE) {
            this.launchManager.triggerSwipeLaunch(endPosition, {
                durationMs,
                swipeDistance: distance,
                ...(aimDirection ? { aimDirection: cloneVector(aimDirection) } : {}),
            });
            return;
        }

        if (durationMs <= TAP_MAX_DURATION_MS) {
            this.launchManager.triggerTapLaunch(endPosition, { durationMs });
            return;
        }

        this.launchManager.triggerTapLaunch(endPosition);
    }

    private getGestureDurationMs(): number {
        if (this.touchStartTimestampMs === null) {
            return 0;
        }
        const elapsed = this.getTimestamp() - this.touchStartTimestampMs;
        return elapsed > 0 ? elapsed : 0;
    }

    private getTimestamp(): number {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    private getDefaultLaunchDirection(): Vector2 {
        return cloneVector(DEFAULT_DIRECTION);
    }

    private normalizeDirection(direction: Vector2): Vector2 {
        const length = Math.hypot(direction.x, direction.y);
        if (!Number.isFinite(length) || length === 0) {
            return this.getDefaultLaunchDirection();
        }
        return {
            x: direction.x / length,
            y: direction.y / length,
        };
    }

    private distanceBetween(a: Vector2, b: Vector2): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.hypot(dx, dy);
    }

    private computeAimDirection(start: Vector2, end: Vector2): Vector2 | null {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);
        if (!Number.isFinite(distance) || distance < MIN_AIM_DISTANCE) {
            return null;
        }

        const aimX = dx;
        let aimY = dy;

        if (aimY >= 0) {
            const upwardMagnitude = Math.max(Math.abs(dy), MIN_UPWARD_COMPONENT * distance);
            aimY = -upwardMagnitude;
        }

        return this.normalizeDirection({ x: aimX, y: aimY });
    }

    private getPrimaryTouch(event: TouchEvent): Touch | null {
        if (event.changedTouches.length > 0) {
            return event.changedTouches[0] ?? null;
        }
        if (event.touches.length > 0) {
            return event.touches[0] ?? null;
        }
        return null;
    }

    private getTouchById(list: TouchList, id: number | null): Touch | null {
        if (id === null) {
            return null;
        }

        for (const touch of Array.from(list)) {
            if (touch.identifier === id) {
                return touch;
            }
        }

        return null;
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
            const active = this.getTouchById(touches, this.activeTouchId);
            if (active) {
                return active;
            }
        }

        return touches[0] ?? null;
    }
}
