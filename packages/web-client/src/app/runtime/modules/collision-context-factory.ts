import type { CollisionContext } from '../collisions';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Factory to build the large CollisionContext object.
 * Extracted from facade.ts to reduce complexity and improve testability.
 * Uses any types for dependencies to avoid complex import chains.
 */
export const createCollisionContext = (options: {
    readonly session: any;
    readonly scoring: any;
    readonly gambleManager: any;
    readonly echoTrailManager: any;
    readonly phantomBrickManager: any;
    readonly vortexFieldManager: any;
    readonly levelRuntime: any;
    readonly brickHealth: any;
    readonly brickMetadata: any;
    readonly brickVisualState: any;
    readonly powerUpManager: any;
    readonly multiBallController: any;
    readonly ball: any;
    readonly paddle: any;
    readonly physics: any;
    readonly inputManager: any;
    readonly roundMachine: any;
    readonly configResolver: any;
    readonly gameConfig: any;
    readonly powerups: any;
    readonly achievements: any;
    readonly foreshadowing: any;
    readonly visuals: any;
    readonly hudSetters: any;
    readonly PLAYFIELD_WIDTH: number;
    readonly PLAYFIELD_HEIGHT: number;
    readonly PLAYFIELD_SIZE_MAX: number;
    readonly MAX_LEVEL_BRICK_HP: number;
    readonly themeBallColors: { highlight: number; aura: number; core: number };
    readonly getRuntimeState: () => {
        gravity: number;
        sessionElapsedSeconds: number;
        frameTimestampMs: number;
        currentBaseSpeed: number;
        currentMaxSpeed: number;
    };
    readonly getActiveLoadoutBundle: () => any;
    readonly resolveComboDecayWindow: () => number;
    readonly refreshAchievementUpgrades: () => void;
    readonly computeScheduledAudioTime: (offsetSeconds: number) => number;
    readonly scheduleVisualEffect: (scheduledTime: number | undefined, effect: () => void) => void;
    readonly flashBallLight: (intensity?: number) => void;
    readonly flashPaddleLight: (intensity?: number) => void;
    readonly applyGambleAppearance: (body: any) => void;
    readonly clearGhostEffect: (...args: any[]) => void;
    readonly removeBodyVisual: (body: any) => void;
    readonly clearExtraBalls: () => void;
    readonly reattachBallToPaddle: () => void;
    readonly removeExtraBallByBody: (body: any) => void;
    readonly promoteExtraBallToPrimary: (body: any) => boolean;
    readonly handleLevelComplete: () => void;
    readonly handleGameOver: () => void;
    readonly spawnCoin: (...args: any[]) => void;
    readonly syncMomentum: () => void;
}): CollisionContext => {
    return {
        get session() {
            return options.session;
        },
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
            queueAchievementUnlocks: (unlocks: readonly any[]) => {
                options.roundMachine.enqueueAchievementUnlocks(unlocks);
            },
            syncMomentum: options.syncMomentum,
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
            handlePowerUpActivation: (type: any) => {
                options.powerups.handlePowerUpActivation(type);
            },
            spawnCoin: options.spawnCoin,
        },
    } satisfies CollisionContext;
};
