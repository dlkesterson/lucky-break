import { describe, expect, it, vi } from 'vitest';
import { bootstrapAudio } from 'audio/index';
import type { ReactiveAudioGameState } from 'audio/scheduler';
import { createSubject } from 'util/observable';

const createTransport = () => {
    return {
        start: vi.fn(async () => undefined),
        stop: vi.fn(() => undefined),
        cancel: vi.fn(() => undefined),
        scheduleOnce: vi.fn((callback: (time: number) => void) => {
            callback(42);
            return 1;
        }),
        clear: vi.fn(() => undefined),
    };
};

describe('bootstrapAudio', () => {
    it('creates scheduler and reactive layer when enabled', () => {
        const start = vi.fn();
        const stop = vi.fn();
        const cancel = vi.fn();
        const transport = {
            start,
            stop,
            cancel,
            scheduleOnce: vi.fn(),
            clear: vi.fn(),
        };
        const scheduler = {
            lookAheadMs: 75,
            schedule: vi.fn(),
            cancel: vi.fn(),
            dispose: vi.fn(),
            context: { currentTime: 0 } as AudioContext,
        };
        const schedulerFactory = vi.fn(() => scheduler);
        const reactiveLayer = { dispose: vi.fn() };
        const reactiveLayerFactory = vi.fn(() => reactiveLayer);
        const subject = createSubject<ReactiveAudioGameState>();

        const subsystem = bootstrapAudio({
            enableMusic: true,
            enableSfx: true,
            schedulerFactory,
            reactiveLayerFactory,
            transport,
            state$: subject,
        });

        expect(subsystem.scheduler).toBe(scheduler);
        expect(subsystem.reactiveLayer).toBe(reactiveLayer);
        expect(subsystem.state$).toBe(subject);
        expect(schedulerFactory).toHaveBeenCalledWith({});
        expect(reactiveLayerFactory).toHaveBeenCalledWith(subject, transport, { lookAheadMs: 75 });
        expect(start).toHaveBeenCalled();

        subsystem.shutdown();

        expect(reactiveLayer.dispose).toHaveBeenCalled();
        expect(scheduler.dispose).toHaveBeenCalled();
        expect(cancel).toHaveBeenCalled();
        expect(stop).toHaveBeenCalled();
    });

    it('can operate without reactive layer and provides lookAhead override', () => {
        const transport = createTransport();
        const scheduler = {
            lookAheadMs: 150,
            schedule: vi.fn(),
            cancel: vi.fn(),
            dispose: vi.fn(),
            context: { currentTime: 0 } as AudioContext,
        };
        const schedulerFactory = vi.fn(() => scheduler);

        const subsystem = bootstrapAudio({
            enableMusic: false,
            enableSfx: false,
            lookAheadMs: 32,
            schedulerFactory,
            transport,
        });

        expect(schedulerFactory).toHaveBeenCalledWith({ lookAheadMs: 32 });
        expect(subsystem.reactiveLayer).toBeNull();
        expect(transport.start).not.toHaveBeenCalled();

        subsystem.shutdown();

        expect(transport.cancel).toHaveBeenCalled();
        expect(transport.stop).not.toHaveBeenCalled();
    });
});
