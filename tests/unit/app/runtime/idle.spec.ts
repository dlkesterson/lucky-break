import { describe, expect, it, vi } from 'vitest';
import { createIdleSimulation } from 'app/runtime/idle';
import { createRuntimeLifecycle } from 'app/runtime/lifecycle';
import { createGameSessionManager } from 'app/state';
import { createRandomManager } from 'util/random';
import { createFateLedger } from 'app/fate-ledger';
import type { HeadlessSimulationOptions, HeadlessSimulationResult } from 'cli/headless-engine';

const STORAGE_KEY = 'lucky-break::idle-snapshot::v1';

const createFakeClock = (startMs = 0) => {
    let current = startMs;
    return {
        now: () => current,
        advance: (delta: number) => {
            current += delta;
        },
    } as const;
};

const createMockStorage = () => {
    const store = new Map<string, string>();
    const storage: Storage = {
        get length() {
            return store.size;
        },
        clear: () => {
            store.clear();
        },
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        removeItem: (key: string) => {
            store.delete(key);
        },
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
    } satisfies Storage;
    return { storage, store } as const;
};

describe('createIdleSimulation', () => {
    const bootstrap = () => {
        const clock = createFakeClock(1_000_000);
        const storageRef = createMockStorage();
        const ledgerStorage = createMockStorage();
        const session = createGameSessionManager({ sessionId: 'idle-session', now: clock.now });
        const random = createRandomManager(0x1234);
        const fateLedger = createFateLedger({ storage: ledgerStorage.storage, now: clock.now });
        const lifecycle = createRuntimeLifecycle();
        return { clock, session, random, fateLedger, lifecycle, storage: storageRef.storage, ledgerStorage: ledgerStorage.store } as const;
    };

    it('returns null when no idle snapshot is persisted', () => {
        const { session, random, fateLedger, lifecycle, storage, clock } = bootstrap();
        const runner = vi.fn<[], HeadlessSimulationResult>(() => {
            throw new Error('simulation should not run');
        });

        const idle = createIdleSimulation({
            session,
            random,
            fateLedger,
            lifecycle,
            now: clock.now,
            storage,
            runSimulation: runner,
        });

        const result = idle.resumeIfNeeded();

        expect(result).toBeNull();
        expect(runner).not.toHaveBeenCalled();
    });

    it('skips simulation when idle duration is below the threshold', () => {
        const { session, random, fateLedger, lifecycle, storage, clock } = bootstrap();
        const runner = vi.fn<[], HeadlessSimulationResult>(() => {
            throw new Error('simulation should not run');
        });

        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 1,
                recordedAt: clock.now() - 30_000,
                seed: 77,
                round: 2,
            }),
        );

        const idle = createIdleSimulation({
            session,
            random,
            fateLedger,
            lifecycle,
            now: clock.now,
            storage,
            runSimulation: runner,
        });

        const beforeStored = session.getEntropyState().stored;
        const result = idle.resumeIfNeeded();
        idle.persistSnapshot();

        expect(result).toBeNull();
        expect(runner).not.toHaveBeenCalled();
        expect(session.getEntropyState().stored).toBe(beforeStored);
        expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('grants idle rewards when sufficient time has elapsed', () => {
        const { session, random, fateLedger, lifecycle, storage, clock, ledgerStorage } = bootstrap();

        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: 1,
                recordedAt: clock.now() - 180_000,
                seed: 0xdeadbeef,
                round: 4,
            }),
        );

        const runner = vi.fn((options: HeadlessSimulationOptions): HeadlessSimulationResult => {
            expect(options.seed).toBe(0xdeadbeef);
            expect(options.round).toBe(4);
            expect(options.durationMs).toBe(180_000);
            return {
                sessionId: 'sim-idle-test',
                seed: options.seed,
                round: options.round,
                durationMs: options.durationMs,
                frames: 540,
                metrics: {
                    bricksBroken: 42,
                    paddleHits: 0,
                    wallHits: 0,
                    livesLost: 0,
                    averageFps: 60,
                    bricksPerSecond: 0.35,
                },
                volley: {
                    longestVolley: 8,
                    averageImpactSpeed: 11.5,
                },
                events: [],
                score: 0,
                snapshot: session.snapshot(),
            } satisfies HeadlessSimulationResult;
        });

        const idle = createIdleSimulation({
            session,
            random,
            fateLedger,
            lifecycle,
            now: clock.now,
            storage,
            runSimulation: runner,
        });

        const result = idle.resumeIfNeeded();
        idle.persistSnapshot();

        expect(result).not.toBeNull();
        expect(result?.durationMs).toBe(180_000);
        expect(result?.entropyAwarded).toBe(45);
        expect(result?.certaintyDustAwarded).toBe(3.6);
        expect(result?.bricksSimulated).toBe(42);
        expect(result?.round).toBe(4);

        const entropyState = session.getEntropyState();
        expect(entropyState.stored).toBe(45);
        expect(entropyState.trend).toBe('rising');

        const ledgerSnapshot = fateLedger.getSnapshot();
        expect(ledgerSnapshot.entries).toHaveLength(1);
        expect(ledgerSnapshot.entries[0]).toMatchObject({
            durationMs: 180_000,
            entropyEarned: 45,
            certaintyDustEarned: 3.6,
        });

        const persisted = storage.getItem(STORAGE_KEY);
        expect(persisted).not.toBeNull();
        if (persisted) {
            const parsed = JSON.parse(persisted) as { round: number; recordedAt: number };
            expect(parsed.round).toBe(session.snapshot().round);
            expect(parsed.recordedAt).toBe(clock.now());
        }

        expect(runner).toHaveBeenCalledTimes(1);
        expect(ledgerStorage.size).toBeGreaterThan(0);
    });
});
