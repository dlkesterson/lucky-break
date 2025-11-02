import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus, type LuckyBreakEventMap } from 'app/events';
import { installToneMock, type ToneMockContext } from './mocks';

interface RecordedTrigger {
    readonly id: string;
    readonly time: number;
    readonly gain: number;
    readonly detune: number;
    readonly pan: number;
    readonly source: {
        readonly event: string;
        readonly row: number;
        readonly impactVelocity: number;
        readonly initialHp?: number;
        readonly previousHp?: number;
        readonly remainingHp?: number;
    };
}

describe('createSfxRouter', () => {
    const lookAheadMs = 80;
    let tone: ToneMockContext;
    let createToneScheduler: any;
    let createSfxRouter: any;

    beforeAll(async () => {
        tone = installToneMock();
        ({ createToneScheduler } = await import('audio/scheduler'));
        ({ createSfxRouter } = await import('audio/sfx'));
    });

    afterAll(() => {
        tone.restore();
    });

    it('schedules brick-break SFX callbacks within the latency budget', () => {
        const bus = createEventBus();
        const triggers: RecordedTrigger[] = [];

        const scheduler = createToneScheduler({
            lookAheadMs,
            now: tone.now,
            schedule: tone.transport.scheduleOnce as unknown as (callback: (time: number) => void, at: number) => number,
            clear: tone.transport.clear as unknown as (id: number) => void,
            cancel: tone.transport.cancel as unknown as (time?: number) => void,
        });

        const router = createSfxRouter({
            bus,
            scheduler,
            trigger: (descriptor: RecordedTrigger) => {
                triggers.push(descriptor);
            },
        });

        const payload = {
            sessionId: 'session-001',
            row: 3,
            col: 4,
            impactVelocity: 9.4,
            brickType: 'standard' as const,
            comboHeat: 7,
            initialHp: 3,
        };

        const publishTime = tone.now();
        bus.publish('BrickBreak', payload, publishTime * 1000);

        expect(tone.transport.scheduleOnce).toHaveBeenCalledTimes(1);
        const [scheduledCallback, scheduledAt] = tone.transport.scheduleOnce.mock.calls[0] as [
            (scheduledTime: number) => void,
            number,
        ];

        expect(typeof scheduledCallback).toBe('function');
        expect(scheduledAt).toBeGreaterThan(publishTime);
        expect(scheduledAt - publishTime).toBeLessThanOrEqual(lookAheadMs / 1000);

        tone.advanceBy(lookAheadMs);

        expect(triggers).toHaveLength(1);
        const [firstTrigger] = triggers;

        expect(firstTrigger.id).toContain('brick');
        expect(firstTrigger.time).toBeCloseTo(scheduledAt, 6);
        expect(firstTrigger.gain).toBeGreaterThan(0.4);
        expect(firstTrigger.gain).toBeLessThanOrEqual(1);
        expect(firstTrigger.source).toMatchObject({
            event: 'BrickBreak',
            row: payload.row,
            impactVelocity: payload.impactVelocity,
            initialHp: payload.initialHp,
        });

        router.dispose();
        scheduler.dispose();
    });

    it('maps impact velocity and brick HP to audio descriptor parameters', () => {
        const bus = createEventBus();
        const triggers: RecordedTrigger[] = [];

        const scheduler = {
            lookAheadMs: 0,
            lookAheadSeconds: 0,
            context: {} as AudioContext,
            schedule: (callback: (time: number) => void) => {
                callback(0.25);
                return { id: 1, time: 0.25 };
            },
            cancel: () => {
                /* no-op */
            },
            dispose: () => {
                /* no-op */
            },
            now: () => 0,
            predictAt: () => 0,
        } satisfies ReturnType<typeof createToneScheduler>;

        const router = createSfxRouter({
            bus,
            scheduler,
            brickSampleIds: ['low', 'mid', 'high'],
            trigger: (descriptor: RecordedTrigger) => {
                triggers.push(descriptor);
            },
        });

        bus.publish('BrickHit', {
            sessionId: 'session-002',
            row: 2,
            col: 1,
            impactVelocity: 12,
            brickType: 'standard',
            comboHeat: 8,
            previousHp: 3,
            remainingHp: 2,
        });

        expect(triggers).toHaveLength(1);
        const [hitTrigger] = triggers;
        expect(hitTrigger.id).toBe('low');
        expect(hitTrigger.gain).toBeGreaterThan(0.5);
        expect(hitTrigger.detune).toBeGreaterThan(0);
        expect(hitTrigger.source.previousHp).toBe(3);
        expect(hitTrigger.source.remainingHp).toBe(2);

        router.dispose();
    });

    it('applies deterministic micro-variations to brick break descriptors', () => {
        const bus = createEventBus();
        const triggers: RecordedTrigger[] = [];

        let nextHandle = 0;
        const scheduler = {
            lookAheadMs: 0,
            lookAheadSeconds: 0,
            context: {} as AudioContext,
            schedule: (callback: (time: number) => void) => {
                callback(0.2);
                nextHandle += 1;
                return { id: nextHandle, time: 0.2 };
            },
            cancel: () => {
                /* no-op */
            },
            dispose: () => {
                /* no-op */
            },
            now: () => 0,
            predictAt: () => 0,
        } satisfies ReturnType<typeof createToneScheduler>;

        const router = createSfxRouter({
            bus,
            scheduler,
            brickSampleIds: ['low', 'mid', 'high'],
            trigger: (descriptor: RecordedTrigger) => {
                triggers.push(descriptor);
            },
        });

        const basePayload: LuckyBreakEventMap['BrickBreak'] = {
            sessionId: 'session-004',
            row: 2,
            col: 3,
            impactVelocity: 9.6,
            brickType: 'standard' as const,
            comboHeat: 8,
            initialHp: 2,
        };

        bus.publish('BrickBreak', basePayload);
        bus.publish('BrickBreak', { ...basePayload, col: basePayload.col + 1 });
        bus.publish('BrickBreak', { ...basePayload });

        expect(triggers).toHaveLength(3);
        const [first, second, third] = triggers;
        expect(first.detune).not.toBe(second.detune);
        expect(first.detune).toBe(third.detune);
        expect(first.gain).toBeCloseTo(third.gain, 5);

        router.dispose();
    });
});
