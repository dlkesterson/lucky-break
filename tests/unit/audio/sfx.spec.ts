import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '@app/events';
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
        readonly velocity: number;
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
            velocity: 9.4,
            brickType: 'standard' as const,
            comboHeat: 7,
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
            velocity: payload.velocity,
        });

        router.dispose();
        scheduler.dispose();
    });
});
