/**
 * Input Manager Implementation
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: Cross-platform input handling for paddle control and launch triggers
 */

import type { InputManager, InputDebugState, InputType, Vector2 } from './contracts';
import { PaddleLaunchManager } from './launch-manager';
import { normalizeMouseEvent, normalizeTouchEvent } from 'util/input-helpers';

export class GameInputManager implements InputManager {
    private container: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private mousePosition: Vector2 | null = null;
    private touchPosition: Vector2 | null = null;
    private keyboardState = new Map<string, boolean>();
    private activeInputs = new Set<InputType>();
    private launchManager = new PaddleLaunchManager();
    private previousPaddlePosition: Vector2 | null = null;
    private hasReceivedInput = false; // Track if user has moved mouse/touch since initialization

    initialize(container: HTMLElement): void {
        this.container = container;
        // Find the canvas element within the container
        this.canvas = container.querySelector('canvas') || null;

        // Clear any stale positions from before initialization
        this.mousePosition = null;
        this.touchPosition = null;
        this.hasReceivedInput = false;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        if (!this.container) return;

        // Mouse events
        this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.container.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Touch events
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.container.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.container.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));

        // Prevent context menu on right click
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handleMouseDown(event: MouseEvent): void {
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
        // Mouse up doesn't remove from active inputs as mouse is still available
    }

    private handleTouchStart(event: TouchEvent): void {
        this.activeInputs.add('touch');
        this.hasReceivedInput = true; // User has touched

        if (event.touches.length > 0) {
            const touch = event.touches[0];

            if (this.canvas) {
                const normalized = normalizeTouchEvent(event, this.canvas);
                if (normalized.touches.length > 0) {
                    this.touchPosition = { x: normalized.touches[0].x, y: normalized.touches[0].y };
                    this.launchManager.triggerTapLaunch(this.touchPosition);
                }
            } else {
                // Fallback: use raw client coordinates
                this.touchPosition = { x: touch.clientX, y: touch.clientY };
                this.launchManager.triggerTapLaunch(this.touchPosition);
            }
        }
    }

    private handleTouchMove(event: TouchEvent): void {
        this.activeInputs.add('touch');
        this.hasReceivedInput = true; // User has moved touch

        if (event.touches.length > 0) {
            const touch = event.touches[0];

            if (this.canvas) {
                const normalized = normalizeTouchEvent(event, this.canvas);
                if (normalized.touches.length > 0) {
                    this.touchPosition = { x: normalized.touches[0].x, y: normalized.touches[0].y };
                }
            } else {
                // Fallback: use raw client coordinates
                this.touchPosition = { x: touch.clientX, y: touch.clientY };
            }
        }
    }

    private handleTouchEnd(event: TouchEvent): void {
        // Touch end doesn't remove from active inputs as touch is still available
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
        const leftPressed = this.keyboardState.get('ArrowLeft') || this.keyboardState.get('KeyA');
        const rightPressed = this.keyboardState.get('ArrowRight') || this.keyboardState.get('KeyD');

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
                .filter(([_, pressed]) => pressed)
                .map(([key, _]) => key),
            paddleTarget: this.getPaddleTarget(),
            launchPending: this.shouldLaunch(),
        };
    }

    destroy(): void {
        if (!this.container) return;

        // Remove all event listeners
        this.container.removeEventListener('mousedown', this.handleMouseDown.bind(this));
        this.container.removeEventListener('mousemove', this.handleMouseMove.bind(this));
        this.container.removeEventListener('mouseup', this.handleMouseUp.bind(this));
        this.container.removeEventListener('touchstart', this.handleTouchStart.bind(this));
        this.container.removeEventListener('touchmove', this.handleTouchMove.bind(this));
        this.container.removeEventListener('touchend', this.handleTouchEnd.bind(this));
        this.container.removeEventListener('contextmenu', (e) => e.preventDefault());

        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
        document.removeEventListener('keyup', this.handleKeyUp.bind(this));

        this.launchManager.reset();
        this.activeInputs.clear();
        this.keyboardState.clear();
        this.container = null;
    }
}