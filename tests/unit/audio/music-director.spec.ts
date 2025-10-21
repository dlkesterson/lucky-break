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
    const scheduledCalls: { readonly when: number | string }[] = [];
    const clearedHandles: number[] = [];

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

    const clear = (id: number): void => {
        clearedHandles.push(id);
        pending.delete(id);
    };

    const nextSubdivision = (): number => 64;

    const runPending = (time = 64): void => {
        for (const [id, callback] of pending.entries()) {
            callback(time);
            pending.delete(id);
        }
    };

    const reset = (): void => {
        scheduledCalls.length = 0;
        clearedHandles.length = 0;
    };

    const getScheduleCount = (): number => scheduledCalls.length;
    const getClearedCount = (): number => clearedHandles.length;

    return {
        scheduleOnce,
        clear,
        nextSubdivision,
        runPending,
        reset,
        getScheduleCount,
        getClearedCount,
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
                melody: { baseLevel: 0.61 },
            },
        });

        expect(actions.filter((entry) => entry.type === 'start')).toHaveLength(3);
        expect(actions.filter((entry) => entry.type === 'set').every((entry) => entry.value === 0)).toBe(true);
        actions.length = 0;

        director.setState({ lives: 3, combo: 0 });

        expect(transport.getScheduleCount()).toBe(0);
        expect(actions).toEqual([
            { layer: 'calm', type: 'set', value: 0.52 },
            { layer: 'melody', type: 'set', value: 0 },
        ]);

        director.dispose();
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
                melody: { baseLevel: 0.7 },
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

    it('activates melody layer at one life and scales with combo', () => {
        const actions: RecordedAction[] = [];
        const transport = createTransportStub(true);
        const director = createMusicDirector({
            transport,
            layerFactory: createLayerFactory(actions),
            layers: {
                calm: { baseLevel: 0.55 },
                intense: { baseLevel: 0.75 },
                melody: { baseLevel: 0.65 },
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
        const melodyRamp = actions.find((entry) => entry.layer === 'melody' && entry.type === 'ramp');
        expect(melodyRamp?.value ?? 0).toBeGreaterThan(0.65);
        expect(melodyRamp?.duration).toBeCloseTo(toPrecision(0.9), 3);

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
                melody: { baseLevel: 0.7 },
            },
        });

        director.setState({ lives: 3, combo: 0 });
        transport.reset();
        director.setState({ lives: 2, combo: 0 });
        expect(transport.getScheduleCount()).toBe(1);

        director.dispose();
        expect(transport.getClearedCount()).toBe(1);
        expect(actions.filter((entry) => entry.type === 'dispose')).toHaveLength(3);
    });

    it('falls back when transport scheduling fails and normalizes state', () => {
        const actions: RecordedAction[] = [];
        const behaviorQueue: Array<{ type: 'throw' } | { type: 'nan' } | { type: 'handle'; value: number }> = [
            { type: 'throw' },
            { type: 'handle', value: 42 },
            { type: 'nan' },
            { type: 'handle', value: 99 },
            { type: 'handle', value: 77 },
        ];
        const scheduledCallbacks: Array<(time: number) => void> = [];

        const scheduleOnce = vi.fn((callback: (time: number) => void, _when: number | string) => {
            const behavior = behaviorQueue.shift() ?? { type: 'handle', value: 101 };
            if (behavior.type === 'throw') {
                throw new Error('boom');
            }
            scheduledCallbacks.push(callback);
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
            nextSubdivision: vi.fn(() => Number.NaN),
        };

        const now = vi.fn(() => 123);

        const director = createMusicDirector({
            transport,
            now,
            crossfadeSeconds: 0.5,
            melodyFadeSeconds: 0.3,
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

        director.setState({ lives: 1, combo: 12 });
        const melodyBoostCallback = scheduledCallbacks.shift();
        melodyBoostCallback?.(Infinity);
        const melodyBoostRamp = actions.find((entry) => entry.layer === 'melody' && entry.type === 'ramp');
        expect(melodyBoostRamp?.time).toBe(toPrecision(123));
        actions.length = 0;

        director.setState({ lives: 1, combo: 0 });
        const baseCallback = scheduledCallbacks.shift();
        baseCallback?.(Infinity);
        const baseRamp = actions.find((entry) => entry.layer === 'intense' && entry.type === 'ramp');
        expect(baseRamp?.time).toBe(toPrecision(123));
        baseCallback?.(10);
        const repeatedRamp = actions.filter((entry) => entry.layer === 'intense' && entry.type === 'ramp');
        expect(repeatedRamp.some((entry) => entry.time === toPrecision(10))).toBe(true);
        const melodyCallback = scheduledCallbacks.shift();
        melodyCallback?.(10);
        const melodyRamp = actions.find((entry) => entry.layer === 'melody' && entry.time === toPrecision(10));
        expect(melodyRamp).toBeDefined();
        actions.length = 0;

        director.setState({ lives: 3, combo: Number.NaN });

        const snapshot = director.getState();
        expect(snapshot).not.toBeNull();
        const mutated = snapshot ? { ...snapshot, combo: 999 } : null;
        expect(mutated?.combo).toBe(999);
        expect(director.getState()?.combo).not.toBe(999);

        director.dispose();
        expect(clear).toHaveBeenCalled();
    });
});
