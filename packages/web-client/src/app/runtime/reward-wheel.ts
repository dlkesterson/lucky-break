import type { GameConfig } from 'config/game';
import type { Reward, RewardOverride, RewardType } from 'game/rewards';
import type {
    LevelCompleteRewardWheelPayload,
    RewardWheelActions,
    RewardWheelState,
    RewardWheelUpdateResult,
} from 'scenes/level-complete';
import type {
    LuckyBreakEventBus,
    RewardEntropyAction,
    RewardWheelInteractionType,
    RewardWheelWeightSnapshot,
} from 'app/events';
import type { GameSessionSnapshot } from 'app/state';
import type { RoundMachine } from './round-machine';

export interface EntropyActionAttemptResult {
    readonly success: boolean;
    readonly reason?: 'invalid-state' | 'insufficient' | 'locked';
}

export interface RewardWheelOrchestratorDeps {
    readonly wheelSegments: GameConfig['rewards']['wheelSegments'];
    readonly roundMachine: Pick<
        RoundMachine,
        'getPendingReward' | 'isPendingRewardLocked' | 'lockPendingReward'
    >;
    readonly getSessionSnapshot: () => GameSessionSnapshot;
    readonly spendCoins: (amount: number) => boolean;
    readonly entropyCosts: {
        readonly reroll: number;
        readonly lockCoins: number;
    };
    readonly attemptEntropyAction: (action: RewardEntropyAction) => EntropyActionAttemptResult;
    readonly setRewardOverride: (override: RewardOverride | null) => void;
    readonly refreshHud: () => void;
    readonly renderStageSoon: () => void;
    readonly eventBus: Pick<LuckyBreakEventBus, 'publish'>;
    readonly createReward: (type: RewardType) => Reward;
}

export interface RewardWheelOrchestrator {
    readonly buildPayload: () => LevelCompleteRewardWheelPayload;
    readonly getState: () => RewardWheelState;
    readonly reroll: () => Promise<RewardWheelUpdateResult>;
    readonly lock: () => Promise<RewardWheelUpdateResult>;
    readonly publishInteraction: (
        action: RewardWheelInteractionType,
        reward: Reward,
        costs?: { readonly entropyCost?: number; readonly coinsCost?: number },
    ) => void;
}

export const createRewardWheelOrchestrator = ({
    wheelSegments,
    roundMachine,
    getSessionSnapshot,
    spendCoins,
    entropyCosts,
    attemptEntropyAction,
    setRewardOverride,
    refreshHud,
    renderStageSoon,
    eventBus,
    createReward,
}: RewardWheelOrchestratorDeps): RewardWheelOrchestrator => {
    const computeTotalWeight = () => wheelSegments.reduce((sum, segment) => sum + segment.weight, 0);

    const buildOdds = (): LevelCompleteRewardWheelPayload['odds'] => {
        const totalWeight = computeTotalWeight();
        return wheelSegments.map((segment) => ({
            reward: createReward(segment.type),
            weight: segment.weight,
            chance: totalWeight > 0 ? segment.weight / totalWeight : 0,
        }));
    };

    const buildWeightsSnapshot = (): readonly RewardWheelWeightSnapshot[] => {
        const totalWeight = computeTotalWeight();
        return wheelSegments.map((segment) => ({
            type: segment.type,
            weight: segment.weight,
            chance: totalWeight > 0 ? segment.weight / totalWeight : 0,
        } satisfies RewardWheelWeightSnapshot));
    };

    const getState: RewardWheelOrchestrator['getState'] = () => {
        const snapshot = getSessionSnapshot();
        const pendingReward = roundMachine.getPendingReward();
        const locked = roundMachine.isPendingRewardLocked();
        const entropyStored = snapshot.hud.entropy.stored;
        const coins = snapshot.coins;

        return {
            reward: pendingReward ?? null,
            locked,
            entropyStored,
            coins,
            rerollCost: entropyCosts.reroll,
            lockCost: entropyCosts.lockCoins,
            canReroll: Boolean(pendingReward) && !locked && entropyStored >= entropyCosts.reroll,
            canLock: Boolean(pendingReward) && !locked && coins >= entropyCosts.lockCoins,
        } satisfies RewardWheelState;
    };

    const publishInteraction: RewardWheelOrchestrator['publishInteraction'] = (
        action,
        reward,
        costs = {},
    ) => {
        const snapshot = getSessionSnapshot();
        const weights = buildWeightsSnapshot();

        eventBus.publish('RewardWheelInteraction', {
            sessionId: snapshot.sessionId,
            action,
            rewardType: reward.type,
            rewardDuration: reward.duration,
            entropyCost: costs.entropyCost ?? 0,
            coinsCost: costs.coinsCost ?? 0,
            entropyStored: snapshot.entropy.stored,
            coins: snapshot.coins,
            locked: roundMachine.isPendingRewardLocked(),
            weights,
        });
    };

    const reroll: RewardWheelOrchestrator['reroll'] = () => {
        const currentState = getState();
        if (!currentState.reward) {
            return Promise.resolve({
                success: false,
                message: 'No reward to reroll',
                state: currentState,
            });
        }

        const result = attemptEntropyAction('reroll');
        if (!result.success) {
            const message = result.reason === 'insufficient'
                ? 'Not enough entropy'
                : result.reason === 'locked'
                    ? 'Reward is locked'
                    : 'Reroll unavailable';
            return Promise.resolve({
                success: false,
                message,
                state: getState(),
            });
        }

        const updatedState = getState();
        const reward = updatedState.reward ?? currentState.reward;
        publishInteraction('reroll', reward, { entropyCost: entropyCosts.reroll });
        return Promise.resolve({
            success: true,
            message: 'Reward rerolled',
            state: updatedState,
        });
    };

    const lock: RewardWheelOrchestrator['lock'] = () => {
        const currentState = getState();
        const reward = currentState.reward;
        if (!reward) {
            return Promise.resolve({
                success: false,
                message: 'No reward to lock',
                state: currentState,
            });
        }
        if (currentState.locked) {
            return Promise.resolve({
                success: false,
                message: 'Reward already locked',
                state: currentState,
            });
        }

        if (entropyCosts.lockCoins > 0) {
            const paid = spendCoins(entropyCosts.lockCoins);
            if (!paid) {
                return Promise.resolve({
                    success: false,
                    message: 'Not enough coins',
                    state: getState(),
                });
            }
        }

        const locked = roundMachine.lockPendingReward();
        if (!locked) {
            return Promise.resolve({
                success: false,
                message: 'Unable to lock reward',
                state: getState(),
            });
        }

        setRewardOverride({ type: reward.type, duration: reward.duration, persist: false });
        refreshHud();
        renderStageSoon();
        publishInteraction('lock', reward, { coinsCost: entropyCosts.lockCoins });
        return Promise.resolve({
            success: true,
            message: 'Reward locked for next spin',
            state: getState(),
        });
    };

    const actions: RewardWheelActions = {
        reroll: () => reroll(),
        lock: () => lock(),
    };

    const buildPayload: RewardWheelOrchestrator['buildPayload'] = () => ({
        odds: buildOdds(),
        state: getState(),
        actions,
    });

    return {
        buildPayload,
        getState,
        reroll,
        lock,
        publishInteraction,
    } satisfies RewardWheelOrchestrator;
};
