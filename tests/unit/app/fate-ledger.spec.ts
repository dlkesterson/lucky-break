import { describe, expect, it } from 'vitest';
import { createFateLedger, resetFateLedgerStorageForTests, type FateLedgerSnapshot } from 'app/fate-ledger';

const createMemoryStorage = (): Storage => {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.has(key) ? store.get(key) ?? null : null;
        },
        key(index: number) {
            const keys = Array.from(store.keys());
            return keys[index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        },
    } satisfies Storage;
};

describe('createFateLedger', () => {
    it('records idle roll entries and reports aggregate totals', () => {
        const storage = createMemoryStorage();
        const clock = (() => {
            let value = 1_000;
            return () => {
                value += 250;
                return value;
            };
        })();

        const ledger = createFateLedger({ storage, now: clock });

        const entry = ledger.recordIdleRoll({
            durationMs: 60_000,
            entropyEarned: 12.5,
            certaintyDustEarned: 3,
            notes: 'Overnight idle roll',
        });

        expect(entry.kind).toBe('idle-roll');
        expect(entry.durationMs).toBe(60_000);
        expect(entry.entropyEarned).toBeCloseTo(12.5);
        expect(entry.certaintyDustEarned).toBe(3);

        const snapshot = ledger.getSnapshot();
        expect(snapshot.totalIdleRolls).toBe(1);
        expect(snapshot.totals.durationMs).toBe(60_000);
        expect(snapshot.totals.entropyEarned).toBeCloseTo(12.5);
        expect(snapshot.totals.certaintyDustEarned).toBe(3);
        expect(snapshot.entries.at(0)?.notes).toBe('Overnight idle roll');
    });

    it('enforces the configured max entry count when new entries are recorded', () => {
        const storage = createMemoryStorage();
        let tick = 10_000;
        const ledger = createFateLedger({
            storage,
            now: () => {
                tick += 1_000;
                return tick;
            },
            maxEntries: 3,
        });

        for (let index = 0; index < 5; index += 1) {
            ledger.recordIdleRoll({
                durationMs: 5_000,
                entropyEarned: index,
                certaintyDustEarned: index * 0.25,
                recordedAt: 20_000 + index,
            });
        }

        const snapshot = ledger.getSnapshot();
        expect(snapshot.entries.length).toBe(3);
        expect(snapshot.entries[0].entropyEarned).toBe(4);
        expect(snapshot.entries[2].entropyEarned).toBe(2);
    });

    it('persists entries to the provided storage and restores them on the next instance', () => {
        const storage = createMemoryStorage();
        const ledger = createFateLedger({ storage, now: () => 42_000 });

        ledger.recordIdleRoll({
            durationMs: 15_000,
            entropyEarned: 7.5,
            certaintyDustEarned: 2,
            recordedAt: 50_000,
            notes: 'Lunch break',
        });

        const rehydrated = createFateLedger({ storage, now: () => 100_000 });
        const snapshot = rehydrated.getSnapshot();
        expect(snapshot.totalIdleRolls).toBe(1);
        expect(snapshot.entries[0]?.notes).toBe('Lunch break');
    });

    it('notifies subscribed listeners with snapshots for new entries', () => {
        const storage = createMemoryStorage();
        const ledger = createFateLedger({ storage, now: () => 12_000 });
        const totals: number[] = [];

        const unsubscribe = ledger.subscribe((snapshot: FateLedgerSnapshot) => {
            totals.push(snapshot.totalIdleRolls);
        });

        ledger.recordIdleRoll({ durationMs: 2_000, entropyEarned: 1.5 });
        ledger.recordIdleRoll({ durationMs: 4_000, entropyEarned: 2.25 });

        expect(totals).toEqual([0, 1, 2]);

        unsubscribe();
        ledger.recordIdleRoll({ durationMs: 1_000, entropyEarned: 0.5 });
        expect(totals).toEqual([0, 1, 2]);
    });

    it('resets persisted storage for tests', () => {
        const storage = createMemoryStorage();
        const ledger = createFateLedger({ storage, now: () => 1_000 });
        ledger.recordIdleRoll({ durationMs: 500, entropyEarned: 0.5 });
        expect(ledger.getSnapshot().totalIdleRolls).toBe(1);

        resetFateLedgerStorageForTests(storage);
        const rehydrated = createFateLedger({ storage, now: () => 2_000 });
        expect(rehydrated.getSnapshot().totalIdleRolls).toBe(0);
    });
});
