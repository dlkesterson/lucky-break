import type { Vector2 } from 'input/contracts';

export type ReplayEvent = ReplayPaddleTargetEvent | ReplayLaunchEvent | ReplaySeedChangeEvent;

export interface ReplayPaddleTargetEvent {
    readonly type: 'paddle-target';
    readonly time: number;
    readonly position: Vector2 | null;
}

export interface ReplayLaunchEvent {
    readonly type: 'launch';
    readonly time: number;
}

export interface ReplaySeedChangeEvent {
    readonly type: 'seed-change';
    readonly time: number;
    readonly seed: number;
}

export interface ReplayRecording {
    readonly version: 1;
    readonly seed: number | null;
    readonly durationSeconds: number;
    readonly events: readonly ReplayEvent[];
}

export interface ReplayBuffer {
    begin(seed: number | null): void;
    recordSeed(seed: number, timeSeconds?: number): void;
    recordPaddleTarget(timeSeconds: number, position: Vector2 | null): void;
    recordLaunch(timeSeconds: number): void;
    markTime(timeSeconds: number): void;
    snapshot(): ReplayRecording;
    toJSON(): ReplayRecording;
}

const VERSION = 1;
const TIME_PRECISION = 1e6;
const POSITION_EPSILON = 0.5;

const normalizeTime = (timeSeconds: number): number => {
    if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
        return 0;
    }
    return Math.round(timeSeconds * TIME_PRECISION) / TIME_PRECISION;
};

const cloneVector = (value: Vector2): Vector2 => ({ x: value.x, y: value.y });

const cloneEvent = (event: ReplayEvent): ReplayEvent => {
    if (event.type === 'paddle-target') {
        return {
            type: 'paddle-target',
            time: event.time,
            position: event.position ? cloneVector(event.position) : null,
        };
    }

    if (event.type === 'seed-change') {
        return {
            type: 'seed-change',
            time: event.time,
            seed: event.seed,
        };
    }

    return {
        type: 'launch',
        time: event.time,
    };
};

const cloneRecording = (recording: ReplayRecording): ReplayRecording => ({
    version: recording.version,
    seed: recording.seed,
    durationSeconds: recording.durationSeconds,
    events: recording.events.map(cloneEvent),
});

const vectorsEqual = (a: Vector2 | null, b: Vector2 | null): boolean => {
    if (a === b) {
        return true;
    }

    if (!a || !b) {
        return false;
    }

    return Math.abs(a.x - b.x) <= POSITION_EPSILON && Math.abs(a.y - b.y) <= POSITION_EPSILON;
};

export const createReplayBuffer = (): ReplayBuffer => {
    let recording: ReplayRecording = {
        version: VERSION,
        seed: null,
        durationSeconds: 0,
        events: [],
    };

    let currentSeed: number | null = null;
    let lastPaddleTarget: Vector2 | null = null;

    const updateDuration = (timeSeconds: number) => {
        const normalized = normalizeTime(timeSeconds);
        if (normalized > recording.durationSeconds) {
            recording = {
                ...recording,
                durationSeconds: normalized,
            };
        }
    };

    const begin = (seed: number | null) => {
        currentSeed = typeof seed === 'number' ? seed : null;
        recording = {
            version: VERSION,
            seed: currentSeed,
            durationSeconds: 0,
            events: [],
        };
        lastPaddleTarget = null;
    };

    const recordSeed = (seed: number, timeSeconds = 0) => {
        const normalizedTime = normalizeTime(timeSeconds);
        if (currentSeed === null) {
            currentSeed = seed;
            recording = {
                ...recording,
                seed,
            };
            updateDuration(normalizedTime);
            return;
        }

        if (currentSeed === seed) {
            updateDuration(normalizedTime);
            return;
        }

        currentSeed = seed;
        recording = {
            ...recording,
            events: [
                ...recording.events,
                {
                    type: 'seed-change',
                    time: normalizedTime,
                    seed,
                } satisfies ReplaySeedChangeEvent,
            ],
        };
        updateDuration(normalizedTime);
    };

    const recordPaddleTarget = (timeSeconds: number, position: Vector2 | null) => {
        const normalizedTime = normalizeTime(timeSeconds);
        if (vectorsEqual(lastPaddleTarget, position)) {
            updateDuration(normalizedTime);
            return;
        }

        const nextPosition = position ? cloneVector(position) : null;
        recording = {
            ...recording,
            events: [
                ...recording.events,
                {
                    type: 'paddle-target',
                    time: normalizedTime,
                    position: nextPosition,
                } satisfies ReplayPaddleTargetEvent,
            ],
        };
        lastPaddleTarget = nextPosition ? cloneVector(nextPosition) : null;
        updateDuration(normalizedTime);
    };

    const recordLaunch = (timeSeconds: number) => {
        const normalizedTime = normalizeTime(timeSeconds);
        const lastEvent = recording.events.at(-1);
        if (lastEvent?.type === 'launch' && Math.abs(lastEvent.time - normalizedTime) <= 1 / TIME_PRECISION) {
            updateDuration(normalizedTime);
            return;
        }

        recording = {
            ...recording,
            events: [
                ...recording.events,
                {
                    type: 'launch',
                    time: normalizedTime,
                } satisfies ReplayLaunchEvent,
            ],
        };
        updateDuration(normalizedTime);
    };

    const markTime = (timeSeconds: number) => {
        updateDuration(timeSeconds);
    };

    const snapshot = (): ReplayRecording => cloneRecording(recording);

    begin(null);

    return {
        begin,
        recordSeed,
        recordPaddleTarget,
        recordLaunch,
        markTime,
        snapshot,
        toJSON: snapshot,
    };
};
