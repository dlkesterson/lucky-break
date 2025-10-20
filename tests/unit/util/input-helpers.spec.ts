import { beforeEach, describe, expect, it } from 'vitest';
import {
    eventsToInputState,
    getActiveInputTypes,
    getPaddleTarget,
    hasPaddleMovement,
    type KeyboardEventData,
    type MouseEventData,
    type TouchEventData,
    normalizeKeyboardEvent,
    normalizeMouseEvent,
    normalizeTouchEvent,
    smoothTowards,
} from 'util/input-helpers';

const createCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    canvas.getBoundingClientRect = () => ({
        left: 10,
        top: 20,
        right: 410,
        bottom: 320,
        width: 400,
        height: 300,
        x: 10,
        y: 20,
        toJSON: () => ({}),
    });
    return canvas;
};

describe('input helpers', () => {
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
        canvas = createCanvas();
    });

    it('normalizes mouse events into canvas coordinates', () => {
        const mouseDown = normalizeMouseEvent({
            clientX: 110,
            clientY: 170,
            button: 0,
            type: 'mousedown',
        } as MouseEvent, canvas);
        expect(mouseDown).toEqual({ x: 200, y: 300, button: 'left', pressed: true });

        const mouseUp = normalizeMouseEvent({
            clientX: 210,
            clientY: 220,
            button: 2,
            type: 'mouseup',
        } as MouseEvent, canvas);
        expect(mouseUp).toEqual({ x: 400, y: 400, button: 'right', pressed: false });
    });

    it('normalizes keyboard events using physical key codes', () => {
        const keyDown = normalizeKeyboardEvent({ code: 'ArrowLeft', type: 'keydown' } as KeyboardEvent);
        expect(keyDown).toEqual({ key: 'ArrowLeft', pressed: true });

        const keyUp = normalizeKeyboardEvent({ code: 'Space', type: 'keyup' } as KeyboardEvent);
        expect(keyUp).toEqual({ key: 'Space', pressed: false });
    });

    it('normalizes touch events and scales coordinates', () => {
        const touch = { clientX: 210, clientY: 120 } as Touch;
        const touches = {
            length: 1,
            item: (index: number) => (index === 0 ? touch : null),
            0: touch,
        } as unknown as TouchList;
        const touchEvent = { touches } as TouchEvent;

        expect(normalizeTouchEvent(touchEvent, canvas)).toEqual({ touches: [{ x: 400, y: 200 }] });
    });

    it('builds input state from mixed device events', () => {
        const mouseEvent: MouseEventData = { x: 200, y: 100, button: 'left', pressed: true };
        const keyboardEvents: KeyboardEventData[] = [
            { key: 'KeyA', pressed: true },
            { key: 'KeyD', pressed: true },
            { key: 'Space', pressed: false },
        ];
        const touchEvent: TouchEventData = { touches: [{ x: 300, y: 0 }] };

        const state = eventsToInputState(mouseEvent, keyboardEvents, touchEvent);
        expect(state).toEqual({
            leftPressed: true,
            rightPressed: true,
            mouseX: 200,
            touchX: 300,
            launchRequested: true,
        });
    });

    it('derives active input sources', () => {
        const mouseOnly: MouseEventData = { x: 0, y: 0, button: 'left', pressed: false };
        const keyboardOnly: KeyboardEventData[] = [{ key: 'KeyA', pressed: true }];
        const allInputsTouch: TouchEventData = { touches: [] };

        expect(getActiveInputTypes()).toEqual([]);
        expect(getActiveInputTypes(mouseOnly)).toEqual(['mouse']);
        expect(getActiveInputTypes(undefined, keyboardOnly)).toEqual(['keyboard']);
        expect(getActiveInputTypes(mouseOnly, keyboardOnly, allInputsTouch)).toEqual([
            'mouse',
            'keyboard',
            'touch',
        ]);
    });

    it('detects paddle movement intent', () => {
        expect(hasPaddleMovement({ leftPressed: false, rightPressed: false, launchRequested: false })).toBe(false);
        expect(hasPaddleMovement({ leftPressed: true, rightPressed: false, launchRequested: false })).toBe(true);
        expect(hasPaddleMovement({ leftPressed: false, rightPressed: false, mouseX: 10, launchRequested: false })).toBe(true);
        expect(hasPaddleMovement({ leftPressed: false, rightPressed: false, touchX: 10, launchRequested: false })).toBe(true);
    });

    it('calculates paddle targets with precedence and clamping', () => {
        expect(getPaddleTarget({ leftPressed: true, rightPressed: false, launchRequested: false }, 800, 100)).toEqual({ x: 50, y: 0 });
        expect(getPaddleTarget({ leftPressed: false, rightPressed: true, launchRequested: false }, 800, 100)).toEqual({ x: 750, y: 0 });
        expect(
            getPaddleTarget({ leftPressed: false, rightPressed: false, mouseX: -100, launchRequested: false }, 800, 100),
        ).toEqual({ x: 50, y: 0 });
        expect(
            getPaddleTarget({ leftPressed: false, rightPressed: false, mouseX: 900, launchRequested: false }, 800, 100),
        ).toEqual({ x: 750, y: 0 });
        expect(
            getPaddleTarget({ leftPressed: false, rightPressed: false, touchX: 400, launchRequested: false }, 800, 100),
        ).toEqual({ x: 400, y: 0 });
        expect(getPaddleTarget({ leftPressed: false, rightPressed: false, launchRequested: false }, 800, 100)).toBeNull();
    });

    it('smoothTowards eases towards the target when delta is small', () => {
        const eased = smoothTowards(0, 100, 1 / 60, { responsiveness: 12 });
        expect(eased).toBeGreaterThan(0);
        expect(eased).toBeLessThan(100);
    });

    it('smoothTowards snaps when within the configured threshold', () => {
        const snapped = smoothTowards(99.6, 100, 1 / 120, { responsiveness: 12, snapThreshold: 0.75 });
        expect(snapped).toBe(100);
    });

    it('smoothTowards converges to target for large delta', () => {
        const converged = smoothTowards(-50, 50, 0.5, { responsiveness: 12 });
        expect(converged).toBeCloseTo(50, 3);
    });
});
