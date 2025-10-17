import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { createGameLoop, DEFAULT_STEP_MS } from 'app/loop';

type RafHandle = number;

type FrameCallback = (timestamp: number) => void;

interface FakeRaf {
    readonly request: (callback: FrameCallback) => RafHandle;
    readonly cancel: (handle: RafHandle) => void;
    readonly flush: (deltaMs: number) => void;
    readonly size: () => number;
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
            const previous = [...callbacks.values()];
            callbacks.clear();
            setTime(getTime() + deltaMs);
            previous.forEach((callback) => callback(getTime()));
        },
        size: () => callbacks.size,
    };
};

const createStageStub = (renderSpy = vi.fn()): { renderSpy: ReturnType<typeof vi.fn>; stage: { app: Application } } => {
    const app = { render: renderSpy } as unknown as Application;
    return { renderSpy, stage: { app } };
};

describe('createGameLoop', () => {
    const stepMs = 10;

    let currentTime: number;
    let setTime: (next: number) => void;
    let fakeRaf: FakeRaf;

    beforeEach(() => {
        currentTime = 0;
        setTime = (next) => {
            currentTime = next;
        };
        fakeRaf = createFakeRaf(
            () => currentTime,
            setTime,
        );
    });

    it('steps the physics world on a fixed timestep and renders each frame', () => {
        const worldStep = vi.fn();
        const beforeStep = vi.fn();
        const afterStep = vi.fn();
        const beforeRender = vi.fn();
        const afterRender = vi.fn();
        const { renderSpy, stage } = createStageStub();

        const loop = createGameLoop({
            world: { step: worldStep },
            stage,
            stepMs,
            hooks: {
                beforeStep,
                afterStep,
                beforeRender,
                afterRender,
            },
            now: () => currentTime,
            requestFrame: fakeRaf.request,
            cancelFrame: fakeRaf.cancel,
        });

        loop.start();
        expect(fakeRaf.size()).toBe(1);

        fakeRaf.flush(stepMs / 2);
        expect(worldStep).not.toHaveBeenCalled();
        expect(renderSpy).toHaveBeenCalledTimes(1);
        expect(beforeRender).toHaveBeenCalledWith(0.5);

        fakeRaf.flush(stepMs / 2);
        expect(worldStep).toHaveBeenCalledTimes(1);
        expect(worldStep).toHaveBeenCalledWith(stepMs);
        expect(beforeStep).toHaveBeenCalledWith(stepMs);
        expect(afterStep).toHaveBeenCalledWith(stepMs);
        expect(renderSpy).toHaveBeenCalledTimes(2);
        expect(afterRender).toHaveBeenCalledTimes(2);
    });

    it('stops scheduling frames when stopped', () => {
        const worldStep = vi.fn();
        const { stage } = createStageStub();

        const loop = createGameLoop({
            world: { step: worldStep },
            stage,
            stepMs,
            now: () => currentTime,
            requestFrame: fakeRaf.request,
            cancelFrame: fakeRaf.cancel,
        });

        loop.start();
        expect(fakeRaf.size()).toBe(1);

        loop.stop();
        expect(fakeRaf.size()).toBe(0);

        fakeRaf.flush(stepMs);
        expect(worldStep).not.toHaveBeenCalled();
    });

    it('limits the number of physics sub-steps per frame', () => {
        const worldStep = vi.fn();
        const { stage } = createStageStub();

        const loop = createGameLoop({
            world: { step: worldStep },
            stage,
            stepMs,
            maxStepsPerFrame: 3,
            now: () => currentTime,
            requestFrame: fakeRaf.request,
            cancelFrame: fakeRaf.cancel,
        });

        loop.start();
        fakeRaf.flush(stepMs * 10);

        expect(worldStep).toHaveBeenCalledTimes(3);
        worldStep.mockClear();

        fakeRaf.flush(stepMs);
        expect(worldStep).toHaveBeenCalledTimes(1);
    });

    it('ignores subsequent start calls while already running', () => {
        const worldStep = vi.fn();
        const { stage } = createStageStub();

        const loop = createGameLoop({
            world: { step: worldStep },
            stage,
            now: () => currentTime,
            requestFrame: fakeRaf.request,
            cancelFrame: fakeRaf.cancel,
        });

        loop.start();
        loop.start();

        expect(fakeRaf.size()).toBe(1);
    });

    it('exposes the default step interval constant', () => {
        expect(DEFAULT_STEP_MS).toBeCloseTo(1000 / 120, 5);
    });
});
