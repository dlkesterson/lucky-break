import { describe, expect, it } from 'vitest';
import { createGameSessionManager } from 'app/state';

describe('mirage stack tracking', () => {
    it('initializes mirage stacks to zero', () => {
        const session = createGameSessionManager();

        expect(session.getMirageStacks()).toBe(0);
    });

    it('increments mirage stacks on successful hits', () => {
        const session = createGameSessionManager();

        session.incrementMirageStacks();
        expect(session.getMirageStacks()).toBe(1);

        session.incrementMirageStacks();
        expect(session.getMirageStacks()).toBe(2);
    });

    it('caps mirage stacks at 100', () => {
        const session = createGameSessionManager();

        for (let i = 0; i < 150; i++) {
            session.incrementMirageStacks();
        }

        expect(session.getMirageStacks()).toBe(100);
    });

    it('resets mirage stacks on life lost', () => {
        const session = createGameSessionManager();
        session.startRound({ breakableBricks: 10, roundNumber: 1 });

        session.incrementMirageStacks();
        session.incrementMirageStacks();
        session.incrementMirageStacks();
        expect(session.getMirageStacks()).toBe(3);

        session.recordLifeLost('ball-drop');

        expect(session.getMirageStacks()).toBe(0);
    });

    it('includes mirage stacks in HUD snapshot', () => {
        const session = createGameSessionManager();

        session.incrementMirageStacks();
        session.incrementMirageStacks();

        const snapshot = session.snapshot();

        expect(snapshot.hud.momentum.mirageStacks).toBe(2);
    });

    it('resets combo alongside mirage stacks on life lost', () => {
        const session = createGameSessionManager();
        session.startRound({ breakableBricks: 10, roundNumber: 1 });

        // Build mirage stacks
        session.incrementMirageStacks();
        session.incrementMirageStacks();

        const beforeLost = session.snapshot();
        expect(beforeLost.hud.momentum.mirageStacks).toBe(2);

        session.recordLifeLost('ball-drop');

        const afterLost = session.snapshot();
        expect(afterLost.hud.momentum.comboHeat).toBe(0);
        expect(afterLost.hud.momentum.comboTimer).toBe(0);
        expect(afterLost.hud.momentum.mirageStacks).toBe(0);
    });
});
