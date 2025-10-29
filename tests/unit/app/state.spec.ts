import { describe, expect, it } from 'vitest';
import { createEventBus, type EntropyActionPayload } from 'app/events';
import { createGameSessionManager, type GameSessionSnapshot } from 'app/state';

interface FakeClock {
    readonly now: () => number;
    readonly tick: (deltaMs: number) => void;
}

const createFakeClock = (start = 0): FakeClock => {
    let current = start;
    return {
        now: () => current,
        tick: (deltaMs) => {
            current += deltaMs;
        },
    };
};

describe('createGameSessionManager', () => {
    const createSnapshot = (overrides?: Partial<Parameters<typeof createGameSessionManager>[0]>) => {
        const clock = createFakeClock();
        const manager = createGameSessionManager({
            sessionId: 'session-001',
            now: clock.now,
            initialLives: 3,
            ...overrides,
        });
        return { manager, clock } as const;
    };

    const expectHud = (snapshot: GameSessionSnapshot) => snapshot.hud;

    it('starts pending with baseline scoreboard values', () => {
        const { manager } = createSnapshot();

        const snapshot = manager.snapshot();

        expect(snapshot.status).toBe('pending');
        expect(snapshot.score).toBe(0);
        expect(snapshot.livesRemaining).toBe(3);
        expect(snapshot.round).toBe(1);
        expect(snapshot.brickRemaining).toBe(0);
        expect(snapshot.brickTotal).toBe(0);

        const hud = expectHud(snapshot);
        expect(hud).toMatchObject({
            score: 0,
            coins: 0,
            lives: 3,
            round: 1,
            brickRemaining: 0,
            brickTotal: 0,
            momentum: {
                volleyLength: 0,
                speedPressure: 0,
                brickDensity: 1,
                comboHeat: 0,
            },
            entropy: {
                charge: 0,
                stored: 0,
                trend: 'stable',
            },
            audio: {
                scene: 'calm',
                nextScene: null,
                barCountdown: 0,
            },
        });
    });

    it('enters active state when a round starts and tracks brick inventory', () => {
        const { manager, clock } = createSnapshot();

        manager.startRound({ breakableBricks: 12 });
        clock.tick(500);

        const snapshot = manager.snapshot();
        expect(snapshot.status).toBe('active');
        expect(snapshot.round).toBe(1);
        expect(snapshot.elapsedTimeMs).toBe(500);

        const hud = expectHud(snapshot);
        expect(hud.brickTotal).toBe(12);
        expect(hud.brickRemaining).toBe(12);
        expect(hud.prompts[0]).toMatchObject({ id: 'round-active' });
    });

    it('records brick breaks by awarding score and reducing remaining brick count', () => {
        const { manager } = createSnapshot();

        manager.startRound({ breakableBricks: 3 });
        manager.recordBrickBreak({ points: 150 });
        manager.recordBrickBreak({ points: 200 });

        const snapshot = manager.snapshot();

        expect(snapshot.score).toBe(350);
        expect(snapshot.brickRemaining).toBe(1);

        const hud = expectHud(snapshot);
        expect(hud.score).toBe(350);
        expect(hud.brickRemaining).toBe(1);
        expect(hud.momentum.brickDensity).toBeCloseTo(1 / 3, 5);
    });

    it('syncs supplied momentum metrics when provided by gameplay systems', () => {
        const { manager } = createSnapshot();

        manager.startRound({ breakableBricks: 5 });
        manager.recordBrickBreak({
            points: 120,
            momentum: {
                volleyLength: 7,
                speedPressure: 0.65,
                brickDensity: 0.4,
                comboHeat: 0.5,
                comboTimer: 1.2,
            },
        });

        const snapshot = manager.snapshot();
        expect(snapshot.momentum).toMatchObject({
            volleyLength: 7,
            speedPressure: 0.65,
            brickDensity: 0.4,
            comboHeat: 0.5,
            comboTimer: 1.2,
        });
        expect(snapshot.hud.momentum).toMatchObject({
            volleyLength: 7,
            speedPressure: 0.65,
            brickDensity: 0.4,
            comboHeat: 0.5,
            comboTimer: 1.2,
        });
    });

    it('allows direct momentum updates between brick breaks', () => {
        const { manager, clock } = createSnapshot();

        manager.startRound({ breakableBricks: 10 });
        clock.tick(320);

        manager.updateMomentum({
            volleyLength: 3,
            speedPressure: 0.58,
            brickDensity: 0.75,
            comboHeat: 0.42,
            comboTimer: 0.9,
        });

        const snapshot = manager.snapshot();
        expect(snapshot.momentum).toMatchObject({
            volleyLength: 3,
            speedPressure: 0.58,
            brickDensity: 0.75,
            comboHeat: 0.42,
            comboTimer: 0.9,
        });
        expect(snapshot.momentum.updatedAt).toBe(320);
        expect(snapshot.hud.momentum.comboHeat).toBeCloseTo(0.42, 5);
        expect(snapshot.hud.momentum.comboTimer).toBeCloseTo(0.9, 5);
    });

    it('collects coin pickups and increases the score', () => {
        const { manager } = createSnapshot();

        manager.collectCoins(7);
        manager.collectCoins(2.6);

        const snapshot = manager.snapshot();
        expect(snapshot.coins).toBe(9);
        expect(snapshot.score).toBe(9);
        expect(snapshot.hud.coins).toBe(9);
    });

    it('marks the round complete when all bricks are cleared', () => {
        const clock = createFakeClock();
        const manager = createGameSessionManager({ sessionId: 'session-002', now: clock.now });

        manager.startRound({ breakableBricks: 2 });
        manager.recordBrickBreak({ points: 100 });
        clock.tick(1000);
        manager.recordBrickBreak({ points: 250 });
        clock.tick(500);
        manager.completeRound();

        const snapshot = manager.snapshot();

        expect(snapshot.status).toBe('completed');
        expect(snapshot.brickRemaining).toBe(0);
        expect(snapshot.lastOutcome).toMatchObject({
            result: 'win',
            round: 1,
            scoreAwarded: 350,
            durationMs: 1500,
        });

        const hud = expectHud(snapshot);
        expect(hud.prompts[0]).toMatchObject({ id: 'round-complete' });
    });

    it('emits brick break events with scoring details when available', () => {
        const bus = createEventBus();
        const publishSpy: unknown[] = [];
        bus.subscribe('BrickBreak', (event) => {
            publishSpy.push(event);
        });

        const manager = createGameSessionManager({
            sessionId: 'session-emit-1',
            eventBus: bus,
        });

        manager.startRound({ breakableBricks: 1 });
        manager.recordBrickBreak({
            points: 125,
            event: {
                row: 2,
                col: 5,
                impactVelocity: 9.2,
                brickType: 'standard',
                initialHp: 3,
            },
        });

        expect(publishSpy).toHaveLength(1);
        const [event] = publishSpy;
        expect(event).toMatchObject({
            type: 'BrickBreak',
            payload: {
                sessionId: 'session-emit-1',
                row: 2,
                col: 5,
                impactVelocity: 9.2,
                brickType: 'standard',
                comboHeat: expect.any(Number),
                initialHp: 3,
            },
            timestamp: expect.any(Number),
        });
    });

    it('emits round completion event when a round finishes', () => {
        const bus = createEventBus();
        const roundEvents: unknown[] = [];
        bus.subscribe('RoundCompleted', (event) => {
            roundEvents.push(event);
        });

        const clock = createFakeClock();
        const manager = createGameSessionManager({
            sessionId: 'session-emit-2',
            now: clock.now,
            eventBus: bus,
        });

        manager.startRound({ breakableBricks: 1 });
        clock.tick(250);
        manager.recordBrickBreak({ points: 50 });
        clock.tick(500);
        manager.completeRound();

        expect(roundEvents).toHaveLength(1);
        const [event] = roundEvents;
        expect(event).toMatchObject({
            type: 'RoundCompleted',
            payload: {
                sessionId: 'session-emit-2',
                round: 1,
                scoreAwarded: 50,
                durationMs: 750,
            },
            timestamp: expect.any(Number),
        });
    });

    it('uses the provided clock for life lost event timestamps', () => {
        const bus = createEventBus();
        const timestamps: number[] = [];
        bus.subscribe('LifeLost', (event) => {
            timestamps.push(event.timestamp);
        });

        const clock = createFakeClock(400);
        const manager = createGameSessionManager({
            sessionId: 'session-clock',
            now: clock.now,
            eventBus: bus,
        });

        manager.startRound({ breakableBricks: 2 });
        clock.tick(275);
        manager.recordLifeLost('ball-drop');

        expect(timestamps).toEqual([675]);
    });

    it('emits life lost events with remaining lives', () => {
        const bus = createEventBus();
        const lifeLostEvents: unknown[] = [];
        bus.subscribe('LifeLost', (event) => {
            lifeLostEvents.push(event);
        });

        const clock = createFakeClock();
        const manager = createGameSessionManager({
            sessionId: 'session-life-loss',
            now: clock.now,
            initialLives: 2,
            eventBus: bus,
        });

        manager.startRound({ breakableBricks: 10 });
        clock.tick(250);
        manager.recordLifeLost('ball-drop');

        expect(lifeLostEvents).toHaveLength(1);
        const [event] = lifeLostEvents;
        expect(event).toMatchObject({
            type: 'LifeLost',
            payload: {
                sessionId: 'session-life-loss',
                livesRemaining: 1,
                cause: 'ball-drop',
            },
            timestamp: expect.any(Number),
        });
    });

    it('transitions to failed when all lives are lost', () => {
        const clock = createFakeClock();
        const manager = createGameSessionManager({ sessionId: 'session-003', now: clock.now, initialLives: 2 });

        manager.startRound({ breakableBricks: 5 });
        manager.recordLifeLost('ball-drop');
        clock.tick(750);
        manager.recordLifeLost('ball-drop');

        const snapshot = manager.snapshot();

        expect(snapshot.status).toBe('failed');
        expect(snapshot.livesRemaining).toBe(0);
        expect(snapshot.lastOutcome).toMatchObject({
            result: 'loss',
            round: 1,
            cause: 'ball-drop',
            durationMs: 750,
        });

        const hud = expectHud(snapshot);
        expect(hud.lives).toBe(0);
        expect(hud.prompts[0]).toMatchObject({ id: 'round-failed', severity: 'error' });
    });

    it('tracks entropy changes from gameplay events', () => {
        const { manager } = createSnapshot();

        manager.recordEntropyEvent({ type: 'brick-hit', comboHeat: 4, impactVelocity: 12 });
        manager.recordEntropyEvent({ type: 'coin-collect', coinValue: 6 });

        const snapshot = manager.snapshot();
        expect(snapshot.entropy.charge).toBeGreaterThan(0);
        expect(snapshot.hud.entropy.trend).toBe('rising');

        const entropyState = manager.getEntropyState();
        expect(entropyState.charge).toBeCloseTo(snapshot.entropy.charge, 5);
        expect(entropyState.stored).toBe(snapshot.entropy.stored);
    });

    it('rejects entropy spends when stored entropy is insufficient', () => {
        const { manager } = createSnapshot();

        const result = manager.spendStoredEntropy({ action: 'bailout', cost: 10 });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('insufficient');
        expect(manager.getEntropyState().stored).toBe(0);
    });

    it('spends stored entropy and emits telemetry when successful', () => {
        const bus = createEventBus();
        const entropyEvents: EntropyActionPayload[] = [];
        bus.subscribe('EntropyAction', (event) => {
            entropyEvents.push(event.payload);
        });

        const clock = createFakeClock();
        const manager = createGameSessionManager({
            sessionId: 'entropy-spend',
            now: clock.now,
            eventBus: bus,
        });

        for (let index = 0; index < 40; index += 1) {
            manager.recordEntropyEvent({ type: 'brick-break', comboHeat: 18, speed: 24 });
        }
        manager.recordEntropyEvent({ type: 'round-complete' });

        const before = manager.getEntropyState().stored;
        expect(before).toBeGreaterThan(0);

        const spendCost = Math.min(20, before);
        const result = manager.spendStoredEntropy({ action: 'shield', cost: spendCost });

        expect(result.success).toBe(true);
        expect(result.action).toBe('shield');
        const after = manager.getEntropyState().stored;
        expect(after).toBeLessThan(before);
        expect(entropyEvents).toHaveLength(1);
        expect(entropyEvents[0]).toMatchObject({
            action: 'shield',
            cost: result.cost,
            storedBefore: before,
            storedAfter: after,
        });
    });

    it('grants stored entropy when idle rewards are applied', () => {
        const { manager } = createSnapshot();

        const before = manager.getEntropyState();
        expect(before.stored).toBe(0);

        const stored = manager.grantStoredEntropy(28);

        expect(stored).toBeGreaterThan(0);
        const after = manager.getEntropyState();
        expect(after.stored).toBe(stored);
        expect(after.trend).toBe('rising');
    });

    it('ignores non-positive idle reward grants', () => {
        const { manager } = createSnapshot();

        const before = manager.getEntropyState();
        manager.grantStoredEntropy(0);
        manager.grantStoredEntropy(-12);

        const after = manager.getEntropyState();
        expect(after.stored).toBe(before.stored);
    });
});
