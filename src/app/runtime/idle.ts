import { rootLogger, type Logger } from 'util/log';
import type { GameSessionManager } from '../state';
import type { FateLedger } from '../fate-ledger';
import type { RuntimeLifecycle } from './lifecycle';
import type { RandomManager } from 'util/random';
import {
    runHeadlessEngine,
    type HeadlessSimulationOptions,
    type HeadlessSimulationResult,
} from 'cli/headless-engine';

const STORAGE_KEY = 'lucky-break::idle-snapshot::v1';
const STATE_VERSION = 1;
const MIN_IDLE_DURATION_MS = 60_000;
const MAX_IDLE_DURATION_MS = 1_800_000;
const ENTROPY_AWARD_CAP = 90;
const ENTROPY_PER_BRICK = 0.72;
const ENTROPY_PER_MINUTE = 5;
const DUST_RATIO = 0.08;

interface PersistedIdleStateRaw {
    readonly version: unknown;
    readonly recordedAt: unknown;
    readonly seed: unknown;
    readonly round: unknown;
}

interface PersistedIdleState {
    readonly version: number;
    readonly recordedAt: number;
    readonly seed: number;
    readonly round: number;
}

const resolveStorage = (explicit?: Storage | null): Storage | null => {
    if (explicit !== undefined) {
        return explicit;
    }
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch (error) {
        void error;
    }
    return null;
};

const sanitizeNumber = (value: unknown, fallback: number, options: { readonly min?: number; readonly max?: number } = {}): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    const minimum = options.min;
    const maximum = options.max;
    let result = value;
    if (typeof minimum === 'number') {
        result = Math.max(minimum, result);
    }
    if (typeof maximum === 'number') {
        result = Math.min(maximum, result);
    }
    if (!Number.isFinite(result)) {
        return fallback;
    }
    return result;
};

const sanitizeInteger = (value: unknown, fallback: number, options: { readonly min?: number; readonly max?: number } = {}): number => {
    const numberValue = sanitizeNumber(value, fallback, options);
    const integerValue = Math.trunc(numberValue);
    if (!Number.isFinite(integerValue)) {
        return fallback;
    }
    return integerValue;
};

const readPersistedState = (storage: Storage | null, logger: Logger): PersistedIdleState | null => {
    if (!storage) {
        return null;
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as PersistedIdleStateRaw;
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }
        const version = sanitizeInteger(parsed.version, STATE_VERSION, { min: 1 });
        const recordedAt = sanitizeInteger(parsed.recordedAt, 0, { min: 0 });
        const seed = sanitizeInteger(parsed.seed, 1, { min: 1 });
        const round = sanitizeInteger(parsed.round, 1, { min: 1 });
        return {
            version,
            recordedAt,
            seed,
            round,
        } satisfies PersistedIdleState;
    } catch (error) {
        logger.warn('Failed to parse idle snapshot; discarding', { error });
        return null;
    }
};

const writePersistedState = (storage: Storage | null, state: PersistedIdleState, logger: Logger): void => {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: STATE_VERSION,
                recordedAt: state.recordedAt,
                seed: state.seed,
                round: state.round,
            }),
        );
    } catch (error) {
        logger.warn('Failed to persist idle snapshot', { error });
    }
};

const clearPersistedState = (storage: Storage | null): void => {
    if (!storage) {
        return;
    }
    try {
        storage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
};

const computeEntropyAward = (bricks: number, durationMs: number): number => {
    const brickBonus = Math.max(0, bricks) * ENTROPY_PER_BRICK;
    const minuteBonus = Math.max(0, durationMs) / 60_000 * ENTROPY_PER_MINUTE;
    const total = Math.round(brickBonus + minuteBonus);
    return Math.max(0, Math.min(ENTROPY_AWARD_CAP, total));
};

const computeDustAward = (entropyAwarded: number): number => {
    if (!Number.isFinite(entropyAwarded) || entropyAwarded <= 0) {
        return 0;
    }
    const dust = entropyAwarded * DUST_RATIO;
    return Math.max(0, Number(dust.toFixed(2)));
};

const buildNotes = (
    round: number,
    metrics: HeadlessSimulationResult['metrics'],
    volley: HeadlessSimulationResult['volley'],
): string => {
    const bricks = Math.max(0, Math.trunc(metrics.bricksBroken));
    const longestVolley = Math.max(0, Math.trunc(volley.longestVolley));
    return `Round ${round} auto-played ${bricks} bricks, longest volley ${longestVolley}`;
};

export interface IdleSimulationOptions {
    readonly session: GameSessionManager;
    readonly random: RandomManager;
    readonly fateLedger: FateLedger;
    readonly lifecycle: RuntimeLifecycle;
    readonly now?: () => number;
    readonly storage?: Storage | null;
    readonly logger?: Logger;
    readonly runSimulation?: (options: HeadlessSimulationOptions) => HeadlessSimulationResult;
}

export interface IdleSimulationResultSummary {
    readonly durationMs: number;
    readonly entropyAwarded: number;
    readonly certaintyDustAwarded: number;
    readonly bricksSimulated: number;
    readonly round: number;
}

export interface IdleSimulationHandle {
    readonly resumeIfNeeded: () => IdleSimulationResultSummary | null;
    readonly persistSnapshot: () => void;
}

export const createIdleSimulation = ({
    session,
    random,
    fateLedger,
    lifecycle,
    now,
    storage: explicitStorage,
    logger: explicitLogger,
    runSimulation,
}: IdleSimulationOptions): IdleSimulationHandle => {
    const storage = resolveStorage(explicitStorage);
    const logger = explicitLogger ?? rootLogger.child('idle-simulation');
    const runner = runSimulation ?? runHeadlessEngine;
    const clock = now ?? Date.now;

    const persistSnapshot = () => {
        if (!storage) {
            return;
        }
        const snapshot = session.snapshot();
        writePersistedState(
            storage,
            {
                version: STATE_VERSION,
                recordedAt: clock(),
                seed: random.seed(),
                round: Math.max(1, snapshot.round),
            },
            logger,
        );
    };

    lifecycle.register(() => {
        persistSnapshot();
    });

    const resumeIfNeeded = (): IdleSimulationResultSummary | null => {
        const persisted = readPersistedState(storage, logger);
        if (!persisted) {
            return null;
        }

        clearPersistedState(storage);

        const nowMs = clock();
        const idleDuration = Math.max(0, nowMs - persisted.recordedAt);
        if (idleDuration < MIN_IDLE_DURATION_MS) {
            persistSnapshot();
            return null;
        }

        const durationMs = Math.min(MAX_IDLE_DURATION_MS, idleDuration);

        let simulation: HeadlessSimulationResult;
        try {
            simulation = runner({
                seed: persisted.seed,
                round: persisted.round,
                durationMs,
            });
        } catch (error) {
            logger.warn('Idle simulation failed; skipping rewards', { error });
            persistSnapshot();
            return null;
        }

        const bricksBroken = Math.max(0, simulation.metrics.bricksBroken);
        const entropyAwarded = computeEntropyAward(bricksBroken, durationMs);
        const certaintyDustAwarded = computeDustAward(entropyAwarded);

        if (entropyAwarded > 0) {
            session.grantStoredEntropy(entropyAwarded);
        }

        fateLedger.recordIdleRoll({
            durationMs,
            entropyEarned: entropyAwarded,
            certaintyDustEarned: certaintyDustAwarded,
            notes: buildNotes(persisted.round, simulation.metrics, simulation.volley),
            recordedAt: nowMs,
        });

        logger.info('Granted idle rewards', {
            durationMs,
            entropyAwarded,
            certaintyDustAwarded,
            bricksBroken,
            round: persisted.round,
        });

        persistSnapshot();

        return {
            durationMs,
            entropyAwarded,
            certaintyDustAwarded,
            bricksSimulated: bricksBroken,
            round: persisted.round,
        } satisfies IdleSimulationResultSummary;
    };

    return {
        resumeIfNeeded,
        persistSnapshot,
    } satisfies IdleSimulationHandle;
};
