const STORAGE_KEY = 'lucky-break::audio-preferences::v1';
const STATE_VERSION = 1;

export interface AudioPreferences {
    readonly version: number;
    readonly masterVolume: number;
    readonly muted: boolean;
}

const DEFAULT_PREFERENCES: AudioPreferences = {
    version: STATE_VERSION,
    masterVolume: 1,
    muted: false,
};

const resolveStorage = (): Storage | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

const readPreferences = (): AudioPreferences => {
    const storage = resolveStorage();
    if (!storage) {
        return { ...DEFAULT_PREFERENCES };
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_PREFERENCES };
        }
        const parsed = JSON.parse(raw) as Partial<AudioPreferences> | undefined;
        if (typeof parsed !== 'object' || parsed === null) {
            return { ...DEFAULT_PREFERENCES };
        }

        const masterVolume = typeof parsed.masterVolume === 'number' && Number.isFinite(parsed.masterVolume)
            ? Math.max(0, Math.min(1, parsed.masterVolume))
            : DEFAULT_PREFERENCES.masterVolume;
        const muted = typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_PREFERENCES.muted;

        return {
            version: STATE_VERSION,
            masterVolume,
            muted,
        } satisfies AudioPreferences;
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
};

export const persistAudioPreferences = (preferences: Pick<AudioPreferences, 'masterVolume' | 'muted'>): void => {
    const storage = resolveStorage();
    if (!storage) {
        return;
    }

    try {
        const toStore: AudioPreferences = {
            version: STATE_VERSION,
            masterVolume: preferences.masterVolume,
            muted: preferences.muted,
        };
        storage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
        // ignore persistence failures in non-browser contexts
    }
};

export const getAudioPreferences = (): AudioPreferences => readPreferences();

export const resetAudioPreferencesForTests = (): void => {
    const storage = resolveStorage();
    try {
        storage?.removeItem(STORAGE_KEY);
    } catch {
        // ignore remove errors in tests
    }
};
