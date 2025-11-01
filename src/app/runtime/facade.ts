import { createAudioBootstrap, clampMidiNote } from './audio-bootstrap';

import {
    GameTheme,
    onThemeChange,
    toggleTheme,
    type GameThemeDefinition,
} from 'render/theme';
import { createGameLoop } from '../loop';
import { createGameSessionManager } from '../state';
import type { GameSessionManager } from '../state';
import type { EntropyActionType } from '../events';
import type { AchievementUnlock } from '../achievements';
import { buildHudScoreboard } from 'render/hud';
import type { BiasPhaseSessionSummary } from 'scenes/bias-phase';
import { gameConfig, type GameConfig } from 'config/game';
import { regulateSpeed, getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { getMomentumMetrics } from 'util/scoring';
import { calculateBallSpeedScale, type PowerUpType } from 'util/power-ups';
import { computePrestigeDust } from 'util/prestige';
import {
    toColorNumber,
    clampUnit,
    mixColors,
    type BallVisualDefaults,
    type BallVisualPalette,
    type PaddleVisualDefaults,
} from 'render/playfield-visuals';
import { createVisualFactory } from 'render/visual-factory';
import { Sprite, type Graphics } from 'pixi.js';
import {
    Body as MatterBody,
    Vector as MatterVector,
} from 'physics/matter';
import type { MatterBody as Body } from 'physics/matter';
import type { MusicBeatEvent, MusicMeasureEvent } from 'audio/music-director';
import { mulberry32, type RandomManager } from 'util/random';
import type { ReplayBuffer } from '../replay-buffer';
import { createGameInitializer } from '../game-initializer';
import type { MultiBallColors } from '../multi-ball-controller';
import { createLevelRuntime, type BrickLayoutBounds } from '../level-runtime';
import { createBrickDecorator } from '../brick-layout-decorator';
import { getPresetLevelCount, setLevelPresetOffset, MAX_LEVEL_BRICK_HP } from 'util/levels';
import {
    spinWheel,
    createReward,
    setRewardOverride,
    type RewardType,
} from 'game/rewards';
import { rootLogger } from 'util/log';
import { recordHighScore } from 'util/high-scores';
import type { GameSceneServices } from '../scene-services';
import type { PhysicsDebugOverlayState } from 'render/debug-overlay';
import { createGambleRuntime } from './gamble';
import { createRuntimeScoring, type RuntimeScoringHandle } from './scoring';
import { createRoundMachine, type RoundMachine } from './round-machine';
import type { RuntimePowerups } from './powerups';
import type { RuntimeInput } from './input';
import type { RuntimeDebug } from './debug';
import type { RuntimeLifecycle } from './lifecycle';
import { getSettings, subscribeSettings } from 'util/settings';
import { createLaserController, type LaserController } from './laser';
import type { RuntimeModifiers } from './modifiers';
import { createMetaProgressionService } from './meta-progress-service';
import { createVisualThemeDefaults, type VisualThemeSnapshot } from './visual-theme-defaults';
import {
    createSyncDriftTelemetry,
    SYNC_DRIFT_HISTORY_SECONDS,
    SYNC_DRIFT_HISTORY_MAX_SAMPLES,
    SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS,
    SYNC_DRIFT_WARN_THRESHOLD_MS,
    SYNC_DRIFT_RECOVERY_THRESHOLD_MS,
    updateSyncDriftMetrics,
} from './state-store';
import {
    isAutoplayBlockedError,
    resolveToneTransport,
    isPromiseLike,
    waitForPromise,
} from './audio';
import { createCollisionRuntime, type CollisionRuntime, type CollisionContext } from './collisions';
import type { RuntimeVisuals } from './physics-assembly';
import {
    createForeshadowingRuntime,
    resolveBallRadius,
    intersectRayWithExpandedAabb,
} from './foreshadowing';
import { createBiasPhaseCoordinator, type BiasPhaseCoordinator } from './bias-phase-coordinator';
import { registerRuntimeScenes } from './scene-registration';
import { createModifierPowerupServices } from './modifier-powerup-services';
import { initializeRuntimeLifecycle } from './lifecycle-manager';
import { setupDebugHarnessIntegrations } from './debug-harness-integration';
import { createRuntimePhysics } from './modules/runtime-physics';
import { createRuntimeHud } from './modules/runtime-hud';
import { createRuntimeAudio } from './modules/runtime-audio';
import { createRuntimeRewards, type RuntimeRewardsHandle } from './modules/runtime-rewards';
import { createRuntimePerformance } from './modules/runtime-performance';

const runtimeLogger = rootLogger.child('game-runtime');

const config: GameConfig = gameConfig;
const PLAYFIELD_DEFAULT = config.playfield;
const BRICK_LIGHT_RADIUS = config.bricks.lighting.radius;
const BRICK_REST_ALPHA = config.bricks.lighting.restAlpha;
const BASE_COMBO_DECAY_WINDOW = config.scoring.comboDecayTime;
const HUD_SCALE = config.hud.scale;
const HUD_MARGIN = config.hud.margin;
const MIN_HUD_SCALE = config.hud.minScale;
const MOBILE_HUD_MARGIN = Math.max(16, Math.round(HUD_MARGIN * 0.6));
const MOBILE_HUD_MAX_SCALE = 1;
const MOBILE_HUD_MIN_SCALE = 0.7;
const BALL_BASE_SPEED = config.ball.baseSpeed;
const BALL_MAX_SPEED = config.ball.maxSpeed;
const BALL_LAUNCH_SPEED = config.ball.launchSpeed;
const MULTI_BALL_MULTIPLIER = config.multiBall.spawnMultiplier;
const MULTI_BALL_CAPACITY = config.multiBall.maxExtraBalls;
const SLOW_TIME_MAX_DURATION = config.rewards.stackLimits.slowTimeMaxDuration;
const MULTI_BALL_MAX_DURATION = config.rewards.stackLimits.multiBallMaxDuration;
const DEFAULT_PADDLE_WIDTH_MULTIPLIER = config.paddle.expandedWidthMultiplier;
const MODIFIER_GRAVITY_RANGE = config.modifiers.gravity;
const MODIFIER_RESTITUTION_RANGE = config.modifiers.restitution;
const MODIFIER_PADDLE_WIDTH_RANGE = config.modifiers.paddleWidth;
const MODIFIER_SPEED_GOVERNOR_RANGE = config.modifiers.speedGovernor;
const BASE_BALL_RESTITUTION = MODIFIER_RESTITUTION_RANGE.default;
const BASE_PADDLE_WIDTH = 100;
const BASE_PADDLE_HEIGHT = 20;
const BASE_PADDLE_SPEED = 300;
const BRICK_WIDTH = config.bricks.size.width;
const BRICK_HEIGHT = config.bricks.size.height;
const POWER_UP_RADIUS = config.powerUp.radius;
const POWER_UP_FALL_SPEED = config.powerUp.fallSpeed;
const POWER_UP_DURATION = config.powerUp.rewardDuration;
const PADDLE_SMOOTH_RESPONSIVENESS = config.paddle.control.smoothResponsiveness;
const PADDLE_SNAP_THRESHOLD = config.paddle.control.snapThreshold;
const COIN_RADIUS = config.coins.radius;
const COIN_FALL_SPEED = config.coins.fallSpeed;
const COIN_BASE_VALUE = config.coins.baseValue;
const COIN_MIN_VALUE = config.coins.min;
const COIN_MAX_VALUE = config.coins.max;
const GAMBLE_TIMER_SECONDS = config.levels.gamble.timerSeconds;
const GAMBLE_REWARD_MULTIPLIER = config.levels.gamble.rewardMultiplier;
const GAMBLE_PRIME_RESET_HP = config.levels.gamble.primeResetHp;
const GAMBLE_FAIL_PENALTY_HP = config.levels.gamble.failPenaltyHp;
const GAMBLE_TINT_ARMED = config.levels.gamble.tintArmed;
const GAMBLE_TINT_PRIMED = config.levels.gamble.tintPrimed;
const GAMBLE_COUNTDOWN_AUDIO_THRESHOLD = Math.min(5, Math.max(1, Math.ceil(GAMBLE_TIMER_SECONDS)));
const BASE_LIVES = 3;
const LAYOUT_SEED_SALT = 0x9e3779b1;
const PRESET_OFFSET_SALT = 0x1f123bb5;

const FORESHADOW_MIN_PREDICTION_SECONDS = 0.28;
const FORESHADOW_MAX_PREDICTION_SECONDS = 3.6;
const FORESHADOW_MIN_SPEED = Math.max(4, BALL_BASE_SPEED * 0.75);
const FORESHADOW_MIN_LEAD_SECONDS = 0.35;
const FORESHADOW_MAX_LEAD_SECONDS = 2.6;

const AUTO_COMPLETE_SETTINGS = config.levels.autoComplete;
const AUTO_COMPLETE_ENABLED = AUTO_COMPLETE_SETTINGS.enabled;
const AUTO_COMPLETE_COUNTDOWN = Math.max(1, AUTO_COMPLETE_SETTINGS.countdownSeconds);
const AUTO_COMPLETE_TRIGGER = Math.max(1, AUTO_COMPLETE_SETTINGS.triggerRemainingBricks);

const deriveLayoutSeed = (baseSeed: number, levelIndex: number): number => {
    const normalizedIndex = levelIndex + 1;
    const hashed = (baseSeed ^ Math.imul(normalizedIndex, LAYOUT_SEED_SALT)) >>> 0;
    return hashed === 0 ? 1 : hashed;
};

const ENTROPY_COST_REROLL = Math.max(1, config.entropy.spend.rerollCost);
const REWARD_LOCK_COIN_COST = Math.max(0, config.rewards.lockCoinCost);
const ENTROPY_COST_SHIELD = Math.max(1, config.entropy.spend.shieldCost);
const ENTROPY_COST_BAILOUT = Math.max(1, config.entropy.spend.bailoutCost);

const ENTROPY_ACTION_COSTS: Record<EntropyActionType, number> = {
    reroll: ENTROPY_COST_REROLL,
    shield: ENTROPY_COST_SHIELD,
    bailout: ENTROPY_COST_BAILOUT,
} as const;

const PRESTIGE_CONFIG = config.prestige;

const ENTROPY_ACTION_BINDINGS: Record<EntropyActionType, { key: string; hotkey: string; label: string }> = {
    reroll: { key: 'KeyR', hotkey: 'R', label: 'Reroll' },
    shield: { key: 'KeyS', hotkey: 'S', label: 'Shield' },
    bailout: { key: 'KeyB', hotkey: 'B', label: 'Bailout' },
} as const;

const ENTROPY_ACTION_SEQUENCE: readonly EntropyActionType[] = ['reroll', 'shield', 'bailout'];

const metaProgression = createMetaProgressionService({
    baseComboDecayWindow: BASE_COMBO_DECAY_WINDOW,
    baseLives: BASE_LIVES,
});

const {
    achievements,
    fateLedger,
    metaUpgrades,
    refreshAchievementUpgrades,
    refreshMetaLoadout,
    resolveInitialLives,
    getLoadout: getMetaLoadout,
    getTraitEffects: getMetaTraitEffects,
    getComboDecayWindow: getMetaComboDecayWindow,
} = metaProgression;

const resolveComboDecayWindow = (): number => {
    const window = getMetaComboDecayWindow();
    return Number.isFinite(window) && window > 0 ? window : BASE_COMBO_DECAY_WINDOW;
};

refreshMetaLoadout();

const audioBootstrap = createAudioBootstrap({
    logger: runtimeLogger,
    getPaletteConfig: () => getMetaLoadout().audioPalette.config,
});

export interface GameRuntimeOptions {
    readonly container: HTMLElement;
    readonly playfieldDimensions?: { readonly width: number; readonly height: number };
    readonly layoutOrientation?: 'portrait' | 'landscape';
    readonly uiProfile?: 'desktop' | 'mobile';
    readonly random: RandomManager;
    readonly replayBuffer: ReplayBuffer;
    readonly onAudioBlocked?: (error: unknown) => void;
}

export interface GameRuntimeHandle {
    readonly getSessionElapsedSeconds: () => number;
    readonly dispose: () => void;
}

export interface RuntimeFacadeModules {
    readonly lifecycle: RuntimeLifecycle;
    readonly input: RuntimeInput;
    readonly debug: RuntimeDebug | null;
    readonly visuals: RuntimeVisuals | null;
    readonly collisions: CollisionRuntime | null;
    readonly scoring: RuntimeScoringHandle;
    readonly rewards: RuntimeRewardsHandle;
    readonly powerups: RuntimePowerups;
    readonly roundMachine: RoundMachine;
    readonly modifiers: RuntimeModifiers;
}

export interface RuntimeFacade {
    readonly handle: GameRuntimeHandle;
    readonly modules: RuntimeFacadeModules;
}

export const createRuntimeFacade = async ({
    container,
    playfieldDimensions = PLAYFIELD_DEFAULT,
    layoutOrientation,
    uiProfile,
    random,
    replayBuffer,
    onAudioBlocked,
}: GameRuntimeOptions): Promise<RuntimeFacade> => {
    await audioBootstrap.ensureToneAudio().catch((error: unknown) => {
        if (isAutoplayBlockedError(error)) {
            onAudioBlocked?.(error);
            return;
        }
        throw error;
    });

    const PLAYFIELD_WIDTH = playfieldDimensions.width;
    const PLAYFIELD_HEIGHT = playfieldDimensions.height;
    const PLAYFIELD_SIZE_MAX = Math.max(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    const sessionOrientation = layoutOrientation ?? (PLAYFIELD_WIDTH >= PLAYFIELD_HEIGHT ? 'landscape' : 'portrait');
    const hudProfile: 'desktop' | 'mobile' = uiProfile === 'mobile' ? 'mobile' : 'desktop';
    const layoutDecorator = createBrickDecorator(sessionOrientation);

    const themeDefaults = createVisualThemeDefaults({
        initialTheme: GameTheme,
        getMetaLoadout,
    });

    let themeSnapshot: VisualThemeSnapshot = themeDefaults.getSnapshot();
    let rowColors: readonly number[] = themeSnapshot.rowColors;
    let themeBallColors: MultiBallColors = themeSnapshot.ballColors;
    let themeAccents: { combo: number; powerUp: number } = {
        combo: themeSnapshot.accents.combo,
        powerUp: themeSnapshot.accents.powerUp,
    };
    let ballVisualDefaults: BallVisualDefaults = themeSnapshot.ballDefaults;
    let paddleVisualDefaults: PaddleVisualDefaults = themeSnapshot.paddleDefaults;
    let backgroundAccentColor = themeSnapshot.backgroundAccentColor;
    let bloomAccentColor = themeSnapshot.bloomAccentColor;

    const syncThemeSnapshot = (snapshot: VisualThemeSnapshot): void => {
        themeSnapshot = snapshot;
        rowColors = snapshot.rowColors;
        themeBallColors = snapshot.ballColors;
        themeAccents = {
            combo: snapshot.accents.combo,
            powerUp: snapshot.accents.powerUp,
        };
        ballVisualDefaults = snapshot.ballDefaults;
        paddleVisualDefaults = snapshot.paddleDefaults;
        backgroundAccentColor = snapshot.backgroundAccentColor;
        bloomAccentColor = snapshot.bloomAccentColor;
    };

    let visuals: RuntimeVisuals | null = null;

    const performanceLogger = typeof runtimeLogger.child === 'function'
        ? runtimeLogger.child('performance')
        : runtimeLogger;
    const runtimePerformance = createRuntimePerformance({
        logger: performanceLogger,
        initialPreference: Boolean(getSettings().performance),
        subscribePreference: (listener) => {
            return subscribeSettings((snapshot) => {
                listener(Boolean(snapshot.performance));
            });
        },
    });
    let unsubscribeMeta: (() => void) | null = null;

    const gambleTintArmed = toColorNumber(GAMBLE_TINT_ARMED);
    const gambleTintPrimed = toColorNumber(GAMBLE_TINT_PRIMED);
    let gambleRuntime: ReturnType<typeof createGambleRuntime> | null = null;

    const visualFactory = createVisualFactory({
        ball: ballVisualDefaults,
        paddle: paddleVisualDefaults,
    });

    let ballHueShift = 0;
    let runtimeDebug: RuntimeDebug | null = null;

    const flashBallLight = (intensity: number) => {
        visuals?.ballLight?.flash(intensity);
    };

    const flashPaddleLight = (intensity: number) => {
        visuals?.paddleLight?.flash(intensity);
    };

    const cheatPowerUpBindings: readonly { code: KeyboardEvent['code']; type: PowerUpType }[] = [
        { code: 'Digit1', type: 'paddle-width' },
        { code: 'Digit2', type: 'ball-speed' },
        { code: 'Digit3', type: 'multi-ball' },
        { code: 'Digit4', type: 'sticky-paddle' },
        { code: 'Digit5', type: 'laser' },
    ];
    let unsubscribeTheme: (() => void) | null = null;

    const {
        stage,
        bus,
        scheduler,
        audioState$,
        musicDirector,
        renderStageSoon,
        dispose: disposeInitializer,
    } = await createGameInitializer({
        container,
        playfieldSize: playfieldDimensions,
        pulseControls: {
            boostCombo: ({ ring, ball }) => {
                runtimeState.comboRingPulse = Math.min(1, runtimeState.comboRingPulse + ring);
                runtimeState.ballGlowPulse = Math.min(1, runtimeState.ballGlowPulse + ball);
                flashBallLight(0.35);
            },
            boostPowerUp: ({ paddle }) => {
                runtimeState.paddleGlowPulse = Math.min(1, runtimeState.paddleGlowPulse + paddle);
                flashPaddleLight(0.5);
            },
        },
        onAudioBlocked,
    });

    const hasPerformanceNow = typeof performance !== 'undefined' && typeof performance.now === 'function';
    const syncDriftTelemetry = createSyncDriftTelemetry({
        logger: performanceLogger,
        hasPerformanceNow,
    });
    const runtimePhysics = createRuntimePhysics({
        container,
        stage,
        playfieldDimensions,
        random,
        visualFactory,
        themeBallColors,
        themeAccents,
        runtimeDefaults: {
            baseBallSpeed: BALL_BASE_SPEED,
            maxBallSpeed: BALL_MAX_SPEED,
            launchBallSpeed: BALL_LAUNCH_SPEED,
            gravity: MODIFIER_GRAVITY_RANGE.default,
            ballRestitution: BASE_BALL_RESTITUTION,
            paddleBaseWidth: BASE_PADDLE_WIDTH,
            paddleWidthMultiplier: MODIFIER_PADDLE_WIDTH_RANGE.default,
            speedGovernorMultiplier: MODIFIER_SPEED_GOVERNOR_RANGE.default,
        },
        paddle: {
            width: BASE_PADDLE_WIDTH,
            height: BASE_PADDLE_HEIGHT,
            speed: BASE_PADDLE_SPEED,
            spawnOffsetFromBottom: 70,
        },
        paddleSmoothing: {
            responsiveness: PADDLE_SMOOTH_RESPONSIVENESS,
            snapThreshold: PADDLE_SNAP_THRESHOLD,
        },
        ball: { radius: 10 },
        multiBall: {
            multiplier: MULTI_BALL_MULTIPLIER,
            maxExtraBalls: MULTI_BALL_CAPACITY,
        },
    });

    const {
        physics,
        runtimeState,
        ballController,
        paddleController,
        launchController,
        runtimeInput,
        ball,
        paddle,
        visuals: createdVisuals,
        ballGraphics,
        paddleGraphics,
        ballGlowFilter,
        ballHueFilter,
        gameContainer,
        multiBallController,
        visualBodies,
    } = runtimePhysics;

    const runtimeAudio = createRuntimeAudio({
        audioBootstrap,
        scheduler,
        musicDirector,
        hasPerformanceNow,
        getWallClockSeconds: hasPerformanceNow
            ? () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() / 1000
                : null)
            : undefined,
        getAudioVisualSkewSeconds: () => runtimeState.audioVisualSkewSeconds,
    });
    const computeScheduledAudioTime = (offsetMs = 0): number => runtimeAudio.computeScheduledAudioTime(offsetMs);
    const scheduleVisualEffect = (scheduledTime: number | undefined, effect: () => void): void =>
        runtimeAudio.scheduleVisualEffect(scheduledTime, effect);
    const pushMusicState = (state: Parameters<typeof runtimeAudio.pushMusicState>[0]): void => {
        runtimeAudio.pushMusicState(state);
    };
    const resolveMidiEngine = () => runtimeAudio.getMidiEngine();

    const handleFrameMetrics = runtimePerformance.handleFrameMetrics;

    const sessionNow = (): number => Math.max(0, Math.floor(runtimeState.sessionElapsedSeconds * 1000));

    const createSession = () =>
        createGameSessionManager({
            sessionId: 'game-session',
            initialLives: resolveInitialLives(),
            eventBus: bus,
            random: random.random,
            now: sessionNow,
        });

    const toMusicLives = (lives: number): 1 | 2 | 3 => {
        if (lives >= 3) {
            return 3;
        }
        if (lives <= 1) {
            return 1;
        }
        return 2;
    };

    let session = createSession();
    const sessionFacade: Pick<GameSessionManager, 'snapshot' | 'recordLifeLost' | 'recordEntropyEvent' | 'completeRound'> = {
        snapshot: () => session.snapshot(),
        recordLifeLost: (cause) => session.recordLifeLost(cause),
        recordEntropyEvent: (event) => session.recordEntropyEvent(event),
        completeRound: () => session.completeRound(),
    };
    const scoring = createRuntimeScoring({
        bus,
        scoringConfig: config.scoring,
    });
    const scoringState = scoring.state;
    const syncMomentum = () => {
        session.updateMomentum(getMomentumMetrics(scoringState));
    };
    syncMomentum();
    pushMusicState({
        lives: toMusicLives(resolveInitialLives()),
        combo: 0,
        tempoRatio: 0,
        bricksRemainingRatio: 1,
        warbleIntensity: 0,
    });
    const roundMachine = createRoundMachine({
        autoCompleteEnabled: AUTO_COMPLETE_ENABLED,
        autoCompleteCountdown: AUTO_COMPLETE_COUNTDOWN,
        autoCompleteTrigger: AUTO_COMPLETE_TRIGGER,
    });

    const syncAutoCompleteCountdownDisplay = () => {
        const display = visuals?.roundCountdownDisplay;
        if (!display) {
            return;
        }
        const { enabled, active, timer, countdown } = roundMachine.getAutoCompleteState();
        if (!enabled || !active) {
            display.hide();
            return;
        }
        display.show(timer, countdown);
    };

    let loop: ReturnType<typeof createGameLoop> | null = null;
    let collisionRuntime: CollisionRuntime | null = null;
    let laserController: LaserController | null = null;
    let isPaused = false;

    let brickLayoutBounds: BrickLayoutBounds | null = null;

    const sharedSceneServices: GameSceneServices = {
        bus,
        scheduler,
        audioState$,
        musicDirector,
        random,
        replayBuffer,
        renderStageSoon,
        fateLedger,
        metaUpgrades,
    };

    const provideSceneServices = (): GameSceneServices => sharedSceneServices;

    const removeBodyVisual = (body: Body): void => {
        const visual = visualBodies.get(body);
        if (!visual) {
            return;
        }
        gambleRuntime?.handleBrickRemoved(body, visual);

        if (visual.parent) {
            visual.parent.removeChild(visual);
        }
        if (visual instanceof Sprite) {
            visual.destroy(false);
        } else if ('destroy' in visual && typeof visual.destroy === 'function') {
            visual.destroy();
        }
        visualBodies.delete(body);
        brickVisualState.delete(body);
    };

    const presetCount = getPresetLevelCount();
    if (presetCount > 0) {
        const offsetSource = mulberry32((random.seed() ^ PRESET_OFFSET_SALT) >>> 0);
        const offset = Math.floor(offsetSource() * presetCount);
        setLevelPresetOffset(offset);
    } else {
        setLevelPresetOffset(0);
    }

    const levelRuntime = createLevelRuntime({
        physics,
        stage,
        visualBodies,
        removeBodyVisual,
        playfieldWidth: PLAYFIELD_WIDTH,
        brickSize: { width: BRICK_WIDTH, height: BRICK_HEIGHT },
        brickLighting: { radius: BRICK_LIGHT_RADIUS, restAlpha: BRICK_REST_ALPHA },
        rowColors,
        powerUp: { radius: POWER_UP_RADIUS, fallSpeed: POWER_UP_FALL_SPEED },
        coin: { radius: COIN_RADIUS, fallSpeed: COIN_FALL_SPEED },
        layoutOrientation: sessionOrientation,
        getLayoutRandom: (levelIndex) => mulberry32(deriveLayoutSeed(random.seed(), levelIndex)),
        decorateBrick: layoutDecorator,
    });

    const brickHealth = levelRuntime.brickHealth;
    const brickMetadata = levelRuntime.brickMetadata;
    const brickVisualState = levelRuntime.brickVisualState;

    const foreshadowing = createForeshadowingRuntime({
        randomSeed: random.seed(),
        runtimeState,
        scheduler,
        getVisuals: () => visuals,
        multiBallController,
        levelRuntime,
        config: {
            minPredictionSeconds: FORESHADOW_MIN_PREDICTION_SECONDS,
            maxPredictionSeconds: FORESHADOW_MAX_PREDICTION_SECONDS,
            minSpeed: FORESHADOW_MIN_SPEED,
            minLeadSeconds: FORESHADOW_MIN_LEAD_SECONDS,
            maxLeadSeconds: FORESHADOW_MAX_LEAD_SECONDS,
        },
        scheduleVisualEffect,
    });

    gambleRuntime = createGambleRuntime({
        managerOptions: {
            timerSeconds: GAMBLE_TIMER_SECONDS,
            rewardMultiplier: Math.max(1, GAMBLE_REWARD_MULTIPLIER),
            primeResetHp: Math.max(1, GAMBLE_PRIME_RESET_HP),
            failPenaltyHp: Math.max(1, GAMBLE_FAIL_PENALTY_HP),
        },
        countdownAudioThreshold: GAMBLE_COUNTDOWN_AUDIO_THRESHOLD,
        tintArmed: gambleTintArmed,
        tintPrimed: gambleTintPrimed,
        visualBodies,
        brickMetadata,
        brickHealth,
        brickVisualState,
        maxBrickHp: MAX_LEVEL_BRICK_HP,
        updateBrickDamage: (brick, hp) => {
            levelRuntime.updateBrickDamage(brick, hp);
        },
        getMidiEngine: () => resolveMidiEngine(),
        musicDirector,
    });
    const { manager: gambleManager } = gambleRuntime;

    const applyGambleAppearance = (body: Body): void => {
        gambleRuntime?.applyAppearance(body);
    };

    const reapplyGambleAppearances = (): void => {
        gambleRuntime?.reapplyAppearances();
    };

    const registerGambleBricks = (): void => {
        gambleRuntime?.registerBricks();
    };

    const updateBrickLighting = (
        ...args: Parameters<typeof levelRuntime.updateBrickLighting>
    ) => levelRuntime.updateBrickLighting(...args);

    const spawnCoin = (
        ...args: Parameters<typeof levelRuntime.spawnCoin>
    ) => levelRuntime.spawnCoin(...args);
    const clearGhostEffect = (
        ...args: Parameters<typeof levelRuntime.clearGhostEffect>
    ) => levelRuntime.clearGhostEffect(...args);
    const resetGhostBricks = (
        ...args: Parameters<typeof levelRuntime.resetGhostBricks>
    ) => levelRuntime.resetGhostBricks(...args);
    const applyGhostBrickReward = (
        ...args: Parameters<typeof levelRuntime.applyGhostBrickReward>
    ) => levelRuntime.applyGhostBrickReward(...args);
    const updateGhostBricks = (
        ...args: Parameters<typeof levelRuntime.updateGhostBricks>
    ) => levelRuntime.updateGhostBricks(...args);
    const getGhostBrickRemainingDuration = (
        ...args: Parameters<typeof levelRuntime.getGhostBrickRemainingDuration>
    ) => levelRuntime.getGhostBrickRemainingDuration(...args);
    const forceClearBreakableBricks = () => levelRuntime.forceClearBreakableBricks();
    const clearActivePowerUps = () => {
        powerups.reset();
        levelRuntime.clearActivePowerUps();
    };
    const clearActiveCoins = () => levelRuntime.clearActiveCoins();

    const resetAutoCompleteCountdown = () => {
        roundMachine.resetAutoCompleteCountdown();
        syncAutoCompleteCountdownDisplay();
    };

    const loadLevel = (levelIndex: number) => {
        gambleRuntime?.prepareLevel();
        const result = levelRuntime.loadLevel(levelIndex);
        roundMachine.setPowerUpChanceMultiplier(result.powerUpChanceMultiplier);
        roundMachine.setLevelDifficultyMultiplier(result.difficultyMultiplier);
        brickLayoutBounds = result.layoutBounds;
        session.startRound({ breakableBricks: result.breakableBricks });
        visuals?.brickParticles?.reset();
        visuals?.heatRippleEffect?.clear();
        registerGambleBricks();
    };

    const applyBackgroundAccent = (accentIndexDelta: number) => {
        const snapshot = themeDefaults.cycleBackgroundAccent(accentIndexDelta);
        syncThemeSnapshot(snapshot);
        visuals?.playfieldBackground?.setTint(backgroundAccentColor);
    };

    const handleMusicMeasure = (_event: MusicMeasureEvent) => {
        void _event;
        applyBackgroundAccent(1);
    };
    const handleMusicBeat = (event: MusicBeatEvent) => {
        const strength = event.isDownbeat ? 0.85 : 0.45;
        visuals?.playfieldBackground?.applyBeatPulse(strength);
    };
    runtimeAudio.setBeatCallback(handleMusicBeat);
    runtimeAudio.setMeasureCallback(handleMusicMeasure);

    const bounds = physics.factory.bounds();
    physics.add(bounds);

    const { manager: inputManager } = runtimeInput;
    visuals = createdVisuals;
    runtimePerformance.updateVisuals(createdVisuals);
    if (createdVisuals) {
        createdVisuals.playfieldBackground?.setTint(backgroundAccentColor, { immediate: true, accentMix: 0.2 });
    }

    const comboRing = createdVisuals?.comboRing ?? null;
    const inputDebugOverlay = createdVisuals?.inputDebugOverlay ?? null;
    const physicsDebugOverlay = createdVisuals?.physicsDebugOverlay ?? null;

    if (runtimeDebug) {
        (runtimeDebug as RuntimeDebug).updateOverlays({ input: inputDebugOverlay, physics: physicsDebugOverlay });
    }

    syncAutoCompleteCountdownDisplay();

    const drawBallSprite = (graphics: Graphics, radius: number, palette?: Partial<BallVisualPalette>) => {
        visualFactory.ball.draw(graphics, radius, palette);
    };

    const setPaddleWidth = (() => {
        let lastWidth = paddle.width;
        return (requestedWidth: number): void => {
            const clampedWidth = Number.isFinite(requestedWidth) ? Math.max(24, requestedWidth) : lastWidth;
            if (Math.abs(clampedWidth - lastWidth) <= 1e-3) {
                paddle.width = clampedWidth;
                return;
            }
            const currentPosition = {
                x: paddle.physicsBody.position.x,
                y: paddle.physicsBody.position.y,
            };
            const scaleX = clampedWidth / lastWidth;
            if (Number.isFinite(scaleX) && scaleX > 0) {
                MatterBody.scale(paddle.physicsBody, scaleX, 1);
                MatterBody.setPosition(paddle.physicsBody, currentPosition);
            }
            lastWidth = clampedWidth;
            paddle.width = clampedWidth;
            paddle.position.x = currentPosition.x;
            paddle.position.y = currentPosition.y;
        };
    })();

    runtimeState.previousPaddlePosition = { x: paddle.position.x, y: paddle.position.y };
    runtimeState.lastRecordedInputTarget = null;
    runtimeState.currentBaseSpeed = BALL_BASE_SPEED;
    runtimeState.currentMaxSpeed = BALL_MAX_SPEED;
    runtimeState.currentLaunchSpeed = BALL_LAUNCH_SPEED;
    const reattachBallToPaddle = (): void => {
        const attachmentOffset = { x: 0, y: -ball.radius - paddle.height / 2 };
        foreshadowing.cancelForBall(ball.physicsBody.id);
        physics.attachBallToPaddle(ball.physicsBody, paddle.physicsBody, attachmentOffset);
        ball.isAttached = true;
        ball.attachmentOffset = attachmentOffset;
        MatterBody.setVelocity(ball.physicsBody, { x: 0, y: 0 });
        MatterBody.setAngularVelocity(ball.physicsBody, 0);
        runtimeInput.resetLaunchTrigger();
        const center = paddleController.getPaddleCenter(paddle);
        runtimeState.previousPaddlePosition = { x: center.x, y: center.y };
        runtimeInput.syncPaddlePosition(center);
        visuals?.ballSpeedRing?.reset();
    };

    const promoteExtraBallToPrimary = (expiredBody: Body): boolean => {
        if (multiBallController.promoteExtraBallToPrimary(expiredBody)) {
            return true;
        }
        return false;
    };

    const removeExtraBallByBody = (body: Body) => {
        foreshadowing.cancelForBall(body.id);
        multiBallController.removeExtraBallByBody(body);
    };

    const clearExtraBalls = () => {
        foreshadowing
            .getActiveBallIds()
            .filter((ballId) => ballId !== ball.physicsBody.id)
            .forEach((ballId) => {
                foreshadowing.cancelForBall(ballId);
            });
        multiBallController.clear();
    };

    const spawnExtraBalls = (requestedCount?: number) => {
        multiBallController.spawnExtraBalls({ currentLaunchSpeed: runtimeState.currentLaunchSpeed, requestedCount });
    };

    const applyBallRestitution = (value: number) => {
        const normalized = Number.isFinite(value) ? value : runtimeState.ballRestitution;
        ball.physicsBody.restitution = normalized;
        multiBallController.setRestitution(normalized);
    };

    const {
        powerups,
        powerUpManager,
        runtimeModifiers,
        bindLaserController,
    } = createModifierPowerupServices({
        logger: runtimeLogger,
        modifierConfig: config.modifiers,
        runtimeState,
        basePaddleWidth: BASE_PADDLE_WIDTH,
        defaults: {
            paddleWidthMultiplier: DEFAULT_PADDLE_WIDTH_MULTIPLIER,
            multiBallCapacity: MULTI_BALL_CAPACITY,
            multiBallMaxDuration: MULTI_BALL_MAX_DURATION,
            slowTimeMaxDuration: SLOW_TIME_MAX_DURATION,
        },
        multiBallController,
        flashBallLight,
        flashPaddleLight,
        spawnExtraBalls,
        resetGhostBricks,
        applyGhostBrickReward,
        getGhostBrickRemainingDuration,
        physics,
        setPaddleWidth,
        setBallRestitution: applyBallRestitution,
        onSpeedGovernorChange: () => {
            /* speed governor state already updated by modifier module */
        },
    });

    runtimeModifiers.reset();

    let biasCoordinator: BiasPhaseCoordinator | null = null;
    let handleEntropyAction: ((action: EntropyActionType) => void) | null = null;

    const runtimeHud = createRuntimeHud({
        stage,
        theme: GameTheme,
        hudProfile,
        playfieldWidth: PLAYFIELD_WIDTH,
        metrics: {
            desktop: {
                margin: HUD_MARGIN,
                maxScale: HUD_SCALE,
                minScale: MIN_HUD_SCALE,
            },
            mobile: {
                margin: MOBILE_HUD_MARGIN,
                maxScale: MOBILE_HUD_MAX_SCALE,
                minScale: MOBILE_HUD_MIN_SCALE,
            },
        },
        getBrickLayoutBounds: () => brickLayoutBounds,
        getPaddleSnapshot: () => ({ centerY: paddle.position.y, height: paddle.height }),
        onEntropyAction: (action) => {
            handleEntropyAction?.(action);
        },
    });
    const { container: hudContainer, display: hudDisplay } = runtimeHud;
    const positionHud = () => runtimeHud.updateLayout();

    const applyRuntimeTheme = (theme: GameThemeDefinition) => {
        const snapshot = themeDefaults.applyTheme(theme);
        syncThemeSnapshot(snapshot);
        levelRuntime.setRowColors(rowColors);
        reapplyGambleAppearances();

        visualFactory.ball.setDefaults(ballVisualDefaults);
        visualFactory.paddle.setDefaults(paddleVisualDefaults);

        ballGlowFilter.color = themeBallColors.highlight;
        visuals?.ballSpeedRing?.setPalette({
            ringColor: themeBallColors.highlight,
            haloColor: themeBallColors.aura,
        });
        drawBallSprite(ballGraphics, ball.radius);
        visualFactory.paddle.draw(paddleGraphics, paddle.width, paddle.height);

        multiBallController.applyTheme(themeBallColors);

        hudDisplay.setTheme(theme);
        visuals?.roundCountdownDisplay?.setTheme(theme);
        stage.applyTheme(theme);
        visuals?.ballTrailsEffect?.applyTheme({
            coreColor: themeBallColors.core,
            auraColor: themeBallColors.aura,
            accentColor: themeAccents.combo,
        });
        visuals?.comboBloomEffect?.applyTheme(themeAccents.combo);
        visuals?.replacePaddleLight(themeAccents.powerUp);
        visuals?.playfieldBackground?.setTint(backgroundAccentColor, { immediate: true, accentMix: 0.2 });

        renderStageSoon();
    };

    applyRuntimeTheme(GameTheme);

    positionHud();

    unsubscribeTheme = onThemeChange((theme, name) => {
        runtimeLogger.info('Applied theme change', { theme: name });
        applyRuntimeTheme(theme);
    });

    let lastComboCount = 0;
    let refreshHudImpl: (() => void) | null = null;
    const refreshHud = () => {
        refreshHudImpl?.();
    };

    const runtimeRewards = createRuntimeRewards({
        random,
        roundMachine,
        sessionNow,
        getSessionSnapshot: () => session.snapshot(),
        spendStoredEntropy: (options: Parameters<GameSessionManager['spendStoredEntropy']>[0]) =>
            session.spendStoredEntropy(options),
        spendCoins: (amount: Parameters<GameSessionManager['spendCoins']>[0]) => session.spendCoins(amount),
        eventBus: bus,
        wheelSegments: config.rewards.wheelSegments,
        entropyCosts: ENTROPY_ACTION_COSTS,
        entropyBindings: ENTROPY_ACTION_BINDINGS,
        entropyOrder: ENTROPY_ACTION_SEQUENCE,
        lockCoinCost: REWARD_LOCK_COIN_COST,
        spinReward: (rng) => spinWheel(rng),
        setRewardOverride,
        createReward,
        onRenderStageSoon: () => {
            renderStageSoon();
        },
        onRequestHudRefresh: () => {
            refreshHud();
        },
        onHudPulseCombo: (intensity) => {
            hudDisplay.pulseCombo(intensity);
        },
        onFlashPaddleLight: (intensity) => {
            flashPaddleLight(intensity);
        },
        onClearExtraBalls: () => {
            clearExtraBalls();
        },
        onReattachBallToPaddle: () => {
            reattachBallToPaddle();
        },
        onResetAutoCompleteCountdown: () => {
            resetAutoCompleteCountdown();
        },
    });

    const { rewardWheel } = runtimeRewards;
    handleEntropyAction = (action) => {
        runtimeRewards.attemptEntropyAction(action);
    };

    refreshHudImpl = () => {
        const snapshot = session.snapshot();
        const gambleStatus = gambleManager.snapshot();
        const entropyActions = runtimeRewards.getHudEntropyActions(snapshot.hud.entropy.stored);
        const hudView = buildHudScoreboard(snapshot, gambleStatus, {
            entropyActions,
        });

        const prompts = (() => {
            const autoState = roundMachine.getAutoCompleteState();
            if (!autoState.enabled || !autoState.active) {
                return hudView.prompts;
            }
            const secondsRemaining = Math.max(0, autoState.timer);
            const formatted = secondsRemaining >= 10
                ? `${Math.ceil(secondsRemaining)}s`
                : `${secondsRemaining.toFixed(1)}s`;
            const severity = secondsRemaining <= 3 ? ('warning' as const) : ('info' as const);
            const autoPrompt = {
                id: 'auto-complete-countdown',
                severity,
                message: `Auto clear in ${formatted}`,
            };
            return [autoPrompt, ...hudView.prompts.filter((prompt) => prompt.id !== autoPrompt.id)];
        })();

        const viewWithCountdown = prompts === hudView.prompts
            ? hudView
            : {
                ...hudView,
                prompts,
            };

        hudDisplay.update({
            view: viewWithCountdown,
            difficultyMultiplier: roundMachine.getLevelDifficultyMultiplier(),
            comboCount: scoringState.combo,
            comboTimer: scoringState.comboTimer,
            activePowerUps: powerups.collectHudPowerUps(),
            reward: powerups.resolveRewardView(),
            momentum: snapshot.hud.momentum,
            entropyActions,
        });

        if (scoringState.combo > lastComboCount) {
            const pulseStrength = Math.min(1, 0.55 + scoringState.combo * 0.04);
            hudDisplay.pulseCombo(pulseStrength);
        }
        lastComboCount = scoringState.combo;
        positionHud();
    };

    refreshHud();

    const applyMetaSnapshot = (snapshotReason: 'loadout-changed' | 'dust-updated', details?: unknown) => {
        refreshMetaLoadout();
        applyRuntimeTheme(GameTheme);
        runtimeAudio.rebuildMidiEngine();
        refreshHud();
        renderStageSoon();
        const loadout = getMetaLoadout();
        const traits = getMetaTraitEffects();
        runtimeLogger.info('Meta upgrades updated', {
            reason: snapshotReason,
            visualPalette: loadout.visualPalette.id,
            audioPalette: loadout.audioPalette.id,
            extraLives: traits.extraLives,
            comboMultiplier: traits.comboDecayMultiplier,
            details,
        });
    };

    unsubscribeMeta = metaUpgrades.subscribe((snapshot) => {
        applyMetaSnapshot('loadout-changed', {
            dustBalance: snapshot.dustBalance,
            visualPalette: snapshot.equipped.visualPalette,
            audioPalette: snapshot.equipped.audioPalette,
            traits: snapshot.equipped.traits,
        });
    });

    scoring.setHudUpdater(refreshHud);

    const beginNewSession = async (): Promise<void> => {
        if (loop?.isRunning()) {
            loop.stop();
        }

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

        session = createSession();
        pushMusicState({
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
        await stage.transitionTo('gameplay');
        loop?.start();
    };

    const startLevel = (levelIndex: number, options: { resetScore?: boolean } = {}): void => {
        isPaused = false;

        gameContainer.visible = true;
        hudContainer.visible = true;

        roundMachine.clearLevelAutoCompleted();
        resetAutoCompleteCountdown();

        if (options.resetScore) {
            scoring.resetAll();
        } else {
            scoring.resetCombo();
        }
        syncMomentum();

        const sessionSnapshot = session.snapshot();
        roundMachine.startLevel(levelIndex, {
            resetScore: options.resetScore === true,
            combo: scoringState.combo,
            score: scoringState.score,
            coins: sessionSnapshot.coins,
        });

        const pendingBiasSelection = roundMachine.consumePendingBiasSelection();

        powerups.reset();
        runtimeModifiers.reset();
        clearExtraBalls();
        foreshadowing.reset();
        loadLevel(levelIndex);
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

    const buildBiasSessionSummary = (upcomingLevelIndex: number): BiasPhaseSessionSummary => {
        const snapshot = session.snapshot();
        return {
            nextLevel: upcomingLevelIndex + 1,
            score: scoringState.score,
            coins: snapshot.coins,
            lives: snapshot.livesRemaining,
            highestCombo: roundMachine.getRunHighestCombo(),
        } satisfies BiasPhaseSessionSummary;
    };

    biasCoordinator = createBiasPhaseCoordinator({
        logger: runtimeLogger,
        random,
        roundMachine,
        runtimeModifiers,
        modifierConfig: config.modifiers,
        stage,
        startLoop: () => {
            loop?.start();
        },
        startLevel: (levelIndex: number) => {
            startLevel(levelIndex);
        },
        renderStageSoon,
        replayBuffer,
        runtimeState,
        buildSessionSummary: buildBiasSessionSummary,
    });

    const presentBiasPhase = (): void => {
        if (!biasCoordinator) {
            runtimeLogger.error('Bias phase coordinator unavailable; skipping bias phase');
            const nextLevelIndex = roundMachine.incrementLevelIndex();
            startLevel(nextLevelIndex);
            loop?.start();
            renderStageSoon();
            return;
        }
        biasCoordinator.present();
    };

    const handleLevelComplete = (): void => {
        clearExtraBalls();
        foreshadowing.reset();
        isPaused = false;
        loop?.stop();
        const spunReward = spinWheel(random.random);
        let finalReward = spunReward;
        let rerollCount = 0;
        while (roundMachine.consumeRerollToken(sessionNow()) && rerollCount < 5) {
            finalReward = spinWheel(random.random);
            rerollCount += 1;
        }
        roundMachine.setPendingReward(finalReward);
        rewardWheel.publishInteraction('initial-spin', finalReward, {
            entropyCost: rerollCount * ENTROPY_COST_REROLL,
            coinsCost: 0,
        });
        resetAutoCompleteCountdown();

        const autoCompletedThisLevel = roundMachine.isLevelAutoCompleted();
        roundMachine.clearLevelAutoCompleted();

        const bricksBrokenThisLevel = roundMachine.getLevelBricksBroken();
        const roundUnlocks = achievements.recordRoundComplete({ bricksBroken: bricksBrokenThisLevel });
        if (roundUnlocks.length > 0) {
            roundMachine.enqueueAchievementUnlocks(roundUnlocks);
            refreshAchievementUpgrades();
        }

        const achievementsToShow = roundMachine.consumeAchievementNotifications();
        const sessionSnapshot = session.snapshot();
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
                runtimeLogger.error('Failed to push level-complete overlay', { error });
                continueToNextLevel();
            });
    };

    const handleGameOver = (): void => {
        clearExtraBalls();
        foreshadowing.reset();
        isPaused = false;
        loop?.stop();
        roundMachine.setPendingReward(null);
        powerups.reset();
        runtimeAudio.disableMusic();

        const sessionSnapshot = session.snapshot();
        const roundsCompleted = Math.max(1, roundMachine.getCurrentLevelIndex() + 1);
        const highestCombo = roundMachine.getRunHighestCombo();

        const sessionUnlocks = achievements.recordSessionSummary({ highestCombo: roundMachine.getRunHighestCombo() });
        if (sessionUnlocks.length > 0) {
            roundMachine.enqueueAchievementUnlocks(sessionUnlocks);
            refreshAchievementUpgrades();
        }

        const achievementsToShow = roundMachine.consumeAchievementNotifications();
        recordHighScore(scoringState.score, {
            round: roundsCompleted,
            achievedAt: Date.now(),
            minScore: 1,
        });

        const dustAwarded = computePrestigeDust(
            {
                score: scoringState.score,
                roundsCompleted,
                highestCombo,
                coinsBanked: sessionSnapshot.coins,
            },
            PRESTIGE_CONFIG,
        );

        if (dustAwarded > 0) {
            const grantResult = metaUpgrades.grantDust(dustAwarded);
            runtimeLogger.info('Prestige dust granted', {
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
                runtimeLogger.error('Failed to push game-over overlay', { error });
                if (stage.getCurrentScene() === 'game-over') {
                    stage.pop();
                    renderStageSoon();
                }
            });
    };

    const collisionContext: CollisionContext = {
        get session() {
            return session;
        },
        scoring,
        gambleManager,
        levelRuntime,
        brickHealth,
        brickMetadata,
        brickVisualState,
        powerUpManager,
        multiBallController,
        ball,
        paddle,
        physics: {
            attachBallToPaddle: physics.attachBallToPaddle,
            remove: physics.remove,
        },
        inputManager,
        roundMachine,
        dimensions: {
            brickWidth: BRICK_WIDTH,
            brickHeight: BRICK_HEIGHT,
            playfieldWidth: PLAYFIELD_WIDTH,
            playfieldHeight: PLAYFIELD_HEIGHT,
            playfieldSizeMax: PLAYFIELD_SIZE_MAX,
        },
        thresholds: {
            multiplier: config.scoring.multiplierThreshold,
            powerUpDuration: POWER_UP_DURATION,
            maxLevelBrickHp: MAX_LEVEL_BRICK_HP,
        },
        coins: {
            baseValue: COIN_BASE_VALUE,
            minValue: COIN_MIN_VALUE,
            maxValue: COIN_MAX_VALUE,
        },
        functions: {
            getSessionElapsedSeconds: () => runtimeState.sessionElapsedSeconds,
            getFrameTimestampMs: () => runtimeState.frameTimestampMs,
            getComboDecayWindow: () => resolveComboDecayWindow(),
            getCurrentBaseSpeed: () => runtimeState.currentBaseSpeed,
            getCurrentMaxSpeed: () => runtimeState.currentMaxSpeed,
            getPowerUpChanceMultiplier: () => roundMachine.getPowerUpChanceMultiplier(),
            getDoublePointsMultiplier: () => powerups.getDoublePointsMultiplier(),
            getActiveReward: () => powerups.getActiveReward(),
            incrementLevelBricksBroken: () => {
                roundMachine.incrementLevelBricksBroken();
            },
            updateHighestCombos: (combo: number) => {
                roundMachine.updateHighestCombos(combo);
            },
            refreshAchievementUpgrades: () => {
                refreshAchievementUpgrades();
            },
            recordBrickBreakAchievements: (combo: number) => achievements.recordBrickBreak({ combo }),
            queueAchievementUnlocks: (unlocks: readonly AchievementUnlock[]) => {
                roundMachine.enqueueAchievementUnlocks(unlocks);
            },
            syncMomentum,
            releaseForeshadowForBall: (ballId, actualTimeSeconds) => {
                foreshadowing.releaseForBall(ballId, actualTimeSeconds);
            },
            computeScheduledAudioTime,
            scheduleVisualEffect,
            spawnHeatRipple: (options) => {
                visuals?.heatRippleEffect?.spawnRipple(options);
            },
            emitBrickParticles: (options) => {
                visuals?.brickParticles?.emit(options);
            },
            flashBallLight: (intensity?: number) => {
                flashBallLight(intensity ?? 0.35);
            },
            flashPaddleLight: (intensity?: number) => {
                flashPaddleLight(intensity ?? 0.3);
            },
            hudPulseCombo: (intensity: number) => {
                hudDisplay.pulseCombo(intensity);
            },
            applyGambleAppearance,
            clearGhostEffect,
            removeBodyVisual,
            clearExtraBalls,
            reattachBallToPaddle,
            removeExtraBallByBody,
            promoteExtraBallToPrimary,
            handleLevelComplete,
            handleGameOver,
            handlePowerUpActivation: (type: PowerUpType) => {
                powerups.handlePowerUpActivation(type);
            },
            spawnCoin,
        },
    } satisfies CollisionContext;

    collisionRuntime = createCollisionRuntime({
        engine: physics.engine,
        bus,
        midiEngine: resolveMidiEngine(),
        random,
        context: collisionContext,
    });
    collisionRuntime.wire();

    laserController = createLaserController({
        collisionRuntime,
        visuals,
        levelRuntime,
        bus,
        getSessionId: () => session.snapshot().sessionId,
        computeScheduledAudioTime,
        scheduleVisualEffect,
        playfieldTop: 0,
        getPaddleState: () => ({
            center: paddleController.getPaddleCenter(paddle),
            width: paddle.width,
            height: paddle.height,
        }),
    });
    bindLaserController(laserController);

    const runGameplayUpdate = (deltaSeconds: number): void => {
        const audioTimeSeconds = scheduler.now();
        const nextElapsedSeconds = runtimeState.sessionElapsedSeconds + deltaSeconds;
        if (hasPerformanceNow) {
            const wallClockSeconds = performance.now() / 1000;
            runtimeState.audioVisualSkewSeconds = wallClockSeconds - audioTimeSeconds;
            runtimeState.syncDriftMs = runtimeState.audioVisualSkewSeconds * 1000;
            updateSyncDriftMetrics(runtimeState, runtimeState.syncDriftMs, nextElapsedSeconds);
        } else {
            runtimeState.audioVisualSkewSeconds = 0;
            runtimeState.syncDriftMs = 0;
            runtimeState.syncDriftAverageMs = 0;
            runtimeState.syncDriftPeakMs = 0;
            runtimeState.syncDriftPeakRecordedAt = nextElapsedSeconds;
            runtimeState.syncDriftHistory.length = 0;
            syncDriftTelemetry.reset();
        }

        runtimeState.sessionElapsedSeconds = nextElapsedSeconds;
        syncDriftTelemetry.emit(runtimeState.sessionElapsedSeconds, runtimeState);
        replayBuffer.markTime(runtimeState.sessionElapsedSeconds);
        runtimeState.frameTimestampMs = sessionNow();

        powerups.tick(deltaSeconds);
        laserController?.update(deltaSeconds);

        for (const binding of runtimeRewards.getActionBindings()) {
            if (runtimeInput.consumeKeyPress(binding.key)) {
                runtimeRewards.attemptEntropyAction(binding.action);
            }
        }

        const slowTimeScale = powerups.getSlowTimeScale();
        const slowTimeRemaining = powerups.getSlowTimeRemaining();
        const timeScale = slowTimeScale;
        const movementDelta = deltaSeconds * timeScale;
        const safeMovementDelta = movementDelta > 0 ? movementDelta : 1 / 240;

        const sessionSnapshot = session.snapshot();
        const bricksRemaining = sessionSnapshot.brickRemaining;
        const bricksTotal = sessionSnapshot.brickTotal;

        const autoResult = roundMachine.tickAutoComplete({
            deltaSeconds,
            bricksRemaining,
            sessionActive: sessionSnapshot.status === 'active',
        });
        if (autoResult.stateChanged) {
            syncAutoCompleteCountdownDisplay();
        }
        if (autoResult.triggered) {
            gambleRuntime?.clearAll();
            forceClearBreakableBricks();
            clearActivePowerUps();
            clearActiveCoins();
            session.completeRound();
            handleLevelComplete();
            return;
        }

        const speedMultiplier = calculateBallSpeedScale(powerUpManager.getEffect('ball-speed'));
        const difficultyScale = roundMachine.getLevelDifficultyMultiplier();
        const governor = runtimeState.speedGovernorMultiplier;
        const baseTargetSpeed = BALL_BASE_SPEED * speedMultiplier * difficultyScale * governor;
        runtimeState.currentMaxSpeed = Math.max(1, BALL_MAX_SPEED * speedMultiplier * difficultyScale * governor);
        runtimeState.currentBaseSpeed = getAdaptiveBaseSpeed(
            baseTargetSpeed,
            runtimeState.currentMaxSpeed,
            scoringState.combo,
        );
        runtimeState.currentLaunchSpeed = BALL_LAUNCH_SPEED * speedMultiplier * difficultyScale * governor;

        audioState$.next({
            combo: scoringState.combo,
            activePowerUps: powerUpManager.getActiveEffects().map((effect) => ({ type: effect.type })),
            lookAheadMs: scheduler.lookAheadMs,
        });

        updateGhostBricks(deltaSeconds);
        gambleRuntime?.tick(deltaSeconds);
        const paddleScale = powerups.getPaddleWidthScale();
        const targetPaddleWidth = runtimeState.paddleBaseWidth * paddleScale;
        setPaddleWidth(targetPaddleWidth);

        const comboBeforeDecay = scoringState.combo;
        scoring.decayCombo(deltaSeconds);
        if (comboBeforeDecay > 0 && scoringState.combo === 0) {
            session.recordEntropyEvent({ type: 'combo-reset', comboHeat: comboBeforeDecay });
        }
        syncMomentum();

        const { screen: paddleTarget, playfield: paddleTargetPlayfield } = runtimeInput.resolveTarget();
        const targetSnapshot = paddleTarget ? { x: paddleTarget.x, y: paddleTarget.y } : null;
        if (
            (runtimeState.lastRecordedInputTarget?.x ?? null) !== (targetSnapshot?.x ?? null) ||
            (runtimeState.lastRecordedInputTarget?.y ?? null) !== (targetSnapshot?.y ?? null)
        ) {
            replayBuffer.recordPaddleTarget(runtimeState.sessionElapsedSeconds, targetSnapshot);
            runtimeState.lastRecordedInputTarget = targetSnapshot ? { ...targetSnapshot } : null;
        }

        if (paddleTargetPlayfield) {
            const currentX = paddle.physicsBody.position.x;
            const nextX = runtimeInput.computeNextX({
                deltaSeconds,
                currentX,
                paddleWidth: paddle.width,
                target: paddleTargetPlayfield,
            });
            MatterBody.setPosition(paddle.physicsBody, { x: nextX, y: paddle.physicsBody.position.y });
            paddle.position.x = nextX;
        } else {
            paddle.position.x = paddle.physicsBody.position.x;
        }

        paddle.position.y = paddle.physicsBody.position.y;

        const paddleCenter = paddleController.getPaddleCenter(paddle);
        const paddleDelta = Math.hypot(
            paddleCenter.x - runtimeState.previousPaddlePosition.x,
            paddleCenter.y - runtimeState.previousPaddlePosition.y,
        );
        const paddleSpeed = paddleDelta / safeMovementDelta;
        visuals?.paddleLight?.update({
            position: { x: paddleCenter.x, y: paddleCenter.y },
            speed: paddleSpeed,
            deltaSeconds: movementDelta,
        });
        runtimeState.previousPaddlePosition = { x: paddleCenter.x, y: paddleCenter.y };

        const paddleWidthActive = powerUpManager.isActive('paddle-width');
        const paddlePulseInfluence = clampUnit(runtimeState.paddleGlowPulse);
        const paddleMotionGlow = clampUnit(paddleSpeed / Math.max(80, paddle.speed * 0.85));
        const pulseBase = paddleWidthActive ? 0.65 : 0;
        const paddlePulseLevel = clampUnit(pulseBase + paddlePulseInfluence * 0.85 + paddleMotionGlow * 0.6);
        const paddleAccentColor = paddleWidthActive
            ? themeAccents.powerUp
            : paddlePulseInfluence > 0
                ? mixColors(themeBallColors.aura, themeAccents.powerUp, paddlePulseInfluence)
                : undefined;

        visualFactory.paddle.draw(paddleGraphics, paddle.width, paddle.height, {
            accentColor: paddleAccentColor ?? paddleVisualDefaults.accentColor,
            pulseStrength: paddlePulseLevel,
            motionGlow: paddleMotionGlow,
        });

        ballController.updateAttachment(ball, paddleCenter);
        if (ball.isAttached) {
            physics.updateBallAttachment(ball.physicsBody, paddleCenter);
        }

        if (ball.isAttached) {
            runtimeInput.syncPaddlePosition(paddleCenter);
        }

        const launchIntent = runtimeInput.shouldLaunch() ? runtimeInput.consumeLaunchIntent() : null;
        if (ball.isAttached && launchIntent) {
            replayBuffer.recordLaunch(runtimeState.sessionElapsedSeconds);
            physics.detachBallFromPaddle(ball.physicsBody);
            launchController.launch(ball, launchIntent.direction, runtimeState.currentLaunchSpeed);
            runtimeInput.resetLaunchTrigger();
            bus.publish('BallLaunched', {
                sessionId: sessionSnapshot.sessionId,
                position: {
                    x: ball.physicsBody.position.x,
                    y: ball.physicsBody.position.y,
                },
                direction: {
                    x: launchIntent.direction.x,
                    y: launchIntent.direction.y,
                },
                speed: MatterVector.magnitude(ball.physicsBody.velocity),
            });
        } else if (launchIntent) {
            runtimeInput.resetLaunchTrigger();
        }

        const speedBeforeRegulation = MatterVector.magnitude(ball.physicsBody.velocity);

        regulateSpeed(ball.physicsBody, {
            baseSpeed: runtimeState.currentBaseSpeed,
            maxSpeed: runtimeState.currentMaxSpeed,
        });

        const speedAfterRegulation = MatterVector.magnitude(ball.physicsBody.velocity);
        const speedDelta = speedAfterRegulation - speedBeforeRegulation;
        const regulationInfo = Math.abs(speedDelta) > 0.01
            ? {
                direction: speedDelta >= 0 ? ('boost' as const) : ('clamp' as const),
                delta: speedDelta,
            }
            : null;

        const speedRange = Math.max(1, runtimeState.currentMaxSpeed - runtimeState.currentBaseSpeed);
        const normalizedSpeed = speedRange <= 1
            ? clampUnit(speedAfterRegulation / Math.max(1, runtimeState.currentMaxSpeed))
            : clampUnit((speedAfterRegulation - runtimeState.currentBaseSpeed) / speedRange);
        const bricksRatio = bricksTotal > 0 ? clampUnit(bricksRemaining / bricksTotal) : 1;
        const lowLives = sessionSnapshot.livesRemaining <= 1;
        const midLives = sessionSnapshot.livesRemaining === 2;
        const baseWarble = lowLives ? 0.55 : midLives ? 0.25 : 0;
        const warbleIntensity = clampUnit(baseWarble + normalizedSpeed * 0.35 + (1 - bricksRatio) * (lowLives ? 0.35 : 0.2));

        pushMusicState({
            lives: toMusicLives(sessionSnapshot.livesRemaining),
            combo: scoringState.combo,
            tempoRatio: normalizedSpeed,
            bricksRemainingRatio: bricksRatio,
            warbleIntensity,
        });

        const physicsOverlayState: PhysicsDebugOverlayState = {
            currentSpeed: speedAfterRegulation,
            baseSpeed: runtimeState.currentBaseSpeed,
            maxSpeed: runtimeState.currentMaxSpeed,
            timeScale,
            slowTimeScale,
            slowTimeRemaining,
            regulation: regulationInfo,
            extraBalls: multiBallController.count(),
            extraBallCapacity: MULTI_BALL_CAPACITY,
            syncDriftMs: runtimeState.syncDriftMs,
            syncDriftAverageMs: runtimeState.syncDriftAverageMs,
            syncDriftPeakMs: runtimeState.syncDriftPeakMs,
        };

        runtimeState.lastPhysicsDebugState = physicsOverlayState;

        if (movementDelta > 0) {
            physics.step(movementDelta * 1000);
        }

        foreshadowing.updatePredictions();

        visualBodies.forEach((visual, body) => {
            visual.x = body.position.x;
            visual.y = body.position.y;
            visual.rotation = body.angle;
        });

        updateBrickLighting(ball.physicsBody.position);

        visuals?.ballLight?.update({
            position: { x: ball.physicsBody.position.x, y: ball.physicsBody.position.y },
            speed: MatterVector.magnitude(ball.physicsBody.velocity),
            deltaSeconds: movementDelta,
        });

        visuals?.ballSpeedRing?.update({
            position: { x: ball.physicsBody.position.x, y: ball.physicsBody.position.y },
            speed: speedAfterRegulation,
            baseSpeed: runtimeState.currentBaseSpeed,
            maxSpeed: runtimeState.currentMaxSpeed,
            deltaSeconds: movementDelta,
        });

        multiBallController.updateSpeedIndicators({
            baseSpeed: runtimeState.currentBaseSpeed,
            maxSpeed: runtimeState.currentMaxSpeed,
            deltaSeconds: movementDelta,
        });

        visuals?.brickParticles?.update(deltaSeconds);

        const comboActive = scoringState.combo >= 2 && scoringState.comboTimer > 0;
        const comboIntensity = comboActive ? clampUnit(scoringState.combo / 14) : 0;
        const decayWindow = resolveComboDecayWindow();
        const comboTimerFactor = comboActive ? clampUnit(scoringState.comboTimer / decayWindow) : 0;
        const comboEnergy = Math.min(
            1.15,
            runtimeState.comboRingPulse * 0.85 + comboIntensity * 0.6 + comboTimerFactor * 0.45,
        );
        if (comboEnergy > 0) {
            const comboPhaseSpeed = 2.4 + comboIntensity * 3 + runtimeState.comboRingPulse * 2.5;
            const nextPhase = (runtimeState.comboRingPhase + movementDelta * comboPhaseSpeed) % (Math.PI * 2);
            runtimeState.comboRingPhase = nextPhase;
        }

        const shouldDisplayComboRing = comboEnergy > 0.02;
        if (comboRing) {
            if (shouldDisplayComboRing) {
                const ringPos = ball.physicsBody.position;
                const baseRadius = ball.radius * (2 + comboIntensity * 0.55);
                const wobble = Math.sin(runtimeState.comboRingPhase * 2) * 0.18;
                const radius = baseRadius * (1 + wobble) + comboEnergy * ball.radius * 0.4;

                const outerColor = mixColors(
                    themeBallColors.highlight,
                    themeAccents.combo,
                    Math.min(1, comboEnergy * 0.7),
                );
                const innerColor = mixColors(
                    themeAccents.combo,
                    themeBallColors.aura,
                    0.3 + comboEnergy * 0.4,
                );
                const outerAlpha = Math.min(1, 0.35 + comboEnergy * 0.4);
                const innerAlpha = Math.min(1, 0.28 + comboEnergy * 0.32);
                const fillAlpha = Math.min(1, 0.05 + comboEnergy * 0.12);
                const overallAlpha = Math.min(1, 0.25 + comboEnergy * 0.45);

                comboRing.update({
                    position: ringPos,
                    radius,
                    outerColor,
                    outerAlpha,
                    innerColor,
                    innerAlpha,
                    fillAlpha,
                    overallAlpha,
                });
            } else {
                comboRing.hide();
            }
        }

        const ballPulse = Math.min(1, comboEnergy * 0.5 + runtimeState.ballGlowPulse);
        const ballHueSpeed = 24 + comboEnergy * 120 + ballPulse * 90;
        ballHueShift = (ballHueShift + movementDelta * ballHueSpeed) % 360;
        ballHueFilter.reset();
        ballHueFilter.hue(ballHueShift, false);
        if (comboEnergy > 0.01) {
            ballHueFilter.saturate(1 + comboEnergy * 0.35, true);
        }

        const glowColor = mixColors(themeBallColors.highlight, themeAccents.combo, Math.min(1, comboEnergy * 0.75));
        ballGlowFilter.color = glowColor;
        ballGlowFilter.outerStrength = Math.min(5, 1.4 + comboEnergy * 0.8 + ballPulse * 2.6);

        const bloomEnergy = clampUnit(comboEnergy);
        visuals?.comboBloomEffect?.update({
            comboEnergy: bloomEnergy,
            deltaSeconds,
            accentColor: bloomAccentColor,
        });

        const backgroundLayer = visuals?.playfieldBackground;
        if (backgroundLayer) {
            const comboTint = mixColors(backgroundAccentColor, themeBallColors.aura, Math.min(0.45, comboEnergy * 0.35));
            const accentMix = clampUnit(0.2 + comboEnergy * 0.5);
            backgroundLayer.setTint(comboTint, { accentMix });

            const normalizedBallX = PLAYFIELD_WIDTH > 0
                ? clampUnit(ball.physicsBody.position.x / PLAYFIELD_WIDTH)
                : 0.5;
            const normalizedBallY = PLAYFIELD_HEIGHT > 0
                ? clampUnit(ball.physicsBody.position.y / PLAYFIELD_HEIGHT)
                : 0.5;
            const parallaxIntensity = clampUnit(0.3 + comboEnergy * 0.5);
            backgroundLayer.setParallaxTarget(
                { x: normalizedBallX, y: normalizedBallY },
                { intensity: parallaxIntensity },
            );
            backgroundLayer.update(deltaSeconds);
        }

        const ballTrailsEffect = visuals?.ballTrailsEffect;
        const ballTrailSources = visuals?.ballTrailSources;
        if (ballTrailsEffect && ballTrailSources) {
            ballTrailSources.length = 0;
            multiBallController.visitActiveBalls(({ body, isPrimary }) => {
                const normalizedSpeed = clampUnit(
                    MatterVector.magnitude(body.velocity) / Math.max(1, runtimeState.currentMaxSpeed),
                );
                ballTrailSources.push({
                    id: body.id,
                    position: { x: body.position.x, y: body.position.y },
                    radius: ball.radius,
                    normalizedSpeed,
                    isPrimary,
                });
            });

            ballTrailsEffect.update({
                deltaSeconds,
                comboEnergy,
                sources: ballTrailSources,
            });
        }

        const heatDistortionEffect = visuals?.heatDistortionEffect;
        const heatDistortionSources = visuals?.heatDistortionSources;
        if (heatDistortionEffect && heatDistortionSources) {
            heatDistortionSources.length = 0;
            multiBallController.visitActiveBalls(({ body }) => {
                const normalizedX = clampUnit(body.position.x / PLAYFIELD_WIDTH);
                const normalizedY = clampUnit(body.position.y / PLAYFIELD_HEIGHT);
                const speed = MatterVector.magnitude(body.velocity);
                const normalizedSpeed = clampUnit(speed / Math.max(1, runtimeState.currentMaxSpeed));
                const swirl = 6 + normalizedSpeed * 18;
                heatDistortionSources.push({
                    position: { x: normalizedX, y: normalizedY },
                    intensity: normalizedSpeed,
                    swirl,
                });
            });

            heatDistortionEffect.update({
                deltaSeconds,
                comboEnergy,
                sources: heatDistortionSources,
            });
        }

        visuals?.heatRippleEffect?.update(deltaSeconds);
        visuals?.audioWaveBackdrop?.update(deltaSeconds);

        runtimeState.ballGlowPulse = Math.max(0, runtimeState.ballGlowPulse - deltaSeconds * 1.6);
        runtimeState.paddleGlowPulse = Math.max(0, runtimeState.paddleGlowPulse - deltaSeconds * 1.3);
        runtimeState.comboRingPulse = Math.max(0, runtimeState.comboRingPulse - deltaSeconds * 1.05);

        const inputOverlay = visuals?.inputDebugOverlay;
        if (inputOverlay?.isVisible()) {
            inputOverlay.update();
        }
        const physicsOverlay = visuals?.physicsDebugOverlay;
        if (physicsOverlay?.isVisible() && runtimeState.lastPhysicsDebugState) {
            physicsOverlay.update(runtimeState.lastPhysicsDebugState);
        }
    };

    loop = createGameLoop(
        (deltaSeconds) => {
            stage.update(deltaSeconds);
        },
        () => {
            refreshHud();
            stage.app.render();
        },
        {
            onFrameMetrics: handleFrameMetrics,
        },
    );

    const { pauseGame, resumeFromPause, quitToMenu } = await registerRuntimeScenes({
        stage,
        getLoop: () => loop,
        renderStageSoon,
        provideSceneServices,
        beginNewSession,
        runGameplayUpdate,
        runtimeInput,
        gameContainer,
        hudContainer,
        getScore: () => scoringState.score,
        getIsPaused: () => isPaused,
        setIsPaused: (paused) => {
            isPaused = paused;
        },
        logger: runtimeLogger,
    });

    const { runtimeDebug: createdRuntimeDebug } = setupDebugHarnessIntegrations({
        logger: runtimeLogger,
        cheatPowerUpBindings,
        toggleTheme,
        pauseGame,
        resumeGame: () => {
            resumeFromPause();
        },
        quitToMenu,
        renderStageSoon,
        isPaused: () => isPaused,
        isLoopRunning: () => Boolean(loop?.isRunning()),
        getPhysicsDebugState: () => runtimeState.lastPhysicsDebugState,
        developerCheatDeps: {
            getCurrentScene: () => stage.getCurrentScene(),
            getPaddlePosition: () => ({
                x: paddle.physicsBody.position.x,
                y: paddle.physicsBody.position.y,
            }),
            spawnPowerUp: (type: PowerUpType, position: { x: number; y: number }) => {
                levelRuntime.spawnPowerUp(type, position);
            },
            powerUpRadius: POWER_UP_RADIUS,
            renderStageSoon,
            runtimeLogger,
            roundMachine,
            powerups,
            refreshHud,
            createReward: (type: RewardType) => createReward(type),
            session: sessionFacade,
            handleLevelComplete,
        },
        harnessDeps: {
            beginNewSession,
            getCurrentScene: () => stage.getCurrentScene(),
            isLoopRunning: () => Boolean(loop?.isRunning()),
            getIsPaused: () => isPaused,
            pauseGame,
            resumeGameplay: () => {
                resumeFromPause();
            },
            quitToMenu,
            scoring,
            session: sessionFacade,
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
        },
        overlays: {
            input: visuals?.inputDebugOverlay ?? null,
            physics: visuals?.physicsDebugOverlay ?? null,
        },
    });

    runtimeDebug = createdRuntimeDebug;


    const cleanupVisuals = () => {
        runtimeAudio.clearScheduledVisualEffects();
        gambleRuntime?.dispose();
        unsubscribeMeta?.();
        unsubscribeMeta = null;
        unsubscribeTheme?.();
        unsubscribeTheme = null;
        runtimePerformance.updateVisuals(null);
        runtimePerformance.reset();
        visuals?.dispose();
        visuals = null;
        runtimeAudio.setBeatCallback(null);
        runtimeAudio.setMeasureCallback(null);
        runtimeDebug?.resetVisibility();
        runtimeDebug?.updateOverlays({ input: null, physics: null });
        runtimeState.lastPhysicsDebugState = null;
        runtimeState.syncDriftHistory.length = 0;
        runtimeState.syncDriftAverageMs = 0;
        runtimeState.syncDriftPeakMs = 0;
        runtimeState.syncDriftPeakRecordedAt = runtimeState.sessionElapsedSeconds;
        syncDriftTelemetry.reset();
    };

    const { lifecycle, idleResumeSummary } = initializeRuntimeLifecycle({
        session,
        random,
        fateLedger,
        cleanupHandlers: [
            () => {
                runtimeAudio.dispose();
            },
            () => {
                foreshadowing.dispose();
            },
            () => {
                disposeInitializer();
            },
            () => {
                cleanupVisuals();
            },
            () => {
                runtimePerformance.dispose();
            },
            () => {
                runtimeHud.dispose();
            },
            () => {
                runtimeInput.dispose();
            },
            () => {
                runtimeDebug?.dispose();
                runtimeDebug = null;
            },
            () => {
                collisionRuntime?.unwire();
                collisionRuntime = null;
            },
            () => {
                bindLaserController(null);
                laserController?.dispose();
                laserController = null;
            },
        ],
    });
    if (idleResumeSummary) {
        refreshHud();
        hudDisplay.pulseCombo(0.35);
        renderStageSoon();
    }

    const handle: GameRuntimeHandle = {
        getSessionElapsedSeconds: () => runtimeState.sessionElapsedSeconds,
        dispose: () => {
            lifecycle.dispose();
        },
    };

    return {
        handle,
        modules: {
            lifecycle,
            input: runtimeInput,
            debug: runtimeDebug,
            visuals,
            collisions: collisionRuntime,
            scoring,
            rewards: runtimeRewards,
            powerups,
            roundMachine,
            modifiers: runtimeModifiers,
        },
    } satisfies RuntimeFacade;
};

export const createGameRuntime = async (options: GameRuntimeOptions): Promise<GameRuntimeHandle> => {
    const runtime = await createRuntimeFacade(options);
    return runtime.handle;
};

export const __internalGameRuntimeTesting = {
    isPromiseLike,
    waitForPromise,
    isAutoplayBlockedError,
    resolveToneTransport,
    ensureToneAudio: audioBootstrap.ensureToneAudio,
    resolveBallRadius,
    intersectRayWithExpandedAabb,
    deriveLayoutSeed,
    clampMidiNote,
    updateSyncDriftMetrics,
    SYNC_DRIFT_HISTORY_SECONDS,
    SYNC_DRIFT_HISTORY_MAX_SAMPLES,
    SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS,
    SYNC_DRIFT_WARN_THRESHOLD_MS,
    SYNC_DRIFT_RECOVERY_THRESHOLD_MS,
};
