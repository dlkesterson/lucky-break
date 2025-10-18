import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installToneMock, type ToneMockContext } from './mocks';
import { createToneScheduler, createReactiveAudioLayer, type ReactiveAudioGameState } from 'audio/scheduler';
import { createSubject } from 'util/observable';

describe('createToneScheduler', () => {
    let tone: ToneMockContext;

    beforeEach(async () => {
        tone = installToneMock();
    });

    afterEach(() => {
        tone.restore();
    });

    it('clamps negative lookAhead and clears scheduled events on dispose', () => {
        const scheduler = createToneScheduler({ lookAheadMs: -30 });
        const callback = vi.fn();

        const handle = scheduler.schedule(callback);

        expect(tone.transport.scheduleOnce).toHaveBeenCalledTimes(1);
        const [, scheduledAt] = tone.transport.scheduleOnce.mock.calls[0] as [(time: number) => void, number | string];
        expect(scheduledAt).toBe('+0');

        scheduler.dispose();

        expect(tone.transport.clear).toHaveBeenCalledWith(handle.id);
        expect(tone.transport.cancel).toHaveBeenCalled();
    });
});

describe('createReactiveAudioLayer', () => {
    const emitStates = (
        subject: ReturnType<typeof createSubject<ReactiveAudioGameState>>,
        states: readonly ReactiveAudioGameState[],
    ) => {
        states.forEach((state) => subject.next(state));
    };

    it('schedules fills for power-up activations and combo milestones', () => {
        const scheduleOnceMock = vi.fn();
        scheduleOnceMock.mockImplementation((callback: (time: number) => void) => {
            scheduledCallbacks.push(callback);
            return scheduleOnceMock.mock.calls.length;
        });
        const scheduleOnce = scheduleOnceMock as unknown as (
            callback: (time: number) => void,
            at: number | string,
        ) => number;
        const clear = vi.fn();
        const cancel = vi.fn();
        const nextSubdivision = vi.fn(() => 1.5);
        const scheduledCallbacks: ((time: number) => void)[] = [];

        const transport = { scheduleOnce, clear, cancel, nextSubdivision } as unknown as Parameters<
            typeof createReactiveAudioLayer
        >[1];
        const onFill = vi.fn();
        const state$ = createSubject<ReactiveAudioGameState>();

        const layer = createReactiveAudioLayer(state$, transport, { onFill, lookAheadMs: 100 });

        emitStates(state$, [
            { combo: 4, activePowerUps: [] },
            { combo: 4, activePowerUps: [{ type: 'sticky-paddle' }] },
            { combo: 7, activePowerUps: [{ type: 'sticky-paddle' }] },
            { combo: 8, activePowerUps: [{ type: 'sticky-paddle' }] },
            { combo: 8, activePowerUps: [] },
        ]);

        expect(scheduleOnceMock).toHaveBeenCalledTimes(2);
        expect(clear).toHaveBeenCalledWith(1);
        expect(nextSubdivision).toHaveBeenCalledWith('4n');

        scheduledCallbacks.forEach((callback) => callback(2.0));

        expect(onFill).toHaveBeenCalledTimes(2);
        const [firstFill, secondFill] = onFill.mock.calls.map(([event]) => event);
        expect(firstFill.type).toBe('power-up');
        expect(firstFill.payload.powerUpType).toBe('sticky-paddle');
        expect(secondFill.type).toBe('combo');
        expect(secondFill.payload.combo).toBe(8);

        layer.dispose();
        expect(cancel).toHaveBeenCalled();
    });

    it('uses immediate scheduling when lookAheadMs is zero or negative', () => {
        const scheduleOnceMock = vi.fn().mockReturnValue(1);
        const scheduleOnce = scheduleOnceMock as unknown as (
            callback: (time: number) => void,
            at: number | string,
        ) => number;
        const clear = vi.fn();
        const cancel = vi.fn();
        const nextSubdivision = vi.fn();
        const now = vi.fn(() => 42);
        const transport = { scheduleOnce, clear, cancel, nextSubdivision } as unknown as Parameters<
            typeof createReactiveAudioLayer
        >[1];
        const onFill = vi.fn();
        const state$ = createSubject<ReactiveAudioGameState>();

        const layer = createReactiveAudioLayer(state$, transport, { onFill, lookAheadMs: 0, now });

        state$.next({ combo: 8, activePowerUps: [] });

        expect(nextSubdivision).not.toHaveBeenCalled();
        expect(scheduleOnceMock).toHaveBeenCalledWith(expect.any(Function), 42);

        layer.dispose();
    });
});
