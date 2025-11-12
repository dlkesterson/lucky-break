/**
 * Unit Tests: HUD State Transitions
 *
 * Tests hudSetters.updateFromRuntime and related HUD state management
 * This guards against regressions where HUD state doesn't update correctly
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hudSetters, useHud } from 'ui/state/game-bridge';
import { createScoring, awardBrickPoints, type ScoreState } from 'util/scoring';
import { gameConfig } from 'config/game';

describe('HUD State Transitions', () => {
    beforeEach(() => {
        hudSetters.reset();
    });

    describe('hudSetters.updateFromRuntime', () => {
        it('updates all basic HUD fields', () => {
            hudSetters.updateFromRuntime({
                score: 1000,
                lives: 2,
                coins: 25,
                combo: 3,
                difficultyMultiplier: 1.2,
                comboTimer: 1.5,
                brickRemaining: 8,
                brickTotal: 15,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: 'In Progress',
                    entries: [],
                    prompts: [],
                },
                activePowerUps: [],
                reward: null,
                entropyActions: [],
                momentum: {
                    volleyLength: 3,
                    speedPressure: 0.6,
                    brickDensity: 0.533,
                    comboHeat: 0.375,
                    comboTimer: 1.5,
                    mirageStacks: 0,
                },
                prompts: [],
                settings: {
                    muted: false,
                    masterVolume: 0.9,
                    reducedMotion: false,
                },
                physics: null,
            });

            const state = useHud.getState();
            expect(state.score).toBe(1000);
            expect(state.lives).toBe(2);
            expect(state.coins).toBe(25);
            expect(state.combo).toBe(3);
            expect(state.difficultyMultiplier).toBe(1.2);
            expect(state.comboTimer).toBe(1.5);
            expect(state.brickRemaining).toBe(8);
            expect(state.brickTotal).toBe(15);
        });

        it('preserves visible state when updating', () => {
            hudSetters.setVisibility(true);
            expect(useHud.getState().visible).toBe(true);

            hudSetters.updateFromRuntime({
                score: 100,
                lives: 3,
                coins: 0,
                combo: 0,
                difficultyMultiplier: 1.0,
                comboTimer: 0,
                brickRemaining: 10,
                brickTotal: 10,
                scoreboard: {
                    statusText: 'Round 1',
                    summaryLine: 'Ready',
                    entries: [],
                    prompts: [],
                },
                activePowerUps: [],
                reward: null,
                entropyActions: [],
                momentum: {
                    volleyLength: 0,
                    speedPressure: 0,
                    brickDensity: 1,
                    comboHeat: 0,
                    comboTimer: 0,
                    mirageStacks: 0,
                },
                prompts: [],
                settings: {
                    muted: false,
                    masterVolume: 1,
                    reducedMotion: false,
                },
                physics: null,
            });

            expect(useHud.getState().visible).toBe(true);
        });

        it('updates momentum metrics correctly', () => {
            hudSetters.updateFromRuntime({
                score: 0,
                lives: 3,
                coins: 0,
                combo: 0,
                difficultyMultiplier: 1.0,
                comboTimer: 0,
                brickRemaining: 10,
                brickTotal: 10,
                scoreboard: {
                    statusText: '',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                activePowerUps: [],
                reward: null,
                entropyActions: [],
                momentum: {
                    volleyLength: 5,
                    speedPressure: 0.8,
                    brickDensity: 0.6,
                    comboHeat: 0.5,
                    comboTimer: 1.2,
                    mirageStacks: 2,
                },
                prompts: [],
                settings: {
                    muted: false,
                    masterVolume: 1,
                    reducedMotion: false,
                },
                physics: null,
            });

            const momentum = useHud.getState().momentum;
            expect(momentum).toBeDefined();
            expect(momentum?.volleyLength).toBe(5);
            expect(momentum?.speedPressure).toBe(0.8);
            expect(momentum?.brickDensity).toBe(0.6);
            expect(momentum?.comboHeat).toBe(0.5);
            expect(momentum?.mirageStacks).toBe(2);
        });

        it('updates physics snapshot when provided', () => {
            hudSetters.updateFromRuntime({
                score: 0,
                lives: 3,
                coins: 0,
                combo: 0,
                difficultyMultiplier: 1.0,
                comboTimer: 0,
                brickRemaining: 10,
                brickTotal: 10,
                scoreboard: {
                    statusText: '',
                    summaryLine: '',
                    entries: [],
                    prompts: [],
                },
                activePowerUps: [],
                reward: null,
                entropyActions: [],
                momentum: {
                    volleyLength: 0,
                    speedPressure: 0,
                    brickDensity: 1,
                    comboHeat: 0,
                    comboTimer: 0,
                    mirageStacks: 0,
                },
                prompts: [],
                settings: {
                    muted: false,
                    masterVolume: 1,
                    reducedMotion: false,
                },
                physics: {
                    currentSpeed: 350,
                    baseSpeed: 250,
                    maxSpeed: 500,
                    gravity: 0,
                },
            });

            const physics = useHud.getState().physics;
            expect(physics).toBeDefined();
            expect(physics?.currentSpeed).toBe(350);
            expect(physics?.baseSpeed).toBe(250);
            expect(physics?.maxSpeed).toBe(500);
        });
    });

    describe('hudSetters.pulseCombo', () => {
        it('sets comboPulse to the provided intensity', () => {
            hudSetters.pulseCombo(0.8);

            expect(useHud.getState().comboPulse).toBe(0.8);
        });

        it('clamps intensity to maximum of 1.6', () => {
            hudSetters.pulseCombo(2.5);

            expect(useHud.getState().comboPulse).toBeLessThanOrEqual(1.6);
        });

        it('ignores negative or non-finite values', () => {
            hudSetters.pulseCombo(0.5);
            expect(useHud.getState().comboPulse).toBe(0.5);

            hudSetters.pulseCombo(-1);
            expect(useHud.getState().comboPulse).toBe(0.5); // Should not change

            hudSetters.pulseCombo(NaN);
            expect(useHud.getState().comboPulse).toBe(0.5); // Should not change
        });

        it('keeps the higher value when called multiple times', () => {
            hudSetters.pulseCombo(0.5);
            expect(useHud.getState().comboPulse).toBe(0.5);

            hudSetters.pulseCombo(0.3);
            expect(useHud.getState().comboPulse).toBe(0.5); // Should keep higher value

            hudSetters.pulseCombo(0.9);
            expect(useHud.getState().comboPulse).toBe(0.9); // Should update to higher
        });

        it('resets comboPulse after delay', async () => {
            vi.useFakeTimers();

            hudSetters.pulseCombo(1.0);
            expect(useHud.getState().comboPulse).toBe(1.0);

            vi.advanceTimersByTime(220);

            expect(useHud.getState().comboPulse).toBe(0);

            vi.useRealTimers();
        });
    });

    describe('hudSetters.setVisibility', () => {
        it('sets HUD visibility to true', () => {
            hudSetters.setVisibility(true);
            expect(useHud.getState().visible).toBe(true);
        });

        it('sets HUD visibility to false', () => {
            hudSetters.setVisibility(false);
            expect(useHud.getState().visible).toBe(false);
        });

        it('does not trigger update if visibility unchanged', () => {
            hudSetters.setVisibility(true);
            const state1 = useHud.getState();

            hudSetters.setVisibility(true);
            const state2 = useHud.getState();

            expect(state1).toBe(state2); // Should be same reference
        });
    });

    describe('hudSetters.setFps', () => {
        it('sets FPS value', () => {
            hudSetters.setFps(60);
            expect(useHud.getState().fps).toBe(60);
        });

        it('can clear FPS value with undefined', () => {
            hudSetters.setFps(60);
            expect(useHud.getState().fps).toBe(60);

            hudSetters.setFps(undefined);
            expect(useHud.getState().fps).toBeUndefined();
        });
    });

    describe('hudSetters.reset', () => {
        it('resets all HUD state to defaults', () => {
            // Set some non-default values
            hudSetters.updateFromRuntime({
                score: 5000,
                lives: 1,
                coins: 100,
                combo: 10,
                difficultyMultiplier: 2.0,
                comboTimer: 3.0,
                brickRemaining: 2,
                brickTotal: 20,
                scoreboard: {
                    statusText: 'Round 5',
                    summaryLine: 'Active',
                    entries: [],
                    prompts: [],
                },
                activePowerUps: [],
                reward: null,
                entropyActions: [],
                momentum: {
                    volleyLength: 10,
                    speedPressure: 1.0,
                    brickDensity: 0.1,
                    comboHeat: 1.0,
                    comboTimer: 3.0,
                    mirageStacks: 5,
                },
                prompts: [],
                settings: {
                    muted: true,
                    masterVolume: 0.5,
                    reducedMotion: true,
                },
                physics: null,
            });
            hudSetters.pulseCombo(1.5);
            hudSetters.setFps(120);

            // Reset
            hudSetters.reset();

            const state = useHud.getState();
            expect(state.score).toBe(0);
            expect(state.lives).toBe(3);
            expect(state.coins).toBe(0);
            expect(state.combo).toBe(0);
            expect(state.comboPulse).toBe(0);
            expect(state.fps).toBeUndefined();
            expect(state.difficultyMultiplier).toBe(1);
            expect(state.comboTimer).toBe(0);
            expect(state.brickRemaining).toBe(0);
            expect(state.brickTotal).toBe(0);
            expect(state.scoreboard).toBeNull();
            expect(state.momentum).toBeNull();
        });

        it('preserves settings after reset', () => {
            hudSetters.applySettings({
                muted: true,
                masterVolume: 0.7,
                reducedMotion: true,
            });

            hudSetters.reset();

            const settings = useHud.getState().settings;
            expect(settings.muted).toBe(true);
            expect(settings.masterVolume).toBe(0.7);
            expect(settings.reducedMotion).toBe(true);
        });
    });

    describe('Scoring updateHUD Callback', () => {
        let scoring: ScoreState;
        let hudUpdateCallCount: number;

        beforeEach(() => {
            scoring = createScoring();
            hudUpdateCallCount = 0;
            scoring.updateHUD = () => {
                hudUpdateCallCount++;
            };
        });

        it('updateHUD callback is invoked when scoring points', () => {
            awardBrickPoints(
                scoring,
                { comboDecayTime: gameConfig.scoring.comboDecayTime },
                {
                    bricksRemaining: 9,
                    brickTotal: 10,
                    impactSpeed: 300,
                    maxSpeed: gameConfig.ball.maxSpeed,
                },
            );

            expect(hudUpdateCallCount).toBeGreaterThan(0);
        });

        it('updateHUD callback can be undefined without error', () => {
            const scoringWithoutCallback = createScoring();

            expect(() => {
                awardBrickPoints(
                    scoringWithoutCallback,
                    { comboDecayTime: gameConfig.scoring.comboDecayTime },
                    {
                        bricksRemaining: 9,
                        brickTotal: 10,
                        impactSpeed: 300,
                        maxSpeed: gameConfig.ball.maxSpeed,
                    },
                );
            }).not.toThrow();
        });

        it('updateHUD is called for each brick break', () => {
            for (let i = 0; i < 5; i++) {
                awardBrickPoints(
                    scoring,
                    { comboDecayTime: gameConfig.scoring.comboDecayTime },
                    {
                        bricksRemaining: 10 - (i + 1),
                        brickTotal: 10,
                        impactSpeed: 300,
                        maxSpeed: gameConfig.ball.maxSpeed,
                    },
                );
            }

            expect(hudUpdateCallCount).toBe(5);
        });
    });
});
