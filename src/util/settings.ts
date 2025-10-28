const STORAGE_KEY = 'lucky-break::settings::v1';
const STATE_VERSION = 1;

export interface SettingsSnapshot {
    readonly version: number;
    readonly performance: boolean;
}

export type SettingsListener = (settings: SettingsSnapshot) => void;

interface UpdatePayload {
    readonly performance?: boolean;
}

const DEFAULT_SETTINGS: SettingsSnapshot = {
    version: STATE_VERSION,
    performance: false,
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

const readSettings = (): SettingsSnapshot => {
    const storage = resolveStorage();
    if (!storage) {
        return { ...DEFAULT_SETTINGS };
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_SETTINGS };
        }
        const parsed = JSON.parse(raw) as Partial<SettingsSnapshot> | undefined;
        if (typeof parsed !== 'object' || parsed === null) {
            return { ...DEFAULT_SETTINGS };
        }
        const performance = typeof parsed.performance === 'boolean' ? parsed.performance : DEFAULT_SETTINGS.performance;
        return {
            version: STATE_VERSION,
            performance,
        } satisfies SettingsSnapshot;
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
};

const persistSettings = (settings: SettingsSnapshot): void => {
    const storage = resolveStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // ignore persistence failures in non-browser contexts
    }
};

let currentSettings = readSettings();
const listeners = new Set<SettingsListener>();

const emit = () => {
    const snapshot = { ...currentSettings } satisfies SettingsSnapshot;
    listeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error('Settings listener failed', error);
        }
    });
};

export const getSettings = (): SettingsSnapshot => ({ ...currentSettings });

export const updateSettings = (update: UpdatePayload): SettingsSnapshot => {
    const next: SettingsSnapshot = {
        version: STATE_VERSION,
        performance:
            typeof update.performance === 'boolean' ? update.performance : currentSettings.performance,
    } satisfies SettingsSnapshot;

    if (next.performance === currentSettings.performance) {
        return { ...currentSettings };
    }

    currentSettings = next;
    persistSettings(currentSettings);
    emit();
    return { ...currentSettings };
};

export const subscribeSettings = (listener: SettingsListener): (() => void) => {
    listeners.add(listener);
    try {
        listener({ ...currentSettings });
    } catch (error) {
        console.error('Settings listener failed during subscription', error);
    }
    return () => {
        listeners.delete(listener);
    };
};

export const resetSettingsForTests = (): void => {
    currentSettings = { ...DEFAULT_SETTINGS };
    const storage = resolveStorage();
    try {
        storage?.removeItem(STORAGE_KEY);
    } catch {
        // ignore remove errors in tests
    }
    emit();
};
