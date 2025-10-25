import { describe, expect, it, vi } from 'vitest';
import { createMusicDirector, type MusicLayerFactory } from 'audio/music-director';

interface RecordedAction {
    readonly layer: string;
    readonly type: 'start' | 'set' | 'ramp' | 'dispose';
    readonly value?: number;
    readonly time?: number;
    readonly duration?: number;
}

const toPrecision = (value: number): number => Number(value.toFixed(3));

const createLayerFactory = (store: RecordedAction[]): MusicLayerFactory => (definition) => {
    let started = false;
    let level = 0;

    return {
        id: definition.id,
        ensureStarted: () => {
            if (started) {
                return;
            }
            started = true;
            store.push({ layer: definition.id, type: 'start' });
        },
        setImmediate: (value) => {
            level = value;
            store.push({ layer: definition.id, type: 'set', value: toPrecision(value) });
        },
        rampTo: (value, time, duration) => {
            level = value;
            store.push({
                layer: definition.id,
                type: 'ramp',
                value: toPrecision(value),
                time: toPrecision(time),
                duration: toPrecision(duration),
            });
        },
        getLevel: () => level,
        dispose: () => {
            store.push({ layer: definition.id, type: 'dispose' });
        },
    };
};

const createTransportStub = (autoExecute: boolean) => {
    let handle = 0;
    const pending = new Map<number, (time: number) => void>();
    const repeats = new Map<number, (time: number) => void>();
    const scheduledCalls: { readonly when: number | string }[] = [];
    const scheduledRepeats: { readonly interval: number | string }[] = [];
    const clearedHandles: number[] = [];
    const cancelInvocations: number[] = [];

    const scheduleOnce = (callback: (time: number) => void, when: number | string): number => {
        const id = ++handle;
        scheduledCalls.push({ when });
        if (autoExecute) {
            const resolvedTime = typeof when === 'number' ? when : 64;
            callback(resolvedTime);
        } else {
            pending.set(id, callback);
        }
        return id;
    };

    const scheduleRepeat = (callback: (time: number) => void, interval: number | string): number => {
        const id = ++handle;
        scheduledRepeats.push({ interval });
        if (autoExecute) {
            callback(typeof interval === 'number' ? interval : 64);
        } else {
            repeats.set(id, callback);
        }
        return id;
    };

    const clear = (id: number): void => {
        clearedHandles.push(id);
        pending.delete(id);
        repeats.delete(id);
    };

    const cancel = (time?: number): void => {
        cancelInvocations.push(typeof time === 'number' ? time : Number.NaN);
        pending.clear();
        repeats.clear();
    };

    const nextSubdivision = (): number => 64;

    const runPending = (time = 64): void => {
        for (const [id, callback] of pending.entries()) {
            callback(time);
            pending.delete(id);
        }
    };

    const emitRepeats = (time = 64, count = 1): void => {
        const callbacks = Array.from(repeats.values());
        for (let iteration = 0; iteration < count; iteration += 1) {
            for (const callback of callbacks) {
                callback(time);
            }
        }
    };

    const reset = (): void => {
        scheduledCalls.length = 0;
        scheduledRepeats.length = 0;
        clearedHandles.length = 0;
        cancelInvocations.length = 0;
        pending.clear();
        repeats.clear();
    };

    const getScheduleCount = (): number => scheduledCalls.length;
    const getRepeatScheduleCount = (): number => scheduledRepeats.length;
    const getClearedCount = (): number => clearedHandles.length;
    const getCancelCount = (): number => cancelInvocations.length;
    const getLastCancelTime = (): number | undefined => cancelInvocations[cancelInvocations.length - 1];
    const getActiveRepeatCount = (): number => repeats.size;

    return {
        scheduleOnce,
        scheduleRepeat,
        clear,
        cancel,
        nextSubdivision,
        runPending,
        emitRepeats,
        reset,
        getScheduleCount,
        getRepeatScheduleCount,
        getClearedCount,
        getCancelCount,
        getLastCancelTime,
        getActiveRepeatCount,
    };
};

describe('createMusicDirector', () => {
    it('initialises calm layer immediately on first state', () => {
        const actions: RecordedAction[] = [];
        const transport = createTransportStub(true);
        const director = createMusicDirector({
            transport,
            layerFactory: createLayerFactory(actions),
            layers: {
                calm: { baseLevel: 0.52 },
                intense: { baseLevel: 0.72 },
            },
        });

        expect(actions.filter((entry) => entry.type === 'start')).toHaveLength(2);
        expect(actions.filter((entry) => entry.type === 'set').every((entry) => entry.value === 0)).toBe(true);
        actions.length = 0;

        director.setState({ lives: 3, combo: 0 });

        expect(transport.getScheduleCount()).toBe(0);
        expect(actions).toEqual([
            { layer: 'calm', type: 'set', value: 0.52 },
        ]);

        director.dispose();
        expect(transport.getCancelCount()).toBe(1);
    });

    it('crossfades to intense layer when lives drop', () => {
        const actions: RecordedAction[] = [];
        const transport = createTransportStub(true);
        const director = createMusicDirector({
            transport,
            layerFactory: createLayerFactory(actions),
            layers: {
                calm: { baseLevel: 0.5 },
                intense: { baseLevel: 0.8 },
            },
        });

        director.setState({ lives: 3, combo: 0 });
        actions.length = 0;
        transport.reset();

        director.setState({ lives: 2, combo: 0 });

        expect(transport.getScheduleCount()).toBe(1);
        expect(actions).toEqual([
            { layer: 'intense', type: 'ramp', value: 0.8, time: 64, duration: toPrecision(1.2) },
            { layer: 'calm', type: 'ramp', value: 0, time: 64, duration: toPrecision(1.2) },
        ]);

        director.dispose();
    });

    it('applies combo boost to the active layer', () => {
        const actions: RecordedAction[] = [];
        const transport = createTransportStub(true);
        const director = createMusicDirector({
            transport,
            layerFactory: createLayerFactory(actions),
            layers: {
                calm: { baseLevel: 0.55 },
                intense: { baseLevel: 0.75 },
            },
        });

        const reset = () => {
            actions.length = 0;
            transport.reset();
        };

        director.setState({ lives: 3, combo: 0 });
        reset();

        director.setState({ lives: 2, combo: 16 });
        const intenseRamp = actions.find((entry) => entry.layer === 'intense' && entry.type === 'ramp');
        expect(intenseRamp?.value).toBeCloseTo(0.75 + 0.2, 3);
        reset();

        director.setState({ lives: 1, combo: 24 });
        const intenseRampLowLives = actions.find((entry) => entry.layer === 'intense' && entry.type === 'ramp');
        expect(intenseRampLowLives?.value).toBeCloseTo(1, 3);

        director.dispose();
    });

    it('clears pending transitions on dispose', () => {
        const actions: RecordedAction[] = [];
        const transport = createTransportStub(false);
        const director = createMusicDirector({
            transport,
            layerFactory: createLayerFactory(actions),
            layers: {
                calm: { baseLevel: 0.5 },
                intense: { baseLevel: 0.8 },
            },
        });

        director.setState({ lives: 3, combo: 0 });
        transport.reset();
        director.setState({ lives: 2, combo: 0 });
        expect(transport.getScheduleCount()).toBe(1);

        director.dispose();
        expect(transport.getClearedCount()).toBe(1);
        expect(transport.getCancelCount()).toBe(1);
        expect(actions.filter((entry) => entry.type === 'dispose')).toHaveLength(2);
    });

    it('falls back when transport scheduling fails and normalizes state', () => {
        const actions: RecordedAction[] = [];
        const behaviorQueue: ({ type: 'throw' } | { type: 'nan' } | { type: 'handle'; value: number })[] = [
            { type: 'throw' },
            { type: 'handle', value: 42 },
            { type: 'nan' },
            { type: 'handle', value: 99 },
            { type: 'handle', value: 77 },
        ];
        const scheduledCallbacks: ((time: number) => void)[] = [];

        const scheduleOnce = vi.fn((callback: (time: number) => void, when: number | string) => {
            const behavior = behaviorQueue.shift() ?? { type: 'handle', value: 101 };
            if (behavior.type === 'throw') {
                throw new Error('boom');
            }
            scheduledCallbacks.push(callback);
            void when;
            if (behavior.type === 'nan') {
                return Number.NaN;
            }
            return behavior.value;
        });

        const clear = vi.fn(() => {
            throw new Error('clear boom');
        });

        const transport = {
            scheduleOnce,
            clear,
            cancel: vi.fn(),
            nextSubdivision: vi.fn(() => Number.NaN),
        };

        const now = vi.fn(() => 123);

        const director = createMusicDirector({
            transport,
            now,
            crossfadeSeconds: 0.5,
            comboBoostRate: 0.2,
            comboBoostCap: 0.6,
            layerFactory: createLayerFactory(actions),
        });

        director.setState({ lives: 3, combo: 0 });
        actions.length = 0;

        director.setState({ lives: 2, combo: 4 });
        const baseFallbackRamp = actions.find((entry) => entry.layer === 'intense' && entry.type === 'ramp');
        expect(baseFallbackRamp?.time).toBe(toPrecision(123));
        actions.length = 0;

        director.setState({ lives: 1, combo: 0 });
        const baseCallback = scheduledCallbacks.shift();
        expect(typeof baseCallback).toBe('function');
        baseCallback?.(Infinity);
        const baseRamp = actions.find((entry) => entry.layer === 'intense' && entry.type === 'ramp');
        expect(baseRamp?.time).toBe(toPrecision(123));
        baseCallback?.(10);
        const repeatedRamp = actions.filter((entry) => entry.layer === 'intense' && entry.type === 'ramp');
        expect(repeatedRamp.some((entry) => entry.time === toPrecision(10))).toBe(true);
        actions.length = 0;

        director.setState({ lives: 3, combo: 0 });
        const calmFallbackRamp = actions.find((entry) => entry.layer === 'calm' && entry.type === 'ramp');
        expect(calmFallbackRamp?.time).toBe(toPrecision(123));
        actions.length = 0;

        director.setState({ lives: 3, combo: Number.NaN });

        const snapshot = director.getState();
        expect(snapshot).not.toBeNull();
        const mutated = snapshot ? { ...snapshot, combo: 999 } : null;
        expect(mutated?.combo).toBe(999);
        expect(director.getState()?.combo).not.toBe(999);

        director.dispose();
        expect(transport.cancel).toHaveBeenCalled();
    });

    it('emits beat and measure callbacks when registered', () => {
        const actions: RecordedAction[] = [];
        const transport = createTransportStub(false);
        const director = createMusicDirector({
            transport,
            layerFactory: createLayerFactory(actions),
            beatsPerMeasure: 4,
        });

        const beatSpy = vi.fn();
        const measureSpy = vi.fn();

        director.setBeatCallback(beatSpy);
        director.setMeasureCallback(measureSpy);

        expect(transport.getRepeatScheduleCount()).toBe(1);

        transport.emitRepeats(32, 5);

        expect(beatSpy).toHaveBeenCalledTimes(5);
        expect(beatSpy.mock.calls[0][0]).toEqual(
            expect.objectContaining({ index: 0, subdivision: 0, isDownbeat: true }),
        );
        expect(beatSpy.mock.calls[1][0]).toEqual(
            expect.objectContaining({ index: 1, subdivision: 1, isDownbeat: false }),
        );
        expect(measureSpy).toHaveBeenCalledTimes(2);
        expect(measureSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ index: 0 }));
        expect(measureSpy.mock.calls[1][0]).toEqual(expect.objectContaining({ index: 1 }));

        director.setEnabled(false);
        expect(transport.getActiveRepeatCount()).toBe(0);

        director.setEnabled(true);
        expect(transport.getRepeatScheduleCount()).toBe(2);

        director.setBeatCallback(null);
        director.setMeasureCallback(null);
        expect(transport.getActiveRepeatCount()).toBe(0);

        director.dispose();
    });
});
