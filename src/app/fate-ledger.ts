import { rootLogger, type Logger } from 'util/log';

const STORAGE_KEY = 'lucky-break::fate-ledger::v1';
const STATE_VERSION = 1;
const DEFAULT_MAX_ENTRIES = 250;

export type FateLedgerEntryKind = 'idle-roll';

export interface FateLedgerEntryBase<Kind extends FateLedgerEntryKind> {
    readonly id: string;
    readonly kind: Kind;
    readonly timestamp: number;
    readonly notes: string | null;
}

export interface FateLedgerIdleRollEntry extends FateLedgerEntryBase<'idle-roll'> {
    readonly durationMs: number;
    readonly entropyEarned: number;
    readonly certaintyDustEarned: number;
}

export type FateLedgerEntry = FateLedgerIdleRollEntry;

export interface FateLedgerSnapshot {
    readonly version: number;
    readonly entries: readonly FateLedgerEntry[];
    readonly totalIdleRolls: number;
    readonly totals: {
        readonly durationMs: number;
        readonly entropyEarned: number;
        readonly certaintyDustEarned: number;
    };
    readonly latestEntryTimestamp: number | null;
}

export interface FateLedgerIdleRollInput {
    readonly durationMs: number;
    readonly entropyEarned: number;
    readonly certaintyDustEarned?: number;
    readonly notes?: string | null;
    readonly recordedAt?: number;
}

export type FateLedgerListener = (snapshot: FateLedgerSnapshot) => void;

export interface FateLedgerOptions {
    readonly storage?: Storage | null;
    readonly now?: () => number;
    readonly maxEntries?: number;
    readonly logger?: Logger;
}

export interface FateLedger {
    readonly recordIdleRoll: (entry: FateLedgerIdleRollInput) => FateLedgerIdleRollEntry;
    readonly getSnapshot: () => FateLedgerSnapshot;
    readonly clear: () => void;
    readonly subscribe: (listener: FateLedgerListener) => () => void;
}

interface PersistedFateLedgerState {
    readonly version: unknown;
    readonly entries: unknown;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

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

const sanitizeNumber = (value: unknown, fallback: number, options?: { readonly min?: number }): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }

    const minimum = options?.min ?? undefined;
    const normalized = minimum === undefined ? value : Math.max(minimum, value);
    if (!Number.isFinite(normalized)) {
        return fallback;
    }
    return normalized;
};

const sanitizeInteger = (value: unknown, fallback: number, options?: { readonly min?: number }): number => {
    const numberValue = sanitizeNumber(value, fallback, options);
    if (!Number.isInteger(numberValue)) {
        return Math.round(numberValue);
    }
    return numberValue;
};

const sanitizeNotes = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return null;
    }
    return trimmed.slice(0, 280);
};

const sanitizeIdleRollEntry = (value: unknown): FateLedgerIdleRollEntry | null => {
    if (!isRecord(value)) {
        return null;
    }

    const kind = value.kind;
    if (kind !== 'idle-roll') {
        return null;
    }

    const idRaw = value.id;
    if (typeof idRaw !== 'string' || idRaw.length === 0) {
        return null;
    }

    const timestamp = sanitizeInteger(value.timestamp, 0, { min: 0 });
    if (timestamp <= 0) {
        return null;
    }

    const durationMs = sanitizeInteger(value.durationMs, 0, { min: 0 });
    const entropyEarned = sanitizeNumber(value.entropyEarned, 0);
    const certaintyDustEarned = sanitizeNumber(value.certaintyDustEarned, 0, { min: 0 });
    const notes = sanitizeNotes(value.notes);

    return {
        id: idRaw,
        kind: 'idle-roll',
        timestamp,
        durationMs,
        entropyEarned,
        certaintyDustEarned,
        notes,
    } satisfies FateLedgerIdleRollEntry;
};

const sanitizeEntries = (value: unknown): FateLedgerEntry[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const entries: FateLedgerEntry[] = [];
    for (const candidate of value) {
        const entry = sanitizeIdleRollEntry(candidate);
        if (!entry) {
            continue;
        }
        entries.push(entry);
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries;
};

const readState = (storage: Storage | null, logger: Logger): PersistedFateLedgerState => {
    if (!storage) {
        return { version: STATE_VERSION, entries: [] } satisfies PersistedFateLedgerState;
    }

    try {
        const payload = storage.getItem(STORAGE_KEY);
        if (!payload) {
            return { version: STATE_VERSION, entries: [] } satisfies PersistedFateLedgerState;
        }
        const parsed = JSON.parse(payload) as PersistedFateLedgerState;
        if (!isRecord(parsed)) {
            return { version: STATE_VERSION, entries: [] } satisfies PersistedFateLedgerState;
        }
        const version = sanitizeInteger(parsed.version, STATE_VERSION, { min: 1 });
        const entries = sanitizeEntries((parsed as PersistedFateLedgerState).entries);
        return {
            version,
            entries,
        } satisfies PersistedFateLedgerState;
    } catch (error) {
        logger.warn('Failed to read fate ledger; using defaults', { error });
        return { version: STATE_VERSION, entries: [] } satisfies PersistedFateLedgerState;
    }
};

const writeState = (storage: Storage | null, state: PersistedFateLedgerState, logger: Logger): void => {
    if (!storage) {
        return;
    }

    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: STATE_VERSION,
                entries: state.entries,
            }),
        );
    } catch (error) {
        logger.warn('Failed to persist fate ledger', { error });
    }
};

const cloneEntry = (entry: FateLedgerEntry): FateLedgerEntry => ({ ...entry });

const cloneEntries = (entries: readonly FateLedgerEntry[]): FateLedgerEntry[] => entries.map((entry) => cloneEntry(entry));

const buildSnapshot = (
    entries: readonly FateLedgerEntry[],
): FateLedgerSnapshot => {
    let totalDuration = 0;
    let totalEntropy = 0;
    let totalDust = 0;
    let latestTimestamp: number | null = null;

    for (const entry of entries) {
        if (entry.kind === 'idle-roll') {
            totalDuration += entry.durationMs;
            totalEntropy += entry.entropyEarned;
            totalDust += entry.certaintyDustEarned;
        }
        if (latestTimestamp === null || entry.timestamp > latestTimestamp) {
            latestTimestamp = entry.timestamp;
        }
    }

    return {
        version: STATE_VERSION,
        entries: cloneEntries(entries),
        totalIdleRolls: entries.length,
        totals: {
            durationMs: totalDuration,
            entropyEarned: totalEntropy,
            certaintyDustEarned: totalDust,
        },
        latestEntryTimestamp: latestTimestamp,
    } satisfies FateLedgerSnapshot;
};

const generateEntryId = (() => {
    let counter = 0;
    return (timestamp: number): string => {
        counter = (counter + 1) & 0xffff;
        const suffix = counter.toString(36).padStart(2, '0');
        return `ledger-${timestamp.toString(36)}-${suffix}`;
    };
})();

export const createFateLedger = (options: FateLedgerOptions = {}): FateLedger => {
    const logger = options.logger ?? rootLogger.child('fate-ledger');
    const now = options.now ?? Date.now;
    const storage = resolveStorage(options.storage);
    const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));

    const state = readState(storage, logger);
    const entries: Mutable<FateLedgerEntry[]> = [...sanitizeEntries(state.entries)];

    const listeners = new Set<FateLedgerListener>();

    const emit = () => {
        const snapshot = buildSnapshot(entries);
        for (const listener of listeners) {
            try {
                listener(snapshot);
            } catch (error) {
                logger.warn('Fate ledger listener failed', { error });
            }
        }
    };

    const persist = () => {
        writeState(
            storage,
            {
                version: STATE_VERSION,
                entries,
            },
            logger,
        );
    };

    const recordIdleRoll: FateLedger['recordIdleRoll'] = (payload) => {
        const recordedAt = payload.recordedAt;
        const timestamp = typeof recordedAt === 'number' && Number.isFinite(recordedAt) && recordedAt > 0
            ? Math.round(recordedAt)
            : now();
        const entry: FateLedgerIdleRollEntry = {
            id: generateEntryId(timestamp),
            kind: 'idle-roll',
            timestamp,
            durationMs: sanitizeInteger(payload.durationMs, 0, { min: 0 }),
            entropyEarned: sanitizeNumber(payload.entropyEarned, 0),
            certaintyDustEarned: sanitizeNumber(payload.certaintyDustEarned, 0, { min: 0 }),
            notes: sanitizeNotes(payload.notes ?? null),
        } satisfies FateLedgerIdleRollEntry;

        entries.unshift(entry);
        if (entries.length > maxEntries) {
            entries.length = maxEntries;
        }

        persist();
        const snapshotEntry = cloneEntry(entry);
        emit();
        return snapshotEntry;
    };

    const getSnapshot: FateLedger['getSnapshot'] = () => buildSnapshot(entries);

    const clear: FateLedger['clear'] = () => {
        if (entries.length === 0) {
            return;
        }
        entries.length = 0;
        persist();
        emit();
    };

    const subscribe: FateLedger['subscribe'] = (listener) => {
        listeners.add(listener);
        try {
            listener(buildSnapshot(entries));
        } catch (error) {
            logger.warn('Fate ledger listener failed during subscription', { error });
        }
        return () => {
            listeners.delete(listener);
        };
    };

    return {
        recordIdleRoll,
        getSnapshot,
        clear,
        subscribe,
    } satisfies FateLedger;
};

export const resetFateLedgerStorageForTests = (storage?: Storage | null): void => {
    const target = resolveStorage(storage);
    try {
        target?.removeItem(STORAGE_KEY);
    } catch {
        /* ignore reset errors in tests */
    }
};
