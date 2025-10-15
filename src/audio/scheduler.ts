import { Transport, now as toneNow } from 'tone';

export interface ScheduledEventHandle {
    readonly id: number;
    readonly time: number;
}

export interface ToneSchedulerOptions {
    readonly lookAheadMs?: number;
    readonly now?: () => number;
    readonly schedule?: (callback: (time: number) => void, at: number) => number;
    readonly clear?: (id: number) => void;
    readonly cancel?: (time?: number) => void;
}

export interface ToneScheduler {
    readonly lookAheadMs: number;
    readonly schedule: (callback: (time: number) => void, offsetMs?: number) => ScheduledEventHandle;
    readonly cancel: (handle: ScheduledEventHandle) => void;
    readonly dispose: () => void;
}

const toSeconds = (milliseconds: number): number => milliseconds / 1000;

export const createToneScheduler = (options: ToneSchedulerOptions = {}): ToneScheduler => {
    const lookAheadMs = Math.max(0, options.lookAheadMs ?? 120);
    const now = options.now ?? toneNow;
    const scheduleFn = options.schedule ?? ((callback, at) => Transport.scheduleOnce(callback, at));
    const clearFn = options.clear ?? ((id) => Transport.clear(id));
    const cancelFn = options.cancel ?? ((time = 0) => Transport.cancel(time));

    const active = new Set<number>();

    const schedule: ToneScheduler['schedule'] = (callback, offsetMs = 0) => {
        const targetTime = now() + toSeconds(lookAheadMs + offsetMs);
        const id = scheduleFn((scheduledTime) => {
            active.delete(id);
            callback(scheduledTime);
        }, targetTime);
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
    };
};
