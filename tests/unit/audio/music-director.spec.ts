import { describe, expect, it } from 'vitest';
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
});
