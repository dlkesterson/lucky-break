import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { developerCheats } from 'app/developer-cheats';
import { getRewardOverride } from 'game/rewards';

const resetCheats = () => {
    developerCheats.resetForTests();
};

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
    };

    const storage: Storage = {
        get length() {
            return Object.keys(store).length;
        },
        ...mocks,
    } as Storage;

    return { storage, mocks };
};

describe('developerCheats', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        (vi as unknown as { unstubAllGlobals?: () => void }).unstubAllGlobals?.();
    });

    afterEach(() => {
        resetCheats();
        (vi as unknown as { unstubAllGlobals?: () => void }).unstubAllGlobals?.();
    });

    it('toggles enabled state', () => {
        resetCheats();
        developerCheats.setEnabled(false);
        expect(developerCheats.isEnabled()).toBe(false);
        const next = developerCheats.toggleEnabled();
        expect(next.enabled).toBe(true);
        const final = developerCheats.toggleEnabled();
        expect(final.enabled).toBe(false);
    });

    it('applies reward override when enabled', () => {
        resetCheats();
        developerCheats.setEnabled(true);
        developerCheats.setForcedReward('multi-ball');
        expect(getRewardOverride()?.type).toBe('multi-ball');
        developerCheats.setEnabled(false);
        expect(getRewardOverride()).toBeNull();
    });

    it('cycles rewards forward and backward', () => {
        resetCheats();
        developerCheats.setEnabled(true);
        const forward = developerCheats.cycleForcedReward(1);
        expect(forward.forcedReward).toBeTruthy();
        const backward = developerCheats.cycleForcedReward(-1);
        expect(backward.forcedReward).toBeTruthy();
        expect(developerCheats.getState().forcedReward).toBe(backward.forcedReward);
    });

    it('normalizes invalid forced rewards to null', () => {
        resetCheats();
        developerCheats.setEnabled(true);

        const result = developerCheats.setForcedReward('not-real' as any);

        expect(result.forcedReward).toBeNull();
        expect(getRewardOverride()).toBeNull();
    });

    it('persists state changes when storage is available', () => {
        const { storage, mocks } = createMockStorage();

        vi.stubGlobal('window', { localStorage: storage } as unknown as Window & typeof globalThis);

        resetCheats();
        developerCheats.setEnabled(true);
        developerCheats.setForcedReward('multi-ball');

        expect(mocks.setItem).toHaveBeenCalled();
        const [, serialized] = mocks.setItem.mock.calls.at(-1)!;
        expect(JSON.parse(serialized)).toEqual({ enabled: true, forcedReward: 'multi-ball' });
    });

    it('clears reward override and storage when resetForTests is invoked', () => {
        const { storage, mocks } = createMockStorage();

        vi.stubGlobal('window', { localStorage: storage } as unknown as Window & typeof globalThis);

        resetCheats();
        developerCheats.setEnabled(true);
        developerCheats.setForcedReward('slow-time');
        expect(getRewardOverride()?.type).toBe('slow-time');

        developerCheats.resetForTests();

        expect(mocks.removeItem).toHaveBeenCalled();
        expect(developerCheats.getState()).toMatchObject({ enabled: expect.any(Boolean), forcedReward: null });
        expect(getRewardOverride()).toBeNull();
    });

    it('cycles rewards through the entire list when no direction provided', () => {
        resetCheats();
        developerCheats.setEnabled(true);

        const seen = new Set<string | null>();
        for (let index = 0; index < 10; index += 1) {
            const result = developerCheats.cycleForcedReward();
            seen.add(result.forcedReward);
        }

        expect(seen.has(null)).toBe(false);
        expect(seen.size).toBeGreaterThanOrEqual(6);
    });

    it('logs listener failures but continues notifying other subscribers', () => {
        resetCheats();
        const error = new Error('listener failed');
        let shouldThrow = false;
        const failListener = vi.fn(() => {
            if (shouldThrow) {
                throw error;
            }
        });
        const okListener = vi.fn();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const unsubscribeFail = developerCheats.subscribe(failListener);
        developerCheats.subscribe(okListener);

        shouldThrow = true;
        developerCheats.setEnabled(true);

        expect(okListener).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Developer cheat listener failed', error);

        unsubscribeFail();
        consoleSpy.mockRestore();
    });
});
