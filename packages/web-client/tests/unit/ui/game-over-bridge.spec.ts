import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementUnlock } from 'app/achievements';
import { gameOverUiBridge, useGameOverUi } from 'ui/state/game-over-bridge';

const resetGameOverState = () => {
    useGameOverUi.setState({ visible: false, suspended: false, snapshot: null }, true);
};

const createAchievement = (id: string): AchievementUnlock => ({
    id: id as AchievementUnlock['id'],
    title: `Achievement ${id}`,
    description: `Description for ${id}`,
    unlockedAt: Date.now(),
    upgrades: {
        bonusLives: 0,
        comboDecayMultiplier: 1,
    },
});

describe('gameOverUiBridge', () => {
    beforeEach(() => {
        resetGameOverState();
    });

    it('enters with snapshot and resets on exit', async () => {
        const onRestart = vi.fn().mockResolvedValue(undefined);
        gameOverUiBridge.enter({
            score: 128_450,
            title: 'Game Over',
            prompt: 'Tap to retry',
            scoreLabel: 'Final Score: 128,450',
            achievements: [createAchievement('combo-king')],
            dustAwarded: 42,
            onRestart,
        });

        const active = useGameOverUi.getState();
        expect(active.visible).toBe(true);
        expect(active.suspended).toBe(false);
        expect(active.snapshot?.score).toBe(128_450);
        expect(active.snapshot?.achievements).toHaveLength(1);

        await active.snapshot?.onRestart();
        expect(onRestart).toHaveBeenCalled();

        gameOverUiBridge.exit();
        expect(useGameOverUi.getState()).toEqual({ visible: false, suspended: false, snapshot: null });
    });

    it('toggles suspension only when visible', () => {
        gameOverUiBridge.suspend();
        expect(useGameOverUi.getState().suspended).toBe(false);

        gameOverUiBridge.enter({
            score: 0,
            title: 'Game Over',
            prompt: 'Retry',
            scoreLabel: 'Final Score: 0',
            achievements: [],
            dustAwarded: null,
            onRestart: async () => { },
        });

        gameOverUiBridge.suspend();
        expect(useGameOverUi.getState().suspended).toBe(true);

        gameOverUiBridge.resume();
        expect(useGameOverUi.getState().suspended).toBe(false);
    });
});
