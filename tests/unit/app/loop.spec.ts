import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameLoop, DEFAULT_FIXED_DELTA, DEFAULT_STEP_MS } from 'app/loop';

type RafHandle = number;

type FrameCallback = (timestamp: number) => void;

interface FakeRaf {
    request: (callback: FrameCallback) => RafHandle;
    cancel: (handle: RafHandle) => void;
    flush: (deltaMs: number) => void;
    pending(): number;
}

const createFakeRaf = (getTime: () => number, setTime: (next: number) => void): FakeRaf => {
    let nextId = 1;
    const callbacks = new Map<RafHandle, FrameCallback>();

    return {
        request: (callback) => {
            const handle = nextId++;
            callbacks.set(handle, callback);
            return handle;
        },
        cancel: (handle) => {
            callbacks.delete(handle);
        },
        flush: (deltaMs) => {
            const scheduled = [...callbacks.entries()];
            callbacks.clear();
            setTime(getTime() + deltaMs);
            scheduled.forEach(([, callback]) => callback(getTime()));
        },
        pending: () => callbacks.size,
    };
};

describe('createGameLoop', () => {
    let currentTime: number;
    let fakeRaf: FakeRaf;

    beforeEach(() => {
        currentTime = 0;
        fakeRaf = createFakeRaf(
            () => currentTime,
            (next) => {
                currentTime = next;
            },
        );
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('produces deterministic updates for identical frame sequences', () => {
        const deltas = [4, 8, 12, 16, 20, 5];

        const execute = () => {
            let time = 0;
            const localRaf = createFakeRaf(
                () => time,
                (next) => {
                    time = next;
                },
            );
            const updates: number[] = [];
            const renders: number[] = [];

            const loop = createGameLoop(
                (dt) => {
                    const nextState = (updates.at(-1) ?? 0) + dt;
                    updates.push(Number(nextState.toFixed(6)));
                },
                (alpha) => {
                    renders.push(Number(alpha.toFixed(6)));
                },
                {
                    fixedDelta: DEFAULT_FIXED_DELTA,
                    now: () => time,
                    raf: localRaf.request,
                    cancelRaf: localRaf.cancel,
                },
            );

            loop.start();
            deltas.forEach((delta) => {
                localRaf.flush(delta);
            });
            loop.stop();

            return { updates, renders, pending: localRaf.pending() };
        };

        const first = execute();
        const second = execute();

        expect(second.pending).toBe(0);
        expect(first.updates).toEqual(second.updates);
        expect(first.renders).toEqual(second.renders);
    });

    it('clamps large frame deltas and limits steps per frame', () => {
        const updates: number[] = [];
        let lastAlpha = 0;

        const loop = createGameLoop(
            (dt) => {
                updates.push(dt);
            },
            (alpha) => {
                lastAlpha = alpha;
            },
            {
                maxStepsPerFrame: 3,
                maxFrameDeltaMs: 100,
                now: () => currentTime,
                raf: fakeRaf.request,
                cancelRaf: fakeRaf.cancel,
            },
        );

        loop.start();
        fakeRaf.flush(300);

        expect(updates.length).toBe(3);
        updates.forEach((dt) => expect(dt).toBeCloseTo(DEFAULT_FIXED_DELTA, 5));
        expect(lastAlpha).toBeCloseTo(1, 5);

        loop.stop();
        expect(fakeRaf.pending()).toBe(0);
    });

    it('consumes the full clamped frame delta with the default step budget', () => {
        const updates: number[] = [];

        const loop = createGameLoop(
            (dt) => {
                updates.push(dt);
            },
            () => {
                /* no-op render */
            },
            {
                now: () => currentTime,
                raf: fakeRaf.request,
                cancelRaf: fakeRaf.cancel,
            },
        );

        loop.start();
        fakeRaf.flush(250);
        loop.stop();

        const expectedSteps = Math.ceil(100 / DEFAULT_STEP_MS);
        expect(updates.length).toBe(expectedSteps);
        updates.forEach((dt) => expect(dt).toBeCloseTo(DEFAULT_FIXED_DELTA, 6));
    });

    it('falls back to setTimeout when requestAnimationFrame is unavailable', () => {
        vi.useFakeTimers();
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

        let nowTime = 0;
        const updates: number[] = [];
        const originalRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
        const originalCancel = (globalThis as Record<string, unknown>).cancelAnimationFrame;
        (globalThis as Record<string, unknown>).requestAnimationFrame = undefined;
        (globalThis as Record<string, unknown>).cancelAnimationFrame = undefined;

        try {
            const loop = createGameLoop(
                (dt) => {
                    updates.push(dt);
                },
                () => {
                    /* no-op render */
                },
                {
                    now: () => nowTime,
                },
            );

            loop.start();
            expect(setTimeoutSpy).toHaveBeenCalled();

            const advanceMs = Math.ceil(DEFAULT_STEP_MS);
            nowTime += advanceMs;
            vi.advanceTimersByTime(advanceMs);

            expect(updates.length).toBeGreaterThan(0);

            loop.stop();
            expect(clearTimeoutSpy).toHaveBeenCalled();
        } finally {
            (globalThis as Record<string, unknown>).requestAnimationFrame = originalRaf;
            (globalThis as Record<string, unknown>).cancelAnimationFrame = originalCancel;
        }
    });

    it('exposes default timing constants', () => {
        expect(DEFAULT_FIXED_DELTA).toBeCloseTo(1 / 60, 6);
        expect(DEFAULT_STEP_MS).toBeCloseTo(1000 / 60, 5);
    });
});
