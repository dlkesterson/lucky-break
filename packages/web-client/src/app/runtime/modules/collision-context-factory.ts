import type { CollisionContext } from '../collisions';
import type { GameSessionManager } from 'app/state';
import type { RuntimeScoringHandle } from '../scoring';
import type { GambleBrickManager } from 'game/gamble-brick-manager';
import type { EchoTrailManager } from 'game/echo-trails';
import type { PhantomBrickManager } from 'game/phantom-bricks';
import type { VortexFieldManager } from 'physics/field-effects';
import type { LevelRuntimeHandle, SpawnCoinOptions } from '../../level-runtime';
import type { MatterBody as Body } from 'physics/matter';
import type { PowerUpManager, PowerUpType } from 'util/power-ups';
import type { MultiBallController } from '../../multi-ball-controller';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { PhysicsWorldHandle } from 'physics/world';
import type { GameInputManager } from 'input/input-manager';
import type { RoundMachine } from '../round-machine';
import type { RuntimePowerups } from '../powerups';
import type { AchievementUnlock } from '../../achievements';
import type { RuntimeVisuals } from '../physics-assembly';
import type { LoadoutEffectsBundle } from '../loadouts';

interface HudSetters {
    pulseCombo(intensity: number): void;
}

interface ConfigResolver {
    readonly brickWidth: number;
    readonly brickHeight: number;
    readonly powerUpDuration: number;
    readonly coinBaseValue: number;
    readonly coinMinValue: number;
    readonly coinMaxValue: number;
}

interface GameConfig {
    readonly scoring: {
        readonly multiplierThreshold: number;
    };
}

interface RuntimeState {
    readonly gravity: number;
    readonly sessionElapsedSeconds: number;
    readonly frameTimestampMs: number;
    readonly currentBaseSpeed: number;
    readonly currentMaxSpeed: number;
}

interface ForeshadowingService {
    releaseForBall(ballId: number, actualTimeSeconds?: number): void;
}

interface AchievementsService {
    recordBrickBreak(params: { combo: number }): readonly AchievementUnlock[];
}

/**
 * Factory to build the large CollisionContext object.
 * Extracted from facade.ts to reduce complexity and improve testability.
 */
export const createCollisionContext = (options: {
    readonly getSession: () => GameSessionManager;
    readonly scoring: RuntimeScoringHandle;
    readonly gambleManager: GambleBrickManager;
    readonly echoTrailManager: EchoTrailManager;
    readonly phantomBrickManager: PhantomBrickManager;
    readonly vortexFieldManager: VortexFieldManager;
    readonly levelRuntime: LevelRuntimeHandle;
    readonly brickHealth: Map<Body, number>;
    readonly brickMetadata: LevelRuntimeHandle['brickMetadata'];
    readonly brickVisualState: LevelRuntimeHandle['brickVisualState'];
    readonly powerUpManager: PowerUpManager;
    readonly multiBallController: MultiBallController;
    readonly ball: Ball;
    readonly paddle: Paddle;
    readonly physics: PhysicsWorldHandle;
    readonly inputManager: GameInputManager;
    readonly roundMachine: RoundMachine;
    readonly configResolver: ConfigResolver;
    readonly gameConfig: GameConfig;
    readonly powerups: RuntimePowerups;
    readonly achievements: AchievementsService;
    readonly foreshadowing: ForeshadowingService;
    readonly visuals: RuntimeVisuals | null;
    readonly hudSetters: HudSetters;
    readonly PLAYFIELD_WIDTH: number;
    readonly PLAYFIELD_HEIGHT: number;
    readonly PLAYFIELD_SIZE_MAX: number;
    readonly MAX_LEVEL_BRICK_HP: number;
    readonly themeBallColors: { highlight: number; aura: number; core: number };
    readonly getRuntimeState: () => RuntimeState;
    readonly getActiveLoadoutBundle: () => LoadoutEffectsBundle;
    readonly resolveComboDecayWindow: () => number;
    readonly refreshAchievementUpgrades: () => void;
    readonly computeScheduledAudioTime: (offsetSeconds: number) => number;
    readonly scheduleVisualEffect: (scheduledTime: number | undefined, effect: () => void) => void;
    readonly flashBallLight: (intensity?: number) => void;
    readonly flashPaddleLight: (intensity?: number) => void;
    readonly applyGambleAppearance: (body: Body) => void;
    readonly clearGhostEffect: (brick: Body) => void;
    readonly removeBodyVisual: (body: Body) => void;
    readonly clearExtraBalls: () => void;
    readonly reattachBallToPaddle: () => void;
    readonly removeExtraBallByBody: (body: Body) => void;
    readonly promoteExtraBallToPrimary: (body: Body) => boolean;
    readonly handleLevelComplete: () => void;
    readonly handleGameOver: () => void;
    readonly spawnCoin: (options: SpawnCoinOptions) => void;
    readonly syncMomentum: () => void;
    readonly refreshHud: () => void;
}): CollisionContext => {
    return {
        getSession: options.getSession,
        scoring: options.scoring,
        gambleManager: options.gambleManager,
        echoTrailManager: options.echoTrailManager,
        phantomBrickManager: options.phantomBrickManager,
        vortexFieldManager: options.vortexFieldManager,
        levelRuntime: options.levelRuntime,
        brickHealth: options.brickHealth,
        brickMetadata: options.brickMetadata,
        brickVisualState: options.brickVisualState,
        powerUpManager: options.powerUpManager,
        multiBallController: options.multiBallController,
        ball: options.ball,
        paddle: options.paddle,
        physics: {
            attachBallToPaddle: options.physics.attachBallToPaddle,
            remove: options.physics.remove,
            isBallAttached: options.physics.isBallAttached,
        },
        inputManager: options.inputManager,
        roundMachine: options.roundMachine,
        dimensions: {
            brickWidth: options.configResolver.brickWidth,
            brickHeight: options.configResolver.brickHeight,
            playfieldWidth: options.PLAYFIELD_WIDTH,
            playfieldHeight: options.PLAYFIELD_HEIGHT,
            playfieldSizeMax: options.PLAYFIELD_SIZE_MAX,
        },
        thresholds: {
            multiplier: options.gameConfig.scoring.multiplierThreshold,
            powerUpDuration: options.configResolver.powerUpDuration,
            maxLevelBrickHp: options.MAX_LEVEL_BRICK_HP,
        },
        coins: {
            baseValue: options.configResolver.coinBaseValue,
            minValue: options.configResolver.coinMinValue,
            maxValue: options.configResolver.coinMaxValue,
        },
        getGravity: () => options.getRuntimeState().gravity,
        getRuleEffects: () => options.getActiveLoadoutBundle().combined.runtime.rules,
        functions: {
            getSessionElapsedSeconds: () => options.getRuntimeState().sessionElapsedSeconds,
            getFrameTimestampMs: () => options.getRuntimeState().frameTimestampMs,
            getComboDecayWindow: options.resolveComboDecayWindow,
            getCurrentBaseSpeed: () => options.getRuntimeState().currentBaseSpeed,
            getCurrentMaxSpeed: () => options.getRuntimeState().currentMaxSpeed,
            getPowerUpChanceMultiplier: () => options.roundMachine.getPowerUpChanceMultiplier(),
            getDoublePointsMultiplier: () => options.powerups.getDoublePointsMultiplier(),
            getActiveReward: () => options.powerups.getActiveReward(),
            getChromaticColors: () => [
                options.themeBallColors.highlight,
                options.themeBallColors.aura,
                options.themeBallColors.core,
            ] as const,
            incrementLevelBricksBroken: () => {
                options.roundMachine.incrementLevelBricksBroken();
            },
            updateHighestCombos: (combo: number) => {
                options.roundMachine.updateHighestCombos(combo);
            },
            refreshAchievementUpgrades: options.refreshAchievementUpgrades,
            recordBrickBreakAchievements: (combo: number) => options.achievements.recordBrickBreak({ combo }),
            queueAchievementUnlocks: (unlocks: readonly AchievementUnlock[]) => {
                options.roundMachine.enqueueAchievementUnlocks(unlocks);
            },
            syncMomentum: options.syncMomentum,
            refreshHud: options.refreshHud,
            releaseForeshadowForBall: (ballId, actualTimeSeconds) => {
                options.foreshadowing.releaseForBall(ballId, actualTimeSeconds);
            },
            computeScheduledAudioTime: options.computeScheduledAudioTime,
            scheduleVisualEffect: options.scheduleVisualEffect,
            spawnHeatRipple: (visualOptions) => {
                options.visuals?.heatRippleEffect?.spawnRipple(visualOptions);
            },
            emitBrickParticles: (visualOptions) => {
                options.visuals?.brickParticles?.emit(visualOptions);
            },
            flashBallLight: (intensity?: number) => {
                options.flashBallLight(intensity ?? 0.35);
            },
            flashPaddleLight: (intensity?: number) => {
                options.flashPaddleLight(intensity ?? 0.3);
            },
            hudPulseCombo: (intensity: number) => {
                options.hudSetters.pulseCombo(intensity);
            },
            applyGambleAppearance: options.applyGambleAppearance,
            clearGhostEffect: options.clearGhostEffect,
            removeBodyVisual: options.removeBodyVisual,
            clearExtraBalls: options.clearExtraBalls,
            reattachBallToPaddle: options.reattachBallToPaddle,
            removeExtraBallByBody: options.removeExtraBallByBody,
            promoteExtraBallToPrimary: options.promoteExtraBallToPrimary,
            handleLevelComplete: options.handleLevelComplete,
            handleGameOver: options.handleGameOver,
            handlePowerUpActivation: (type: PowerUpType) => {
                options.powerups.handlePowerUpActivation(type);
            },
            spawnCoin: options.spawnCoin,
        },
    } satisfies CollisionContext;
};
