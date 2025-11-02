import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ScheduledEntry {
    readonly time: number;
    readonly callback: (time: number) => void;
}

const mockRandomValues: number[] = [];

vi.mock('util/random', () => ({
    mulberry32: () => () => mockRandomValues.shift() ?? 0,
}));

vi.mock('tone', () => {
    const toneState = {
        gains: [] as any[],
        membraneSynths: [] as any[],
        polySynths: [] as any[],
        parts: [] as any[],
        transport: {
            now: 0,
            nextId: 1,
            scheduled: new Map<number, ScheduledEntry>(),
        },
    };

    class GainStub {
        public readonly gain = {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            cancelAndHoldAtTime: vi.fn(),
        };

        public readonly connectedTo: unknown[] = [];

        public disposed = false;

        constructor(public readonly initialValue: number) {
            toneState.gains.push(this);
        }

        public connect(target: unknown): void {
            this.connectedTo.push(target);
        }

        public toDestination(): void {
            // no-op in tests
        }

        public dispose(): void {
            this.disposed = true;
        }
    }

    class MembraneSynthStub {
        public readonly connections: unknown[] = [];

        public disposed = false;

        public readonly triggerAttackRelease = vi.fn();

        constructor(public readonly options?: unknown) {
            toneState.membraneSynths.push(this);
        }

        public connect(target: unknown): void {
            this.connections.push(target);
        }

        public dispose(): void {
            this.disposed = true;
        }
    }

    class PolySynthStub {
        public readonly connections: unknown[] = [];

        public disposed = false;

        public readonly triggerAttackRelease = vi.fn();

        constructor(public readonly voices?: number, public readonly options?: unknown) {
            toneState.polySynths.push(this);
        }

        public connect(target: unknown): void {
            this.connections.push(target);
        }

        public dispose(): void {
            this.disposed = true;
        }
    }

    class PartStub<T> {
        public loop = true;

        public humanize = true;

        public readonly events: { readonly offset: number; readonly payload: T }[] = [];

        public startedAt: number | null = null;

        public stoppedAt: number | null = null;

        public canceled = false;

        public disposed = false;

        public constructor(public readonly callback: (time: number, payload: T) => void) {
            toneState.parts.push(this);
        }

        public add(offset: number, payload: T): void {
            this.events.push({ offset, payload });
        }

        public start = vi.fn((time: number) => {
            this.startedAt = time;
        });

        public stop = vi.fn((time: number) => {
            this.stoppedAt = time;
        });

        public cancel = vi.fn(() => {
            this.canceled = true;
        });

        public dispose = vi.fn(() => {
            this.disposed = true;
        });

        public invoke(time: number, payload: T): void {
            this.callback(time, payload);
        }
    }

    const flushScheduled = (limit: number) => {
        let progressed = true;
        while (progressed) {
            progressed = false;
            const entries = [...toneState.transport.scheduled.entries()].sort((a, b) => a[1].time - b[1].time);
            for (const [id, entry] of entries) {
                if (entry.time > limit) {
                    continue;
                }
                toneState.transport.scheduled.delete(id);
                toneState.transport.now = entry.time;
                entry.callback(entry.time);
                progressed = true;
            }
        }
        toneState.transport.now = limit;
    };

    const Transport = {
        now: () => toneState.transport.now,
        scheduleOnce: (callback: (time: number) => void, when: number | string) => {
            const id = toneState.transport.nextId;
            toneState.transport.nextId += 1;
            const time = typeof when === 'number' ? when : Number(when);
            toneState.transport.scheduled.set(id, { time, callback });
            return id;
        },
        clear: (id: number) => {
            toneState.transport.scheduled.delete(id);
        },
        __flushUntil: flushScheduled,
        __state: toneState.transport,
    } as const;

    return {
        Gain: GainStub,
        MembraneSynth: MembraneSynthStub,
        PolySynth: PolySynthStub,
        Part: PartStub,
        Transport,
        __toneState: toneState,
    };
});

type ToneModule = typeof import('tone') & {
    __toneState: {
        gains: { disposed: boolean }[];
        membraneSynths: { triggerAttackRelease: ReturnType<typeof vi.fn>; disposed: boolean }[];
        polySynths: { triggerAttackRelease: ReturnType<typeof vi.fn>; disposed: boolean }[];
        parts: {
            events: { offset: number; payload: unknown }[];
            dispose: ReturnType<typeof vi.fn>;
            invoke: (time: number, payload: unknown) => void;
            disposed: boolean;
        }[];
        transport: {
            now: number;
            nextId: number;
            scheduled: Map<number, ScheduledEntry>;
        };
    };
};

describe('AudioForeshadower', () => {
    beforeEach(() => {
        mockRandomValues.length = 0;
        vi.resetModules();
    });

    it('ignores invalid events and stops scheduling once disposed', async () => {
        const { AudioForeshadower } = await import('audio/AudioForeshadower');
        const tone = (await import('tone')) as ToneModule;
        const foreshadower = new AudioForeshadower([], 123);

        foreshadower.dispose();
        foreshadower.scheduleEvent({ id: 'disposed', type: 'brickHit', timeUntil: 1 });
        foreshadower.scheduleEvent({ id: '', type: 'brickHit', timeUntil: 2 });
        foreshadower.scheduleEvent({ id: 'too-soon', type: 'brickHit', timeUntil: 0.1 });
        foreshadower.scheduleEvent({ id: 'nan', type: 'brickHit', timeUntil: Number.NaN });

        expect(tone.__toneState.parts).toHaveLength(0);
        expect(tone.__toneState.transport.scheduled.size).toBe(0);
    });

    it('schedules percussion foreshadow events using drum-roll patterns', async () => {
        mockRandomValues.push(0.1); // resolveLeadIn fallback unused but keep queue stable
        mockRandomValues.push(0.2); // chooseEffect => drum-roll
        mockRandomValues.push(...Array(20).fill(0.5));

        const { AudioForeshadower } = await import('audio/AudioForeshadower');
        const tone = (await import('tone')) as ToneModule;
        const foreshadower = new AudioForeshadower([60, 62, 64], 7);

        foreshadower.scheduleEvent({
            id: 'percussion',
            type: 'brickHit',
            timeUntil: 1.8,
            intensity: 0.9,
            leadInSeconds: 1.1,
        });

        expect(tone.__toneState.parts).toHaveLength(1);
        expect(tone.__toneState.membraneSynths).toHaveLength(1);
        const [part] = tone.__toneState.parts;
        const [drum] = tone.__toneState.membraneSynths;
        expect(part.events.length).toBeGreaterThan(0);

        const first = part.events[0];
        expect(first?.payload).toBeDefined();
        part.invoke(0.5, first?.payload ?? { instrument: 'percussion', duration: 0.1, velocity: 0.5 });
        expect(drum.triggerAttackRelease).toHaveBeenCalledTimes(1);
    });

    it('supports melodic foreshadow events and cleans up after cancellation', async () => {
        mockRandomValues.push(0.4); // resolveLeadIn randomness
        mockRandomValues.push(0.9); // chooseEffect => scale-run

        const { AudioForeshadower } = await import('audio/AudioForeshadower');
        const tone = (await import('tone')) as ToneModule;
        const foreshadower = new AudioForeshadower([62, 65, 67, 69], 11);

        foreshadower.scheduleEvent({
            id: 'melodic',
            type: 'paddleBounce',
            timeUntil: 2.4,
            targetMidi: 72,
            intensity: 0.2,
        });

        expect(tone.__toneState.parts.length).toBeGreaterThan(0);
        expect(tone.__toneState.polySynths.length).toBeGreaterThan(0);
        const part = tone.__toneState.parts.at(-1);
        const poly = tone.__toneState.polySynths.at(-1);

        expect(part).toBeDefined();
        expect(poly).toBeDefined();
        if (!part || !poly) {
            throw new Error('expected foreshadow stubs');
        }

        const first = part.events[0];
        part.invoke(0.75, first?.payload ?? { instrument: 'melodic', duration: 0.2, velocity: 0.6 });
        expect(poly.triggerAttackRelease).toHaveBeenCalledTimes(1);

        const cleanupTime = Math.min(...[...tone.__toneState.transport.scheduled.values()].map((entry) => entry.time));
        const transport = (tone.Transport as unknown as { __flushUntil: (limit: number) => void });
        transport.__flushUntil(cleanupTime);

        foreshadower.cancelEvent('melodic');
        transport.__flushUntil(cleanupTime + 1);

        expect(poly.disposed).toBe(true);
        expect(part.disposed).toBe(true);
        expect(tone.__toneState.transport.scheduled.size).toBe(0);
    });

    it('disposes active foreshadow events and rejects new work afterwards', async () => {
        mockRandomValues.push(0.4);
        mockRandomValues.push(0.8);

        const { AudioForeshadower } = await import('audio/AudioForeshadower');
        const tone = (await import('tone')) as ToneModule;
        const foreshadower = new AudioForeshadower([60, 64, 67], 19);

        foreshadower.scheduleEvent({
            id: 'active',
            type: 'brickHit',
            timeUntil: 1.6,
        });

        foreshadower.dispose();

        const transport = (tone.Transport as unknown as { __flushUntil: (limit: number) => void });
        transport.__flushUntil(5);
        transport.__flushUntil(Number.POSITIVE_INFINITY);

        expect(tone.__toneState.gains[0]?.disposed).toBe(true);
        expect(tone.__toneState.transport.scheduled.size).toBe(0);

        const partCount = tone.__toneState.parts.length;
        foreshadower.scheduleEvent({ id: 'ignored', type: 'paddleBounce', timeUntil: 2 });
        expect(tone.__toneState.parts.length).toBe(partCount);
    });

    it('emits diagnostics for scheduling, triggering, and lifecycle events', async () => {
        mockRandomValues.push(0.4, 0.8);
        mockRandomValues.push(...Array(12).fill(0.5));

        const { AudioForeshadower } = await import('audio/AudioForeshadower');
        const tone = (await import('tone')) as ToneModule;

        const onPatternScheduled = vi.fn();
        const onNoteTriggered = vi.fn();
        const onEventFinalized = vi.fn();

        const foreshadower = new AudioForeshadower([60, 64, 67], 23, {
            onPatternScheduled,
            onNoteTriggered,
            onEventFinalized,
        });

        foreshadower.scheduleEvent({ id: 'complete', type: 'brickHit', timeUntil: 1.2, intensity: 0.5 });
        expect(onPatternScheduled).toHaveBeenCalledTimes(1);
        expect(onPatternScheduled.mock.calls[0][0]?.event.id).toBe('complete');

        const part = tone.__toneState.parts.at(-1);
        expect(part).toBeDefined();
        const payload = part?.events[0];
        part?.invoke(0.6, payload?.payload ?? { instrument: 'melodic', duration: 0.2, velocity: 0.6 });
        expect(onNoteTriggered).toHaveBeenCalled();

        const transport = (tone.Transport as unknown as { __flushUntil: (time: number) => void });
        transport.__flushUntil(Number.POSITIVE_INFINITY);
        expect(onEventFinalized).toHaveBeenCalledWith({ eventId: 'complete', reason: 'completed' });

        foreshadower.scheduleEvent({ id: 'cancel', type: 'brickHit', timeUntil: 1.4 });
        foreshadower.cancelEvent('cancel');
        transport.__flushUntil(Number.POSITIVE_INFINITY);
        expect(onEventFinalized).toHaveBeenCalledWith({ eventId: 'cancel', reason: 'cancelled' });
    });
});
