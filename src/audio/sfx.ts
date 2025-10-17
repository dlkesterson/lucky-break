import type {
    LuckyBreakEventBus,
    EventEnvelope,
    BrickBreakPayload,
    BrickHitPayload,
    PaddleHitPayload,
    WallHitPayload,
} from 'app/events';
import type { ScheduledEventHandle, ToneScheduler } from './scheduler';

type BrickBreakSource = { readonly event: 'BrickBreak' } & BrickBreakPayload;
type BrickHitSource = { readonly event: 'BrickHit' } & BrickHitPayload;
type PaddleHitSource = { readonly event: 'PaddleHit' } & PaddleHitPayload;
type WallHitSource = { readonly event: 'WallHit' } & WallHitPayload;

type SfxSource = BrickBreakSource | BrickHitSource | PaddleHitSource | WallHitSource;

export interface SfxTriggerDescriptor {
    readonly id: string;
    readonly time: number;
    readonly gain: number;
    readonly detune: number;
    readonly pan: number;
    readonly source: SfxSource;
}

export interface SfxRouterOptions {
    readonly bus: LuckyBreakEventBus;
    readonly scheduler: ToneScheduler;
    readonly trigger?: (descriptor: SfxTriggerDescriptor) => void;
    readonly brickSampleId?: string;
    readonly brickSampleIds?: readonly string[];
    readonly brickImpactSampleId?: string;
    readonly paddleSampleId?: string;
    readonly wallSampleId?: string;
}

export interface SfxRouter {
    readonly dispose: () => void;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const defaultTrigger = (_descriptor: SfxTriggerDescriptor): void => {
    // Intentionally blank: production wiring occurs in audio bootstrap.
};

const normalizeBrickPan = (column: number): number => {
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

const toSampleList = (options: SfxRouterOptions): readonly string[] => {
    if (options.brickSampleIds && options.brickSampleIds.length > 0) {
        return options.brickSampleIds;
    }

    if (options.brickSampleId) {
        return [options.brickSampleId];
    }

    return ['brick-hit'];
};

interface BrickSamplePayload {
    readonly row: number;
    readonly col: number;
    readonly velocity: number;
}

const selectSampleId = (samples: readonly string[], payload: BrickSamplePayload): string => {
    if (samples.length === 1) {
        return samples[0];
    }

    const hash = (payload.row * 31 + payload.col * 17 + Math.round(payload.velocity * 10)) | 0;
    const index = Math.abs(hash) % samples.length;
    return samples[index];
};

const buildBrickBreakDescriptor = (
    samples: readonly string[],
    time: number,
    payload: BrickBreakPayload,
): SfxTriggerDescriptor => ({
    id: selectSampleId(samples, payload),
    time,
    gain: calculateGain(payload.velocity),
    detune: calculateDetune(payload.comboHeat, payload.row),
    pan: normalizeBrickPan(payload.col),
    source: { event: 'BrickBreak', ...payload },
});

const buildBrickHitDescriptor = (
    samples: readonly string[],
    impactSampleId: string | undefined,
    time: number,
    payload: BrickHitPayload,
): SfxTriggerDescriptor => ({
    id: impactSampleId ?? selectSampleId(samples, payload),
    time,
    gain: clamp(calculateGain(payload.velocity) * 0.8, 0.3, 0.9),
    detune: Math.round(calculateDetune(payload.comboHeat, payload.row) * 0.75),
    pan: normalizeBrickPan(payload.col),
    source: { event: 'BrickHit', ...payload },
});

const buildPaddleHitDescriptor = (
    sampleId: string,
    time: number,
    payload: PaddleHitPayload,
): SfxTriggerDescriptor => ({
    id: sampleId,
    time,
    gain: clamp(0.45 + payload.speed / 12, 0.35, 0.85),
    detune: Math.round(payload.impactOffset * 120),
    pan: clamp(Number(payload.impactOffset.toFixed(2)), -1, 1),
    source: { event: 'PaddleHit', ...payload },
});

const buildWallHitDescriptor = (
    sampleId: string,
    time: number,
    payload: WallHitPayload,
): SfxTriggerDescriptor => {
    const pan = (() => {
        switch (payload.side) {
            case 'left': return -0.7;
            case 'right': return 0.7;
            default: return 0;
        }
    })();

    const detune = (() => {
        switch (payload.side) {
            case 'top': return -40;
            case 'bottom': return -60;
            case 'right': return 30;
            case 'left': return -30;
            default: return 0;
        }
    })();

    return {
        id: sampleId,
        time,
        gain: clamp(0.4 + payload.speed / 15, 0.3, 0.8),
        detune,
        pan,
        source: { event: 'WallHit', ...payload },
    } satisfies SfxTriggerDescriptor;
};

export const createSfxRouter = (options: SfxRouterOptions): SfxRouter => {
    const trigger = options.trigger ?? defaultTrigger;
    const samples = toSampleList(options);
    const brickImpactSampleId = options.brickImpactSampleId;
    const paddleSample = options.paddleSampleId ?? samples[0];
    const wallSample = options.wallSampleId ?? samples[0];

    const pending = new Set<ScheduledEventHandle>();

    const scheduleSource = (source: SfxSource) => {
        const handle = options.scheduler.schedule((scheduledTime) => {
            pending.delete(handle);
            let descriptor: SfxTriggerDescriptor | null = null;

            switch (source.event) {
                case 'BrickBreak':
                    descriptor = buildBrickBreakDescriptor(samples, scheduledTime, source);
                    break;
                case 'BrickHit':
                    descriptor = buildBrickHitDescriptor(samples, brickImpactSampleId, scheduledTime, source);
                    break;
                case 'PaddleHit':
                    descriptor = buildPaddleHitDescriptor(paddleSample, scheduledTime, source);
                    break;
                case 'WallHit':
                    descriptor = buildWallHitDescriptor(wallSample, scheduledTime, source);
                    break;
                default:
                    descriptor = null;
            }

            if (descriptor) {
                trigger(descriptor);
            }
        });
        pending.add(handle);
    };

    const subscriptions: Array<() => void> = [
        options.bus.subscribe('BrickBreak', (event: EventEnvelope<'BrickBreak'>) => {
            scheduleSource({ event: 'BrickBreak', ...event.payload });
        }),
        options.bus.subscribe('BrickHit', (event: EventEnvelope<'BrickHit'>) => {
            scheduleSource({ event: 'BrickHit', ...event.payload });
        }),
        options.bus.subscribe('PaddleHit', (event: EventEnvelope<'PaddleHit'>) => {
            scheduleSource({ event: 'PaddleHit', ...event.payload });
        }),
        options.bus.subscribe('WallHit', (event: EventEnvelope<'WallHit'>) => {
            scheduleSource({ event: 'WallHit', ...event.payload });
        }),
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
