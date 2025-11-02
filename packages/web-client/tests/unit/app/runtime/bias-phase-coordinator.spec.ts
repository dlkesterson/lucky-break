import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Logger } from 'util/log';
import type { RandomManager } from 'util/random';
import type { StageHandle } from 'render/stage';
import type { GameConfig } from 'config/game';
import type { BiasPhaseOption, RoundMachine } from 'app/runtime/round-machine';
import type { RuntimeModifierSnapshot, RuntimeModifiers } from 'app/runtime/modifiers';
import type { ReplayBuffer } from 'app/replay-buffer';
import type { GameplayRuntimeState } from 'app/runtime/types';
import { createBiasPhaseCoordinator } from 'app/runtime/bias-phase-coordinator';

type RuntimeStateSlice = Pick<GameplayRuntimeState, 'sessionElapsedSeconds'>;

const modifierConfig: GameConfig['modifiers'] = {
    gravity: { min: 0.5, max: 2, step: 0.05, default: 1 },
    restitution: { min: 0.5, max: 1.2, step: 0.05, default: 0.9 },
    paddleWidth: { min: 0.8, max: 1.5, step: 0.05, default: 1 },
    speedGovernor: { min: 0.5, max: 2, step: 0.05, default: 1 },
} as const;

const createLoggerStub = (): Logger => {
    const stub: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => stub),
    };
    return stub;
};

const createRandomStub = (): RandomManager => ({
    seed: () => 1,
    setSeed: vi.fn(),
    reset: vi.fn(),
    next: vi.fn(() => 0.5),
    random: () => 0.5,
    nextInt: vi.fn(() => 0),
    boolean: vi.fn(() => false),
});

const createRuntimeModifiersStub = () => {
    const getState: Mock<[], RuntimeModifierSnapshot> = vi.fn(() => ({
        gravity: 1,
        restitution: 1,
        paddleWidthMultiplier: 1,
        speedGovernorMultiplier: 1,
    }));
    const setGravity: Mock<[number], boolean> = vi.fn<[number], boolean>(() => true);
    const setRestitution: Mock<[number], boolean> = vi.fn<[number], boolean>(() => true);
    const setPaddleWidthMultiplier: Mock<[number], boolean> = vi.fn<[number], boolean>(() => true);
    const setSpeedGovernorMultiplier: Mock<[number], boolean> = vi.fn<[number], boolean>(() => true);
    const reset: Mock<[], void> = vi.fn();

    const runtimeModifiers: RuntimeModifiers = {
        getState: getState as RuntimeModifiers['getState'],
        setGravity: setGravity as RuntimeModifiers['setGravity'],
        setRestitution: setRestitution as RuntimeModifiers['setRestitution'],
        setPaddleWidthMultiplier: setPaddleWidthMultiplier as RuntimeModifiers['setPaddleWidthMultiplier'],
        setSpeedGovernorMultiplier: setSpeedGovernorMultiplier as RuntimeModifiers['setSpeedGovernorMultiplier'],
        reset: reset as RuntimeModifiers['reset'],
    };

    return {
        runtimeModifiers,
        setGravity,
        setRestitution,
        setPaddleWidthMultiplier,
        setSpeedGovernorMultiplier,
    };
};

const createStageStub = () => {
    let currentScene = 'bias-phase';
    let latestPayload: unknown = null;
    const push = vi.fn(async (_name: string, payload?: unknown) => {
        latestPayload = payload ?? null;
    });
    const getCurrentScene = vi.fn(() => currentScene);
    const pop = vi.fn(() => {
        currentScene = 'gameplay';
    });
    const stage = {
        push,
        getCurrentScene,
        pop,
    } as unknown as StageHandle;

    return {
        stage,
        push,
        getCurrentScene,
        pop,
        getLatestPayload: () => latestPayload,
        setScene: (scene: string) => {
            currentScene = scene;
        },
    };
};

interface RoundMachineHarness {
    readonly roundMachine: RoundMachine;
    readonly difficulty: { value: number };
    readonly powerUp: { value: number };
    readonly setBiasPhaseOptions: Mock<(readonly BiasPhaseOption[])[], void>;
    readonly commitBiasSelection: Mock<[string], BiasPhaseOption | null>;
    readonly incrementLevelIndex: Mock<[], number>;
}

const createRoundMachineHarness = (): RoundMachineHarness => {
    const difficulty = { value: 1 };
    const powerUp = { value: 1 };
    let options: BiasPhaseOption[] = [];
    let currentLevel = 0;

    const setBiasPhaseOptions: Mock<[readonly BiasPhaseOption[]], void> = vi.fn((next: readonly BiasPhaseOption[]) => {
        options = next.map((option) => ({ ...option }));
    });

    const commitBiasSelection: Mock<[string], BiasPhaseOption | null> = vi.fn((optionId: string) => {
        return options.find((option) => option.id === optionId) ?? null;
    });

    const incrementLevelIndex: Mock<[], number> = vi.fn(() => {
        currentLevel += 1;
        return currentLevel;
    });

    const roundMachine = {
        resetForNewSession: vi.fn(),
        startLevel: vi.fn(),
        getCurrentLevelIndex: vi.fn(() => currentLevel),
        setCurrentLevelIndex: vi.fn((index: number) => {
            currentLevel = index;
        }),
        incrementLevelIndex: incrementLevelIndex as unknown as RoundMachine['incrementLevelIndex'],
        markLevelAutoCompleted: vi.fn(),
        clearLevelAutoCompleted: vi.fn(),
        isLevelAutoCompleted: vi.fn(() => false),
        getAutoCompleteState: vi.fn(),
        resetAutoCompleteCountdown: vi.fn(),
        beginAutoCompleteCountdown: vi.fn(),
        tickAutoComplete: vi.fn(),
        getPendingReward: vi.fn(() => null),
        setPendingReward: vi.fn(),
        getLevelDifficultyMultiplier: vi.fn(() => difficulty.value),
        setLevelDifficultyMultiplier: vi.fn((value: number) => {
            difficulty.value = value;
        }),
        getPowerUpChanceMultiplier: vi.fn(() => powerUp.value),
        setPowerUpChanceMultiplier: vi.fn((value: number) => {
            powerUp.value = value;
        }),
        incrementLevelBricksBroken: vi.fn(),
        resetLevelBricksBroken: vi.fn(),
        getLevelBricksBroken: vi.fn(),
        updateHighestCombos: vi.fn(),
        getRunHighestCombo: vi.fn(() => 0),
        getRoundHighestCombo: vi.fn(() => 0),
        setRoundHighestCombo: vi.fn(),
        setRoundBaseline: vi.fn(),
        getRoundScoreBaseline: vi.fn(() => 0),
        getRoundCoinBaseline: vi.fn(() => 0),
        enqueueAchievementUnlocks: vi.fn(),
        consumeAchievementNotifications: vi.fn(() => []),
        grantEntropyAction: vi.fn(),
        consumeRerollToken: vi.fn(() => false),
        consumeShieldCharge: vi.fn(() => false),
        recordBailoutActivation: vi.fn(),
        getEntropyActionState: vi.fn(() => ({ rerollTokens: 0, shieldCharges: 0, lastAction: null })),
        lockPendingReward: vi.fn(() => false),
        isPendingRewardLocked: vi.fn(() => false),
        setBiasPhaseOptions: setBiasPhaseOptions as unknown as RoundMachine['setBiasPhaseOptions'],
        commitBiasSelection: commitBiasSelection as unknown as RoundMachine['commitBiasSelection'],
        consumePendingBiasSelection: vi.fn(() => null),
        getBiasPhaseState: vi.fn(() => ({ options: [], pendingSelection: null, lastSelection: null })),
    } as unknown as RoundMachine;

    return {
        roundMachine,
        difficulty,
        powerUp,
        setBiasPhaseOptions,
        commitBiasSelection,
        incrementLevelIndex,
    };
};

describe('createBiasPhaseCoordinator', () => {
    it('applies selection effects to round machine and modifiers', () => {
        const logger = createLoggerStub();
        const random = createRandomStub();
        const modifiersHarness = createRuntimeModifiersStub();
        const stageHarness = createStageStub();
        const roundMachineHarness = createRoundMachineHarness();
        const startLoop = vi.fn();
        const startLevel = vi.fn();
        const renderStageSoon = vi.fn();
        const recordBiasChoice = vi.fn();
        const replaySnapshot = vi.fn();
        const replayBuffer = { recordBiasChoice, snapshot: replaySnapshot } as unknown as ReplayBuffer;
        const runtimeState: RuntimeStateSlice = { sessionElapsedSeconds: 12 };
        const buildSessionSummary = vi.fn(() => ({
            nextLevel: 1,
            score: 0,
            coins: 0,
            lives: 3,
            highestCombo: 0,
        }));

        const coordinator = createBiasPhaseCoordinator({
            logger,
            random,
            roundMachine: roundMachineHarness.roundMachine,
            runtimeModifiers: modifiersHarness.runtimeModifiers,
            modifierConfig,
            stage: stageHarness.stage,
            startLoop,
            startLevel,
            renderStageSoon,
            replayBuffer,
            runtimeState,
            buildSessionSummary,
        });

        const selection: BiasPhaseOption = {
            id: 'bias-test',
            label: 'Test',
            description: 'Example',
            risk: 'bold',
            effects: {
                difficultyMultiplier: 1.25,
                powerUpChanceMultiplier: 1.5,
                modifiers: {
                    gravity: 1.2,
                    restitution: 0.95,
                    paddleWidthMultiplier: 1.1,
                    speedGovernorMultiplier: 1.3,
                },
            },
        } satisfies BiasPhaseOption;

        coordinator.applySelection(selection);

        expect(roundMachineHarness.difficulty.value).toBeCloseTo(1.25, 3);
        expect(roundMachineHarness.powerUp.value).toBeCloseTo(1.5, 3);
        expect(modifiersHarness.setGravity).toHaveBeenCalledWith(1.2);
        expect(modifiersHarness.setRestitution).toHaveBeenCalledWith(0.95);
        expect(modifiersHarness.setPaddleWidthMultiplier).toHaveBeenCalledWith(1.1);
        expect(modifiersHarness.setSpeedGovernorMultiplier).toHaveBeenCalledWith(1.3);
    });

    it('presents bias phase and handles automation commits', async () => {
        const logger = createLoggerStub();
        const random = createRandomStub();
        const modifiersHarness = createRuntimeModifiersStub();
        const stageHarness = createStageStub();
        const roundMachineHarness = createRoundMachineHarness();
        const startLoop = vi.fn();
        const startLevel = vi.fn();
        const renderStageSoon = vi.fn();
        const recordBiasChoice = vi.fn();
        const replaySnapshot = vi.fn();
        const replayBuffer = { recordBiasChoice, snapshot: replaySnapshot } as unknown as ReplayBuffer;
        const runtimeState: RuntimeStateSlice = { sessionElapsedSeconds: 48 };
        const buildSessionSummary = vi.fn((upcoming: number) => ({
            nextLevel: upcoming + 1,
            score: 1234,
            coins: 77,
            lives: 2,
            highestCombo: 5,
        }));

        const coordinator = createBiasPhaseCoordinator({
            logger,
            random,
            roundMachine: roundMachineHarness.roundMachine,
            runtimeModifiers: modifiersHarness.runtimeModifiers,
            modifierConfig,
            stage: stageHarness.stage,
            startLoop,
            startLevel,
            renderStageSoon,
            replayBuffer,
            runtimeState,
            buildSessionSummary,
        });

        coordinator.present();
        await Promise.resolve();

        expect(stageHarness.push).toHaveBeenCalledWith(
            'bias-phase',
            expect.objectContaining({
                session: expect.objectContaining({ nextLevel: 2 }),
                options: expect.arrayContaining([expect.objectContaining({ risk: 'safe' })]),
            }),
        );
        expect(roundMachineHarness.setBiasPhaseOptions).toHaveBeenCalled();

        const automation = coordinator.getAutomation();
        expect(automation).not.toBeNull();
        const capturedOptions = (stageHarness.getLatestPayload() as { options: BiasPhaseOption[] }).options;
        automation!.select(capturedOptions[1]?.id ?? '');
        await Promise.resolve();

        expect(roundMachineHarness.commitBiasSelection).toHaveBeenCalled();
        expect(recordBiasChoice).toHaveBeenCalledWith(expect.any(String), runtimeState.sessionElapsedSeconds);
        expect(stageHarness.pop).toHaveBeenCalled();
        expect(roundMachineHarness.incrementLevelIndex).toHaveBeenCalled();
        expect(startLevel).toHaveBeenCalled();
        expect(startLoop).toHaveBeenCalled();
        expect(renderStageSoon).toHaveBeenCalled();
        expect(coordinator.getAutomation()).toBeNull();
    });

    it('supports skipping via automation', async () => {
        const logger = createLoggerStub();
        const random = createRandomStub();
        const modifiersHarness = createRuntimeModifiersStub();
        const stageHarness = createStageStub();
        const roundMachineHarness = createRoundMachineHarness();
        const startLoop = vi.fn();
        const startLevel = vi.fn();
        const renderStageSoon = vi.fn();
        const skipRecordBiasChoice = vi.fn();
        const skipReplaySnapshot = vi.fn();
        const replayBuffer = { recordBiasChoice: skipRecordBiasChoice, snapshot: skipReplaySnapshot } as unknown as ReplayBuffer;
        const runtimeState: RuntimeStateSlice = { sessionElapsedSeconds: 7 };
        const buildSessionSummary = vi.fn(() => ({
            nextLevel: 2,
            score: 0,
            coins: 0,
            lives: 3,
            highestCombo: 0,
        }));

        const coordinator = createBiasPhaseCoordinator({
            logger,
            random,
            roundMachine: roundMachineHarness.roundMachine,
            runtimeModifiers: modifiersHarness.runtimeModifiers,
            modifierConfig,
            stage: stageHarness.stage,
            startLoop,
            startLevel,
            renderStageSoon,
            replayBuffer,
            runtimeState,
            buildSessionSummary,
        });

        coordinator.present();
        await Promise.resolve();

        const automation = coordinator.getAutomation();
        expect(automation).not.toBeNull();
        automation!.skip();
        await Promise.resolve();

        expect(stageHarness.pop).toHaveBeenCalled();
        expect(roundMachineHarness.incrementLevelIndex).toHaveBeenCalled();
        expect(startLevel).toHaveBeenCalled();
        expect(startLoop).toHaveBeenCalled();
        expect(renderStageSoon).toHaveBeenCalled();
        expect(coordinator.getAutomation()).toBeNull();
    });
});
