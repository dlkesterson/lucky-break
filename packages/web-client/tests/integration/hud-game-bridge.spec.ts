/**
 * Integration Tests: HUD Game Bridge
 *
 * Tests the data flow from PixiJS game runtime to React HUD components
 * Verifies that hudSetters correctly propagate game state changes to the UI
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { hudSetters, useHud, type RuntimeHudPayload } from 'ui/state/game-bridge';

describe('HUD Game Bridge Integration', () => {
    beforeEach(() => {
        hudSetters.reset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const createRuntimePayload = (overrides: Partial<RuntimeHudPayload> = {}): RuntimeHudPayload => ({
        score: 0,
        lives: 3,
        coins: 0,
        combo: 0,
        difficultyMultiplier: 1,
        comboTimer: 0,
        brickRemaining: 10,
        brickTotal: 10,
        scoreboard: {
            statusText: 'Round 1 — Active',
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
        physics: null,
        ...overrides,
    });

    describe('Runtime to HUD State Propagation', () => {
        it('propagates score updates from game runtime to HUD state', () => {
            const payload = createRuntimePayload({ score: 1500 });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.score).toBe(1500);
        });

        it('propagates brick progress updates', () => {
            hudSetters.setVisibility(true);

            const payload = createRuntimePayload({
                brickRemaining: 7,
                brickTotal: 10,
            });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.brickRemaining).toBe(7);
            expect(state.brickTotal).toBe(10);
        });

        it('propagates combo changes from scoring system', () => {
            const payload = createRuntimePayload({
                combo: 5,
                comboTimer: 3.5,
            });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.combo).toBe(5);
            expect(state.comboTimer).toBe(3.5);
        });

        it('propagates lives updates when player takes damage', () => {
            const payload = createRuntimePayload({ lives: 2 });
            hudSetters.updateFromRuntime(payload);

            expect(useHud.getState().lives).toBe(2);

            const payload2 = createRuntimePayload({ lives: 1 });
            hudSetters.updateFromRuntime(payload2);

            expect(useHud.getState().lives).toBe(1);
        });

        it('propagates coin collection events', () => {
            const payload = createRuntimePayload({ coins: 25 });
            hudSetters.updateFromRuntime(payload);

            expect(useHud.getState().coins).toBe(25);

            const payload2 = createRuntimePayload({ coins: 50 });
            hudSetters.updateFromRuntime(payload2);

            expect(useHud.getState().coins).toBe(50);
        });

        it('propagates momentum metrics from game state', () => {
            const payload = createRuntimePayload({
                momentum: {
                    volleyLength: 8,
                    speedPressure: 0.75,
                    brickDensity: 0.6,
                    comboHeat: 0.9,
                    comboTimer: 2.3,
                    mirageStacks: 2,
                },
            });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.momentum).toBeDefined();
            expect(state.momentum?.volleyLength).toBe(8);
            expect(state.momentum?.speedPressure).toBe(0.75);
            expect(state.momentum?.brickDensity).toBe(0.6);
            expect(state.momentum?.comboHeat).toBe(0.9);
            expect(state.momentum?.mirageStacks).toBe(2);
        });

        it('propagates physics state from Matter.js engine', () => {
            const payload = createRuntimePayload({
                physics: {
                    currentSpeed: 350,
                    baseSpeed: 280,
                    maxSpeed: 500,
                    gravity: -0.2,
                },
            });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.physics).toBeDefined();
            expect(state.physics?.currentSpeed).toBe(350);
            expect(state.physics?.baseSpeed).toBe(280);
            expect(state.physics?.maxSpeed).toBe(500);
            expect(state.physics?.gravity).toBe(-0.2);
        });

        it('propagates difficulty multiplier changes', () => {
            const payload = createRuntimePayload({ difficultyMultiplier: 1.5 });
            hudSetters.updateFromRuntime(payload);

            expect(useHud.getState().difficultyMultiplier).toBe(1.5);
        });
    });

    describe('Combo Pulse Synchronization', () => {
        it('triggers combo pulse when combo increases', () => {
            hudSetters.pulseCombo(0.8);

            expect(useHud.getState().comboPulse).toBe(0.8);
        });

        it('auto-resets combo pulse after delay', () => {
            hudSetters.pulseCombo(1.2);
            expect(useHud.getState().comboPulse).toBe(1.2);

            vi.advanceTimersByTime(220);

            expect(useHud.getState().comboPulse).toBe(0);
        });

        it('keeps maximum pulse value when multiple pulses arrive', () => {
            hudSetters.pulseCombo(0.5);
            expect(useHud.getState().comboPulse).toBe(0.5);

            hudSetters.pulseCombo(0.3);
            expect(useHud.getState().comboPulse).toBe(0.5);

            hudSetters.pulseCombo(1.0);
            expect(useHud.getState().comboPulse).toBe(1.0);
        });

        it('resets pulse timer when new pulse arrives', () => {
            hudSetters.pulseCombo(0.8);

            vi.advanceTimersByTime(100);
            hudSetters.pulseCombo(0.9);

            vi.advanceTimersByTime(100);
            expect(useHud.getState().comboPulse).toBe(0.9);

            vi.advanceTimersByTime(120);
            expect(useHud.getState().comboPulse).toBe(0);
        });
    });

    describe('FPS Counter Integration', () => {
        it('receives FPS updates from performance monitor', () => {
            hudSetters.setFps(60);
            expect(useHud.getState().fps).toBe(60);

            hudSetters.setFps(59.8);
            expect(useHud.getState().fps).toBe(59.8);
        });

        it('clears FPS when performance monitoring stops', () => {
            hudSetters.setFps(60);
            expect(useHud.getState().fps).toBe(60);

            hudSetters.setFps(undefined);
            expect(useHud.getState().fps).toBeUndefined();
        });
    });

    describe('Flavor Message Flow', () => {
        it('displays flavor message from narrative service', () => {
            hudSetters.showFlavor(
                {
                    id: 'flavor-test-1',
                    text: 'Nice hit!',
                    tone: 'hype',
                },
                { durationMs: 3000 },
            );

            const state = useHud.getState();
            expect(state.flavor).toBeDefined();
            expect(state.flavor?.text).toBe('Nice hit!');
            expect(state.flavor?.tone).toBe('hype');
        });

        it('auto-hides flavor message after duration', () => {
            hudSetters.showFlavor(
                {
                    id: 'flavor-test-2',
                    text: 'Combo rising',
                    tone: 'info',
                },
                { durationMs: 2000 },
            );

            expect(useHud.getState().flavor).toBeDefined();

            vi.advanceTimersByTime(2000);

            expect(useHud.getState().flavor).toBeNull();
        });

        it('replaces existing flavor when new message arrives', () => {
            hudSetters.showFlavor(
                {
                    id: 'flavor-1',
                    text: 'First message',
                    tone: 'info',
                },
                { durationMs: 5000 },
            );

            expect(useHud.getState().flavor?.text).toBe('First message');

            hudSetters.showFlavor(
                {
                    id: 'flavor-2',
                    text: 'Second message',
                    tone: 'hype',
                },
                { durationMs: 5000 },
            );

            expect(useHud.getState().flavor?.text).toBe('Second message');
            expect(useHud.getState().flavor?.tone).toBe('hype');
        });

        it('does not replace flavor with same ID', () => {
            const flavor = {
                id: 'flavor-same',
                text: 'Same message',
                tone: 'info' as const,
            };

            hudSetters.showFlavor(flavor, { durationMs: 5000 });
            const state1 = useHud.getState();

            hudSetters.showFlavor(flavor, { durationMs: 5000 });
            const state2 = useHud.getState();

            expect(state1).toBe(state2);
        });

        it('clears flavor when null is provided', () => {
            hudSetters.showFlavor(
                {
                    id: 'flavor-clear',
                    text: 'Temporary',
                    tone: 'warning',
                },
                { durationMs: 3000 },
            );

            expect(useHud.getState().flavor).not.toBeNull();

            hudSetters.showFlavor(null);

            expect(useHud.getState().flavor).toBeNull();
        });
    });

    describe('Settings Synchronization', () => {
        it('propagates settings changes from game preferences', () => {
            const payload = createRuntimePayload({
                settings: {
                    muted: true,
                    masterVolume: 0.7,
                    reducedMotion: true,
                },
            });
            hudSetters.updateFromRuntime(payload);

            const settings = useHud.getState().settings;
            expect(settings.muted).toBe(true);
            expect(settings.masterVolume).toBe(0.7);
            expect(settings.reducedMotion).toBe(true);
        });

        it('applies settings directly via applySettings', () => {
            hudSetters.applySettings({
                muted: false,
                masterVolume: 0.8,
                reducedMotion: false,
            });

            const settings = useHud.getState().settings;
            expect(settings.muted).toBe(false);
            expect(settings.masterVolume).toBe(0.8);
        });

        it('preserves settings across reset', () => {
            const payload = createRuntimePayload({
                score: 1000,
                settings: {
                    muted: true,
                    masterVolume: 0.6,
                    reducedMotion: true,
                },
            });
            hudSetters.updateFromRuntime(payload);

            hudSetters.reset();

            const settings = useHud.getState().settings;
            expect(settings.muted).toBe(true);
            expect(settings.masterVolume).toBe(0.6);
            expect(settings.reducedMotion).toBe(true);
        });
    });

    describe('Visibility Control', () => {
        it('starts hidden by default', () => {
            expect(useHud.getState().visible).toBe(false);
        });

        it('shows HUD when visibility is enabled', () => {
            hudSetters.setVisibility(true);
            expect(useHud.getState().visible).toBe(true);
        });

        it('preserves visibility through runtime updates', () => {
            hudSetters.setVisibility(true);

            const payload = createRuntimePayload({ score: 500 });
            hudSetters.updateFromRuntime(payload);

            expect(useHud.getState().visible).toBe(true);
        });

        it('hides HUD when visibility is disabled', () => {
            hudSetters.setVisibility(true);
            expect(useHud.getState().visible).toBe(true);

            hudSetters.setVisibility(false);
            expect(useHud.getState().visible).toBe(false);
        });
    });

    describe('State Reset and Cleanup', () => {
        it('resets all game state to defaults', () => {
            const payload = createRuntimePayload({
                score: 5000,
                lives: 1,
                coins: 200,
                combo: 10,
                brickRemaining: 3,
                brickTotal: 20,
            });
            hudSetters.updateFromRuntime(payload);
            hudSetters.setFps(60);
            hudSetters.pulseCombo(1.5);
            hudSetters.showFlavor(
                {
                    id: 'test',
                    text: 'Test',
                    tone: 'info',
                },
                { durationMs: 5000 },
            );

            hudSetters.reset();

            const state = useHud.getState();
            expect(state.score).toBe(0);
            expect(state.lives).toBe(3);
            expect(state.coins).toBe(0);
            expect(state.combo).toBe(0);
            expect(state.comboPulse).toBe(0);
            expect(state.fps).toBeUndefined();
            expect(state.brickRemaining).toBe(0);
            expect(state.brickTotal).toBe(0);
            expect(state.scoreboard).toBeNull();
            expect(state.flavor).toBeNull();
        });

        it('clears pending combo pulse timers on reset', () => {
            hudSetters.pulseCombo(1.0);
            expect(useHud.getState().comboPulse).toBe(1.0);

            hudSetters.reset();
            expect(useHud.getState().comboPulse).toBe(0);

            vi.advanceTimersByTime(500);
            expect(useHud.getState().comboPulse).toBe(0);
        });

        it('clears pending flavor timers on reset', () => {
            hudSetters.showFlavor(
                {
                    id: 'timer-test',
                    text: 'Timer test',
                    tone: 'info',
                },
                { durationMs: 3000 },
            );

            hudSetters.reset();
            expect(useHud.getState().flavor).toBeNull();

            vi.advanceTimersByTime(5000);
            expect(useHud.getState().flavor).toBeNull();
        });
    });

    describe('Entropy Actions Propagation', () => {
        it('propagates entropy actions from rewards system', () => {
            const payload = createRuntimePayload({
                entropyActions: [
                    {
                        action: 'reroll',
                        label: 'Reroll Bricks',
                        hotkey: 'R',
                        cost: 25,
                        charges: 0,
                        affordable: true,
                    },
                    {
                        action: 'shield',
                        label: 'Shield',
                        hotkey: 'S',
                        cost: 15,
                        charges: 2,
                        affordable: true,
                    },
                ],
            });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.entropyActions).toHaveLength(2);
            expect(state.entropyActions[0]?.label).toBe('Reroll Bricks');
            expect(state.entropyActions[1]?.label).toBe('Shield');
            expect(state.entropyActions[1]?.charges).toBe(2);
        });
    });

    describe('Power-ups and Rewards Display', () => {
        it('propagates active power-up states', () => {
            const payload = createRuntimePayload({
                activePowerUps: [
                    { label: 'Magnet', remaining: '12s' },
                    { label: 'Shield', remaining: '8s' },
                ],
            });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.activePowerUps).toHaveLength(2);
            expect(state.activePowerUps[0]?.label).toBe('Magnet');
            expect(state.activePowerUps[1]?.label).toBe('Shield');
        });

        it('propagates reward view when active', () => {
            const payload = createRuntimePayload({
                reward: {
                    label: 'Mystery Box',
                    remaining: '5s',
                },
            });
            hudSetters.updateFromRuntime(payload);

            const state = useHud.getState();
            expect(state.reward).toBeDefined();
            expect(state.reward?.label).toBe('Mystery Box');
            expect(state.reward?.remaining).toBe('5s');
        });

        it('clears reward when null', () => {
            const payload1 = createRuntimePayload({
                reward: {
                    label: 'Bonus',
                    remaining: '3s',
                },
            });
            hudSetters.updateFromRuntime(payload1);
            expect(useHud.getState().reward).not.toBeNull();

            const payload2 = createRuntimePayload({ reward: null });
            hudSetters.updateFromRuntime(payload2);
            expect(useHud.getState().reward).toBeNull();
        });
    });

    describe('Complete Game Session Flow', () => {
        it('simulates full game session with state transitions', () => {
            hudSetters.setVisibility(true);

            hudSetters.updateFromRuntime(
                createRuntimePayload({
                    score: 0,
                    lives: 3,
                    brickRemaining: 10,
                    brickTotal: 10,
                }),
            );

            let state = useHud.getState();
            expect(state.score).toBe(0);
            expect(state.lives).toBe(3);

            hudSetters.updateFromRuntime(
                createRuntimePayload({
                    score: 500,
                    combo: 3,
                    comboTimer: 2.5,
                    brickRemaining: 7,
                    brickTotal: 10,
                }),
            );
            hudSetters.pulseCombo(0.7);

            state = useHud.getState();
            expect(state.score).toBe(500);
            expect(state.combo).toBe(3);
            expect(state.comboPulse).toBe(0.7);

            hudSetters.updateFromRuntime(
                createRuntimePayload({
                    score: 1500,
                    lives: 2,
                    combo: 0,
                    brickRemaining: 4,
                    brickTotal: 10,
                }),
            );

            state = useHud.getState();
            expect(state.score).toBe(1500);
            expect(state.lives).toBe(2);
            expect(state.combo).toBe(0);

            hudSetters.updateFromRuntime(
                createRuntimePayload({
                    score: 3000,
                    lives: 2,
                    brickRemaining: 0,
                    brickTotal: 10,
                }),
            );

            state = useHud.getState();
            expect(state.score).toBe(3000);
            expect(state.brickRemaining).toBe(0);

            hudSetters.reset();
            state = useHud.getState();
            expect(state.score).toBe(0);
            expect(state.lives).toBe(3);
            expect(state.brickRemaining).toBe(0);
        });
    });
});
