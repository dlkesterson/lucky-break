import { beforeEach, describe, expect, it } from 'vitest';
import { createAchievementManager, type AchievementUnlock } from 'app/achievements';

class MemoryStorage implements Storage {
    private readonly map = new Map<string, string>();

    get length(): number {
        return this.map.size;
    }

    clear(): void {
        this.map.clear();
    }

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    key(index: number): string | null {
        const keys = Array.from(this.map.keys());
        return keys[index] ?? null;
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
}

describe('createAchievementManager', () => {
    let storage: MemoryStorage;
    let now: number;

    const nextNow = () => {
        now += 1;
        return now;
    };

    beforeEach(() => {
        storage = new MemoryStorage();
        now = 0;
    });

    it('unlocks Combo King once combo threshold is reached', () => {
        const manager = createAchievementManager({ storage, now: nextNow });
        let unlocks: readonly AchievementUnlock[] = [];

        for (let combo = 1; combo < 50; combo += 1) {
            unlocks = manager.recordBrickBreak({ combo });
            expect(unlocks).toHaveLength(0);
        }

        unlocks = manager.recordBrickBreak({ combo: 50 });
        expect(unlocks).toHaveLength(1);
        expect(unlocks[0]?.id).toBe('combo-king');
        const upgrades = manager.getUpgradeSnapshot();
        expect(upgrades.comboDecayMultiplier).toBeCloseTo(1.05, 5);
    });

    it('persists unlocked achievements to storage', () => {
        const manager = createAchievementManager({ storage, now: nextNow });

        for (let index = 0; index < 1000; index += 1) {
            manager.recordBrickBreak({ combo: 1 });
        }

        const firstSnapshot = manager.getSnapshot();
        expect(firstSnapshot.unlocked.some((entry) => entry.id === 'brick-marathon')).toBe(true);
        expect(storage.getItem('lucky-break.achievements')).not.toBeNull();

        const reloaded = createAchievementManager({ storage, now: nextNow });
        const upgrades = reloaded.getUpgradeSnapshot();
        expect(upgrades.bonusLives).toBeGreaterThanOrEqual(1);
    });

    it('records session summary combos for unlock checks', () => {
        const manager = createAchievementManager({ storage, now: nextNow });
        const unlocks = manager.recordSessionSummary({ highestCombo: 60 });
        expect(unlocks.some((entry) => entry.id === 'combo-king')).toBe(true);
        const upgrades = manager.getUpgradeSnapshot();
        expect(upgrades.comboDecayMultiplier).toBeGreaterThan(1);
    });
});
