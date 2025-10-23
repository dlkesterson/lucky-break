import { setRewardOverride, type RewardType } from 'game/rewards';

export interface DeveloperCheatState {
    readonly enabled: boolean;
    readonly forcedReward: RewardType | null;
}

export type DeveloperCheatListener = (state: DeveloperCheatState) => void;

export interface DeveloperCheatController {
    getState(): DeveloperCheatState;
    isEnabled(): boolean;
    setEnabled(enabled: boolean): DeveloperCheatState;
    toggleEnabled(): DeveloperCheatState;
    setForcedReward(reward: RewardType | null): DeveloperCheatState;
    clearForcedReward(): DeveloperCheatState;
    cycleForcedReward(direction?: 1 | -1): DeveloperCheatState;
    subscribe(listener: DeveloperCheatListener): () => void;
    resetForTests(): void;
}

const STORAGE_KEY = 'lucky-break:developer-cheats';
const REWARD_ORDER: readonly RewardType[] = [
    'sticky-paddle',
    'double-points',
    'wide-paddle',
    'multi-ball',
    'slow-time',
    'ghost-brick',
];

type ImportMetaWithEnv = ImportMeta & { env?: { DEV?: boolean } };

const resolveDefaultEnabled = (): boolean => {
    try {
        return typeof import.meta !== 'undefined' && Boolean((import.meta as ImportMetaWithEnv).env?.DEV);
    } catch {
        return false;
    }
};

const DEFAULT_STATE: DeveloperCheatState = {
    enabled: resolveDefaultEnabled(),
    forcedReward: null,
};

const cloneState = (state: DeveloperCheatState): DeveloperCheatState => ({ ...state });

const getStorage = (): Storage | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

const loadState = (): DeveloperCheatState => {
    const storage = getStorage();
    if (!storage) {
        return cloneState(DEFAULT_STATE);
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            return cloneState(DEFAULT_STATE);
        }
        const parsed = JSON.parse(raw) as Partial<DeveloperCheatState> | undefined;
        const forcedReward = parsed?.forcedReward && REWARD_ORDER.includes(parsed.forcedReward)
            ? parsed.forcedReward
            : null;
        const enabled = typeof parsed?.enabled === 'boolean' ? parsed.enabled : DEFAULT_STATE.enabled;
        return { enabled, forcedReward } satisfies DeveloperCheatState;
    } catch {
        return cloneState(DEFAULT_STATE);
    }
};

let state: DeveloperCheatState = loadState();

const subscribers = new Set<DeveloperCheatListener>();

const persistState = (): void => {
    const storage = getStorage();
    if (!storage) {
        return;
    }
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore persistence failures in non-browser contexts
    }
};

const applyRewardOverride = (): void => {
    if (state.enabled && state.forcedReward) {
        setRewardOverride({ type: state.forcedReward, persist: true });
        return;
    }
    setRewardOverride(null);
};

const notifySubscribers = (): void => {
    const snapshot = cloneState(state);
    subscribers.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error('Developer cheat listener failed', error);
        }
    });
};

const updateState = (next: DeveloperCheatState): DeveloperCheatState => {
    state = cloneState(next);
    persistState();
    applyRewardOverride();
    notifySubscribers();
    return cloneState(state);
};

const normalizeReward = (reward: RewardType | null): RewardType | null => {
    if (!reward) {
        return null;
    }
    return REWARD_ORDER.includes(reward) ? reward : null;
};

const cycleReward = (direction: 1 | -1): RewardType => {
    const currentIndex = state.forcedReward ? REWARD_ORDER.indexOf(state.forcedReward) : -1;
    const step = direction >= 0 ? 1 : -1;
    const nextIndex = (currentIndex + step + REWARD_ORDER.length) % REWARD_ORDER.length;
    return REWARD_ORDER[nextIndex];
};

const controller: DeveloperCheatController = {
    getState: () => cloneState(state),
    isEnabled: () => state.enabled,
    setEnabled: (enabled) => updateState({ ...state, enabled }),
    toggleEnabled: () => controller.setEnabled(!state.enabled),
    setForcedReward: (reward) => {
        const normalized = normalizeReward(reward);
        return updateState({ ...state, forcedReward: normalized });
    },
    clearForcedReward: () => controller.setForcedReward(null),
    cycleForcedReward: (direction = 1) => {
        const nextReward = cycleReward(direction >= 0 ? 1 : -1);
        return controller.setForcedReward(nextReward);
    },
    subscribe: (listener) => {
        subscribers.add(listener);
        listener(cloneState(state));
        return () => {
            subscribers.delete(listener);
        };
    },
    resetForTests: () => {
        const storage = getStorage();
        try {
            storage?.removeItem(STORAGE_KEY);
        } catch {
            // ignore removal issues during tests
        }
        updateState(cloneState(DEFAULT_STATE));
    },
};

applyRewardOverride();

export const developerCheats = controller;
