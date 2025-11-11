import type { LuckyBreakEventBus, LifeLostCause } from 'app/events';
import type { PhysicsBallLaunchController } from 'physics/ball-launch';
import type { Ball } from 'physics/contracts';
import { Vector as MatterVector } from 'physics/matter';
import type { PhysicsWorldHandle } from 'physics/world';
import type { GameSessionManager } from 'app/state';
import type { ReplayBuffer, ReplayRecording } from 'app/replay-buffer';
import type { LevelRuntimeHandle } from '../level-runtime';
import type { RuntimeInput } from './input';
import type { RuntimeScoringHandle } from './scoring';
import type { RoundMachine, BiasPhaseState } from './round-machine';
import type { BiasPhaseCoordinator } from './bias-phase-coordinator';
import type { RuntimeModifiers, RuntimeModifierSnapshot } from './modifiers';
import type { GameplayRuntimeState } from './types';

interface E2EHarnessRuntimeState {
    readonly currentScene: string | null;
    readonly isPaused: boolean;
    readonly loopRunning: boolean;
    readonly livesRemaining: number;
}

interface E2ERoundMachineSnapshot {
    readonly levelIndex: number;
    readonly difficultyMultiplier: number;
    readonly powerUpChanceMultiplier: number;
}

interface E2EBrickVariant {
    readonly style: string;
    readonly form: string;
    readonly rarity: number;
    readonly width: number;
    readonly height: number;
}

interface E2EBrickData {
    readonly variants: {
        readonly neon: readonly E2EBrickVariant[];
        readonly mosaic: readonly E2EBrickVariant[];
        readonly marble: readonly E2EBrickVariant[];
    } | null;
    readonly crackTextures: {
        readonly '1': { width: number; height: number };
        readonly '2': { width: number; height: number };
        readonly '3': { width: number; height: number };
    } | null;
}

interface E2EHarnessControls {
    [key: string]: unknown;
    startGameplay?: () => Promise<void> | void;
    skipLevel?: () => Promise<void> | void;
    loseLife?: (cause?: LifeLostCause) => Promise<void> | void;
    drainLives?: (options?: { leaveOne?: boolean }) => Promise<void> | void;
    pauseGameplay?: () => Promise<void> | void;
    resumeGameplay?: () => Promise<void> | void;
    quitToMenu?: () => Promise<void> | void;
    launchBall?: (direction?: { x: number; y: number }) => Promise<void> | void;
    getRuntimeState?: () => E2EHarnessRuntimeState;
    getBiasPhaseState?: () => BiasPhaseState;
    commitBiasSelection?: (optionId: string) => boolean;
    skipBiasPhase?: () => boolean;
    getRuntimeModifiers?: () => RuntimeModifierSnapshot;
    getRoundMachineSnapshot?: () => E2ERoundMachineSnapshot;
    getReplaySnapshot?: () => ReplayRecording;
    getBrickData?: () => E2EBrickData;
}

export interface RegisterE2EHarnessDeps {
    readonly beginNewSession: () => Promise<void>;
    readonly skipToNextLevel: () => void;
    readonly getCurrentScene: () => string | null;
    readonly isLoopRunning: () => boolean;
    readonly getIsPaused: () => boolean;
    readonly pauseGame: () => void;
    readonly resumeGameplay: () => void;
    readonly quitToMenu: () => Promise<void> | void;
    readonly scoring: RuntimeScoringHandle;
    readonly session: Pick<GameSessionManager, 'snapshot' | 'recordLifeLost' | 'recordEntropyEvent'>;
    readonly syncMomentum: () => void;
    readonly clearExtraBalls: () => void;
    readonly reattachBallToPaddle: () => void;
    readonly renderStageSoon: () => void;
    readonly handleGameOver: () => void;
    readonly runtimeInput: Pick<RuntimeInput, 'resetLaunchTrigger'>;
    readonly launchController: Pick<PhysicsBallLaunchController, 'canLaunch' | 'launch'>;
    readonly physics: Pick<PhysicsWorldHandle, 'detachBallFromPaddle'>;
    readonly ball: Ball;
    readonly runtimeState: Pick<GameplayRuntimeState, 'sessionElapsedSeconds' | 'currentLaunchSpeed'>;
    readonly replayBuffer: Pick<ReplayBuffer, 'recordLaunch' | 'snapshot'>;
    readonly bus: LuckyBreakEventBus;
    readonly roundMachine: Pick<
        RoundMachine,
        'getBiasPhaseState' | 'getCurrentLevelIndex' | 'getLevelDifficultyMultiplier' | 'getPowerUpChanceMultiplier'
    >;
    readonly biasCoordinator: BiasPhaseCoordinator | null;
    readonly runtimeModifiers: RuntimeModifiers;
    readonly levelRuntime: Pick<LevelRuntimeHandle, 'getBrickVariants' | 'getCrackTextures'>;
}

export const registerE2EHarnessControls = ({
    beginNewSession,
    skipToNextLevel,
    getCurrentScene,
    isLoopRunning,
    getIsPaused,
    pauseGame,
    resumeGameplay,
    quitToMenu,
    scoring,
    session,
    syncMomentum,
    clearExtraBalls,
    reattachBallToPaddle,
    renderStageSoon,
    handleGameOver,
    runtimeInput,
    launchController,
    physics,
    ball,
    runtimeState,
    replayBuffer,
    bus,
    roundMachine,
    biasCoordinator,
    runtimeModifiers,
    levelRuntime,
}: RegisterE2EHarnessDeps): void => {
    const candidate = globalThis as { __LB_E2E_HOOKS__?: Record<string, unknown> };
    const controls = (() => {
        const existing = candidate.__LB_E2E_HOOKS__;
        if (typeof existing === 'object' && existing !== null) {
            return existing as E2EHarnessControls;
        }
        const created: E2EHarnessControls = {};
        candidate.__LB_E2E_HOOKS__ = created;
        return created;
    })();

    const resolveCurrentScene = () => getCurrentScene();
    const isGameplaySceneActive = () => resolveCurrentScene() === 'gameplay';
    const isPauseSceneActive = () => resolveCurrentScene() === 'pause';
    const isGameOverSceneActive = () => resolveCurrentScene() === 'game-over';
    const isLevelCompleteSceneActive = () => resolveCurrentScene() === 'level-complete';

    const loseLifeInternal = (cause: LifeLostCause = 'forced-reset') => {
        if (!isGameplaySceneActive()) {
            return;
        }

        const comboBeforeReset = scoring.state.combo;
        session.recordLifeLost(cause);
        session.recordEntropyEvent({ type: 'combo-reset', comboHeat: comboBeforeReset });
        scoring.lifeLost();
        syncMomentum();

        if (session.snapshot().livesRemaining > 0) {
            clearExtraBalls();
            reattachBallToPaddle();
            renderStageSoon();
            return;
        }

        handleGameOver();
    };

    controls.startGameplay = () => beginNewSession();
    controls.skipLevel = () => {
        if (!isGameplaySceneActive()) {
            return;
        }
        skipToNextLevel();
    };
    controls.loseLife = (cause?: LifeLostCause) => {
        loseLifeInternal(cause ?? 'forced-reset');
    };
    controls.drainLives = (options?: { leaveOne?: boolean }) => {
        if (!isGameplaySceneActive()) {
            return;
        }
        const targetLives = options?.leaveOne === true ? 1 : 0;
        while (session.snapshot().livesRemaining > targetLives) {
            loseLifeInternal('forced-reset');
            if (session.snapshot().livesRemaining <= targetLives || !isGameplaySceneActive()) {
                break;
            }
        }
    };
    controls.pauseGameplay = () => {
        if (!isGameplaySceneActive() || getIsPaused() || !isLoopRunning()) {
            return;
        }
        pauseGame();
    };
    controls.resumeGameplay = () => {
        if (!isPauseSceneActive() || !getIsPaused()) {
            return;
        }
        resumeGameplay();
    };
    controls.quitToMenu = () => {
        if (
            !isGameplaySceneActive() &&
            !isPauseSceneActive() &&
            !isGameOverSceneActive() &&
            !isLevelCompleteSceneActive()
        ) {
            return;
        }
        return quitToMenu();
    };
    controls.launchBall = (direction?: { x: number; y: number }) => {
        if (!isGameplaySceneActive() || !launchController.canLaunch(ball)) {
            return;
        }
        const launchDirection = direction ?? { x: 0, y: -1 };
        replayBuffer.recordLaunch(runtimeState.sessionElapsedSeconds);
        physics.detachBallFromPaddle(ball.physicsBody);
        launchController.launch(ball, launchDirection, runtimeState.currentLaunchSpeed);
        runtimeInput.resetLaunchTrigger();
        const snapshot = session.snapshot();
        bus.publish('BallLaunched', {
            sessionId: snapshot.sessionId,
            position: {
                x: ball.physicsBody.position.x,
                y: ball.physicsBody.position.y,
            },
            direction: {
                x: launchDirection.x,
                y: launchDirection.y,
            },
            speed: MatterVector.magnitude(ball.physicsBody.velocity),
        });
    };
    controls.getRuntimeState = () => {
        const currentScene = resolveCurrentScene();
        const snapshot = session.snapshot();
        return {
            currentScene,
            isPaused: getIsPaused(),
            loopRunning: isLoopRunning(),
            livesRemaining: snapshot.livesRemaining,
        } satisfies E2EHarnessRuntimeState;
    };
    controls.getBiasPhaseState = () => roundMachine.getBiasPhaseState();
    controls.commitBiasSelection = (optionId?: string) => {
        if (typeof optionId !== 'string' || optionId.length === 0) {
            return false;
        }
        const automation = biasCoordinator?.getAutomation();
        if (!automation) {
            return false;
        }
        void automation.select(optionId);
        return true;
    };
    controls.skipBiasPhase = () => {
        const automation = biasCoordinator?.getAutomation();
        if (!automation) {
            return false;
        }
        automation.skip();
        return true;
    };
    controls.getRuntimeModifiers = () => runtimeModifiers.getState();
    controls.getRoundMachineSnapshot = () => ({
        levelIndex: roundMachine.getCurrentLevelIndex(),
        difficultyMultiplier: roundMachine.getLevelDifficultyMultiplier(),
        powerUpChanceMultiplier: roundMachine.getPowerUpChanceMultiplier(),
    } satisfies E2ERoundMachineSnapshot);
    controls.getReplaySnapshot = () => replayBuffer.snapshot();
    controls.getBrickData = () => {
        const variants = levelRuntime.getBrickVariants();
        const cracks = levelRuntime.getCrackTextures();
        return {
            variants: variants ? {
                neon: variants.neon.map(v => ({
                    style: v.style,
                    form: v.form,
                    rarity: v.rarity,
                    width: v.texture.width,
                    height: v.texture.height,
                })),
                mosaic: variants.mosaic.map(v => ({
                    style: v.style,
                    form: v.form,
                    rarity: v.rarity,
                    width: v.texture.width,
                    height: v.texture.height,
                })),
                marble: variants.marble.map(v => ({
                    style: v.style,
                    form: v.form,
                    rarity: v.rarity,
                    width: v.texture.width,
                    height: v.texture.height,
                })),
            } : null,
            crackTextures: cracks ? {
                '1': { width: cracks[1].width, height: cracks[1].height },
                '2': { width: cracks[2].width, height: cracks[2].height },
                '3': { width: cracks[3].width, height: cracks[3].height },
            } : null,
        } satisfies E2EBrickData;
    };
};
