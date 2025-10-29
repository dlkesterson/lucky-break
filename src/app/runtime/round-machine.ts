import type { AchievementUnlock } from '../achievements';
import type { EntropyActionType } from '../events';
import type { Reward } from 'game/rewards';
import type { RuntimeModifierSnapshot } from './modifiers';

export type BiasOptionRisk = 'safe' | 'bold' | 'volatile';

export interface BiasPhaseEffects {
    readonly modifiers?: Partial<RuntimeModifierSnapshot>;
    readonly difficultyMultiplier?: number;
    readonly powerUpChanceMultiplier?: number;
}

export interface BiasPhaseOption {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly risk: BiasOptionRisk;
    readonly effects: BiasPhaseEffects;
}

export interface BiasPhaseState {
    readonly options: readonly BiasPhaseOption[];
    readonly pendingSelection: BiasPhaseOption | null;
    readonly lastSelection: BiasPhaseOption | null;
}

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
    grantEntropyAction(action: EntropyActionType, timestamp: number): void;
    consumeRerollToken(timestamp: number): boolean;
    consumeShieldCharge(timestamp: number): boolean;
    recordBailoutActivation(timestamp: number): void;
    getEntropyActionState(): EntropyActionState;
    lockPendingReward(): boolean;
    isPendingRewardLocked(): boolean;
    setBiasPhaseOptions(options: readonly BiasPhaseOption[]): void;
    commitBiasSelection(optionId: string): BiasPhaseOption | null;
    consumePendingBiasSelection(): BiasPhaseOption | null;
    getBiasPhaseState(): BiasPhaseState;
}

export interface EntropyActionState {
    readonly rerollTokens: number;
    readonly shieldCharges: number;
    readonly lastAction: {
        readonly action: EntropyActionType;
        readonly timestamp: number;
    } | null;
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
    let rewardLocked = false;
    const pendingAchievementNotifications: AchievementUnlock[] = [];
    let rerollTokens = 0;
    let shieldCharges = 0;
    let lastEntropyAction: EntropyActionState['lastAction'] = null;
    let biasOptions: readonly BiasPhaseOption[] = [];
    let pendingBiasSelection: BiasPhaseOption | null = null;
    let lastBiasSelection: BiasPhaseOption | null = null;

    const MAX_STORED_ACTIONS = 3;

    const normalizeTimestamp = (timestamp: number): number => (Number.isFinite(timestamp) ? timestamp : Date.now());

    const markEntropyAction = (action: EntropyActionType, timestamp: number): void => {
        lastEntropyAction = {
            action,
            timestamp: normalizeTimestamp(timestamp),
        } satisfies EntropyActionState['lastAction'];
    };

    const grantEntropyAction = (action: EntropyActionType, timestamp: number): void => {
        markEntropyAction(action, timestamp);
        if (action === 'reroll') {
            rerollTokens = Math.min(MAX_STORED_ACTIONS, rerollTokens + 1);
        } else if (action === 'shield') {
            shieldCharges = Math.min(MAX_STORED_ACTIONS, shieldCharges + 1);
        }
    };

    const consumeRerollToken = (timestamp: number): boolean => {
        if (rerollTokens <= 0 || rewardLocked) {
            return false;
        }
        rerollTokens -= 1;
        markEntropyAction('reroll', timestamp);
        return true;
    };

    const consumeShieldCharge = (timestamp: number): boolean => {
        if (shieldCharges <= 0) {
            return false;
        }
        shieldCharges -= 1;
        markEntropyAction('shield', timestamp);
        return true;
    };

    const recordBailoutActivation = (timestamp: number): void => {
        markEntropyAction('bailout', timestamp);
    };

    const getEntropyActionState = (): EntropyActionState => ({
        rerollTokens,
        shieldCharges,
        lastAction: lastEntropyAction,
    });

    const lockPendingReward = (): boolean => {
        if (!pendingReward || rewardLocked) {
            return false;
        }
        rewardLocked = true;
        return true;
    };

    const isPendingRewardLocked = (): boolean => rewardLocked;

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

    const cloneBiasOption = (option: BiasPhaseOption): BiasPhaseOption => ({
        id: option.id,
        label: option.label,
        description: option.description,
        risk: option.risk,
        effects: {
            modifiers: option.effects.modifiers ? { ...option.effects.modifiers } : undefined,
            difficultyMultiplier: option.effects.difficultyMultiplier,
            powerUpChanceMultiplier: option.effects.powerUpChanceMultiplier,
        },
    });

    const setBiasPhaseOptions = (options: readonly BiasPhaseOption[]) => {
        biasOptions = options.map(cloneBiasOption);
        pendingBiasSelection = null;
    };

    const commitBiasSelection = (optionId: string): BiasPhaseOption | null => {
        const option = biasOptions.find((candidate) => candidate.id === optionId);
        if (!option) {
            return null;
        }
        const committed = cloneBiasOption(option);
        pendingBiasSelection = committed;
        lastBiasSelection = committed;
        biasOptions = [];
        return cloneBiasOption(committed);
    };

    const consumePendingBiasSelection = (): BiasPhaseOption | null => {
        if (!pendingBiasSelection) {
            return null;
        }
        const selection = cloneBiasOption(pendingBiasSelection);
        pendingBiasSelection = null;
        return selection;
    };

    const getBiasPhaseState = (): BiasPhaseState => ({
        options: biasOptions.map(cloneBiasOption),
        pendingSelection: pendingBiasSelection ? cloneBiasOption(pendingBiasSelection) : null,
        lastSelection: lastBiasSelection ? cloneBiasOption(lastBiasSelection) : null,
    });

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
            rewardLocked = false;
            pendingAchievementNotifications.length = 0;
            rerollTokens = 0;
            shieldCharges = 0;
            lastEntropyAction = null;
            biasOptions = [];
            pendingBiasSelection = null;
            lastBiasSelection = null;
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
            rewardLocked = false;
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
        grantEntropyAction,
        consumeRerollToken,
        consumeShieldCharge,
        recordBailoutActivation,
        getEntropyActionState,
        lockPendingReward,
        isPendingRewardLocked,
        setBiasPhaseOptions,
        commitBiasSelection,
        consumePendingBiasSelection,
        getBiasPhaseState,
    } satisfies RoundMachine;
};
