import type { AchievementUnlock } from '../achievements';
import type { Reward } from 'game/rewards';

export interface RoundMachineOptions {
    readonly autoCompleteEnabled: boolean;
    readonly autoCompleteCountdown: number;
    readonly autoCompleteTrigger: number;
}

export interface AutoCompleteState {
    readonly enabled: boolean;
    readonly countdown: number;
    readonly trigger: number;
    readonly active: boolean;
    readonly timer: number;
}

export interface AutoCompleteTickArgs {
    readonly deltaSeconds: number;
    readonly bricksRemaining: number;
    readonly sessionActive: boolean;
}

export interface AutoCompleteTickResult {
    readonly triggered: boolean;
    readonly stateChanged: boolean;
}

export interface RoundMachine {
    resetForNewSession(): void;
    startLevel(levelIndex: number, context: { resetScore: boolean; combo: number; score: number; coins: number }): void;
    getCurrentLevelIndex(): number;
    setCurrentLevelIndex(index: number): void;
    incrementLevelIndex(): number;
    markLevelAutoCompleted(): void;
    clearLevelAutoCompleted(): void;
    isLevelAutoCompleted(): boolean;
    getAutoCompleteState(): AutoCompleteState;
    resetAutoCompleteCountdown(): void;
    beginAutoCompleteCountdown(): void;
    tickAutoComplete(args: AutoCompleteTickArgs): AutoCompleteTickResult;
    getPendingReward(): Reward | null;
    setPendingReward(reward: Reward | null): void;
    getLevelDifficultyMultiplier(): number;
    setLevelDifficultyMultiplier(value: number): void;
    getPowerUpChanceMultiplier(): number;
    setPowerUpChanceMultiplier(value: number): void;
    incrementLevelBricksBroken(): number;
    resetLevelBricksBroken(): void;
    getLevelBricksBroken(): number;
    updateHighestCombos(combo: number): void;
    getRunHighestCombo(): number;
    getRoundHighestCombo(): number;
    setRoundHighestCombo(combo: number): void;
    setRoundBaseline(score: number, coins: number): void;
    getRoundScoreBaseline(): number;
    getRoundCoinBaseline(): number;
    enqueueAchievementUnlocks(unlocks: readonly AchievementUnlock[]): void;
    consumeAchievementNotifications(): readonly AchievementUnlock[];
}

export const createRoundMachine = ({
    autoCompleteEnabled,
    autoCompleteCountdown,
    autoCompleteTrigger,
}: RoundMachineOptions): RoundMachine => {
    const countdown = Math.max(1, autoCompleteCountdown);
    const trigger = Math.max(1, autoCompleteTrigger);

    let currentLevelIndex = 0;
    let runHighestCombo = 0;
    let levelBricksBroken = 0;
    let roundHighestCombo = 0;
    let roundScoreBaseline = 0;
    let roundCoinBaseline = 0;
    let levelAutoCompleted = false;
    let autoCompleteActive = false;
    let autoCompleteTimer = countdown;
    let levelDifficultyMultiplier = 1;
    let powerUpChanceMultiplier = 1;
    let pendingReward: Reward | null = null;
    const pendingAchievementNotifications: AchievementUnlock[] = [];

    const getAutoCompleteState = (): AutoCompleteState => ({
        enabled: autoCompleteEnabled,
        countdown,
        trigger,
        active: autoCompleteActive,
        timer: autoCompleteTimer,
    });

    const resetAutoCompleteCountdown = () => {
        autoCompleteActive = false;
        autoCompleteTimer = countdown;
    };

    const beginAutoCompleteCountdown = () => {
        autoCompleteActive = true;
        autoCompleteTimer = countdown;
    };

    const tickAutoComplete = ({ deltaSeconds, bricksRemaining, sessionActive }: AutoCompleteTickArgs): AutoCompleteTickResult => {
        let stateChanged = false;
        let triggered = false;

        if (!autoCompleteEnabled) {
            if (autoCompleteActive) {
                resetAutoCompleteCountdown();
                stateChanged = true;
            }
            return { triggered: false, stateChanged } satisfies AutoCompleteTickResult;
        }

        if (!sessionActive) {
            if (autoCompleteActive) {
                resetAutoCompleteCountdown();
                stateChanged = true;
            }
            return { triggered: false, stateChanged } satisfies AutoCompleteTickResult;
        }

        if (bricksRemaining > 0 && bricksRemaining <= trigger) {
            if (!autoCompleteActive) {
                beginAutoCompleteCountdown();
                stateChanged = true;
            } else {
                const nextTimer = Math.max(0, autoCompleteTimer - deltaSeconds);
                if (nextTimer !== autoCompleteTimer) {
                    autoCompleteTimer = nextTimer;
                    stateChanged = true;
                }
                if (autoCompleteTimer === 0) {
                    levelAutoCompleted = true;
                    resetAutoCompleteCountdown();
                    triggered = true;
                    stateChanged = true;
                }
            }
        } else if (autoCompleteActive) {
            resetAutoCompleteCountdown();
            stateChanged = true;
        }

        return { triggered, stateChanged } satisfies AutoCompleteTickResult;
    };

    const updateHighestCombos = (combo: number) => {
        if (combo > runHighestCombo) {
            runHighestCombo = combo;
        }
        if (combo > roundHighestCombo) {
            roundHighestCombo = combo;
        }
    };

    const enqueueAchievementUnlocks = (unlocks: readonly AchievementUnlock[]) => {
        if (unlocks.length === 0) {
            return;
        }
        pendingAchievementNotifications.push(...unlocks);
    };

    const consumeAchievementNotifications = (): readonly AchievementUnlock[] => {
        if (pendingAchievementNotifications.length === 0) {
            return [];
        }
        const notifications = pendingAchievementNotifications.slice();
        pendingAchievementNotifications.length = 0;
        return notifications;
    };

    return {
        resetForNewSession: () => {
            currentLevelIndex = 0;
            runHighestCombo = 0;
            levelBricksBroken = 0;
            roundHighestCombo = 0;
            roundScoreBaseline = 0;
            roundCoinBaseline = 0;
            levelAutoCompleted = false;
            resetAutoCompleteCountdown();
            levelDifficultyMultiplier = 1;
            powerUpChanceMultiplier = 1;
            pendingReward = null;
            pendingAchievementNotifications.length = 0;
        },
        startLevel: (levelIndex, { combo, score, coins }) => {
            currentLevelIndex = levelIndex;
            levelAutoCompleted = false;
            resetAutoCompleteCountdown();
            levelBricksBroken = 0;
            roundHighestCombo = combo;
            roundScoreBaseline = Math.max(0, score);
            roundCoinBaseline = coins;
        },
        getCurrentLevelIndex: () => currentLevelIndex,
        setCurrentLevelIndex: (index: number) => {
            currentLevelIndex = Math.max(0, index);
        },
        incrementLevelIndex: () => {
            currentLevelIndex += 1;
            return currentLevelIndex;
        },
        markLevelAutoCompleted: () => {
            levelAutoCompleted = true;
        },
        clearLevelAutoCompleted: () => {
            levelAutoCompleted = false;
        },
        isLevelAutoCompleted: () => levelAutoCompleted,
        getAutoCompleteState,
        resetAutoCompleteCountdown,
        beginAutoCompleteCountdown,
        tickAutoComplete,
        getPendingReward: () => pendingReward,
        setPendingReward: (reward) => {
            pendingReward = reward;
        },
        getLevelDifficultyMultiplier: () => levelDifficultyMultiplier,
        setLevelDifficultyMultiplier: (value: number) => {
            levelDifficultyMultiplier = Number.isFinite(value) && value > 0 ? value : 1;
        },
        getPowerUpChanceMultiplier: () => powerUpChanceMultiplier,
        setPowerUpChanceMultiplier: (value: number) => {
            powerUpChanceMultiplier = Number.isFinite(value) && value > 0 ? value : 1;
        },
        incrementLevelBricksBroken: () => {
            levelBricksBroken += 1;
            return levelBricksBroken;
        },
        resetLevelBricksBroken: () => {
            levelBricksBroken = 0;
        },
        getLevelBricksBroken: () => levelBricksBroken,
        updateHighestCombos,
        getRunHighestCombo: () => runHighestCombo,
        getRoundHighestCombo: () => roundHighestCombo,
        setRoundHighestCombo: (combo: number) => {
            roundHighestCombo = Math.max(0, combo);
        },
        setRoundBaseline: (score: number, coins: number) => {
            roundScoreBaseline = Math.max(0, score);
            roundCoinBaseline = Math.max(0, coins);
        },
        getRoundScoreBaseline: () => roundScoreBaseline,
        getRoundCoinBaseline: () => roundCoinBaseline,
        enqueueAchievementUnlocks,
        consumeAchievementNotifications,
    } satisfies RoundMachine;
};
