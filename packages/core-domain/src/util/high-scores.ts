const STORAGE_KEY = 'lucky-break::high-scores::v1';
const MAX_ENTRIES = 10;
const DEFAULT_NAME = 'PLAYER';

type MaybeStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

export interface HighScoreEntry {
    readonly name: string;
    readonly score: number;
    readonly round: number;
    readonly achievedAt: number;
}

export interface RecordHighScoreOptions {
    readonly name?: string;
    readonly round?: number;
    readonly achievedAt?: number;
    readonly minScore?: number;
}

export interface RecordHighScoreResult {
    readonly accepted: boolean;
    readonly position: number | null;
    readonly entries: readonly HighScoreEntry[];
}

const inMemoryStore: HighScoreEntry[] = [];

const accessLocalStorage = (): MaybeStorage => {
    if (typeof window === 'undefined' || !window?.localStorage) {
        return null;
    }

    try {
        return window.localStorage;
    } catch (error) {
        console.warn('High score storage unavailable, falling back to memory', error);
        return null;
    }
};

const normalizeName = (name: string): string => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        return DEFAULT_NAME;
    }
    return trimmed.slice(0, 16);
};

const readScores = (): HighScoreEntry[] => {
    const storage = accessLocalStorage();

    if (storage) {
        const serialized = storage.getItem(STORAGE_KEY);
        if (serialized) {
            try {
                const parsed = JSON.parse(serialized) as HighScoreEntry[];
                if (Array.isArray(parsed)) {
                    inMemoryStore.length = 0;
                    parsed.forEach((entry) => {
                        if (typeof entry?.score === 'number' && Number.isFinite(entry.score)) {
                            inMemoryStore.push({
                                name: typeof entry.name === 'string' ? entry.name : DEFAULT_NAME,
                                score: entry.score,
                                round: Number.isFinite(entry.round) ? entry.round : 1,
                                achievedAt: Number.isFinite(entry.achievedAt) ? entry.achievedAt : Date.now(),
                            });
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to parse high score storage, clearing', error);
                storage.setItem(STORAGE_KEY, JSON.stringify([]));
                inMemoryStore.length = 0;
            }
        }
    }

    return inMemoryStore.map((entry) => ({ ...entry }));
};

const persistScores = (entries: readonly HighScoreEntry[]): void => {
    inMemoryStore.length = 0;
    entries.forEach((entry) => {
        inMemoryStore.push({ ...entry });
    });

    const storage = accessLocalStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(inMemoryStore));
    } catch (error) {
        console.warn('Failed to persist high scores, retaining in memory only', error);
    }
};

const sortScores = (entries: HighScoreEntry[]): HighScoreEntry[] => {
    return entries.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return a.achievedAt - b.achievedAt;
    });
};

export const getHighScores = (): readonly HighScoreEntry[] => {
    return sortScores(readScores()).map((entry) => ({ ...entry }));
};

export const recordHighScore = (
    score: number,
    options: RecordHighScoreOptions = {},
): RecordHighScoreResult => {
    if (!Number.isFinite(score) || score < 0) {
        return { accepted: false, position: null, entries: getHighScores() };
    }

    const minScore = options.minScore ?? 0;
    if (score < minScore) {
        return { accepted: false, position: null, entries: getHighScores() };
    }

    const name = normalizeName(options.name ?? DEFAULT_NAME);
    const roundOption = options.round;
    const round = typeof roundOption === 'number' && Number.isFinite(roundOption)
        ? Math.max(1, Math.floor(roundOption))
        : 1;
    const achievedAtOption = options.achievedAt;
    const achievedAt = typeof achievedAtOption === 'number' && Number.isFinite(achievedAtOption)
        ? Math.floor(achievedAtOption)
        : Date.now();

    const existing = readScores();
    const insertion = { name, score: Math.floor(score), round, achievedAt } satisfies HighScoreEntry;

    const next = sortScores([...existing, insertion]).slice(0, MAX_ENTRIES);
    const position = next.findIndex((entry) => entry === insertion);

    if (position === -1) {
        return { accepted: false, position: null, entries: next };
    }

    persistScores(next);
    return { accepted: true, position, entries: next };
};

export const clearHighScores = (): void => {
    inMemoryStore.length = 0;
    const storage = accessLocalStorage();
    if (storage) {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify([]));
        } catch (error) {
            console.warn('Failed to clear high scores storage', error);
        }
    }
};
