import type { EntropyActionType, LuckyBreakEventBus, RewardEntropyAction } from 'app/events';
import type { GameConfig } from 'config/game';
import type { Reward, RewardOverride, RewardType } from 'game/rewards';
import type { HudEntropyActionDescriptor } from 'render/hud';
import type { RandomManager } from 'util/random';
import type {
    EntropySpendOptions,
    EntropySpendResult,
    GameSessionSnapshot,
} from 'app/state';
import type { RoundMachine } from '../round-machine';
import type { RewardsWorldBridge } from '../contracts';
import {
    createRewardWheelOrchestrator,
    type RewardWheelOrchestrator,
    type EntropyActionAttemptResult,
} from '../reward-wheel';

export interface RuntimeEntropyBinding {
    readonly action: RewardEntropyAction;
    readonly key: string;
    readonly hotkey: string;
    readonly label: string;
}

export interface RuntimeRewardsOptions {
    readonly random: RandomManager;
    readonly roundMachine: RoundMachine;
    readonly sessionNow: () => number;
    readonly getSessionSnapshot: () => GameSessionSnapshot;
    readonly spendStoredEntropy: (options: EntropySpendOptions) => EntropySpendResult;
    readonly spendCoins: (amount: number) => boolean;
    readonly eventBus: Pick<LuckyBreakEventBus, 'publish'>;
    readonly wheelSegments: GameConfig['rewards']['wheelSegments'];
    readonly entropyCosts: Record<RewardEntropyAction, number>;
    readonly entropyBindings: Record<RewardEntropyAction, { key: string; hotkey: string; label: string }>;
    readonly entropyOrder: readonly RewardEntropyAction[];
    readonly lockCoinCost: number;
    readonly spinReward: (random: () => number) => Reward;
    readonly setRewardOverride: (override: RewardOverride | null) => void;
    readonly createReward: (type: RewardType) => Reward;
    readonly worldBridge: RewardsWorldBridge;
}

export interface RuntimeRewardsHandle {
    readonly rewardWheel: RewardWheelOrchestrator;
    readonly attemptEntropyAction: (action: RewardEntropyAction) => EntropyActionAttemptResult;
    readonly getHudEntropyActions: (storedEntropy: number) => HudEntropyActionDescriptor[];
    readonly getActionBindings: () => readonly RuntimeEntropyBinding[];
}

const resolveBinding = (
    bindings: RuntimeRewardsOptions['entropyBindings'],
    action: RewardEntropyAction,
): RuntimeEntropyBinding => {
    const binding = bindings[action];
    if (!binding) {
        throw new Error(`Missing entropy action binding for action "${action}"`);
    }
    return {
        action,
        key: binding.key,
        hotkey: binding.hotkey,
        label: binding.label,
    } satisfies RuntimeEntropyBinding;
};

export const createRuntimeRewards = ({
    random,
    roundMachine,
    sessionNow,
    getSessionSnapshot,
    spendStoredEntropy,
    spendCoins,
    eventBus,
    wheelSegments,
    entropyCosts,
    entropyBindings,
    entropyOrder,
    lockCoinCost,
    spinReward,
    setRewardOverride,
    createReward,
    worldBridge,
}: RuntimeRewardsOptions): RuntimeRewardsHandle => {
    const bindingList: readonly RuntimeEntropyBinding[] = entropyOrder.map((action) =>
        resolveBinding(entropyBindings, action),
    );

    const applyImmediateReroll = (timestamp: number): boolean => {
        const pendingReward = roundMachine.getPendingReward();
        if (!pendingReward) {
            return false;
        }
        if (roundMachine.isPendingRewardLocked()) {
            return false;
        }
        if (!roundMachine.consumeRerollToken(timestamp)) {
            return false;
        }
        const rerolledReward = spinReward(random.random);
        roundMachine.setPendingReward(rerolledReward);
        return true;
    };

    const attemptEntropyAction = (action: RewardEntropyAction): EntropyActionAttemptResult => {
        const snapshot = getSessionSnapshot();
        const status = snapshot.status;

        if (action === 'reroll') {
            if (status !== 'active' && status !== 'completed') {
                return { success: false, reason: 'invalid-state' } satisfies EntropyActionAttemptResult;
            }
            if (roundMachine.isPendingRewardLocked()) {
                return { success: false, reason: 'locked' } satisfies EntropyActionAttemptResult;
            }
        } else if (status !== 'active') {
            return { success: false, reason: 'invalid-state' } satisfies EntropyActionAttemptResult;
        }

        const cost = entropyCosts[action];
        const spendResult = spendStoredEntropy({ action, cost });
        if (!spendResult.success) {
            const reason: EntropyActionAttemptResult['reason'] = spendResult.reason === 'insufficient'
                ? 'insufficient'
                : 'invalid-state';
            return { success: false, reason } satisfies EntropyActionAttemptResult;
        }

        const timestamp = sessionNow();
        let applied = false;

        switch (action) {
            case 'reroll': {
                roundMachine.grantEntropyAction(action, timestamp);
                applied = applyImmediateReroll(timestamp);
                if (applied) {
                    worldBridge.pulseHudCombo(0.3);
                    worldBridge.renderStageSoon();
                }
                break;
            }
            case 'shield': {
                roundMachine.grantEntropyAction(action, timestamp);
                worldBridge.pulseHudCombo(0.4);
                applied = true;
                break;
            }
            case 'bailout': {
                roundMachine.recordBailoutActivation(timestamp);
                worldBridge.clearExtraBalls();
                worldBridge.reattachBallToPaddle();
                worldBridge.resetAutoCompleteCountdown();
                worldBridge.flashPaddleLight(0.55);
                worldBridge.pulseHudCombo(0.5);
                worldBridge.renderStageSoon();
                applied = true;
                break;
            }
        }

        if (applied) {
            worldBridge.requestHudRefresh();
            return { success: true } satisfies EntropyActionAttemptResult;
        }

        return { success: false, reason: 'invalid-state' } satisfies EntropyActionAttemptResult;
    };

    const rewardWheel = createRewardWheelOrchestrator({
        wheelSegments,
        roundMachine,
        getSessionSnapshot,
        spendCoins,
        entropyCosts: {
            reroll: entropyCosts.reroll,
            lockCoins: lockCoinCost,
        },
        attemptEntropyAction,
        setRewardOverride,
        refreshHud: () => worldBridge.requestHudRefresh(),
        renderStageSoon: () => worldBridge.renderStageSoon(),
        eventBus,
        createReward,
    });

    const getHudEntropyActions = (storedEntropy: number): HudEntropyActionDescriptor[] => {
        const state = roundMachine.getEntropyActionState();
        return bindingList.map(({ action, label, hotkey }) => {
            const cost = entropyCosts[action];
            const charges = action === 'reroll'
                ? state.rerollTokens
                : action === 'shield'
                    ? state.shieldCharges
                    : 0;
            const lastActionTimestamp = state.lastAction?.action === action
                ? state.lastAction.timestamp
                : undefined;
            return {
                action,
                label,
                hotkey,
                cost,
                charges,
                affordable: storedEntropy >= cost,
                lastActionTimestamp,
            } satisfies HudEntropyActionDescriptor;
        });
    };

    return {
        rewardWheel,
        attemptEntropyAction,
        getHudEntropyActions,
        getActionBindings: () => bindingList,
    } satisfies RuntimeRewardsHandle;
};
