import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudScoreboardView, HudScoreboardPrompt, HudEntropyActionDescriptor } from 'render/hud';
import type { HudPowerUpView, HudRewardView } from 'render/hud-display';
import type { RewardEntropyAction } from 'app/events';
import { hudSetters, useHud } from '../../../../src/ui/state/game-bridge';

const createScoreboard = (prompts: readonly HudScoreboardPrompt[] = []): HudScoreboardView => ({
    statusText: 'Round 1 — Active',
    summaryLine: 'Elapsed 60s',
    entries: [
        { id: 'score', label: 'Score', value: '1,200' },
        { id: 'coins', label: 'Coins', value: '42c' },
    ],
    prompts,
});

const createEntropyAction = (action: RewardEntropyAction): HudEntropyActionDescriptor => ({
    action,
    label: action.toUpperCase(),
    hotkey: action.charAt(0),
    cost: 25,
    charges: action === 'shield' ? 2 : 0,
    affordable: action !== 'bailout',
});

const samplePowerUps: readonly HudPowerUpView[] = [
    { label: 'Shield', remaining: '8s' },
    { label: 'Laser', remaining: 'Ready' },
];

const sampleReward: HudRewardView = {
    label: 'Jackpot',
    remaining: '12s',
};

describe('React HUD bridge', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        hudSetters.reset();
    });

    afterEach(() => {
        hudSetters.reset();
        vi.useRealTimers();
    });

    it('hydrates the Zustand store from runtime payloads', () => {
        hudSetters.pulseCombo(0.9);
        const initialPulse = useHud.getState().comboPulse;

        const payload = {
            score: 4800,
            lives: 2,
            coins: 77,
            combo: 6,
            difficultyMultiplier: 1.45,
            comboTimer: 1.3,
            brickRemaining: 15,
            brickTotal: 90,
            scoreboard: createScoreboard(),
            activePowerUps: samplePowerUps,
            reward: sampleReward,
            entropyActions: [
                createEntropyAction('reroll'),
                createEntropyAction('shield'),
            ],
            momentum: {
                comboHeat: 0.6,
                volleyLength: 12,
                speedPressure: 0.55,
                brickDensity: 0.3,
                comboTimer: 1.8,
            },
            prompts: [
                { id: 'alert', severity: 'warning', message: 'Brace yourself!' },
            ],
            settings: {
                muted: false,
                masterVolume: 0.8,
                reducedMotion: false,
            },
            physics: {
                currentSpeed: 315,
                baseSpeed: 280,
                maxSpeed: 400,
                gravity: 0.12,
            },
        } as const;

        hudSetters.updateFromRuntime(payload);

        const state = useHud.getState();
        expect(state.score).toBe(payload.score);
        expect(state.lives).toBe(payload.lives);
        expect(state.coins).toBe(payload.coins);
        expect(state.combo).toBe(payload.combo);
        expect(state.comboTimer).toBe(payload.comboTimer);
        expect(state.comboPulse).toBe(initialPulse);
        expect(state.difficultyMultiplier).toBe(payload.difficultyMultiplier);
        expect(state.brickRemaining).toBe(payload.brickRemaining);
        expect(state.brickTotal).toBe(payload.brickTotal);
        expect(state.scoreboard).toBe(payload.scoreboard);
        expect(state.activePowerUps).toEqual(samplePowerUps);
        expect(state.reward).toEqual(sampleReward);
        expect(state.entropyActions).toEqual(payload.entropyActions);
        expect(state.momentum).toEqual(payload.momentum);
        expect(state.prompts).toEqual(payload.prompts);
        expect(state.settings).toEqual(payload.settings);
        expect(state.physics).toEqual(payload.physics);
    });

    it('pulses the combo meter with clamped intensity and timed decay', () => {
        hudSetters.pulseCombo(1.8);
        expect(useHud.getState().comboPulse).toBeCloseTo(1.6, 5);

        hudSetters.pulseCombo(0.4);
        expect(useHud.getState().comboPulse).toBeCloseTo(1.6, 5);

        vi.advanceTimersByTime(221);
        expect(useHud.getState().comboPulse).toBe(0);
    });

    it('clears timers while preserving last applied settings on reset', () => {
        hudSetters.updateFromRuntime({
            score: 900,
            lives: 1,
            coins: 12,
            combo: 3,
            difficultyMultiplier: 1.1,
            comboTimer: 0.9,
            brickRemaining: 4,
            brickTotal: 50,
            scoreboard: createScoreboard(),
            activePowerUps: samplePowerUps,
            reward: sampleReward,
            entropyActions: [createEntropyAction('shield')],
            momentum: {
                comboHeat: 0.2,
                volleyLength: 5,
                speedPressure: 0.1,
                brickDensity: 0.4,
                comboTimer: 0.6,
            },
            prompts: [],
            settings: {
                muted: true,
                masterVolume: 0,
                reducedMotion: true,
            },
            physics: {
                currentSpeed: 300,
                baseSpeed: 280,
                maxSpeed: 360,
                gravity: -0.05,
            },
        });

        hudSetters.pulseCombo(1);
        hudSetters.reset();
        expect(useHud.getState()).toMatchObject({
            score: 0,
            lives: 3,
            coins: 0,
            combo: 0,
            comboPulse: 0,
            scoreboard: null,
            activePowerUps: [],
            reward: null,
            entropyActions: [],
            momentum: null,
            prompts: [],
            settings: {
                muted: true,
                masterVolume: 0,
                reducedMotion: true,
            },
            physics: null,
        });

        vi.advanceTimersByTime(1000);
        expect(useHud.getState().comboPulse).toBe(0);
    });
});
