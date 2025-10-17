import { Transport, now as toneNow, getContext } from 'tone';

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
    readonly schedule: (callback: (time: number) => void, offsetMs?: number) => ScheduledEventHandle;
    readonly cancel: (handle: ScheduledEventHandle) => void;
    readonly dispose: () => void;
    readonly context: AudioContext;
}

const toSeconds = (milliseconds: number): number => milliseconds / 1000;

export const createToneScheduler = (options: ToneSchedulerOptions = {}): ToneScheduler => {
    const lookAheadMs = Math.max(0, options.lookAheadMs ?? 120);
    const now = options.now ?? toneNow;
    const scheduleFn = options.schedule ?? ((callback, at) => Transport.scheduleOnce(callback, at));
    const clearFn = options.clear ?? ((id) => Transport.clear(id));
    const cancelFn = options.cancel ?? ((time = 0) => Transport.cancel(time));
    const usingTransport = options.schedule === undefined;
    const audioContext = getContext().rawContext as AudioContext;

    const active = new Set<number>();

    const schedule: ToneScheduler['schedule'] = (callback, offsetMs = 0) => {
        const offsetSeconds = toSeconds(lookAheadMs + offsetMs);
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

    return {
        lookAheadMs,
        schedule,
        cancel,
        dispose,
        context: audioContext,
    };
};
