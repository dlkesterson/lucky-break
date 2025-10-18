import { describe, expect, it } from 'vitest';
import { createEventBus } from 'app/events';
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
});
