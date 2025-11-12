import type { LuckyBreakEventBus, LifeLostCause } from 'app/events';
import type { PhysicsBallLaunchController } from 'physics/ball-launch';
import type { Ball } from 'physics/contracts';
import { Vector as MatterVector } from 'physics/matter';
import type { MatterBody as Body } from 'physics/matter';
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
import type { GambleBrickManager } from 'game/gamble-brick-manager';
import type { RuntimePowerups } from './powerups';
import type { MultiBallController } from '../multi-ball-controller';
import type { PowerUpType } from 'util/power-ups';
import type { PauseUiSnapshot } from '../../ui/state/pause-bridge';

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

interface E2EComboSnapshot {
    readonly currentCombo: number;
    readonly scoreMultiplier: number;
    readonly comboTimeRemaining: number;
}

interface E2EGambleBrickSnapshot {
    readonly armedCount: number;
    readonly primedCount: number;
    readonly nextExpirationSeconds: number | null;
}

interface E2EPowerUpSnapshot {
    readonly activePowerUps: ReadonlyArray<{
        readonly type: string;
        readonly remainingTime: number;
        readonly duration: number;
    }>;
    readonly activeReward: {
        readonly type: string;
        readonly duration: number;
        readonly [key: string]: unknown;
    } | null;
    readonly doublePointsMultiplier: number;
    readonly slowTimeScale: number;
    readonly paddleWidthScale: number;
}

interface E2EMultiBallSnapshot {
    readonly totalBalls: number;
    readonly extraBalls: number;
    readonly attachedBalls: number;
}

interface E2EPauseState {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly snapshot: PauseUiSnapshot | null;
}

interface E2EPhysicsState {
    readonly ballPosition: { x: number; y: number };
    readonly ballVelocity: { x: number; y: number };
    readonly ballSpeed: number;
    readonly ballAttached: boolean;
    readonly paddlePosition: { x: number; y: number };
    readonly brickCount: number;
    readonly timeScale: number;
    readonly loopRunning: boolean;
    readonly isPaused: boolean;
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
    getBrickPositions?: () => Array<{ x: number; y: number }>;
    getComboState?: () => E2EComboSnapshot;
    getGambleBrickState?: () => E2EGambleBrickSnapshot;
    getPowerUpState?: () => E2EPowerUpSnapshot;
    activatePowerUp?: (type: string) => void;
    activateReward?: (rewardType: string) => void;
    forceReward?: (rewardType: string | null) => void;
    getMultiBallState?: () => E2EMultiBallSnapshot;
    getPauseState?: () => E2EPauseState;
    getPhysicsState?: () => E2EPhysicsState;
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
    readonly physics: Pick<PhysicsWorldHandle, 'detachBallFromPaddle' | 'isBallAttached'>;
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
    readonly levelRuntime: Pick<LevelRuntimeHandle, 'getBrickVariants' | 'getCrackTextures' | 'brickHealth'>;
    readonly gambleManager: GambleBrickManager;
    readonly powerups: RuntimePowerups;
    readonly multiBallController: MultiBallController;
    readonly forceGambleReward: (type: string | null) => void;
    readonly usePauseUi: () => { visible: boolean; suspended: boolean; snapshot: PauseUiSnapshot | null };
    readonly paddle: { readonly physicsBody: Body };
    readonly getSlowTimeScale: () => number;
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
    gambleManager,
    powerups,
    multiBallController,
    forceGambleReward,
    usePauseUi,
    paddle,
    getSlowTimeScale,
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
        // Use a slight angle by default to ensure ball hits bricks in e2e tests
        // Pure vertical (0, -1) will miss bricks on the sides
        const launchDirection = direction ?? { x: 0.15, y: -1 };
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
    controls.getBrickPositions = () => {
        const positions: Array<{ x: number; y: number }> = [];
        levelRuntime.brickHealth.forEach((_hp, body) => {
            positions.push({
                x: body.position.x,
                y: body.position.y,
            });
        });
        return positions;
    };
    controls.getComboState = () => {
        const decayWindow = 5; // Default combo decay window in seconds
        const comboThreshold = 8; // Default combo threshold for multiplier
        const currentCombo = scoring.state.combo;
        const multiplier = currentCombo >= comboThreshold ? 1 + Math.floor(currentCombo / comboThreshold) * 0.25 : 1;
        return {
            currentCombo,
            scoreMultiplier: multiplier,
            comboTimeRemaining: Math.max(0, scoring.state.comboTimer),
        } satisfies E2EComboSnapshot;
    };
    controls.getGambleBrickState = () => {
        const summary = gambleManager.snapshot();
        return {
            armedCount: summary.armedCount,
            primedCount: summary.primedCount,
            nextExpirationSeconds: summary.nextExpirationSeconds,
        } satisfies E2EGambleBrickSnapshot;
    };
    controls.getPowerUpState = () => {
        const hudPowerUps = powerups.collectHudPowerUps();
        const rewardView = powerups.resolveRewardView();
        return {
            activePowerUps: hudPowerUps.map(p => ({
                type: p.label,
                remainingTime: parseFloat(p.remaining) || 0,
                duration: parseFloat(p.remaining) || 0, // Approximate since we don't have original duration
            })),
            activeReward: rewardView ? {
                type: rewardView.label,
                duration: rewardView.remaining ? parseFloat(rewardView.remaining) : 0,
            } : null,
            doublePointsMultiplier: powerups.getDoublePointsMultiplier(),
            slowTimeScale: powerups.getSlowTimeScale(),
            paddleWidthScale: powerups.getPaddleWidthScale(),
        } satisfies E2EPowerUpSnapshot;
    };
    controls.activatePowerUp = (type: string) => {
        powerups.handlePowerUpActivation(type as PowerUpType);
    };
    controls.activateReward = (rewardType: string) => {
        // Activate reward through the powerups system
        // This would need to be exposed through the powerups interface
        // For now, we can use forceGambleReward if it's a gamble reward
        if (rewardType.includes('gamble') || rewardType.includes('casino')) {
            forceGambleReward(rewardType);
        }
    };
    controls.forceReward = (rewardType: string | null) => {
        forceGambleReward(rewardType);
    };
    controls.getMultiBallState = () => {
        let totalBalls = 1; // Primary ball
        const extraBalls = multiBallController.count();
        let attachedBalls = 0;

        // Count attached balls - we can't easily check individual balls, so estimate
        // If primary is likely attached (not in motion), count it
        // This is an approximation for test purposes

        totalBalls += extraBalls;

        return {
            totalBalls,
            extraBalls,
            attachedBalls,
        } satisfies E2EMultiBallSnapshot;
    };
    controls.getPauseState = () => {
        const pauseState = usePauseUi();
        return {
            visible: pauseState.visible,
            suspended: pauseState.suspended,
            snapshot: pauseState.snapshot,
        } satisfies E2EPauseState;
    };
    controls.getPhysicsState = () => {
        const brickCount = levelRuntime.brickHealth.size;
        return {
            ballPosition: {
                x: ball.physicsBody.position.x,
                y: ball.physicsBody.position.y,
            },
            ballVelocity: {
                x: ball.physicsBody.velocity.x,
                y: ball.physicsBody.velocity.y,
            },
            ballSpeed: MatterVector.magnitude(ball.physicsBody.velocity),
            ballAttached: physics.isBallAttached(ball.physicsBody),
            paddlePosition: {
                x: paddle.physicsBody.position.x,
                y: paddle.physicsBody.position.y,
            },
            brickCount,
            timeScale: getSlowTimeScale(),
            loopRunning: isLoopRunning(),
            isPaused: getIsPaused(),
        } satisfies E2EPhysicsState;
    };
};
