import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getSettings,
    resetSettingsForTests,
    subscribeSettings,
    updateSettings,
} from 'util/settings';

const createMockStorage = () => {
    let store: Record<string, string> = {};
    const mocks = {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    } satisfies Record<keyof Storage, unknown>;

    const storage: Storage = {
        get length() {
            return Object.keys(store).length;
        },
        ...mocks,
    } as Storage;

    return { storage, mocks };
};

describe('settings', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        (vi as unknown as { unstubAllGlobals?: () => void }).unstubAllGlobals?.();
        resetSettingsForTests();
    });

    afterEach(() => {
        resetSettingsForTests();
        (vi as unknown as { unstubAllGlobals?: () => void }).unstubAllGlobals?.();
    });

    it('returns default settings when storage is unavailable', () => {
        const snapshot = getSettings();
        expect(snapshot).toEqual({ version: 1, performance: false });
    });

    it('persists updates when storage is available', () => {
        const { storage, mocks } = createMockStorage();
        vi.stubGlobal('window', { localStorage: storage } as unknown as Window & typeof globalThis);

        const result = updateSettings({ performance: true });

        expect(result.performance).toBe(true);
        expect(mocks.setItem).toHaveBeenCalledTimes(1);
        const [, serialized] = mocks.setItem.mock.calls[0] ?? [];
        expect(JSON.parse(serialized)).toEqual({ version: 1, performance: true });
    });

    it('notifies subscribers immediately and on subsequent updates', () => {
        const { storage } = createMockStorage();
        vi.stubGlobal('window', { localStorage: storage } as unknown as Window & typeof globalThis);

        const updates: boolean[] = [];
        const unsubscribe = subscribeSettings((snapshot) => {
            updates.push(snapshot.performance);
        });

        updateSettings({ performance: true });
        updateSettings({ performance: false });

        unsubscribe();

        expect(updates).toEqual([false, true, false]);
    });

    it('resets storage and notifies listeners when resetSettingsForTests is called', () => {
        const { storage, mocks } = createMockStorage();
        vi.stubGlobal('window', { localStorage: storage } as unknown as Window & typeof globalThis);

        const notifications: boolean[] = [];
        const unsubscribe = subscribeSettings((snapshot) => {
            notifications.push(snapshot.performance);
        });

        updateSettings({ performance: true });
        expect(notifications.at(-1)).toBe(true);

        resetSettingsForTests();

        expect(mocks.removeItem).toHaveBeenCalledWith('lucky-break::settings::v1');
        expect(notifications.at(-1)).toBe(false);

        unsubscribe();
    });
});
