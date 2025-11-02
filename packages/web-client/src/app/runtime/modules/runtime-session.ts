import type { Container } from 'pixi.js';
import type { GameSessionManager } from 'app/state';
import type { ReplayBuffer } from 'app/replay-buffer';
import type { GameplayRuntimeState } from '../types';
import type { ForeshadowingRuntime } from '../foreshadowing';
import type { RandomManager } from 'util/random';
import type { RuntimeAudioHandle } from './runtime-audio';
import type { RoundMachine, BiasPhaseOption } from '../round-machine';
import type { RuntimePowerups } from '../powerups';
import type { RuntimeModifiers } from '../modifiers';
import type { RuntimeScoringHandle } from '../scoring';

export interface RuntimeSessionCoordinatorOptions {
    readonly runtimeAudio: Pick<RuntimeAudioHandle, 'enableMusic' | 'pushMusicState'>;
    readonly random: RandomManager;
    readonly runtimeState: GameplayRuntimeState;
    readonly replayBuffer: Pick<ReplayBuffer, 'begin'>;
    readonly foreshadowing: Pick<ForeshadowingRuntime, 'reset'>;
    readonly refreshAchievementUpgrades: () => void;
    readonly roundMachine: RoundMachine;
    readonly powerups: Pick<RuntimePowerups, 'reset' | 'activateReward'>;
    readonly runtimeModifiers: RuntimeModifiers;
    readonly createSession: () => GameSessionManager;
    readonly getSession: () => GameSessionManager;
    readonly replaceSession: (session: GameSessionManager) => void;
    readonly resolveInitialLives: () => number;
    readonly toMusicLives: (lives: number) => 1 | 2 | 3;
    readonly transitionToGameplay: () => Promise<void>;
    readonly resetAutoCompleteCountdown: () => void;
    readonly scoring: Pick<RuntimeScoringHandle, 'resetAll' | 'resetCombo'>;
    readonly scoringState: RuntimeScoringHandle['state'];
    readonly syncMomentum: () => void;
    readonly setIsPaused: (paused: boolean) => void;
    readonly containers: {
        readonly game: Pick<Container, 'visible'>;
        readonly hud: Pick<Container, 'visible'>;
    };
    readonly clearExtraBalls: () => void;
    readonly loadLevel: (levelIndex: number) => void;
    readonly getBiasCoordinator: () => { applySelection(selection: BiasPhaseOption | null): void } | null;
    readonly reattachBallToPaddle: () => void;
    readonly refreshHud: () => void;
    readonly startLoop: () => void;
    readonly stopLoopIfRunning: () => void;
}

export interface RuntimeSessionCoordinator {
    beginNewSession(this: void): Promise<void>;
    startLevel(this: void, levelIndex: number, options?: { readonly resetScore?: boolean }): void;
}

export const createRuntimeSessionCoordinator = ({
    runtimeAudio,
    random,
    runtimeState,
    replayBuffer,
    foreshadowing,
    refreshAchievementUpgrades,
    roundMachine,
    powerups,
    runtimeModifiers,
    createSession,
    getSession,
    replaceSession,
    resolveInitialLives,
    toMusicLives,
    transitionToGameplay,
    resetAutoCompleteCountdown,
    scoring,
    scoringState,
    syncMomentum,
    setIsPaused,
    containers,
    clearExtraBalls,
    loadLevel,
    getBiasCoordinator,
    reattachBallToPaddle,
    refreshHud,
    startLoop,
    stopLoopIfRunning,
}: RuntimeSessionCoordinatorOptions): RuntimeSessionCoordinator => {
    const startLevel: RuntimeSessionCoordinator['startLevel'] = (levelIndex, options) => {
        const resetScore = options?.resetScore === true;

        setIsPaused(false);

        containers.game.visible = true;
        containers.hud.visible = true;

        roundMachine.clearLevelAutoCompleted();
        resetAutoCompleteCountdown();

        if (resetScore) {
            scoring.resetAll();
        } else {
            scoring.resetCombo();
        }
        syncMomentum();

        const session = getSession();
        const snapshot = session.snapshot();
        const entropyState = snapshot.entropy;
        const entropyTotal = Math.max(0, (entropyState?.charge ?? 0) + (entropyState?.stored ?? 0));
        roundMachine.startLevel(levelIndex, {
            resetScore,
            combo: scoringState.combo,
            score: scoringState.score,
            coins: snapshot.coins,
            entropyTotal,
        });

        const pendingBiasSelection = roundMachine.consumePendingBiasSelection();

        powerups.reset();
        runtimeModifiers.reset();
        clearExtraBalls();
        foreshadowing.reset();
        loadLevel(levelIndex);

        const biasCoordinator = getBiasCoordinator();
        biasCoordinator?.applySelection(pendingBiasSelection);

        reattachBallToPaddle();

        const pendingReward = roundMachine.getPendingReward();
        if (pendingReward) {
            powerups.activateReward(pendingReward);
            roundMachine.setPendingReward(null);
        } else {
            powerups.activateReward(null);
        }

        refreshHud();
    };

    const beginNewSession: RuntimeSessionCoordinator['beginNewSession'] = async () => {
        stopLoopIfRunning();

        runtimeAudio.enableMusic();
        random.reset();
        const activeSeed = random.seed();
        runtimeState.sessionElapsedSeconds = 0;
        runtimeState.frameTimestampMs = 0;
        runtimeState.lastRecordedInputTarget = null;
        replayBuffer.begin(activeSeed);

        foreshadowing.reset();

        refreshAchievementUpgrades();
        roundMachine.resetForNewSession();

        const session = createSession();
        replaceSession(session);
        runtimeAudio.pushMusicState({
            lives: toMusicLives(resolveInitialLives()),
            combo: 0,
            tempoRatio: 0,
            bricksRemainingRatio: 1,
            warbleIntensity: 0,
        });
        roundMachine.setCurrentLevelIndex(0);
        roundMachine.setPendingReward(null);
        powerups.activateReward(null);
        startLevel(roundMachine.getCurrentLevelIndex(), { resetScore: true });
        await transitionToGameplay();
        startLoop();
    };

    return {
        beginNewSession,
        startLevel,
    } satisfies RuntimeSessionCoordinator;
};
