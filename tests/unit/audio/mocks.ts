import { vi } from 'vitest';

export interface ToneMockContext {
    readonly transport: {
        readonly schedule: ReturnType<typeof vi.fn>;
        readonly scheduleOnce: ReturnType<typeof vi.fn>;
        readonly clear: ReturnType<typeof vi.fn>;
        readonly cancel: ReturnType<typeof vi.fn>;
        readonly start: ReturnType<typeof vi.fn>;
        readonly stop: ReturnType<typeof vi.fn>;
        readonly nextSubdivision: ReturnType<typeof vi.fn>;
        readonly seconds: number;
    };
    readonly advanceBy: (milliseconds: number) => void;
    readonly now: () => number;
    readonly restore: () => void;
}

export const installToneMock = (): ToneMockContext => {
    interface ScheduledCallback {
        id: number;
        at: number;
        callback: (scheduledTime: number) => void;
    }

    let nowSeconds = 0;
    const scheduled: ScheduledCallback[] = [];

    const schedule = vi.fn((callback: (scheduledTime: number) => void, at: number | string) => {
        const asSeconds = typeof at === 'number' ? at : parseFloat(String(at));
        const entry: ScheduledCallback = {
            id: scheduled.length,
            at: asSeconds,
            callback,
        };
        scheduled.push(entry);
        return entry.id;
    });

    const scheduleOnce = vi.fn((callback: (scheduledTime: number) => void, at: number | string) => {
        return schedule(callback, at);
    });

    const clear = vi.fn((id: number) => {
        const index = scheduled.findIndex((item) => item.id === id);
        if (index !== -1) {
            scheduled.splice(index, 1);
        }
    });

    const cancel = vi.fn(() => {
        scheduled.length = 0;
    });

    let transportState: 'started' | 'stopped' = 'stopped';
    const start = vi.fn(async () => {
        transportState = 'started';
    });
    const stop = vi.fn(() => {
        transportState = 'stopped';
    });

    const nextSubdivision = vi.fn((subdivision: string) => {
        const subdivisions: Record<string, number> = {
            '4n': nowSeconds + 0.5,
        };
        return subdivisions[subdivision] ?? nowSeconds + 0.5;
    });

    const transportCore = {
        schedule: schedule as ReturnType<typeof vi.fn>,
        scheduleOnce: scheduleOnce as ReturnType<typeof vi.fn>,
        clear: clear as ReturnType<typeof vi.fn>,
        cancel: cancel as ReturnType<typeof vi.fn>,
        start: start as ReturnType<typeof vi.fn>,
        stop: stop as ReturnType<typeof vi.fn>,
        nextSubdivision: nextSubdivision as ReturnType<typeof vi.fn>,
    } as Record<string, ReturnType<typeof vi.fn>>;

    Object.defineProperty(transportCore, 'seconds', {
        get: () => nowSeconds,
    });
    Object.defineProperty(transportCore, 'state', {
        get: () => transportState,
    });

    const transport = transportCore as unknown as ToneMockContext['transport'];

    const audioContextStub = {
        state: 'running' as AudioContextState,
        currentTime: nowSeconds,
        resume: vi.fn(async () => {
            audioContextStub.state = 'running';
        }),
    };

    vi.doMock('tone', () => ({
        Transport: transport,
        now: () => nowSeconds,
        getContext: () => ({ rawContext: audioContextStub as unknown as AudioContext }),
        Destination: {
            volume: {
                value: 0,
            },
        },
    }));

    const advanceBy = (milliseconds: number): void => {
        nowSeconds += milliseconds / 1000;
        audioContextStub.currentTime = nowSeconds;

        for (const entry of [...scheduled]) {
            if (entry.at <= nowSeconds) {
                entry.callback(nowSeconds);
                const index = scheduled.findIndex((item) => item.id === entry.id);
                if (index !== -1) {
                    scheduled.splice(index, 1);
                }
            }
        }
    };

    const restore = () => {
        vi.resetModules();
        vi.doUnmock('tone');
    };

    return {
        transport,
        advanceBy,
        now: () => nowSeconds,
        restore,
    };
};
