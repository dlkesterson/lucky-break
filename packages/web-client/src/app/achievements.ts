import { rootLogger, type Logger } from 'util/log';

export type AchievementId = 'combo-king' | 'brick-marathon';

export interface AchievementUpgrades {
    readonly bonusLives: number;
    readonly comboDecayMultiplier: number;
}

export interface AchievementUnlock {
    readonly id: AchievementId;
    readonly title: string;
    readonly description: string;
    readonly upgrades: AchievementUpgrades;
    readonly unlockedAt: number;
}

export interface LifetimeStats {
    readonly totalBricksBroken: number;
    readonly highestCombo: number;
    readonly roundsCompleted: number;
    readonly lastUpdated: number;
}

type MutableLifetimeStats = { -readonly [Key in keyof LifetimeStats]: LifetimeStats[Key] };

interface AchievementRecord {
    readonly unlockedAt: number;
}

type AchievementRecordMap = Partial<Record<AchievementId, AchievementRecord>>;

interface PersistedAchievementState {
    readonly version: number;
    readonly stats: LifetimeStats;
    readonly unlocked: AchievementRecordMap;
}

const STORAGE_KEY = 'lucky-break.achievements';
const STATE_VERSION = 1;

const DEFAULT_STATE: PersistedAchievementState = {
    version: STATE_VERSION,
    stats: {
        totalBricksBroken: 0,
        highestCombo: 0,
        roundsCompleted: 0,
        lastUpdated: 0,
    },
    unlocked: {},
};

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

const sanitizeNumber = (value: unknown, fallback: number): number => {
    if (typeof value !== 'number') {
        return fallback;
    }
    if (!Number.isFinite(value)) {
        return fallback;
    }
    return value;
};

const sanitizeStats = (value: unknown): LifetimeStats => {
    if (!isRecord(value)) {
        return DEFAULT_STATE.stats;
    }
    const totalBricksBroken = sanitizeNumber(value.totalBricksBroken, 0);
    const highestCombo = sanitizeNumber(value.highestCombo, 0);
    const roundsCompleted = sanitizeNumber(value.roundsCompleted, 0);
    const lastUpdated = sanitizeNumber(value.lastUpdated, 0);
    return {
        totalBricksBroken: Math.max(0, Math.floor(totalBricksBroken)),
        highestCombo: Math.max(0, Math.floor(highestCombo)),
        roundsCompleted: Math.max(0, Math.floor(roundsCompleted)),
        lastUpdated: Math.max(0, Math.floor(lastUpdated)),
    };
};

const sanitizeUnlocked = (value: unknown): AchievementRecordMap => {
    if (!isRecord(value)) {
        return {};
    }
    const entries: AchievementRecordMap = {};
    for (const id of ACHIEVEMENT_IDS) {
        const raw = value[id];
        if (!isRecord(raw)) {
            continue;
        }
        const unlockedAt = sanitizeNumber(raw.unlockedAt, 0);
        if (unlockedAt > 0) {
            entries[id] = { unlockedAt };
        }
    }
    return entries;
};

const readState = (storage: Storage | null, logger: Logger): PersistedAchievementState => {
    if (!storage) {
        return DEFAULT_STATE;
    }
    try {
        const payload = storage.getItem(STORAGE_KEY);
        if (!payload) {
            return DEFAULT_STATE;
        }
        const parsed = JSON.parse(payload) as unknown;
        if (!isRecord(parsed)) {
            return DEFAULT_STATE;
        }
        const stats = sanitizeStats(parsed.stats);
        const unlocked = sanitizeUnlocked(parsed.unlocked);
        return {
            version: STATE_VERSION,
            stats,
            unlocked,
        };
    } catch (error) {
        logger.warn('Failed to read achievements state; using defaults', { error });
        return DEFAULT_STATE;
    }
};

const writeState = (storage: Storage | null, state: PersistedAchievementState, logger: Logger): void => {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        logger.warn('Failed to persist achievements state', { error });
    }
};

interface AchievementDefinition {
    readonly id: AchievementId;
    readonly title: string;
    readonly description: string;
    readonly upgrades: AchievementUpgrades;
    readonly condition: (stats: LifetimeStats) => boolean;
}

const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
    {
        id: 'combo-king',
        title: 'Combo King',
        description: 'Combo decay lasts 5% longer.',
        upgrades: { bonusLives: 0, comboDecayMultiplier: 1.05 },
        condition: (stats) => stats.highestCombo >= 50,
    },
    {
        id: 'brick-marathon',
        title: 'Brick Marathon',
        description: 'Start each run with +1 life.',
        upgrades: { bonusLives: 1, comboDecayMultiplier: 1 },
        condition: (stats) => stats.totalBricksBroken >= 1000,
    },
] as const;

const ACHIEVEMENT_IDS = ACHIEVEMENT_DEFINITIONS.map((definition) => definition.id);

const combineUpgrades = (records: AchievementRecordMap): AchievementUpgrades => {
    return ACHIEVEMENT_DEFINITIONS.reduce<AchievementUpgrades>((accumulator, definition) => {
        if (records[definition.id]) {
            return {
                bonusLives: accumulator.bonusLives + definition.upgrades.bonusLives,
                comboDecayMultiplier:
                    accumulator.comboDecayMultiplier * definition.upgrades.comboDecayMultiplier,
            };
        }
        return accumulator;
    }, { bonusLives: 0, comboDecayMultiplier: 1 });
};

export interface AchievementSnapshot {
    readonly stats: LifetimeStats;
    readonly unlocked: readonly AchievementUnlock[];
}

export interface AchievementManagerOptions {
    readonly storage?: Storage | null;
    readonly now?: () => number;
    readonly logger?: Logger;
}

export interface AchievementManager {
    readonly recordBrickBreak: (event: { readonly combo: number }) => readonly AchievementUnlock[];
    readonly recordRoundComplete: (event: { readonly bricksBroken: number }) => readonly AchievementUnlock[];
    readonly recordSessionSummary: (event: { readonly highestCombo: number }) => readonly AchievementUnlock[];
    readonly getUpgradeSnapshot: () => AchievementUpgrades;
    readonly getSnapshot: () => AchievementSnapshot;
}

const mapUnlocks = (records: AchievementRecordMap): readonly AchievementUnlock[] => {
    const unlocks: AchievementUnlock[] = [];
    for (const definition of ACHIEVEMENT_DEFINITIONS) {
        const record = records[definition.id];
        if (!record) {
            continue;
        }
        unlocks.push({
            id: definition.id,
            title: definition.title,
            description: definition.description,
            upgrades: definition.upgrades,
            unlockedAt: record.unlockedAt,
        });
    }
    return unlocks;
};

export const createAchievementManager = (options: AchievementManagerOptions = {}): AchievementManager => {
    const logger = options.logger ?? rootLogger.child('achievements');
    const now = options.now ?? Date.now;
    const storage = resolveStorage(options.storage);
    const state: PersistedAchievementState = readState(storage, logger);
    const stats: MutableLifetimeStats = { ...state.stats };
    const unlocked: AchievementRecordMap = { ...state.unlocked };

    let dirty = false;

    const markDirty = () => {
        dirty = true;
    };

    const persistIfNeeded = () => {
        if (!dirty) {
            return;
        }
        const snapshot: PersistedAchievementState = {
            version: STATE_VERSION,
            stats,
            unlocked,
        };
        writeState(storage, snapshot, logger);
        dirty = false;
    };

    const evaluateUnlocks = (): AchievementUnlock[] => {
        const timestamp = now();
        const newlyUnlocked: AchievementUnlock[] = [];
        for (const definition of ACHIEVEMENT_DEFINITIONS) {
            if (unlocked[definition.id]) {
                continue;
            }
            if (definition.condition(stats)) {
                unlocked[definition.id] = { unlockedAt: timestamp };
                newlyUnlocked.push({
                    id: definition.id,
                    title: definition.title,
                    description: definition.description,
                    upgrades: definition.upgrades,
                    unlockedAt: timestamp,
                });
                logger.info('Achievement unlocked', { id: definition.id });
            }
        }
        if (newlyUnlocked.length > 0) {
            markDirty();
        }
        return newlyUnlocked;
    };

    const applyBrickBreak = (combo: number): AchievementUnlock[] => {
        stats.totalBricksBroken += 1;
        if (combo > stats.highestCombo) {
            stats.highestCombo = combo;
        }
        stats.lastUpdated = now();
        markDirty();
        const unlocks = evaluateUnlocks();
        persistIfNeeded();
        return unlocks;
    };

    const applyRoundComplete = (): AchievementUnlock[] => {
        stats.roundsCompleted += 1;
        stats.lastUpdated = now();
        markDirty();
        const unlocks = evaluateUnlocks();
        persistIfNeeded();
        return unlocks;
    };

    const applySessionSummary = (highestCombo: number): AchievementUnlock[] => {
        if (highestCombo > stats.highestCombo) {
            stats.highestCombo = highestCombo;
        }
        stats.lastUpdated = now();
        markDirty();
        const unlocks = evaluateUnlocks();
        persistIfNeeded();
        return unlocks;
    };

    const recordBrickBreak: AchievementManager['recordBrickBreak'] = ({ combo }) => applyBrickBreak(combo);

    const recordRoundComplete: AchievementManager['recordRoundComplete'] = (event) => {
        void event.bricksBroken;
        return applyRoundComplete();
    };

    const recordSessionSummary: AchievementManager['recordSessionSummary'] = ({ highestCombo }) =>
        applySessionSummary(highestCombo);

    const getUpgradeSnapshot: AchievementManager['getUpgradeSnapshot'] = () => combineUpgrades(unlocked);

    const getSnapshot: AchievementManager['getSnapshot'] = () => ({
        stats: { ...stats },
        unlocked: mapUnlocks(unlocked),
    });

    return {
        recordBrickBreak,
        recordRoundComplete,
        recordSessionSummary,
        getUpgradeSnapshot,
        getSnapshot,
    };
};
