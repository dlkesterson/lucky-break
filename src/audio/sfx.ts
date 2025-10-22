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

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

const mixHash = (seed: number, value: number): number => {
    const mixed = Math.imul(seed ^ value, FNV_PRIME);
    return mixed | 0;
};

const hashString = (value: string): number => {
    let seed = FNV_OFFSET;
    for (let index = 0; index < value.length; index += 1) {
        seed = mixHash(seed, value.charCodeAt(index));
    }
    return seed;
};

const hashSequence = (...values: number[]): number => {
    let seed = FNV_OFFSET;
    for (const value of values) {
        const safe = Number.isFinite(value) ? Math.trunc(value) : 0;
        seed = mixHash(seed, safe);
    }
    return seed;
};

const createSeed = (sessionId: string, kind: number, ...values: number[]): number =>
    hashSequence(hashString(sessionId), kind, ...values);

const computeVariation = (seed: number, amplitude: number): number => {
    if (!Number.isFinite(amplitude) || amplitude <= 0) {
        return 0;
    }
    const normalized = Math.sin(seed) * 0.5 + 0.5;
    return (normalized * 2 - 1) * amplitude;
};

const applyGainVariation = (
    base: number,
    seed: number,
    amplitude: number,
    min: number,
    max: number,
): number => {
    const varied = clamp(base + computeVariation(seed, amplitude), min, max);
    return Number(varied.toFixed(2));
};

const applyDetuneVariation = (base: number, seed: number, amplitude: number): number => {
    const varied = base + computeVariation(seed, amplitude);
    return Math.round(varied);
};

const defaultTrigger = (): void => {
    // Intentionally blank: production wiring occurs in audio bootstrap.
};

const normalizeBrickPan = (column: number): number => {
    const normalized = (column - 5.5) / 5.5;
    return clamp(Number(normalized.toFixed(2)), -1, 1);
};

const calculateGain = (impactVelocity: number): number => {
    const base = 0.55 + impactVelocity / 20;
    return Number(clamp(base, 0.4, 1).toFixed(2));
};

const calculateDetune = (comboHeat: number, row: number, impactVelocity: number): number => {
    const comboComponent = (comboHeat - 5) * 6 + (row - 3) * 4;
    const velocityComponent = (impactVelocity - 8) * 5;
    return Math.round(comboComponent + velocityComponent);
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

const selectSampleByHp = (samples: readonly string[], hp: number): string => {
    if (samples.length === 0) {
        return 'brick-hit';
    }

    if (samples.length === 1) {
        return samples[0];
    }

    const finiteHp = Number.isFinite(hp) ? Math.max(0, Math.floor(hp)) : 0;
    const clamped = Math.min(samples.length, Math.max(1, finiteHp));
    const index = samples.length - clamped;
    return samples[index] ?? samples[samples.length - 1];
};

const resolveBrickSample = (samples: readonly string[], fallback: BrickSamplePayload, hp: number | undefined): string => {
    if (hp === undefined) {
        return selectSampleId(samples, fallback);
    }

    return selectSampleByHp(samples, hp);
};

const buildBrickBreakDescriptor = (
    samples: readonly string[],
    time: number,
    payload: BrickBreakPayload,
): SfxTriggerDescriptor => {
    const sampleId = resolveBrickSample(samples, {
        row: payload.row,
        col: payload.col,
        velocity: payload.impactVelocity,
    }, payload.initialHp);
    const seed = createSeed(
        payload.sessionId,
        1,
        payload.row,
        payload.col,
        Math.round(payload.impactVelocity * 100),
        payload.initialHp,
    );
    const gain = applyGainVariation(calculateGain(payload.impactVelocity), seed, 0.08, 0.4, 1);
    const detune = applyDetuneVariation(
        calculateDetune(payload.comboHeat, payload.row, payload.impactVelocity),
        seed ^ 0x9e3779b9,
        18,
    );

    return {
        id: sampleId,
        time,
        gain,
        detune,
        pan: normalizeBrickPan(payload.col),
        source: { event: 'BrickBreak', ...payload },
    } satisfies SfxTriggerDescriptor;
};

const buildBrickHitDescriptor = (
    samples: readonly string[],
    impactSampleId: string | undefined,
    time: number,
    payload: BrickHitPayload,
): SfxTriggerDescriptor => {
    const resolvedId = impactSampleId ?? resolveBrickSample(samples, {
        row: payload.row,
        col: payload.col,
        velocity: payload.impactVelocity,
    }, payload.previousHp);
    const baseGain = clamp(calculateGain(payload.impactVelocity) * 0.8, 0.3, 0.9);
    const seed = createSeed(
        payload.sessionId,
        2,
        payload.row,
        payload.col,
        Math.round(payload.impactVelocity * 100),
        payload.previousHp,
        payload.remainingHp,
    );
    const gain = applyGainVariation(baseGain, seed, 0.06, 0.3, 0.9);
    const detune = applyDetuneVariation(
        Math.round(calculateDetune(payload.comboHeat, payload.row, payload.impactVelocity) * 0.75),
        seed ^ 0x85ebca6b,
        12,
    );

    return {
        id: resolvedId,
        time,
        gain,
        detune,
        pan: normalizeBrickPan(payload.col),
        source: { event: 'BrickHit', ...payload },
    } satisfies SfxTriggerDescriptor;
};

const buildPaddleHitDescriptor = (
    sampleId: string,
    time: number,
    payload: PaddleHitPayload,
): SfxTriggerDescriptor => {
    const baseGain = clamp(0.45 + payload.speed / 12, 0.35, 0.85);
    const seed = createSeed(
        payload.sessionId,
        3,
        Math.round(payload.speed * 100),
        Math.round(payload.impactOffset * 1000),
    );
    const gain = applyGainVariation(baseGain, seed, 0.05, 0.35, 0.85);
    const detune = applyDetuneVariation(Math.round(payload.impactOffset * 120), seed ^ 0xc2b2ae35, 10);

    return {
        id: sampleId,
        time,
        gain,
        detune,
        pan: clamp(Number(payload.impactOffset.toFixed(2)), -1, 1),
        source: { event: 'PaddleHit', ...payload },
    } satisfies SfxTriggerDescriptor;
};

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

    const seed = createSeed(
        payload.sessionId,
        4,
        hashString(payload.side),
        Math.round(payload.speed * 100),
    );

    return {
        id: sampleId,
        time,
        gain: applyGainVariation(clamp(0.4 + payload.speed / 15, 0.3, 0.8), seed, 0.04, 0.3, 0.8),
        detune: applyDetuneVariation(detune, seed ^ 0x27d4eb2f, 8),
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
        let handle: ScheduledEventHandle | null = null;

        const scheduledHandle = options.scheduler.schedule((scheduledTime) => {
            if (handle) {
                pending.delete(handle);
            }
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
        handle = scheduledHandle;
        pending.add(handle);
    };

    const subscriptions: (() => void)[] = [
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
