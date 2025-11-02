import type { Logger } from 'util/log';
import type { RandomManager } from 'util/random';
import type { StageHandle } from 'render/stage';
import type { ScoreState } from 'util/scoring';
import type { Reward } from 'game/rewards';
import type { LuckyBreakEventBus } from 'app/events';
import type { RoundMachine } from '../round-machine';
import type { RuntimeModifiers } from '../modifiers';
import type { ReplayBuffer } from 'app/replay-buffer';
import type { GameplayRuntimeState } from '../types';
import type { RewardWheelOrchestrator } from '../reward-wheel';
import type { AchievementManager } from '../../achievements';
import type { MetaUpgradeManager } from '../../meta-upgrades';
import { createBiasPhaseCoordinator, type BiasPhaseCoordinator } from '../bias-phase-coordinator';
import type { BiasPhaseSessionSummary } from 'scenes/bias-phase';
import type { GameSessionSnapshot } from 'app/state';
import type { PrestigeAwardInput } from 'util/prestige';
import type { GameConfig } from 'config/game';
import type { RecordHighScoreOptions } from 'util/high-scores';

export interface RuntimeRoundCoordinatorOptions {
    readonly logger: Logger;
    readonly random: RandomManager;
    readonly roundMachine: RoundMachine;
    readonly runtimeModifiers: RuntimeModifiers;
    readonly modifierConfig: GameConfig['modifiers'];
    readonly stage: StageHandle;
    readonly startLoop: () => void;
    readonly stopLoop: () => void;
    readonly startLevel: (levelIndex: number) => void;
    readonly renderStageSoon: () => void;
    readonly replayBuffer: ReplayBuffer;
    readonly runtimeState: Pick<GameplayRuntimeState, 'sessionElapsedSeconds'>;
    readonly getSessionSnapshot: () => GameSessionSnapshot;
    readonly achievements: Pick<AchievementManager, 'recordRoundComplete' | 'recordSessionSummary'>;
    readonly refreshAchievementUpgrades: () => void;
    readonly scoringState: ScoreState;
    readonly sessionNow: () => number;
    readonly rewardWheel: Pick<RewardWheelOrchestrator, 'buildPayload' | 'publishInteraction'>;
    readonly resetAutoCompleteCountdown: () => void;
    readonly clearExtraBalls: () => void;
    readonly resetForeshadowing: () => void;
    readonly setPaused: (paused: boolean) => void;
    readonly spinReward: (rng: () => number) => Reward;
    readonly entropyCosts: {
        readonly reroll: number;
    };
    readonly metaUpgrades: Pick<MetaUpgradeManager, 'grantDust'>;
    readonly powerupsReset: () => void;
    readonly disableMusic: () => void;
    readonly bus: Pick<LuckyBreakEventBus, 'publish'>;
    readonly computePrestigeDust: (input: PrestigeAwardInput) => number;
    readonly recordHighScore: (score: number, options: RecordHighScoreOptions) => void;
}

export interface RuntimeRoundCoordinatorHandle {
    handleLevelComplete(): void;
    handleGameOver(): void;
    getBiasCoordinator(): BiasPhaseCoordinator | null;
}

export const createRuntimeRoundCoordinator = ({
    logger,
    random,
    roundMachine,
    runtimeModifiers,
    modifierConfig,
    stage,
    startLoop,
    stopLoop,
    startLevel,
    renderStageSoon,
    replayBuffer,
    runtimeState,
    getSessionSnapshot,
    achievements,
    refreshAchievementUpgrades,
    scoringState,
    sessionNow,
    rewardWheel,
    resetAutoCompleteCountdown,
    clearExtraBalls,
    resetForeshadowing,
    setPaused,
    spinReward,
    entropyCosts,
    metaUpgrades,
    powerupsReset,
    disableMusic,
    bus,
    computePrestigeDust,
    recordHighScore,
}: RuntimeRoundCoordinatorOptions): RuntimeRoundCoordinatorHandle => {
    const buildBiasSessionSummary = (upcomingLevelIndex: number): BiasPhaseSessionSummary => {
        const snapshot = getSessionSnapshot();
        return {
            nextLevel: upcomingLevelIndex + 1,
            score: scoringState.score,
            coins: snapshot.coins,
            lives: snapshot.livesRemaining,
            highestCombo: roundMachine.getRunHighestCombo(),
        } satisfies BiasPhaseSessionSummary;
    };

    const biasCoordinator = createBiasPhaseCoordinator({
        logger,
        random,
        roundMachine,
        runtimeModifiers,
        modifierConfig,
        stage,
        startLoop,
        startLevel,
        renderStageSoon,
        replayBuffer,
        runtimeState,
        buildSessionSummary: buildBiasSessionSummary,
    });

    const presentBiasPhase = (): void => {
        if (!biasCoordinator) {
            logger.error('Bias phase coordinator unavailable; skipping bias phase');
            const nextLevelIndex = roundMachine.incrementLevelIndex();
            startLevel(nextLevelIndex);
            startLoop();
            renderStageSoon();
            return;
        }
        biasCoordinator.present();
    };

    const handleLevelComplete = (): void => {
        clearExtraBalls();
        resetForeshadowing();
        setPaused(false);
        stopLoop();

        const rollReward = () => spinReward(random.random);

        let finalReward = rollReward();
        let rerollCount = 0;
        while (roundMachine.consumeRerollToken(sessionNow()) && rerollCount < 5) {
            finalReward = rollReward();
            rerollCount += 1;
        }
        roundMachine.setPendingReward(finalReward);
        rewardWheel.publishInteraction('initial-spin', finalReward, {
            entropyCost: rerollCount * entropyCosts.reroll,
            coinsCost: 0,
        });
        resetAutoCompleteCountdown();

        const autoCompletedThisLevel = roundMachine.isLevelAutoCompleted();
        roundMachine.clearLevelAutoCompleted();

        const roundUnlocks = achievements.recordRoundComplete({
            bricksBroken: roundMachine.getLevelBricksBroken(),
        });
        if (roundUnlocks.length > 0) {
            roundMachine.enqueueAchievementUnlocks(roundUnlocks);
            refreshAchievementUpgrades();
        }

        const achievementsToShow = roundMachine.consumeAchievementNotifications();
        const sessionSnapshot = getSessionSnapshot();
        const hudSnapshot = sessionSnapshot.hud;

        const bricksBroken = Math.max(0, hudSnapshot.brickTotal - hudSnapshot.brickRemaining);
        const roundScoreGain = Math.max(0, scoringState.score - roundMachine.getRoundScoreBaseline());
        const coinsCollected = Math.max(0, sessionSnapshot.coins - roundMachine.getRoundCoinBaseline());
        const durationMs = sessionSnapshot.lastOutcome?.durationMs ?? 0;
        const volleyLength = hudSnapshot.momentum.volleyLength;
        const speedPressure = hudSnapshot.momentum.speedPressure;

        const milestones: string[] = [];
        if (roundScoreGain > 0) {
            milestones.push(`+${roundScoreGain.toLocaleString()} points`);
        }
        const roundBestCombo = roundMachine.getRoundHighestCombo();
        if (roundBestCombo > 0) {
            milestones.push(`Combo x${roundBestCombo}`);
        }
        if (autoCompletedThisLevel) {
            milestones.push('Auto Clear Assist');
        }
        if (coinsCollected > 0) {
            milestones.push(`${coinsCollected.toLocaleString()} coins banked`);
        }
        if (hudSnapshot.brickTotal > 0 && bricksBroken === hudSnapshot.brickTotal) {
            milestones.push('Perfect Clear');
        }
        if (volleyLength >= 25) {
            milestones.push(`Volley ${volleyLength}`);
        }

        roundMachine.setRoundBaseline(scoringState.score, sessionSnapshot.coins);
        roundMachine.setRoundHighestCombo(scoringState.combo);
        roundMachine.resetLevelBricksBroken();

        const completedLevel = roundMachine.getCurrentLevelIndex() + 1;
        let handled = false;
        const continueToNextLevel = () => {
            if (handled) {
                return;
            }
            handled = true;
            if (stage.getCurrentScene() === 'level-complete') {
                stage.pop();
            }
            presentBiasPhase();
        };

        const rewardWheelPayload = rewardWheel.buildPayload();

        void stage.push('level-complete', {
            level: completedLevel,
            score: scoringState.score,
            reward: roundMachine.getPendingReward() ?? undefined,
            achievements: achievementsToShow.length > 0 ? achievementsToShow : undefined,
            recap: {
                roundScore: roundScoreGain,
                totalScore: scoringState.score,
                bricksBroken,
                brickTotal: hudSnapshot.brickTotal,
                bestCombo: roundBestCombo,
                volleyLength,
                speedPressure,
                coinsCollected,
                durationMs,
            },
            milestones: milestones.length > 0 ? milestones : undefined,
            rewardWheel: rewardWheelPayload,
            onContinue: continueToNextLevel,
        })
            .then(() => {
                renderStageSoon();
            })
            .catch((error) => {
                logger.error('Failed to push level-complete overlay', { error });
                continueToNextLevel();
            });
    };

    const handleGameOver = (): void => {
        clearExtraBalls();
        resetForeshadowing();
        setPaused(false);
        stopLoop();
        roundMachine.setPendingReward(null);
        powerupsReset();
        disableMusic();

        const sessionSnapshot = getSessionSnapshot();
        const roundsCompleted = Math.max(1, roundMachine.getCurrentLevelIndex() + 1);
        const highestCombo = roundMachine.getRunHighestCombo();

        const sessionUnlocks = achievements.recordSessionSummary({ highestCombo });
        if (sessionUnlocks.length > 0) {
            roundMachine.enqueueAchievementUnlocks(sessionUnlocks);
            refreshAchievementUpgrades();
        }

        const achievementsToShow = roundMachine.consumeAchievementNotifications();
        recordHighScore(scoringState.score, {
            round: roundsCompleted,
            achievedAt: Date.now(),
            minScore: 1,
        } satisfies RecordHighScoreOptions);

        const dustAwarded = computePrestigeDust({
            score: scoringState.score,
            roundsCompleted,
            highestCombo,
            coinsBanked: sessionSnapshot.coins,
        });

        if (dustAwarded > 0) {
            const grantResult = metaUpgrades.grantDust(dustAwarded);
            logger.info('Prestige dust granted', {
                dustAwarded,
                dustBalance: grantResult.dustBalance,
                roundsCompleted,
                highestCombo,
                score: scoringState.score,
                coins: sessionSnapshot.coins,
            });

            bus.publish('PrestigeConversion', {
                sessionId: sessionSnapshot.sessionId,
                totalScore: scoringState.score,
                roundsCompleted,
                highestCombo,
                coins: sessionSnapshot.coins,
                dustAwarded,
                timestamp: Date.now(),
            });
        }

        void stage.push('game-over', {
            score: scoringState.score,
            achievements: achievementsToShow.length > 0 ? achievementsToShow : undefined,
            dustAwarded: dustAwarded > 0 ? dustAwarded : undefined,
        })
            .then(() => {
                renderStageSoon();
            })
            .catch((error) => {
                logger.error('Failed to push game-over overlay', { error });
                if (stage.getCurrentScene() === 'game-over') {
                    stage.pop();
                    renderStageSoon();
                }
            });
    };

    return {
        handleLevelComplete,
        handleGameOver,
        getBiasCoordinator: () => biasCoordinator,
    } satisfies RuntimeRoundCoordinatorHandle;
};
