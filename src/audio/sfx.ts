import type { LuckyBreakEventBus, EventEnvelope, BrickBreakPayload } from '@app/events';
import type { ScheduledEventHandle, ToneScheduler } from './scheduler';

export interface SfxTriggerDescriptor {
    readonly id: string;
    readonly time: number;
    readonly gain: number;
    readonly detune: number;
    readonly pan: number;
    readonly source: {
        readonly event: 'BrickBreak';
        readonly row: number;
        readonly velocity: number;
    };
}

export interface SfxRouterOptions {
    readonly bus: LuckyBreakEventBus;
    readonly scheduler: ToneScheduler;
    readonly trigger?: (descriptor: SfxTriggerDescriptor) => void;
    readonly brickSampleId?: string;
}

export interface SfxRouter {
    readonly dispose: () => void;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const defaultTrigger = (_descriptor: SfxTriggerDescriptor): void => {
    // Intentionally blank: production wiring occurs in audio bootstrap.
};

const normalizePan = (column: number): number => {
    const normalized = (column - 5.5) / 5.5;
    return clamp(Number(normalized.toFixed(2)), -1, 1);
};

const calculateGain = (velocity: number): number => {
    const base = 0.55 + velocity / 20;
    return Number(clamp(base, 0.4, 1).toFixed(2));
};

const calculateDetune = (comboHeat: number, row: number): number => {
    const detune = (comboHeat - 5) * 6 + (row - 3) * 4;
    return Math.round(detune);
};

const createBrickTrigger = (
    payload: BrickBreakPayload,
    time: number,
    sampleId: string,
): SfxTriggerDescriptor => ({
    id: sampleId,
    time,
    gain: calculateGain(payload.velocity),
    detune: calculateDetune(payload.comboHeat, payload.row),
    pan: normalizePan(payload.col),
    source: {
        event: 'BrickBreak',
        row: payload.row,
        velocity: payload.velocity,
    },
});

export const createSfxRouter = (options: SfxRouterOptions): SfxRouter => {
    const trigger = options.trigger ?? defaultTrigger;
    const sampleId = options.brickSampleId ?? 'brick/snare-01';

    const pending = new Set<ScheduledEventHandle>();

    const handleBrickBreak = (event: EventEnvelope<'BrickBreak'>) => {
        const handle = options.scheduler.schedule((scheduledTime) => {
            pending.delete(handle);
            trigger(createBrickTrigger(event.payload, scheduledTime, sampleId));
        });
        pending.add(handle);
    };

    const subscriptions: Array<() => void> = [
        options.bus.subscribe('BrickBreak', handleBrickBreak),
    ];

    const dispose: SfxRouter['dispose'] = () => {
        for (const unsubscribe of subscriptions) {
            unsubscribe();
        }
        subscriptions.length = 0;

        for (const handle of pending) {
            options.scheduler.cancel(handle);
        }
        pending.clear();
    };

    return {
        dispose,
    };
};
