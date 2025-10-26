import { Transport, now as toneNow, getContext } from 'tone';
import { isComboMilestone } from 'util/scoring';
import type { Observable, Subscription } from 'util/observable';

const DEFAULT_LOOK_AHEAD_MS = 120;

export interface ScheduledEventHandle {
    readonly id: number;
    readonly time: number;
}

export interface ToneSchedulerOptions {
    readonly lookAheadMs?: number;
    readonly now?: () => number;
    readonly schedule?: (callback: (time: number) => void, at: number | string) => number;
    readonly clear?: (id: number) => void;
    readonly cancel?: (time?: number) => void;
}

export interface ToneScheduler {
    readonly lookAheadMs: number;
    readonly lookAheadSeconds: number;
    readonly schedule: (callback: (time: number) => void, offsetMs?: number) => ScheduledEventHandle;
    readonly cancel: (handle: ScheduledEventHandle) => void;
    readonly dispose: () => void;
    readonly context: AudioContext;
    readonly now: () => number;
    readonly predictAt: (offsetMs?: number) => number;
}

const toSeconds = (milliseconds: number): number => milliseconds / 1000;

const resolveTransport = (): {
    scheduleOnce?: (callback: (time: number) => void, at: number | string) => number;
    schedule?: (callback: (time: number) => void, at: number | string) => number;
    clear?: (id: number) => void;
    cancel?: (time?: number) => void;
} => {
    const globalTransport = (globalThis as {
        __luckyBreakToneTransport?: unknown;
    }).__luckyBreakToneTransport;

    if (globalTransport && typeof globalTransport === 'object') {
        return globalTransport as {
            scheduleOnce?: (callback: (time: number) => void, at: number | string) => number;
            schedule?: (callback: (time: number) => void, at: number | string) => number;
            clear?: (id: number) => void;
            cancel?: (time?: number) => void;
        };
    }

    return Transport as unknown as {
        scheduleOnce?: (callback: (time: number) => void, at: number | string) => number;
        schedule?: (callback: (time: number) => void, at: number | string) => number;
        clear?: (id: number) => void;
        cancel?: (time?: number) => void;
    };
};

export const createToneScheduler = (options: ToneSchedulerOptions = {}): ToneScheduler => {
    const lookAheadMs = Math.max(0, options.lookAheadMs ?? DEFAULT_LOOK_AHEAD_MS);
    const now = options.now ?? toneNow;
    const lookAheadSeconds = toSeconds(lookAheadMs);
    const transportLike = resolveTransport();

    const fallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();
    let fallbackHandle = 1;

    const resolveTargetSeconds = (at: number | string): number => {
        if (typeof at === 'number') {
            return at;
        }

        const parsed = parseFloat(at);
        if (!Number.isFinite(parsed)) {
            return now();
        }

        if (String(at).trim().startsWith('+')) {
            return now() + parsed;
        }

        return parsed;
    };

    const scheduleFallback = (callback: (time: number) => void, at: number | string) => {
        const handle = fallbackHandle++;
        const targetSeconds = resolveTargetSeconds(at);
        const delayMs = Math.max(0, (targetSeconds - now()) * 1000);
        const timer = setTimeout(() => {
            fallbackTimers.delete(handle);
            callback(targetSeconds);
        }, delayMs);
        fallbackTimers.set(handle, timer);
        return -handle;
    };

    const clearFallback = (id: number) => {
        const timer = fallbackTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            fallbackTimers.delete(id);
        }
    };

    const cancelFallback = () => {
        for (const timer of fallbackTimers.values()) {
            clearTimeout(timer);
        }
        fallbackTimers.clear();
    };

    const hasTransportScheduling = typeof transportLike.scheduleOnce === 'function' || typeof transportLike.schedule === 'function';

    const scheduleWithTransport = (callback: (time: number) => void, at: number | string): number => {
        if (typeof transportLike.scheduleOnce === 'function') {
            return transportLike.scheduleOnce(callback, at);
        }
        if (typeof transportLike.schedule === 'function') {
            return transportLike.schedule(callback, at);
        }
        throw new TypeError('Tone.Transport does not support scheduling');
    };

    const scheduleFn = options.schedule ?? ((callback, at) => {
        if (!hasTransportScheduling) {
            return scheduleFallback(callback, at);
        }

        try {
            return scheduleWithTransport(callback, at);
        } catch {
            return scheduleFallback(callback, at);
        }
    });

    const clearFn = options.clear ?? ((id) => {
        if (id < 0) {
            clearFallback(-id);
            return;
        }

        if (typeof transportLike.clear === 'function') {
            transportLike.clear(id);
            return;
        }

        transportLike.cancel?.();
    });

    const cancelFn = options.cancel ?? ((time = 0) => {
        transportLike.cancel?.(time);
        cancelFallback();
    });
    const usingTransport = options.schedule === undefined;
    const audioContext = getContext().rawContext as AudioContext;

    const active = new Set<number>();

    const schedule: ToneScheduler['schedule'] = (callback, offsetMs = 0) => {
        const offsetSeconds = lookAheadSeconds + toSeconds(offsetMs);
        const targetTime = now() + offsetSeconds;
        const scheduleAt = usingTransport ? `+${offsetSeconds}` : targetTime;

        const id = scheduleFn((scheduledTime) => {
            active.delete(id);
            const resolvedTime = Number.isFinite(scheduledTime) ? scheduledTime : targetTime;
            callback(resolvedTime);
        }, scheduleAt);
        active.add(id);
        return { id, time: targetTime };
    };

    const cancel: ToneScheduler['cancel'] = (handle) => {
        if (active.has(handle.id)) {
            active.delete(handle.id);
            clearFn(handle.id);
        }
    };

    const dispose: ToneScheduler['dispose'] = () => {
        for (const id of active) {
            clearFn(id);
        }
        active.clear();
        cancelFn(0);
    };

    const nowSeconds: ToneScheduler['now'] = () => now();

    const predictAt: ToneScheduler['predictAt'] = (offsetMs = 0) => {
        const normalizedOffsetMs = Number.isFinite(offsetMs) ? offsetMs : 0;
        return nowSeconds() + lookAheadSeconds + toSeconds(normalizedOffsetMs);
    };

    return {
        lookAheadMs,
        lookAheadSeconds,
        schedule,
        cancel,
        dispose,
        context: audioContext,
        now: nowSeconds,
        predictAt,
    };
};

interface TransportLike {
    scheduleOnce(callback: (time: number) => void, when: number | string): number;
    clear(id: number): void;
    cancel?(time?: number): void;
    nextSubdivision?(subdivision: string): number;
}

export interface ReactiveAudioGameState {
    readonly combo: number;
    readonly activePowerUps: readonly { type: string }[];
    readonly lookAheadMs?: number;
}

export type ReactiveFillType = 'power-up' | 'combo';

export interface ReactiveFillEvent {
    readonly type: ReactiveFillType;
    readonly payload: {
        readonly powerUpType?: string;
        readonly combo?: number;
    };
    readonly scheduledTime: number;
}

export interface ReactiveAudioLayerOptions {
    readonly lookAheadMs?: number;
    readonly comboThreshold?: number;
    readonly now?: () => number;
    readonly onFill?: (event: ReactiveFillEvent) => void;
}

export interface ReactiveAudioLayer {
    dispose(): void;
}

const computeScheduleTarget = (
    transport: TransportLike,
    lookAheadMs: number,
    currentTime: number,
): number | string => {
    if (lookAheadMs <= 0) {
        return currentTime;
    }

    const subdivisionTarget = transport.nextSubdivision?.('4n');
    if (typeof subdivisionTarget === 'number' && Number.isFinite(subdivisionTarget)) {
        return subdivisionTarget;
    }

    const offsetSeconds = toSeconds(lookAheadMs);
    return `+${offsetSeconds}`;
};

export const createReactiveAudioLayer = (
    state$: Observable<ReactiveAudioGameState>,
    transport: TransportLike = Transport,
    options: ReactiveAudioLayerOptions = {},
): ReactiveAudioLayer => {
    const activePowerUps = new Set<string>();
    const scheduled = new Map<string, number>();
    const now = options.now ?? toneNow;
    const comboThreshold = options.comboThreshold;
    let previousCombo = 0;
    let disposed = false;

    const clearScheduled = (key: string) => {
        const handle = scheduled.get(key);
        if (handle !== undefined) {
            transport.clear(handle);
            scheduled.delete(key);
        }
    };

    const scheduleFill = (
        key: string,
        lookAheadMs: number,
        payloadFactory: () => Omit<ReactiveFillEvent, 'scheduledTime'>,
    ) => {
        clearScheduled(key);
        const currentTime = now();
        const target = computeScheduleTarget(transport, lookAheadMs, currentTime);
        const id = transport.scheduleOnce((scheduledTime) => {
            scheduled.delete(key);
            if (disposed) {
                return;
            }

            const payload = payloadFactory();
            options.onFill?.({ ...payload, scheduledTime });
        }, target);
        scheduled.set(key, id);
    };

    const subscription: Subscription = state$.subscribe((state) => {
        const lookAheadMs = state.lookAheadMs ?? options.lookAheadMs ?? DEFAULT_LOOK_AHEAD_MS;
        const nextPowerUps = new Set<string>(state.activePowerUps.map((entry) => entry.type));

        for (const type of nextPowerUps) {
            if (!activePowerUps.has(type)) {
                scheduleFill(
                    `power:${type}`,
                    lookAheadMs,
                    () => ({
                        type: 'power-up',
                        payload: { powerUpType: type },
                    }),
                );
            }
        }

        for (const type of activePowerUps) {
            if (!nextPowerUps.has(type)) {
                clearScheduled(`power:${type}`);
            }
        }

        activePowerUps.clear();
        nextPowerUps.forEach((type) => activePowerUps.add(type));

        if (state.combo > previousCombo && isComboMilestone(state.combo, comboThreshold)) {
            scheduleFill(
                `combo:${state.combo}`,
                lookAheadMs,
                () => ({
                    type: 'combo',
                    payload: { combo: state.combo },
                }),
            );
        }

        previousCombo = state.combo;
    });

    const dispose = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        subscription.unsubscribe();
        for (const key of scheduled.keys()) {
            clearScheduled(key);
        }
        scheduled.clear();
        activePowerUps.clear();
        transport.cancel?.(now());
    };

    return {
        dispose,
    };
};
