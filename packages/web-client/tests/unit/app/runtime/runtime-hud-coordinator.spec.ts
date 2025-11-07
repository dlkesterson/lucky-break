import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSessionSnapshot } from 'app/state';
import type { GambleBrickSummary } from 'game/gamble-brick-manager';
import type { HudScoreboardPrompt, HudScoreboardView } from 'render/hud';
import { createRuntimeHudCoordinator } from 'app/runtime/modules/runtime-hud-coordinator';
import { hudSetters } from '../../../../src/ui/state/game-bridge';

const AUTO_PROMPT_ID = 'auto-complete-countdown';

const { buildHudScoreboardMock } = vi.hoisted(() => ({
    buildHudScoreboardMock: vi.fn<[GameSessionSnapshot, GambleBrickSummary, unknown], HudScoreboardView>(),
}));

vi.mock('render/hud', () => ({
    buildHudScoreboard: buildHudScoreboardMock,
}));

const createView = (prompts: readonly HudScoreboardPrompt[] = []): HudScoreboardView => ({
    statusText: '',
    summaryLine: '',
    entries: [],
    prompts,
});

const createPrompt = (overrides?: Partial<HudScoreboardPrompt>): HudScoreboardPrompt => ({
    id: overrides?.id ?? 'other-prompt',
    severity: overrides?.severity ?? 'info',
    message: overrides?.message ?? 'placeholder',
});

describe('createRuntimeHudCoordinator', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        buildHudScoreboardMock.mockReset();
    });

    const createHarness = () => {
        let combo = 0;
        let comboTimer = 0;
        let autoState = { enabled: false, active: false, timer: 0 };
        let nextView = createView();

        const updateSpy = vi.spyOn(hudSetters, 'updateFromRuntime').mockImplementation(() => { });
        const pulseSpy = vi.spyOn(hudSetters, 'pulseCombo').mockImplementation(() => { });
        const resetSpy = vi.spyOn(hudSetters, 'reset').mockImplementation(() => { });

        const scoring = {
            getScoringView: vi.fn(() => ({
                combo,
                comboTimer,
            })),
        };

        const roundMachine = {
            getAutoCompleteState: vi.fn(() => autoState),
            getLevelDifficultyMultiplier: vi.fn(() => 1.5),
        };

        const entropyActions = [
            {
                action: 'burst',
                label: 'Burst',
                hotkey: 'B',
                cost: 25,
                charges: 2,
                affordable: true,
            },
        ] as unknown[];

        const runtimeRewards = {
            getHudEntropyActions: vi.fn(() => entropyActions),
        };

        const powerups = {
            collectHudPowerUps: vi.fn(() => ['shield']),
            resolveRewardView: vi.fn(() => ({ id: 'reward' })),
        };
        const physicsState = {
            currentSpeed: 320,
            baseSpeed: 280,
            maxSpeed: 400,
            gravity: -0.08,
        };

        const sessionSnapshot = {
            status: 'active',
            elapsedTimeMs: 0,
            lastOutcome: null,
            hud: {
                prompts: [],
                momentum: {
                    comboHeat: 0,
                    volleyLength: 0,
                    speedPressure: 0,
                    brickDensity: 0,
                },
                entropy: {
                    stored: 42,
                    charge: 0,
                    trend: 'steady',
                },
            },
        } as unknown as GameSessionSnapshot;

        const gambleStatus: GambleBrickSummary = {
            armedCount: 0,
            primedCount: 0,
            nextExpirationSeconds: null,
            timerSeconds: 0,
            rewardMultiplier: 1,
        };

        buildHudScoreboardMock.mockImplementation(() => nextView);

        const coordinator = createRuntimeHudCoordinator({
            scoring: scoring as never,
            roundMachine: roundMachine as never,
            runtimeRewards: runtimeRewards as never,
            powerups: powerups as never,
            getSessionSnapshot: () => sessionSnapshot,
            getGambleStatus: () => gambleStatus,
            getPhysicsState: () => physicsState,
        });

        return {
            refresh: () => coordinator.refresh(),
            setCombo: (value: number) => {
                combo = value;
            },
            setComboTimer: (value: number) => {
                comboTimer = value;
            },
            setAutoState: (state: typeof autoState) => {
                autoState = state;
            },
            setBaseView: (view: HudScoreboardView) => {
                nextView = view;
            },
            updateSpy,
            pulseSpy,
            resetSpy,
            runtimeRewards,
            powerups,
            roundMachine,
            physicsState,
        };
    };

    it('adds and removes the auto-complete prompt while pulsing on combo gains', () => {
        const harness = createHarness();

        harness.setBaseView(createView([createPrompt()]));
        harness.setAutoState({ enabled: true, active: true, timer: 12 });
        harness.refresh();

        expect(harness.resetSpy).toHaveBeenCalledTimes(1);

        const firstUpdate = harness.updateSpy.mock.calls[0][0];
        expect(firstUpdate.scoreboard.prompts[0]).toMatchObject({
            id: AUTO_PROMPT_ID,
            severity: 'info',
            message: 'Auto clear in 12s',
        });
        expect(firstUpdate.scoreboard.prompts[1]).toMatchObject({ id: 'other-prompt' });
        expect(firstUpdate.activePowerUps).toEqual(['shield']);
        expect(firstUpdate.difficultyMultiplier).toBe(1.5);
        expect(firstUpdate.physics).toEqual(harness.physicsState);
        expect(harness.runtimeRewards.getHudEntropyActions).toHaveBeenCalledWith(42);
        expect(harness.pulseSpy).not.toHaveBeenCalled();

        harness.setCombo(5);
        harness.setComboTimer(1.2);
        harness.setAutoState({ enabled: true, active: true, timer: 2.5 });
        harness.setBaseView(createView());
        harness.refresh();

        const secondUpdate = harness.updateSpy.mock.calls[1][0];
        expect(secondUpdate.scoreboard.prompts[0]).toMatchObject({
            id: AUTO_PROMPT_ID,
            severity: 'warning',
            message: 'Auto clear in 2.5s',
        });
        expect(harness.pulseSpy).toHaveBeenCalledWith(0.75);

        harness.setCombo(1);
        harness.setAutoState({ enabled: false, active: false, timer: 0 });
        harness.setBaseView(createView([
            createPrompt({ id: AUTO_PROMPT_ID, message: 'stale prompt' }),
            createPrompt({ id: 'keep', message: 'keep me' }),
        ]));
        harness.refresh();

        const thirdUpdate = harness.updateSpy.mock.calls[2][0];
        expect(
            thirdUpdate.scoreboard.prompts.find((prompt: HudScoreboardPrompt) => prompt.id === AUTO_PROMPT_ID),
        ).toBeUndefined();
        expect(thirdUpdate.scoreboard.prompts[0]).toMatchObject({ id: 'keep' });
        expect(harness.pulseSpy).toHaveBeenCalledTimes(1);
    });
});
