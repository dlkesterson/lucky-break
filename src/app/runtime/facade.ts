import {
    scheduleForeshadowEvent,
    initForeshadower,
    cancelForeshadowEvent,
    disposeForeshadower,
} from 'audio/foreshadow-api';
import type { ForeshadowDiagnostics } from 'audio/AudioForeshadower';

import {
    GameTheme,
    onThemeChange,
    toggleTheme,
    type GameThemeDefinition,
} from 'render/theme';
import { createPhysicsWorld } from 'physics/world';
import { createGameLoop, type LoopOptions } from '../loop';
import { createGameSessionManager } from '../state';
import type { EntropyActionType, LifeLostCause, RewardWheelInteractionType } from '../events';
import { createAchievementManager, type AchievementUnlock } from '../achievements';
import { getMetaUpgradeManager } from '../metaprogression';
import { createFateLedger } from '../fate-ledger';
import { buildHudScoreboard, type HudEntropyActionDescriptor } from 'render/hud';
import { createHudDisplay } from 'render/hud-display';
import { createMobileHudDisplay } from 'render/mobile-hud-display';
import { createMainMenuScene } from 'scenes/main-menu';
import { createGameplayScene } from 'scenes/gameplay';
import {
    createLevelCompleteScene,
    type LevelCompleteRewardWheelPayload,
    type RewardWheelState,
    type RewardWheelUpdateResult,
} from 'scenes/level-complete';
import {
    createBiasPhaseScene,
    type BiasPhasePayload,
    type BiasPhaseSceneOption,
    type BiasPhaseSessionSummary,
} from 'scenes/bias-phase';
import { createFateLedgerScene } from 'scenes/fate-ledger';
import { createGameOverScene } from 'scenes/game-over';
import { createPauseScene } from 'scenes/pause';
import { gameConfig, type GameConfig } from 'config/game';
import { BallAttachmentController } from 'physics/ball-attachment';
import { PaddleBodyController } from 'render/paddle-body';
import { PhysicsBallLaunchController } from 'physics/ball-launch';
import { regulateSpeed, getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { getMomentumMetrics } from 'util/scoring';
import { calculateBallSpeedScale, type PowerUpType } from 'util/power-ups';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import {
    toColorNumber,
    clampUnit,
    mixColors,
    type BallVisualDefaults,
    type BallVisualPalette,
    type PaddleVisualDefaults,
} from 'render/playfield-visuals';
import { createVisualFactory } from 'render/visual-factory';
import { Sprite, Container, Graphics, ColorMatrixFilter, type Filter } from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import {
    Body as MatterBody,
    Vector as MatterVector,
} from 'physics/matter';
import type { MatterBody as Body } from 'physics/matter';
import { Transport } from 'tone';
import type { MusicState, MusicBeatEvent, MusicMeasureEvent } from 'audio/music-director';
import { createMidiEngine, type MidiEngine } from 'audio/midi-engine';
import { mulberry32, type RandomManager } from 'util/random';
import type { ReplayBuffer, ReplayRecording } from '../replay-buffer';
import { createGameInitializer } from '../game-initializer';
import { createMultiBallController, type MultiBallColors } from '../multi-ball-controller';
import { createLevelRuntime, type BrickLayoutBounds } from '../level-runtime';
import { createBrickDecorator } from '../brick-layout-decorator';
import { getPresetLevelCount, setLevelPresetOffset, MAX_LEVEL_BRICK_HP } from 'util/levels';
import {
    spinWheel,
    createReward,
    setRewardOverride,
    type Reward,
    type RewardType,
    type LaserPaddleReward,
} from 'game/rewards';
import { createGambleBrickManager } from 'game/gamble-brick-manager';
import { rootLogger } from 'util/log';
import { getHighScores, recordHighScore } from 'util/high-scores';
import type { GameSceneServices } from '../scene-services';
import { developerCheats } from '../developer-cheats';
import type { PhysicsDebugOverlayState } from 'render/debug-overlay';
import { createRuntimeVisuals, type ForeshadowInstrument } from './visuals';
import { createGambleHighlightEffect, type GambleHighlightEffect } from 'render/effects';
import { createRuntimeScoring, type RuntimeScoringHandle } from './scoring';
import {
    createRoundMachine,
    type BiasOptionRisk,
    type BiasPhaseEffects,
    type BiasPhaseOption,
    type BiasPhaseState,
    type EntropyActionState,
    type RoundMachine,
} from './round-machine';
import { createRuntimePowerups, type RuntimePowerups } from './powerups';
import { createRuntimeInput, type RuntimeInput } from './input';
import { createRuntimeDebug, type RuntimeDebug } from './debug';
import { createRuntimeLifecycle, type RuntimeLifecycle } from './lifecycle';
import type { GameplayRuntimeState, SyncDriftSample } from './types';
import { getSettings, subscribeSettings } from 'util/settings';
import { createLaserController, type LaserController } from './laser';
import { createRuntimeModifiers, type RuntimeModifierSnapshot, type RuntimeModifiers } from './modifiers';
import { createIdleSimulation, type IdleSimulationResultSummary } from './idle';

type RuntimeVisuals = ReturnType<typeof createRuntimeVisuals>;
import {
    ensureToneAudio as ensureToneAudioBase,
    isAutoplayBlockedError,
    resolveToneTransport,
    isPromiseLike,
    waitForPromise,
} from './audio';
import { createCollisionRuntime, type CollisionRuntime, type CollisionContext } from './collisions';

const runtimeLogger = rootLogger.child('game-runtime');

interface BiasPhaseAutomation {
    readonly select: (optionId: string) => void;
    readonly skip: () => void;
}

const ensureToneAudio = () =>
    ensureToneAudioBase({
        warn: (message, details) => {
            if (details) {
                runtimeLogger.warn(message, details);
            } else {
                runtimeLogger.warn(message);
            }
        },
    });

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

const FORESHADOW_SCALE_SALT = 0x4b1d9a85;
const FORESHADOW_EVENT_SALT = 0x2c9277b9;
const FORESHADOW_MIN_PREDICTION_SECONDS = 0.28;
const FORESHADOW_MAX_PREDICTION_SECONDS = 3.6;
const FORESHADOW_MIN_SPEED = Math.max(4, BALL_BASE_SPEED * 0.75);
const FORESHADOW_MIN_LEAD_SECONDS = 0.35;
const FORESHADOW_MAX_LEAD_SECONDS = 2.6;

const FORESHADOW_SCALE_LIBRARY: readonly (readonly number[])[] = [
    [52, 55, 57, 59, 62, 64, 67], // D mixolydian
    [48, 50, 53, 55, 57, 60, 62], // C major pentatonic
    [45, 48, 50, 52, 55, 57, 60], // A minor
    [47, 50, 52, 54, 57, 59, 62], // B dorian
    [49, 52, 54, 56, 59, 61, 64], // C# minor
    [57, 60, 62, 64, 67, 69, 72], // A major
    [55, 58, 60, 63, 65, 67, 70], // G mixolydian
    [53, 56, 58, 60, 63, 65, 68], // F lydian
];

const clampMidiNote = (note: number, min = 36, max = 96): number => {
    if (!Number.isFinite(note)) {
        return min;
    }
    return Math.max(min, Math.min(max, Math.round(note)));
};

const deriveForeshadowScale = (seed: number): readonly number[] => {
    const normalizedSeed = (seed ^ FORESHADOW_SCALE_SALT) >>> 0;
    const rng = mulberry32(normalizedSeed);
    const libraryIndex = Math.floor(rng() * FORESHADOW_SCALE_LIBRARY.length) % FORESHADOW_SCALE_LIBRARY.length;
    const baseScale = FORESHADOW_SCALE_LIBRARY[libraryIndex] ?? FORESHADOW_SCALE_LIBRARY[0];
    const octaveShift = Math.floor(rng() * 3) - 1; // -1, 0, 1
    const shiftSemitones = octaveShift * 12;
    return baseScale.map((note) => clampMidiNote(note + shiftSemitones));
};

const resolveBallRadius = (body: Body): number => {
    if (typeof body.circleRadius === 'number' && Number.isFinite(body.circleRadius)) {
        return Math.max(2, body.circleRadius);
    }
    const width = body.bounds?.max.x - body.bounds?.min.x;
    const height = body.bounds?.max.y - body.bounds?.min.y;
    if (Number.isFinite(width) && Number.isFinite(height)) {
        return Math.max(2, Math.max(width ?? 0, height ?? 0) / 2);
    }
    return 10;
};

const intersectRayWithExpandedAabb = (
    origin: { readonly x: number; readonly y: number },
    direction: { readonly x: number; readonly y: number },
    bounds: Body['bounds'],
    radius: number,
): number | null => {
    const minX = bounds.min.x - radius;
    const maxX = bounds.max.x + radius;
    const minY = bounds.min.y - radius;
    const maxY = bounds.max.y + radius;

    let tMin = 0;
    let tMax = Number.POSITIVE_INFINITY;

    if (Math.abs(direction.x) < 1e-6) {
        if (origin.x < minX || origin.x > maxX) {
            return null;
        }
    } else {
        const invX = 1 / direction.x;
        let t1 = (minX - origin.x) * invX;
        let t2 = (maxX - origin.x) * invX;
        if (t1 > t2) {
            [t1, t2] = [t2, t1];
        }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) {
            return null;
        }
    }

    if (Math.abs(direction.y) < 1e-6) {
        if (origin.y < minY || origin.y > maxY) {
            return null;
        }
    } else {
        const invY = 1 / direction.y;
        let t1 = (minY - origin.y) * invY;
        let t2 = (maxY - origin.y) * invY;
        if (t1 > t2) {
            [t1, t2] = [t2, t1];
        }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) {
            return null;
        }
    }

    if (tMax < 0) {
        return null;
    }

    const impactTime = tMin >= 0 ? tMin : tMax;
    if (!Number.isFinite(impactTime) || impactTime < 0) {
        return null;
    }
    return impactTime;
};

const AUTO_COMPLETE_SETTINGS = config.levels.autoComplete;
const AUTO_COMPLETE_ENABLED = AUTO_COMPLETE_SETTINGS.enabled;
const AUTO_COMPLETE_COUNTDOWN = Math.max(1, AUTO_COMPLETE_SETTINGS.countdownSeconds);
const AUTO_COMPLETE_TRIGGER = Math.max(1, AUTO_COMPLETE_SETTINGS.triggerRemainingBricks);

const deriveLayoutSeed = (baseSeed: number, levelIndex: number): number => {
    const normalizedIndex = levelIndex + 1;
    const hashed = (baseSeed ^ Math.imul(normalizedIndex, LAYOUT_SEED_SALT)) >>> 0;
    return hashed === 0 ? 1 : hashed;
};

const SYNC_DRIFT_HISTORY_SECONDS = 6;
const SYNC_DRIFT_HISTORY_MAX_SAMPLES = SYNC_DRIFT_HISTORY_SECONDS * 120;
const SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS = 12;
const SYNC_DRIFT_WARN_THRESHOLD_MS = 35;
const SYNC_DRIFT_RECOVERY_THRESHOLD_MS = 12;

const updateSyncDriftMetrics = (
    state: Pick<
        GameplayRuntimeState,
        'syncDriftHistory' | 'syncDriftAverageMs' | 'syncDriftPeakMs' | 'syncDriftPeakRecordedAt'
    >,
    driftMs: number,
    elapsedSeconds: number,
): void => {
    const safeElapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
    const safeDrift = Number.isFinite(driftMs) ? driftMs : 0;
    state.syncDriftHistory.push({
        timestamp: safeElapsed,
        drift: safeDrift,
        magnitude: Math.abs(safeDrift),
    } satisfies SyncDriftSample);

    const cutoff = safeElapsed - SYNC_DRIFT_HISTORY_SECONDS;
    while (state.syncDriftHistory.length > 0) {
        const oldest = state.syncDriftHistory[0];
        if (!oldest || oldest.timestamp >= cutoff) {
            break;
        }
        state.syncDriftHistory.shift();
    }

    if (state.syncDriftHistory.length > SYNC_DRIFT_HISTORY_MAX_SAMPLES) {
        state.syncDriftHistory.splice(0, state.syncDriftHistory.length - SYNC_DRIFT_HISTORY_MAX_SAMPLES);
    }

    if (state.syncDriftHistory.length === 0) {
        state.syncDriftAverageMs = 0;
        state.syncDriftPeakMs = 0;
        state.syncDriftPeakRecordedAt = safeElapsed;
        return;
    }

    let sum = 0;
    let peak = 0;
    let peakTimestamp = state.syncDriftHistory[state.syncDriftHistory.length - 1]?.timestamp ?? safeElapsed;
    for (const sample of state.syncDriftHistory) {
        sum += sample.drift;
        if (sample.magnitude >= peak) {
            peak = sample.magnitude;
            peakTimestamp = sample.timestamp;
        }
    }

    state.syncDriftAverageMs = sum / state.syncDriftHistory.length;
    state.syncDriftPeakMs = peak;
    state.syncDriftPeakRecordedAt = peakTimestamp;
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

const ENTROPY_ACTION_BINDINGS: Record<EntropyActionType, { key: string; hotkey: string; label: string }> = {
    reroll: { key: 'KeyR', hotkey: 'R', label: 'Reroll' },
    shield: { key: 'KeyS', hotkey: 'S', label: 'Shield' },
    bailout: { key: 'KeyB', hotkey: 'B', label: 'Bailout' },
} as const;

const ENTROPY_ACTION_SEQUENCE: readonly EntropyActionType[] = ['reroll', 'shield', 'bailout'];

const achievements = createAchievementManager();
const fateLedger = createFateLedger();
const metaUpgrades = getMetaUpgradeManager();

let upgradeSnapshot = achievements.getUpgradeSnapshot();
let metaUpgradeLoadout = metaUpgrades.getLoadout();
let traitEffects = metaUpgradeLoadout.traitEffects;

const recomputeComboDecayWindow = () => {
    const combinedMultiplier = upgradeSnapshot.comboDecayMultiplier * traitEffects.comboDecayMultiplier;
    const candidate = BASE_COMBO_DECAY_WINDOW * combinedMultiplier;
    return Number.isFinite(candidate) && candidate > 0 ? candidate : BASE_COMBO_DECAY_WINDOW;
};

let comboDecayWindow = recomputeComboDecayWindow();

const refreshAchievementUpgrades = () => {
    upgradeSnapshot = achievements.getUpgradeSnapshot();
    comboDecayWindow = recomputeComboDecayWindow();
    return upgradeSnapshot;
};

const applyMetaLoadout = (loadout: typeof metaUpgradeLoadout) => {
    metaUpgradeLoadout = loadout;
    traitEffects = loadout.traitEffects;
    comboDecayWindow = recomputeComboDecayWindow();
};

const refreshMetaLoadout = () => {
    applyMetaLoadout(metaUpgrades.getLoadout());
};

refreshMetaLoadout();

const resolveInitialLives = () => Math.max(1, BASE_LIVES + upgradeSnapshot.bonusLives + traitEffects.extraLives);

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
    readonly powerups: RuntimePowerups;
    readonly roundMachine: RoundMachine;
    readonly modifiers: RuntimeModifiers;
}

export interface RuntimeFacade {
    readonly handle: GameRuntimeHandle;
    readonly modules: RuntimeFacadeModules;
}

type PaddleState = Paddle;
type BallState = Ball;

export const createRuntimeFacade = async ({
    container,
    playfieldDimensions = PLAYFIELD_DEFAULT,
    layoutOrientation,
    uiProfile,
    random,
    replayBuffer,
    onAudioBlocked,
}: GameRuntimeOptions): Promise<RuntimeFacade> => {
    await ensureToneAudio().catch((error) => {
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
    const HALF_PLAYFIELD_WIDTH = PLAYFIELD_WIDTH / 2;
    const layoutDecorator = createBrickDecorator(sessionOrientation);

    const toColorValue = (value: string | number): number =>
        typeof value === 'number' ? value : toColorNumber(value);

    let rowColors = GameTheme.brickColors.map(toColorNumber);
    let themeBallColors: MultiBallColors = {
        core: 0xffffff,
        aura: 0xffffff,
        highlight: 0xffffff,
    };
    let themeAccents = {
        combo: 0xffffff,
        powerUp: 0xffffff,
    };

    let ballVisualDefaults: BallVisualDefaults = {
        baseColor: 0xffffff,
        auraColor: 0xffffff,
        highlightColor: 0xffffff,
        baseAlpha: 0.78,
        rimAlpha: 0.38,
        innerAlpha: 0.32,
        innerScale: 0.5,
    } satisfies BallVisualDefaults;

    let paddleVisualDefaults: PaddleVisualDefaults = {
        gradient: GameTheme.paddle.gradient.map(toColorNumber),
        accentColor: toColorValue(GameTheme.accents.combo),
    } satisfies PaddleVisualDefaults;

    let backgroundAccentOverrides: readonly number[] | null = null;

    const applyMetaVisualDefaults = (theme: GameThemeDefinition) => {
        const palette = metaUpgradeLoadout.visualPalette;
        themeBallColors = {
            core: toColorValue(palette.ball?.core ?? theme.ball.core),
            aura: toColorValue(palette.ball?.aura ?? theme.ball.aura),
            highlight: toColorValue(palette.ball?.highlight ?? theme.ball.highlight),
        } satisfies MultiBallColors;

        ballVisualDefaults = {
            baseColor: themeBallColors.core,
            auraColor: themeBallColors.aura,
            highlightColor: themeBallColors.highlight,
            baseAlpha: palette.ball?.baseAlpha ?? 0.78,
            rimAlpha: palette.ball?.rimAlpha ?? 0.38,
            innerAlpha: palette.ball?.innerAlpha ?? 0.32,
            innerScale: palette.ball?.innerScale ?? 0.5,
        } satisfies BallVisualDefaults;

        const paddleGradientSource = palette.paddle?.gradient ?? theme.paddle.gradient;
        const paddleAccentSource = palette.paddle?.accentColor ?? theme.accents.combo;
        paddleVisualDefaults = {
            gradient: paddleGradientSource.map(toColorValue),
            accentColor: toColorValue(paddleAccentSource),
        } satisfies PaddleVisualDefaults;

        themeAccents = {
            combo: toColorValue(palette.accents?.combo ?? theme.accents.combo),
            powerUp: toColorValue(palette.accents?.powerUp ?? theme.accents.powerUp),
        };

        backgroundAccentOverrides = palette.accents?.background && palette.accents.background.length > 0
            ? palette.accents.background.map(toColorValue)
            : null;
    };

    applyMetaVisualDefaults(GameTheme);

    let visuals: RuntimeVisuals | null = null;

    const performanceLogger = typeof runtimeLogger.child === 'function'
        ? runtimeLogger.child('performance')
        : runtimeLogger;
    let userPerformancePreference = getSettings().performance;
    let dynamicPerformanceMode = false;
    let desiredVisualProfile: 'quality' | 'performance' = userPerformancePreference ? 'performance' : 'quality';
    let unsubscribeSettings: (() => void) | null = null;
    let unsubscribeMeta: (() => void) | null = null;

    const applyVisualPerformanceProfile = () => {
        desiredVisualProfile = userPerformancePreference || dynamicPerformanceMode ? 'performance' : 'quality';
        visuals?.setEffectProfile(desiredVisualProfile);
    };

    unsubscribeSettings = subscribeSettings((snapshot) => {
        userPerformancePreference = snapshot.performance;
        applyVisualPerformanceProfile();
    });

    const gambleTintArmed = toColorNumber(GAMBLE_TINT_ARMED);
    const gambleTintPrimed = toColorNumber(GAMBLE_TINT_PRIMED);
    const gambleManager = createGambleBrickManager({
        timerSeconds: GAMBLE_TIMER_SECONDS,
        rewardMultiplier: Math.max(1, GAMBLE_REWARD_MULTIPLIER),
        primeResetHp: Math.max(1, GAMBLE_PRIME_RESET_HP),
        failPenaltyHp: Math.max(1, GAMBLE_FAIL_PENALTY_HP),
    });

    const visualFactory = createVisualFactory({
        ball: ballVisualDefaults,
        paddle: paddleVisualDefaults,
    });

    let ballHueShift = 0;
    let gambleHighlight: GambleHighlightEffect | null = null;
    let gambleCountdownLastSecond: number | null = null;
    let runtimeDebug: RuntimeDebug | null = null;

    let biasPhaseAutomation: BiasPhaseAutomation | null = null;

    const flashBallLight = (intensity: number) => {
        visuals?.ballLight?.flash(intensity);
    };

    const flashPaddleLight = (intensity: number) => {
        visuals?.paddleLight?.flash(intensity);
    };
    let backgroundAccentIndex = 0;
    let backgroundAccentColor = themeAccents.combo;
    let bloomAccentColor = themeAccents.combo;
    let backgroundAccentPalette: number[] = [];

    const rebuildBackgroundPalette = () => {
        const override = backgroundAccentOverrides && backgroundAccentOverrides.length > 0
            ? [...backgroundAccentOverrides]
            : [
                themeAccents.combo,
                themeBallColors.aura,
                mixColors(themeAccents.powerUp, themeBallColors.highlight, 0.45),
            ];
        backgroundAccentPalette = override.length > 0 ? override : [0xffffff];
        if (backgroundAccentPalette.length === 0) {
            backgroundAccentPalette = [0xffffff];
        }
        backgroundAccentIndex %= backgroundAccentPalette.length;
        backgroundAccentColor = backgroundAccentPalette[backgroundAccentIndex] ?? themeAccents.combo;
        bloomAccentColor = backgroundAccentColor;
        visuals?.playfieldBackground?.setTint(backgroundAccentColor, { immediate: true, accentMix: 0.2 });
    };

    rebuildBackgroundPalette();
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
    const pendingVisualTimers = new Set<ReturnType<typeof setTimeout>>();
    let midiEngine: MidiEngine = createMidiEngine({
        palette: metaUpgradeLoadout.audioPalette.config,
    });

    const rebuildMidiEngine = () => {
        const previous = midiEngine;
        midiEngine = createMidiEngine({
            palette: metaUpgradeLoadout.audioPalette.config,
        });
        previous.dispose();
    };

    const computeScheduledAudioTime = (offsetMs = 0): number => scheduler.predictAt(offsetMs);

    const scheduleVisualEffect = (scheduledTime: number | undefined, effect: () => void): void => {
        if (typeof scheduledTime !== 'number' || !Number.isFinite(scheduledTime)) {
            effect();
            return;
        }

        if (!hasPerformanceNow) {
            effect();
            return;
        }

        const wallNowSeconds = performance.now() / 1000;
        const targetVisualSeconds = scheduledTime + runtimeState.audioVisualSkewSeconds;
        const delayMs = Math.max(0, (targetVisualSeconds - wallNowSeconds) * 1000);

        if (delayMs <= 2) {
            effect();
            return;
        }

        const timer = setTimeout(() => {
            pendingVisualTimers.delete(timer);
            effect();
        }, delayMs);
        pendingVisualTimers.add(timer);
    };

    const resolveForeshadowVisualTime = (transportTime: number): number | undefined => {
        if (!Number.isFinite(transportTime)) {
            return undefined;
        }
        const nowSeconds = Transport.now();
        const deltaSeconds = Math.max(0, transportTime - nowSeconds);
        const offsetMs = deltaSeconds * 1000 - scheduler.lookAheadMs;
        if (!Number.isFinite(offsetMs)) {
            return undefined;
        }
        return scheduler.predictAt(offsetMs);
    };

    const foreshadowVisualEvents = new Map<string, ForeshadowInstrument>();

    const triggerForeshadowWave = (
        accent: 'schedule' | 'note' | 'cancel',
        instrument: ForeshadowInstrument,
        intensity: number,
        transportTime?: number,
    ): void => {
        if (!visuals?.audioWaveBackdrop) {
            return;
        }
        const clampedIntensity = clampUnit(intensity);
        if (clampedIntensity <= 0 && accent !== 'cancel') {
            return;
        }
        const applyBump = () => {
            const backdrop = visuals?.audioWaveBackdrop;
            if (!backdrop) {
                return;
            }
            backdrop.setVisible(true);
            const resolvedIntensity = accent === 'cancel' ? Math.max(clampedIntensity, 0.35) : clampedIntensity;
            backdrop.bump('foreshadow', {
                accent,
                instrument,
                intensity: resolvedIntensity,
            });
        };
        const scheduledTime = typeof transportTime === 'number'
            ? resolveForeshadowVisualTime(transportTime)
            : undefined;
        scheduleVisualEffect(scheduledTime, applyBump);
    };

    const physics = createPhysicsWorld({
        dimensions: { width: PLAYFIELD_WIDTH, height: PLAYFIELD_HEIGHT },
        gravity: 0,
    });

    const runtimeState: GameplayRuntimeState = {
        sessionElapsedSeconds: 0,
        frameTimestampMs: 0,
        audioVisualSkewSeconds: 0,
        syncDriftMs: 0,
        syncDriftAverageMs: 0,
        syncDriftPeakMs: 0,
        syncDriftPeakRecordedAt: 0,
        syncDriftHistory: [],
        ballGlowPulse: 0,
        paddleGlowPulse: 0,
        comboRingPulse: 0,
        comboRingPhase: 0,
        lastRecordedInputTarget: null,
        previousPaddlePosition: { x: 0, y: 0 },
        lastPhysicsDebugState: null,
        currentBaseSpeed: BALL_BASE_SPEED,
        currentMaxSpeed: BALL_MAX_SPEED,
        currentLaunchSpeed: BALL_LAUNCH_SPEED,
        gravity: MODIFIER_GRAVITY_RANGE.default,
        ballRestitution: BASE_BALL_RESTITUTION,
        paddleBaseWidth: BASE_PADDLE_WIDTH * MODIFIER_PADDLE_WIDTH_RANGE.default,
        speedGovernorMultiplier: MODIFIER_SPEED_GOVERNOR_RANGE.default,
    };

    let nextSyncDriftTelemetryLogAt = SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
    let syncDriftWarnActive = false;

    const formatDriftValue = (value: number): number => {
        if (!Number.isFinite(value)) {
            return value;
        }
        return Number(value.toFixed(2));
    };

    const emitSyncDriftTelemetry = (elapsedSeconds: number): void => {
        if (!hasPerformanceNow) {
            return;
        }

        const sampleCount = runtimeState.syncDriftHistory.length;
        if (sampleCount === 0) {
            return;
        }

        if (elapsedSeconds >= nextSyncDriftTelemetryLogAt) {
            performanceLogger.debug('Sync drift sample', {
                elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
                currentMs: formatDriftValue(runtimeState.syncDriftMs),
                averageMs: formatDriftValue(runtimeState.syncDriftAverageMs),
                peakMs: formatDriftValue(runtimeState.syncDriftPeakMs),
                peakRecordedAt: Number(runtimeState.syncDriftPeakRecordedAt.toFixed(3)),
                sampleWindowSeconds: SYNC_DRIFT_HISTORY_SECONDS,
                sampleCount,
            });
            nextSyncDriftTelemetryLogAt = elapsedSeconds + SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
        }

        const peakMagnitude = Math.abs(runtimeState.syncDriftPeakMs);
        const averageMagnitude = Math.abs(runtimeState.syncDriftAverageMs);

        if (!syncDriftWarnActive && peakMagnitude >= SYNC_DRIFT_WARN_THRESHOLD_MS) {
            performanceLogger.warn('Audio sync drift above threshold', {
                peakMs: formatDriftValue(runtimeState.syncDriftPeakMs),
                averageMs: formatDriftValue(runtimeState.syncDriftAverageMs),
                currentMs: formatDriftValue(runtimeState.syncDriftMs),
                recordedAt: Number(runtimeState.syncDriftPeakRecordedAt.toFixed(3)),
                thresholdMs: SYNC_DRIFT_WARN_THRESHOLD_MS,
            });
            syncDriftWarnActive = true;
        } else if (
            syncDriftWarnActive &&
            peakMagnitude <= SYNC_DRIFT_RECOVERY_THRESHOLD_MS &&
            averageMagnitude <= SYNC_DRIFT_RECOVERY_THRESHOLD_MS
        ) {
            performanceLogger.info('Audio sync drift recovered', {
                peakMs: formatDriftValue(runtimeState.syncDriftPeakMs),
                averageMs: formatDriftValue(runtimeState.syncDriftAverageMs),
                currentMs: formatDriftValue(runtimeState.syncDriftMs),
                recordedAt: Number(runtimeState.syncDriftPeakRecordedAt.toFixed(3)),
            });
            syncDriftWarnActive = false;
        }
    };

    const LOW_FPS_THRESHOLD = 45;
    const RECOVER_FPS_THRESHOLD = 55;
    const LOW_FPS_TRIGGER_MS = 4_000;
    const HIGH_FPS_RECOVER_MS = 6_000;

    let accumulatedLowFpsMs = 0;
    let accumulatedHighFpsMs = 0;

    const handleFrameMetrics: LoopOptions['onFrameMetrics'] = ({ rawDeltaMs }) => {
        if (!Number.isFinite(rawDeltaMs) || rawDeltaMs <= 0) {
            return;
        }

        const clampedDelta = Math.max(0, rawDeltaMs);
        const fps = clampedDelta > 0 ? 1000 / clampedDelta : Number.POSITIVE_INFINITY;

        if (fps < LOW_FPS_THRESHOLD) {
            accumulatedLowFpsMs = Math.min(LOW_FPS_TRIGGER_MS, accumulatedLowFpsMs + clampedDelta);
            accumulatedHighFpsMs = Math.max(0, accumulatedHighFpsMs - clampedDelta * 0.5);
        } else if (fps >= RECOVER_FPS_THRESHOLD) {
            accumulatedHighFpsMs = Math.min(HIGH_FPS_RECOVER_MS, accumulatedHighFpsMs + clampedDelta);
            accumulatedLowFpsMs = Math.max(0, accumulatedLowFpsMs - clampedDelta);
        } else {
            accumulatedLowFpsMs = Math.max(0, accumulatedLowFpsMs - clampedDelta * 0.5);
            accumulatedHighFpsMs = Math.max(0, accumulatedHighFpsMs - clampedDelta);
        }

        if (!dynamicPerformanceMode && accumulatedLowFpsMs >= LOW_FPS_TRIGGER_MS) {
            dynamicPerformanceMode = true;
            accumulatedHighFpsMs = 0;
            performanceLogger.info('Enabling performance profile due to sustained low FPS', {
                fps: Number(fps.toFixed(1)),
            });
            applyVisualPerformanceProfile();
        } else if (
            dynamicPerformanceMode &&
            !userPerformancePreference &&
            accumulatedHighFpsMs >= HIGH_FPS_RECOVER_MS
        ) {
            dynamicPerformanceMode = false;
            accumulatedLowFpsMs = 0;
            performanceLogger.info('Restoring quality profile after sustained recovery', {
                fps: Number(fps.toFixed(1)),
            });
            applyVisualPerformanceProfile();
        }
    };

    const sessionNow = (): number => Math.max(0, Math.floor(runtimeState.sessionElapsedSeconds * 1000));

    const foreshadowScale = deriveForeshadowScale(random.seed());
    const foreshadowSeed = (random.seed() ^ FORESHADOW_EVENT_SALT) >>> 0;
    const foreshadowDiagnostics: ForeshadowDiagnostics = {
        onPatternScheduled: ({ event, instrument, averageVelocity, startTime }) => {
            foreshadowVisualEvents.set(event.id, instrument);
            triggerForeshadowWave('schedule', instrument, averageVelocity, startTime);
        },
        onNoteTriggered: ({ eventId, instrument, velocity, time }) => {
            foreshadowVisualEvents.set(eventId, instrument);
            triggerForeshadowWave('note', instrument, velocity, time);
        },
        onEventFinalized: ({ eventId, reason }) => {
            const instrument = foreshadowVisualEvents.get(eventId) ?? 'melodic';
            if (reason === 'cancelled') {
                triggerForeshadowWave('cancel', instrument, 0.6);
            }
            foreshadowVisualEvents.delete(eventId);
        },
    };

    initForeshadower({
        scale: foreshadowScale,
        seed: foreshadowSeed,
        diagnostics: foreshadowDiagnostics,
    });

    interface BallForeshadowState {
        readonly eventId: string;
        readonly brickId: number;
        readonly scheduledAt: number;
    }

    const activeForeshadowByBall = new Map<number, BallForeshadowState>();
    let foreshadowEventCounter = 0;

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

    let lastMusicState: MusicState | null = null;
    const pushMusicState = (state: MusicState) => {
        const normalizedWarble = state.warbleIntensity;
        const normalized: MusicState = {
            lives: state.lives,
            combo: state.combo,
            tempoRatio: clampUnit(state.tempoRatio ?? 0),
            paused: state.paused,
            warbleIntensity: normalizedWarble === undefined ? undefined : clampUnit(normalizedWarble ?? 0),
            bricksRemainingRatio: clampUnit(state.bricksRemainingRatio ?? 1),
        };

        if (
            lastMusicState &&
            lastMusicState.lives === normalized.lives &&
            Math.abs(lastMusicState.combo - normalized.combo) <= 1e-3 &&
            Math.abs((lastMusicState.tempoRatio ?? 0) - (normalized.tempoRatio ?? 0)) <= 1e-3 &&
            Math.abs((lastMusicState.warbleIntensity ?? 0) - (normalized.warbleIntensity ?? 0)) <= 1e-3 &&
            Math.abs((lastMusicState.bricksRemainingRatio ?? 1) - (normalized.bricksRemainingRatio ?? 1)) <= 1e-3
        ) {
            return;
        }

        musicDirector.setState(normalized);
        lastMusicState = { ...normalized };
    };

    let session = createSession();
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

    const visualBodies = new Map<Body, Container>();
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

        if (visual instanceof Sprite && gambleHighlight) {
            gambleHighlight.reset(visual);
        }

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
        gambleManager.unregister(body);
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

    const nextForeshadowEventId = (): string => {
        foreshadowEventCounter = (foreshadowEventCounter + 1) >>> 0;
        const salted = foreshadowEventCounter ^ foreshadowSeed;
        return `foreshadow:${salted.toString(16)}`;
    };

    const cancelForeshadowForBall = (ballId: number): void => {
        const entry = activeForeshadowByBall.get(ballId);
        if (!entry) {
            return;
        }
        cancelForeshadowEvent(entry.eventId);
        activeForeshadowByBall.delete(ballId);
    };

    const releaseForeshadowForBall = (ballId: number, actualTimeSeconds?: number): void => {
        const entry = activeForeshadowByBall.get(ballId);
        if (!entry) {
            return;
        }
        if (typeof actualTimeSeconds === 'number' && entry.scheduledAt - actualTimeSeconds > 0.12) {
            cancelForeshadowEvent(entry.eventId);
        }
        activeForeshadowByBall.delete(ballId);
    };

    const resetForeshadowing = (): void => {
        activeForeshadowByBall.forEach((entry) => {
            cancelForeshadowEvent(entry.eventId);
        });
        activeForeshadowByBall.clear();
        foreshadowEventCounter = 0;
        foreshadowVisualEvents.clear();
        visuals?.audioWaveBackdrop?.setVisible(false);
    };

    const resolveBrickTargetMidi = (brick: Body): number => {
        const metadata = brickMetadata.get(brick);
        if (!metadata) {
            return foreshadowScale[0] ?? 60;
        }
        const scaleLength = foreshadowScale.length || 1;
        const base = foreshadowScale[Math.abs(metadata.row) % scaleLength] ?? foreshadowScale[0] ?? 60;
        const octaveStep = Math.floor(metadata.row / scaleLength);
        const octaveOffset = Math.max(-1, Math.min(2, octaveStep)) * 12;
        const columnAccent = (metadata.col ?? 0) % 3;
        const columnOffset = columnAccent === 2 ? 4 : columnAccent === 1 ? 2 : 0;
        return clampMidiNote(base + octaveOffset + columnOffset);
    };

    interface PredictedBrickImpact {
        readonly brick: Body;
        readonly timeUntil: number;
        readonly speed: number;
    }

    const predictNextBrickImpact = (ballBody: Body): PredictedBrickImpact | null => {
        const speed = MatterVector.magnitude(ballBody.velocity);
        if (!Number.isFinite(speed) || speed < FORESHADOW_MIN_SPEED) {
            return null;
        }
        const direction = ballBody.velocity;
        if (Math.abs(direction.x) < 1e-6 && Math.abs(direction.y) < 1e-6) {
            return null;
        }

        const radius = resolveBallRadius(ballBody);
        const origin = { x: ballBody.position.x, y: ballBody.position.y };

        let best: PredictedBrickImpact | null = null;

        brickHealth.forEach((hp, brick) => {
            if (hp <= 0) {
                return;
            }
            if (brick.isSensor) {
                return;
            }
            const metadata = brickMetadata.get(brick);
            if (metadata?.breakable === false) {
                return;
            }

            const bounds = brick.bounds;
            const impactTime = intersectRayWithExpandedAabb(origin, direction, bounds, radius);
            if (impactTime === null) {
                return;
            }
            if (impactTime < FORESHADOW_MIN_PREDICTION_SECONDS || impactTime > FORESHADOW_MAX_PREDICTION_SECONDS) {
                return;
            }
            if (!best || impactTime < best.timeUntil) {
                best = {
                    brick,
                    timeUntil: impactTime,
                    speed,
                };
            }
        });

        return best;
    };

    const updateForeshadowPredictions = (): void => {
        const nowSeconds = runtimeState.sessionElapsedSeconds;
        const visited = new Set<number>();
        multiBallController.visitActiveBalls(({ body }) => {
            visited.add(body.id);
            const prediction = predictNextBrickImpact(body);
            if (!prediction) {
                cancelForeshadowForBall(body.id);
                return;
            }

            const scheduledAt = nowSeconds + prediction.timeUntil;
            const existing = activeForeshadowByBall.get(body.id);
            if (existing) {
                const timeDelta = Math.abs(existing.scheduledAt - scheduledAt);
                if (existing.brickId === prediction.brick.id && timeDelta < 0.1) {
                    return;
                }
                cancelForeshadowForBall(body.id);
            }

            const eventId = nextForeshadowEventId();
            const targetMidi = resolveBrickTargetMidi(prediction.brick);
            const normalizedIntensity = clampUnit(
                prediction.speed /
                Math.max(FORESHADOW_MIN_SPEED, runtimeState.currentMaxSpeed || FORESHADOW_MIN_SPEED),
            );
            const rawLead = prediction.timeUntil * 0.75;
            const leadInSeconds = Math.min(
                Math.max(FORESHADOW_MIN_LEAD_SECONDS, rawLead),
                Math.max(FORESHADOW_MIN_LEAD_SECONDS, Math.min(prediction.timeUntil - 0.1, FORESHADOW_MAX_LEAD_SECONDS)),
            );

            scheduleForeshadowEvent({
                id: eventId,
                type: 'brickHit',
                timeUntil: prediction.timeUntil,
                targetMidi,
                intensity: normalizedIntensity,
                leadInSeconds,
            });

            activeForeshadowByBall.set(body.id, {
                eventId,
                brickId: prediction.brick.id,
                scheduledAt,
            });
        });

        activeForeshadowByBall.forEach((entry, ballId) => {
            if (!visited.has(ballId)) {
                cancelForeshadowForBall(ballId);
            }
        });
    };

    const applyGambleAppearance = (body: Body): void => {
        const visual = visualBodies.get(body);
        if (!(visual instanceof Sprite)) {
            return;
        }
        const state = gambleManager.getState(body);
        if (state === 'primed') {
            visual.tint = gambleTintPrimed;
            if (gambleHighlight) {
                const remaining = gambleManager.getRemainingTimer(body);
                const urgency = remaining !== null && Number.isFinite(remaining)
                    ? clampUnit(1 - remaining / Math.max(0.001, GAMBLE_TIMER_SECONDS))
                    : 0;
                gambleHighlight.apply(visual, 'primed', urgency);
            }
        } else if (state === 'armed') {
            visual.tint = gambleTintArmed;
            gambleHighlight?.apply(visual, 'armed', 0);
        } else {
            visual.tint = 0xffffff;
            if (gambleHighlight) {
                gambleHighlight.reset(visual);
            }
        }
    };

    const reapplyGambleAppearances = (): void => {
        gambleManager.forEach((body) => {
            applyGambleAppearance(body);
        });
    };

    const registerGambleBricks = (): void => {
        brickMetadata.forEach((metadata, body) => {
            if (metadata?.traits?.includes('gamble')) {
                gambleManager.register(body);
                applyGambleAppearance(body);
            }
        });
    };

    const applyGambleFailurePenalty = (brick: Body, penaltyHp: number): void => {
        if (!brickHealth.has(brick)) {
            return;
        }
        const normalizedPenalty = Math.max(1, Math.round(penaltyHp));
        const clampedPenalty = Math.min(MAX_LEVEL_BRICK_HP, normalizedPenalty);
        brickHealth.set(brick, clampedPenalty);
        const state = brickVisualState.get(brick);
        if (state) {
            const nextMax = state.isBreakable
                ? Math.min(MAX_LEVEL_BRICK_HP, Math.max(state.maxHp, clampedPenalty))
                : Math.max(state.maxHp, clampedPenalty);
            state.maxHp = nextMax;
        }
        levelRuntime.updateBrickDamage(brick, clampedPenalty);
        applyGambleAppearance(brick);
    };

    const updateGambleCountdownAudio = (nextExpirationSeconds: number | null): void => {
        if (nextExpirationSeconds === null || !Number.isFinite(nextExpirationSeconds)) {
            gambleCountdownLastSecond = null;
            return;
        }
        const remaining = Math.max(0, nextExpirationSeconds);
        if (remaining > GAMBLE_COUNTDOWN_AUDIO_THRESHOLD) {
            gambleCountdownLastSecond = null;
            return;
        }
        const marker = Math.max(0, Math.ceil(remaining));
        if (gambleCountdownLastSecond === marker) {
            return;
        }
        gambleCountdownLastSecond = marker;
        const urgency = clampUnit(1 - remaining / Math.max(0.001, GAMBLE_TIMER_SECONDS));
        midiEngine.triggerGambleCountdown({
            second: marker,
            urgency,
        });
        musicDirector.triggerGambleCountdown({
            urgency,
        });
    };

    const tickGambleBricks = (deltaSeconds: number): void => {
        if (gambleHighlight) {
            gambleHighlight.update(deltaSeconds);
        }
        const expirations = gambleManager.tick(deltaSeconds);
        const summary = gambleManager.snapshot();
        updateGambleCountdownAudio(summary.nextExpirationSeconds);
        if (expirations.length === 0) {
            return;
        }
        expirations.forEach(({ brick, penaltyHp }) => {
            applyGambleFailurePenalty(brick, penaltyHp);
        });
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
        gambleManager.clear();
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
        if (backgroundAccentPalette.length === 0) {
            return;
        }
        backgroundAccentIndex = (backgroundAccentIndex + accentIndexDelta + backgroundAccentPalette.length) %
            backgroundAccentPalette.length;
        backgroundAccentColor = backgroundAccentPalette[backgroundAccentIndex];
        bloomAccentColor = backgroundAccentColor;
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
    musicDirector.setBeatCallback(handleMusicBeat);
    musicDirector.setMeasureCallback(handleMusicMeasure);

    const bounds = physics.factory.bounds();
    physics.add(bounds);

    const ballController = new BallAttachmentController();
    const paddleController = new PaddleBodyController();
    const runtimeInput = createRuntimeInput({
        container,
        stage,
        playfieldWidth: PLAYFIELD_WIDTH,
        smoothing: {
            responsiveness: PADDLE_SMOOTH_RESPONSIVENESS,
            snapThreshold: PADDLE_SNAP_THRESHOLD,
        },
    });
    const { manager: inputManager } = runtimeInput;
    const launchController = new PhysicsBallLaunchController();

    const paddle: PaddleState = paddleController.createPaddle(
        { x: HALF_PLAYFIELD_WIDTH, y: PLAYFIELD_HEIGHT - 70 },
        { width: BASE_PADDLE_WIDTH, height: BASE_PADDLE_HEIGHT, speed: BASE_PADDLE_SPEED },
    );
    physics.add(paddle.physicsBody);

    const ball: BallState = ballController.createAttachedBall(
        paddleController.getPaddleCenter(paddle),
        { radius: 10, restitution: BASE_BALL_RESTITUTION },
    );
    physics.add(ball.physicsBody);
    ball.physicsBody.restitution = runtimeState.ballRestitution;

    runtimeInput.install();

    const createdVisuals = createRuntimeVisuals({
        stage,
        playfieldDimensions,
        themeBallColors,
        themeAccents,
        random,
        ball,
        paddle,
        ballController,
        paddleController,
        inputManager,
        ballMaxSpeed: BALL_MAX_SPEED,
    });
    visuals = createdVisuals;
    createdVisuals.playfieldBackground?.setTint(backgroundAccentColor, { immediate: true, accentMix: 0.2 });
    visuals.setEffectProfile(desiredVisualProfile);
    gambleHighlight = createGambleHighlightEffect();

    const comboRing = createdVisuals.comboRing;
    const gameContainer = createdVisuals.gameContainer;
    const inputDebugOverlay = createdVisuals.inputDebugOverlay;
    const physicsDebugOverlay = createdVisuals.physicsDebugOverlay;

    if (runtimeDebug) {
        (runtimeDebug as RuntimeDebug).updateOverlays({ input: inputDebugOverlay, physics: physicsDebugOverlay });
    }

    syncAutoCompleteCountdownDisplay();

    const drawBallSprite = (graphics: Graphics, radius: number, palette?: Partial<BallVisualPalette>) => {
        visualFactory.ball.draw(graphics, radius, palette);
    };

    const ballGraphics = visualFactory.ball.create({ radius: ball.radius });
    ballGraphics.zIndex = 50;
    const ballGlowFilter = new GlowFilter({
        distance: 18,
        outerStrength: 1.4,
        innerStrength: 0,
        color: themeBallColors.highlight,
        quality: 0.3,
    });
    const ballHueFilter = new ColorMatrixFilter();
    ballGraphics.filters = [ballGlowFilter as unknown as Filter, ballHueFilter];
    gameContainer.addChild(ballGraphics);
    visualBodies.set(ball.physicsBody, ballGraphics);

    const multiBallController = createMultiBallController({
        physics,
        ball,
        paddle,
        ballGraphics,
        gameContainer,
        visualBodies,
        drawBallVisual: drawBallSprite,
        colors: themeBallColors,
        multiplier: MULTI_BALL_MULTIPLIER,
        maxExtraBalls: MULTI_BALL_CAPACITY,
        sampleRestitution: () => runtimeState.ballRestitution,
    });

    multiBallController.setRestitution(runtimeState.ballRestitution);

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

    const paddleGraphics = visualFactory.paddle.create({ width: paddle.width, height: paddle.height });
    paddleGraphics.zIndex = 60;
    gameContainer.addChild(paddleGraphics);
    visualBodies.set(paddle.physicsBody, paddleGraphics);

    runtimeState.previousPaddlePosition = { x: paddle.position.x, y: paddle.position.y };
    runtimeState.lastRecordedInputTarget = null;
    runtimeState.currentBaseSpeed = BALL_BASE_SPEED;
    runtimeState.currentMaxSpeed = BALL_MAX_SPEED;
    runtimeState.currentLaunchSpeed = BALL_LAUNCH_SPEED;
    const reattachBallToPaddle = (): void => {
        const attachmentOffset = { x: 0, y: -ball.radius - paddle.height / 2 };
        cancelForeshadowForBall(ball.physicsBody.id);
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
        cancelForeshadowForBall(body.id);
        multiBallController.removeExtraBallByBody(body);
    };

    const clearExtraBalls = () => {
        const extraBallIds = Array.from(activeForeshadowByBall.keys()).filter((ballId) => ballId !== ball.physicsBody.id);
        extraBallIds.forEach((ballId) => {
            cancelForeshadowForBall(ballId);
        });
        multiBallController.clear();
    };

    const spawnExtraBalls = (requestedCount?: number) => {
        multiBallController.spawnExtraBalls({ currentLaunchSpeed: runtimeState.currentLaunchSpeed, requestedCount });
    };

    let pendingLaserActivation: LaserPaddleReward | null = null;
    let enableLaserRewardImpl: (reward: LaserPaddleReward) => void = (reward) => {
        pendingLaserActivation = reward;
    };
    let disableLaserRewardImpl: () => void = () => {
        pendingLaserActivation = null;
    };

    const powerups = createRuntimePowerups({
        logger: runtimeLogger,
        multiBallController,
        flashBallLight,
        flashPaddleLight,
        spawnExtraBalls,
        resetGhostBricks,
        applyGhostBrickReward,
        getGhostBrickRemainingDuration,
        enableLaserReward: (reward) => enableLaserRewardImpl(reward),
        disableLaserReward: () => disableLaserRewardImpl(),
        defaults: {
            paddleWidthMultiplier: DEFAULT_PADDLE_WIDTH_MULTIPLIER,
            multiBallCapacity: MULTI_BALL_CAPACITY,
            multiBallMaxDuration: MULTI_BALL_MAX_DURATION,
            slowTimeMaxDuration: SLOW_TIME_MAX_DURATION,
        },
    });
    const { manager: powerUpManager } = powerups;

    const refreshPaddleWidth = () => {
        const scale = powerups.getPaddleWidthScale();
        setPaddleWidth(runtimeState.paddleBaseWidth * scale);
    };

    refreshPaddleWidth();

    const applyBallRestitution = (value: number) => {
        const normalized = Number.isFinite(value) ? value : runtimeState.ballRestitution;
        ball.physicsBody.restitution = normalized;
        multiBallController.setRestitution(normalized);
    };

    const runtimeModifiers = createRuntimeModifiers({
        config: config.modifiers,
        physics,
        runtimeState,
        baseValues: { paddleWidth: BASE_PADDLE_WIDTH },
        applyRestitution: (value) => {
            applyBallRestitution(value);
        },
        applyPaddleBaseWidth: () => {
            refreshPaddleWidth();
        },
        onSpeedGovernorChange: () => {
            /* speed governor state already updated by modifier module */
        },
    });

    runtimeModifiers.reset();

    const roundToDecimals = (value: number, decimals = 3): number => {
        if (!Number.isFinite(value)) {
            return 0;
        }
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    };

    const formatSigned = (value: number, decimals = 2): string => {
        const rounded = roundToDecimals(value, decimals);
        const sign = rounded >= 0 ? '+' : '';
        return `${sign}${rounded.toFixed(decimals)}`;
    };

    const formatMultiplierLabel = (value: number, decimals = 2): string => {
        const rounded = roundToDecimals(value, decimals);
        return `x${rounded.toFixed(decimals)}`;
    };

    const clampToRange = (value: number, range: { readonly min: number; readonly max: number }): number => {
        if (!Number.isFinite(value)) {
            return range.min;
        }
        return Math.min(range.max, Math.max(range.min, value));
    };

    const randomBetween = (min: number, max: number): number => min + (max - min) * random.next();

    const randomSigned = (magnitude: number): number => (random.boolean() ? magnitude : -magnitude);

    const pickFrom = <T>(values: readonly T[]): T => {
        if (values.length === 0) {
            throw new Error('Cannot select from empty list');
        }
        const index = random.nextInt(values.length);
        return values[index] ?? values[0];
    };

    const biasRiskOrder: readonly BiasOptionRisk[] = ['safe', 'bold', 'volatile'];

    const biasLabels: Record<BiasOptionRisk, readonly string[]> = {
        safe: ['Momentum Hedge', 'Steady Anchor', 'Measured Tilt'],
        bold: ['Double Down', 'Edge Stack', 'Tempo Spike'],
        volatile: ['Chaos Ramp', 'Glitch Push', 'Void Bet'],
    } as const;

    const biasDescriptions: Record<BiasOptionRisk, readonly string[]> = {
        safe: [
            'Pocket a modest edge while keeping the board manageable.',
            'Steady your hand with softer tweaks and steadier odds.',
        ],
        bold: [
            'Lean into the heat for fatter drops and sharper volleys.',
            'Amp the tempo to chase richer streak rewards.',
        ],
        volatile: [
            'Spin the wheel for wild payouts and relentless speed.',
            'Embrace chaos—huge upside with heavy gravity shifts.',
        ],
    } as const;

    const generateBiasPhaseOptions = (upcomingLevelIndex: number): BiasPhaseOption[] => {
        const baseGravity = MODIFIER_GRAVITY_RANGE.default;
        const baseRestitution = MODIFIER_RESTITUTION_RANGE.default;
        const basePaddleWidth = MODIFIER_PADDLE_WIDTH_RANGE.default;
        const baseSpeedGovernor = MODIFIER_SPEED_GOVERNOR_RANGE.default;

        return biasRiskOrder.map((risk, order) => {
            const idSeed = random.nextInt(1_000_000);
            const modifierEntries: {
                gravity?: number;
                restitution?: number;
                paddleWidthMultiplier?: number;
                speedGovernorMultiplier?: number;
            } = {};
            let difficulty: number | undefined;
            let powerUp: number | undefined;

            if (risk === 'safe') {
                modifierEntries.paddleWidthMultiplier = roundToDecimals(
                    clampToRange(basePaddleWidth + randomBetween(0.05, 0.12), MODIFIER_PADDLE_WIDTH_RANGE),
                    2,
                );
                modifierEntries.gravity = roundToDecimals(
                    clampToRange(baseGravity + randomSigned(randomBetween(0.02, 0.05)), MODIFIER_GRAVITY_RANGE),
                    2,
                );
                difficulty = roundToDecimals(1 + randomBetween(0.04, 0.08), 3);
                powerUp = roundToDecimals(1 + randomBetween(0.06, 0.1), 3);
            } else if (risk === 'bold') {
                modifierEntries.paddleWidthMultiplier = roundToDecimals(
                    clampToRange(basePaddleWidth - randomBetween(0.05, 0.12), MODIFIER_PADDLE_WIDTH_RANGE),
                    2,
                );
                modifierEntries.speedGovernorMultiplier = roundToDecimals(
                    clampToRange(baseSpeedGovernor + randomBetween(0.08, 0.15), MODIFIER_SPEED_GOVERNOR_RANGE),
                    2,
                );
                modifierEntries.gravity = roundToDecimals(
                    clampToRange(baseGravity + randomSigned(randomBetween(0.04, 0.08)), MODIFIER_GRAVITY_RANGE),
                    2,
                );
                difficulty = roundToDecimals(1 + randomBetween(0.09, 0.16), 3);
                powerUp = roundToDecimals(1 + randomBetween(0.12, 0.18), 3);
            } else {
                modifierEntries.speedGovernorMultiplier = roundToDecimals(
                    clampToRange(baseSpeedGovernor + randomBetween(0.16, 0.24), MODIFIER_SPEED_GOVERNOR_RANGE),
                    2,
                );
                modifierEntries.restitution = roundToDecimals(
                    clampToRange(baseRestitution + randomBetween(0.02, 0.06), MODIFIER_RESTITUTION_RANGE),
                    2,
                );
                modifierEntries.gravity = roundToDecimals(
                    clampToRange(baseGravity + randomSigned(randomBetween(0.1, 0.18)), MODIFIER_GRAVITY_RANGE),
                    2,
                );
                difficulty = roundToDecimals(1 + randomBetween(0.16, 0.24), 3);
                powerUp = roundToDecimals(1 + randomBetween(0.18, 0.26), 3);
            }

            const modifiers = Object.keys(modifierEntries).length > 0 ? modifierEntries : undefined;
            const effects: BiasPhaseEffects = {
                modifiers,
                difficultyMultiplier: difficulty,
                powerUpChanceMultiplier: powerUp,
            };

            return {
                id: `bias-${upcomingLevelIndex + 1}-${risk}-${order}-${idSeed}`,
                label: pickFrom(biasLabels[risk]),
                description: pickFrom(biasDescriptions[risk]),
                risk,
                effects,
            } satisfies BiasPhaseOption;
        });
    };

    const describeBiasOption = (option: BiasPhaseOption): readonly string[] => {
        const summary: string[] = [];
        const { modifiers, difficultyMultiplier, powerUpChanceMultiplier } = option.effects;

        if (difficultyMultiplier !== undefined && Math.abs(difficultyMultiplier - 1) > 1e-3) {
            summary.push(`Difficulty ${formatMultiplierLabel(difficultyMultiplier)}`);
        }

        if (powerUpChanceMultiplier !== undefined && Math.abs(powerUpChanceMultiplier - 1) > 1e-3) {
            summary.push(`Power-Up Odds ${formatMultiplierLabel(powerUpChanceMultiplier)}`);
        }

        if (modifiers) {
            if (modifiers.gravity !== undefined) {
                const delta = modifiers.gravity - MODIFIER_GRAVITY_RANGE.default;
                summary.push(`Gravity ${formatSigned(delta)}`);
            }
            if (modifiers.restitution !== undefined) {
                const delta = modifiers.restitution - MODIFIER_RESTITUTION_RANGE.default;
                summary.push(`Restitution ${formatSigned(delta)}`);
            }
            if (modifiers.paddleWidthMultiplier !== undefined) {
                summary.push(`Paddle Width ${formatMultiplierLabel(modifiers.paddleWidthMultiplier)}`);
            }
            if (modifiers.speedGovernorMultiplier !== undefined) {
                summary.push(`Speed Governor ${formatMultiplierLabel(modifiers.speedGovernorMultiplier)}`);
            }
        }

        if (summary.length === 0) {
            summary.push('No material change');
        }
        return summary;
    };

    const mapBiasOptionToScene = (option: BiasPhaseOption): BiasPhaseSceneOption => ({
        id: option.id,
        label: option.label,
        description: option.description,
        risk: option.risk,
        effectSummary: describeBiasOption(option),
    });

    const applyBiasSelection = (selection: BiasPhaseOption | null) => {
        if (!selection) {
            return;
        }

        const { effects } = selection;
        if (effects.difficultyMultiplier !== undefined && effects.difficultyMultiplier > 0) {
            const base = roundMachine.getLevelDifficultyMultiplier();
            const adjusted = roundToDecimals(base * effects.difficultyMultiplier, 4);
            roundMachine.setLevelDifficultyMultiplier(adjusted);
        }

        if (effects.powerUpChanceMultiplier !== undefined && effects.powerUpChanceMultiplier > 0) {
            const base = roundMachine.getPowerUpChanceMultiplier();
            const adjusted = roundToDecimals(base * effects.powerUpChanceMultiplier, 4);
            roundMachine.setPowerUpChanceMultiplier(Math.max(0.01, adjusted));
        }

        const modifiers = effects.modifiers;
        if (!modifiers) {
            return;
        }

        if (modifiers.gravity !== undefined) {
            runtimeModifiers.setGravity(modifiers.gravity);
        }
        if (modifiers.restitution !== undefined) {
            runtimeModifiers.setRestitution(modifiers.restitution);
        }
        if (modifiers.paddleWidthMultiplier !== undefined) {
            runtimeModifiers.setPaddleWidthMultiplier(modifiers.paddleWidthMultiplier);
        }
        if (modifiers.speedGovernorMultiplier !== undefined) {
            runtimeModifiers.setSpeedGovernorMultiplier(modifiers.speedGovernorMultiplier);
        }
    };

    const hudContainer = new Container();
    hudContainer.eventMode = 'none';
    hudContainer.visible = false;
    hudContainer.zIndex = 1;
    stage.layers.playfield.addChild(hudContainer);

    const hudDisplay = hudProfile === 'mobile'
        ? createMobileHudDisplay(GameTheme)
        : createHudDisplay(GameTheme);
    hudDisplay.container.zIndex = 1;
    hudContainer.addChild(hudDisplay.container);
    hudDisplay.setEntropyActionHandler((action) => {
        attemptEntropyAction(action);
    });

    const positionHud = () => {
        const margin = hudProfile === 'mobile' ? MOBILE_HUD_MARGIN : HUD_MARGIN;
        const maxScale = hudProfile === 'mobile' ? MOBILE_HUD_MAX_SCALE : HUD_SCALE;
        const minScale = hudProfile === 'mobile' ? MOBILE_HUD_MIN_SCALE : MIN_HUD_SCALE;
        const hudWidth = hudDisplay.width;
        const hudHeight = hudDisplay.getHeight();
        const clampScale = (value: number) => Math.max(minScale, Math.min(maxScale, value));
        const paddleTop = paddle.position.y - paddle.height / 2;
        const widthScaleLimit = (PLAYFIELD_WIDTH - margin * 2) / hudWidth;
        let scale = clampScale(Math.min(maxScale, widthScaleLimit));

        const safePaddleTop = paddleTop - margin;
        let top = Math.max(margin, safePaddleTop - hudHeight * scale);

        if (brickLayoutBounds) {
            const bricksBottom = brickLayoutBounds.maxY;
            const preferredTop = bricksBottom + margin;
            const availableHeight = safePaddleTop - preferredTop;
            if (availableHeight > 0) {
                const heightScaleLimit = availableHeight / hudHeight;
                scale = clampScale(Math.min(scale, heightScaleLimit));
                const maxTop = safePaddleTop - hudHeight * scale;
                top = Math.max(margin, Math.min(maxTop, preferredTop));
            }
        }

        const width = hudWidth * scale;
        const x = Math.round((PLAYFIELD_WIDTH - width) / 2);
        const y = Math.round(Math.max(margin, top));

        hudDisplay.container.scale.set(scale);
        hudDisplay.container.position.set(x, y);
    };

    const applyRuntimeTheme = (theme: GameThemeDefinition) => {
        rowColors = theme.brickColors.map(toColorNumber);
        levelRuntime.setRowColors(rowColors);
        reapplyGambleAppearances();

        applyMetaVisualDefaults(theme);

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
        rebuildBackgroundPalette();

        renderStageSoon();
    };

    applyRuntimeTheme(GameTheme);

    positionHud();
    window.addEventListener('resize', positionHud);

    unsubscribeTheme = onThemeChange((theme, name) => {
        runtimeLogger.info('Applied theme change', { theme: name });
        applyRuntimeTheme(theme);
    });

    const pauseLegendLines = [
        'Cyan Paddle Width - Widens your paddle for extra coverage.',
        'Orange Ball Speed - Speeds up the ball and boosts scoring.',
        'Pink Multi Ball - Splits the active ball into additional balls.',
        'Green Sticky Paddle - Catches the ball until you launch again.',
        'Shift + C toggles high-contrast color mode.',
    ] as const;

    let lastComboCount = 0;

    const buildEntropyHudEntries = (state: EntropyActionState, stored: number): HudEntropyActionDescriptor[] => {
        return ENTROPY_ACTION_SEQUENCE.map((action) => {
            const binding = ENTROPY_ACTION_BINDINGS[action];
            const cost = ENTROPY_ACTION_COSTS[action];
            const charges = action === 'reroll'
                ? state.rerollTokens
                : action === 'shield'
                    ? state.shieldCharges
                    : 0;
            const lastActionTimestamp = state.lastAction?.action === action ? state.lastAction.timestamp : undefined;
            return {
                action,
                label: binding.label,
                hotkey: binding.hotkey,
                cost,
                charges,
                affordable: stored >= cost,
                lastActionTimestamp,
            } satisfies HudEntropyActionDescriptor;
        });
    };

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
        const rerolledReward = spinWheel(random.random);
        roundMachine.setPendingReward(rerolledReward);
        return true;
    };

    interface EntropyActionAttemptResult {
        readonly success: boolean;
        readonly reason?: 'invalid-state' | 'insufficient' | 'locked';
    }

    const attemptEntropyAction = (action: EntropyActionType): EntropyActionAttemptResult => {
        const snapshot = session.snapshot();
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

        const cost = ENTROPY_ACTION_COSTS[action];
        const spend = session.spendStoredEntropy({ action, cost });
        if (!spend.success) {
            const reason: EntropyActionAttemptResult['reason'] = spend.reason === 'insufficient'
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
                    hudDisplay.pulseCombo(0.3);
                    renderStageSoon();
                }
                break;
            }
            case 'shield': {
                roundMachine.grantEntropyAction(action, timestamp);
                hudDisplay.pulseCombo(0.4);
                applied = true;
                break;
            }
            case 'bailout': {
                roundMachine.recordBailoutActivation(timestamp);
                clearExtraBalls();
                reattachBallToPaddle();
                resetAutoCompleteCountdown();
                flashPaddleLight(0.55);
                hudDisplay.pulseCombo(0.5);
                renderStageSoon();
                applied = true;
                break;
            }
        }

        if (applied) {
            refreshHud();
            return { success: true } satisfies EntropyActionAttemptResult;
        }

        return { success: false, reason: 'invalid-state' } satisfies EntropyActionAttemptResult;
    };

    const refreshHud = () => {
        const snapshot = session.snapshot();
        const gambleStatus = gambleManager.snapshot();
        const entropyState = roundMachine.getEntropyActionState();
        const entropyActions = buildEntropyHudEntries(entropyState, snapshot.hud.entropy.stored);
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

    const applyMetaSnapshot = (snapshotReason: 'loadout-changed' | 'dust-updated', details?: unknown) => {
        refreshMetaLoadout();
        applyRuntimeTheme(GameTheme);
        rebuildMidiEngine();
        refreshHud();
        renderStageSoon();
        runtimeLogger.info('Meta upgrades updated', {
            reason: snapshotReason,
            visualPalette: metaUpgradeLoadout.visualPalette.id,
            audioPalette: metaUpgradeLoadout.audioPalette.id,
            extraLives: traitEffects.extraLives,
            comboMultiplier: traitEffects.comboDecayMultiplier,
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

    const buildRewardWheelOdds = (): LevelCompleteRewardWheelPayload['odds'] => {
        const segments = config.rewards.wheelSegments;
        const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
        return segments.map((segment) => ({
            reward: createReward(segment.type),
            weight: segment.weight,
            chance: totalWeight > 0 ? segment.weight / totalWeight : 0,
        }));
    };

    const buildRewardWheelState = (): RewardWheelState => {
        const snapshot = session.snapshot();
        const pendingReward = roundMachine.getPendingReward();
        const locked = roundMachine.isPendingRewardLocked();
        const entropyStored = snapshot.hud.entropy.stored;
        const coins = snapshot.coins;

        return {
            reward: pendingReward ?? null,
            locked,
            entropyStored,
            coins,
            rerollCost: ENTROPY_COST_REROLL,
            lockCost: REWARD_LOCK_COIN_COST,
            canReroll: Boolean(pendingReward) && !locked && entropyStored >= ENTROPY_COST_REROLL,
            canLock: Boolean(pendingReward) && !locked && coins >= REWARD_LOCK_COIN_COST,
        } satisfies RewardWheelState;
    };

    const publishRewardWheelInteraction = (
        action: RewardWheelInteractionType,
        reward: Reward,
        costs: { readonly entropyCost?: number; readonly coinsCost?: number } = {},
    ): void => {
        const snapshot = session.snapshot();
        const segments = config.rewards.wheelSegments;
        const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
        const weights = segments.map((segment) => ({
            type: segment.type,
            weight: segment.weight,
            chance: totalWeight > 0 ? segment.weight / totalWeight : 0,
        }));

        bus.publish('RewardWheelInteraction', {
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

    const performRewardReroll = (): Promise<RewardWheelUpdateResult> => {
        const currentState = buildRewardWheelState();
        if (!currentState.reward) {
            return Promise.resolve({
                success: false,
                message: 'No reward to reroll',
                state: currentState,
            } satisfies RewardWheelUpdateResult);
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
                state: buildRewardWheelState(),
            } satisfies RewardWheelUpdateResult);
        }

        const updatedState = buildRewardWheelState();
        const reward = updatedState.reward ?? currentState.reward;
        publishRewardWheelInteraction('reroll', reward, { entropyCost: ENTROPY_COST_REROLL });
        return Promise.resolve({
            success: true,
            message: 'Reward rerolled',
            state: updatedState,
        } satisfies RewardWheelUpdateResult);
    };

    const performRewardLock = (): Promise<RewardWheelUpdateResult> => {
        const currentState = buildRewardWheelState();
        const reward = currentState.reward;
        if (!reward) {
            return Promise.resolve({
                success: false,
                message: 'No reward to lock',
                state: currentState,
            } satisfies RewardWheelUpdateResult);
        }
        if (currentState.locked) {
            return Promise.resolve({
                success: false,
                message: 'Reward already locked',
                state: currentState,
            } satisfies RewardWheelUpdateResult);
        }

        if (REWARD_LOCK_COIN_COST > 0) {
            const paid = session.spendCoins(REWARD_LOCK_COIN_COST);
            if (!paid) {
                return Promise.resolve({
                    success: false,
                    message: 'Not enough coins',
                    state: buildRewardWheelState(),
                } satisfies RewardWheelUpdateResult);
            }
        }

        const locked = roundMachine.lockPendingReward();
        if (!locked) {
            return Promise.resolve({
                success: false,
                message: 'Unable to lock reward',
                state: buildRewardWheelState(),
            } satisfies RewardWheelUpdateResult);
        }
        setRewardOverride({ type: reward.type, duration: reward.duration, persist: false });
        refreshHud();
        renderStageSoon();
        publishRewardWheelInteraction('lock', reward, { coinsCost: REWARD_LOCK_COIN_COST });
        return Promise.resolve({
            success: true,
            message: 'Reward locked for next spin',
            state: buildRewardWheelState(),
        } satisfies RewardWheelUpdateResult);
    };

    const buildRewardWheelPayload = (): LevelCompleteRewardWheelPayload => ({
        odds: buildRewardWheelOdds(),
        state: buildRewardWheelState(),
        actions: {
            reroll: () => performRewardReroll(),
            lock: () => performRewardLock(),
        },
    });

    scoring.setHudUpdater(refreshHud);

    const beginNewSession = async (): Promise<void> => {
        if (loop?.isRunning()) {
            loop.stop();
        }

        musicDirector.setEnabled(true);
        random.reset();
        const activeSeed = random.seed();
        runtimeState.sessionElapsedSeconds = 0;
        runtimeState.frameTimestampMs = 0;
        runtimeState.lastRecordedInputTarget = null;
        replayBuffer.begin(activeSeed);

        resetForeshadowing();

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

    interface E2EHarnessControls {
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
    }

    const registerE2EHarnessControls = (): void => {
        const candidate = globalThis as { __LB_E2E_HOOKS__?: unknown };
        const harness = candidate.__LB_E2E_HOOKS__;
        if (!harness || typeof harness !== 'object') {
            return;
        }

        const controls = harness as E2EHarnessControls;

        const resolveCurrentScene = () => stage.getCurrentScene();
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
            skipToNextLevelCheat();
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
            if (!isGameplaySceneActive() || isPaused || !loop?.isRunning()) {
                return;
            }
            pauseGame();
        };
        controls.resumeGameplay = () => {
            if (!isPauseSceneActive() || !isPaused) {
                return;
            }
            resumeFromPause();
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
            const currentScene = stage.getCurrentScene() ?? null;
            const snapshot = session.snapshot();
            return {
                currentScene,
                isPaused,
                loopRunning: Boolean(loop?.isRunning()),
                livesRemaining: snapshot.livesRemaining,
            } satisfies E2EHarnessRuntimeState;
        };
        controls.getBiasPhaseState = () => roundMachine.getBiasPhaseState();
        controls.commitBiasSelection = (optionId?: string) => {
            if (typeof optionId !== 'string' || optionId.length === 0) {
                return false;
            }
            if (biasPhaseAutomation === null) {
                return false;
            }
            biasPhaseAutomation.select(optionId);
            return true;
        };
        controls.skipBiasPhase = () => {
            if (biasPhaseAutomation === null) {
                return false;
            }
            biasPhaseAutomation.skip();
            return true;
        };
        controls.getRuntimeModifiers = () => runtimeModifiers.getState();
        controls.getRoundMachineSnapshot = () => ({
            levelIndex: roundMachine.getCurrentLevelIndex(),
            difficultyMultiplier: roundMachine.getLevelDifficultyMultiplier(),
            powerUpChanceMultiplier: roundMachine.getPowerUpChanceMultiplier(),
        } satisfies E2ERoundMachineSnapshot);
        controls.getReplaySnapshot = () => replayBuffer.snapshot();
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
        resetForeshadowing();
        loadLevel(levelIndex);
        applyBiasSelection(pendingBiasSelection);
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

    const presentBiasPhase = (): void => {
        const upcomingLevelIndex = roundMachine.getCurrentLevelIndex() + 1;
        const options = generateBiasPhaseOptions(upcomingLevelIndex);

        if (options.length === 0) {
            biasPhaseAutomation = null;
            const nextLevelIndex = roundMachine.incrementLevelIndex();
            startLevel(nextLevelIndex);
            loop?.start();
            renderStageSoon();
            return;
        }

        roundMachine.setBiasPhaseOptions(options);

        const advance = (selection: BiasPhaseOption | null) => {
            biasPhaseAutomation = null;
            if (!selection) {
                roundMachine.setBiasPhaseOptions([]);
            }
            if (stage.getCurrentScene() === 'bias-phase') {
                stage.pop();
            }
            const nextLevelIndex = roundMachine.incrementLevelIndex();
            startLevel(nextLevelIndex);
            loop?.start();
            renderStageSoon();
        };

        const handleSelection = (optionId: string) => {
            const selection = roundMachine.commitBiasSelection(optionId);
            if (!selection) {
                runtimeLogger.warn('Failed to resolve bias selection', { optionId });
                advance(null);
                return;
            }
            replayBuffer.recordBiasChoice(optionId, runtimeState.sessionElapsedSeconds);
            advance(selection);
        };

        const handleSkip = () => {
            advance(null);
        };

        const payload = {
            session: buildBiasSessionSummary(upcomingLevelIndex),
            options: options.map(mapBiasOptionToScene),
            onSelect: (optionId: string) => {
                handleSelection(optionId);
            },
            onSkip: handleSkip,
        } satisfies BiasPhasePayload;

        biasPhaseAutomation = {
            select: (optionId: string) => {
                handleSelection(optionId);
            },
            skip: () => {
                handleSkip();
            },
        } satisfies BiasPhaseAutomation;

        void stage.push('bias-phase', payload)
            .then(() => {
                renderStageSoon();
            })
            .catch((error) => {
                runtimeLogger.error('Failed to push bias-phase scene', { error });
                handleSkip();
            });
    };

    const handleLevelComplete = (): void => {
        clearExtraBalls();
        resetForeshadowing();
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
        publishRewardWheelInteraction('initial-spin', finalReward, {
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

        const rewardWheelPayload = buildRewardWheelPayload();

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
        resetForeshadowing();
        isPaused = false;
        loop?.stop();
        roundMachine.setPendingReward(null);
        powerups.reset();
        musicDirector.setEnabled(false);

        const sessionUnlocks = achievements.recordSessionSummary({ highestCombo: roundMachine.getRunHighestCombo() });
        if (sessionUnlocks.length > 0) {
            roundMachine.enqueueAchievementUnlocks(sessionUnlocks);
            refreshAchievementUpgrades();
        }

        const achievementsToShow = roundMachine.consumeAchievementNotifications();
        recordHighScore(scoringState.score, {
            round: roundMachine.getCurrentLevelIndex() + 1,
            achievedAt: Date.now(),
            minScore: 1,
        });

        void stage.push('game-over', {
            score: scoringState.score,
            achievements: achievementsToShow.length > 0 ? achievementsToShow : undefined,
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
            getComboDecayWindow: () => comboDecayWindow,
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
            releaseForeshadowForBall,
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
        midiEngine,
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

    enableLaserRewardImpl = (reward) => {
        if (laserController) {
            laserController.activate(reward);
        } else {
            pendingLaserActivation = reward;
        }
    };

    disableLaserRewardImpl = () => {
        laserController?.deactivate();
        pendingLaserActivation = null;
    };

    if (pendingLaserActivation && laserController) {
        laserController.activate(pendingLaserActivation);
        pendingLaserActivation = null;
    }

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
            syncDriftWarnActive = false;
            nextSyncDriftTelemetryLogAt = nextElapsedSeconds + SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
        }

        runtimeState.sessionElapsedSeconds = nextElapsedSeconds;
        emitSyncDriftTelemetry(runtimeState.sessionElapsedSeconds);
        replayBuffer.markTime(runtimeState.sessionElapsedSeconds);
        runtimeState.frameTimestampMs = sessionNow();

        powerups.tick(deltaSeconds);
        laserController?.update(deltaSeconds);

        ENTROPY_ACTION_SEQUENCE.forEach((action) => {
            const binding = ENTROPY_ACTION_BINDINGS[action];
            if (runtimeInput.consumeKeyPress(binding.key)) {
                attemptEntropyAction(action);
            }
        });

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
            gambleManager.clear();
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
        tickGambleBricks(deltaSeconds);
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

        updateForeshadowPredictions();

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
        const decayWindow = comboDecayWindow > 0 ? comboDecayWindow : BASE_COMBO_DECAY_WINDOW;
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
        if (shouldDisplayComboRing) {
            const ringPos = ball.physicsBody.position;
            const baseRadius = ball.radius * (2 + comboIntensity * 0.55);
            const wobble = Math.sin(runtimeState.comboRingPhase * 2) * 0.18;
            const radius = baseRadius * (1 + wobble) + comboEnergy * ball.radius * 0.4;

            const outerColor = mixColors(themeBallColors.highlight, themeAccents.combo, Math.min(1, comboEnergy * 0.7));
            const innerColor = mixColors(themeAccents.combo, themeBallColors.aura, 0.3 + comboEnergy * 0.4);
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

    stage.register('main-menu', (context) =>
        createMainMenuScene(context, {
            helpText: [
                'Drag or use arrow keys to aim the paddle',
                'Tap, space, or click to launch the ball',
                'Stack power-ups for massive combos',
            ],
            onStart: () => {
                void beginNewSession();
            },
            highScoresProvider: getHighScores,
        }),
        { provideContext: provideSceneServices },
    );

    stage.register('fate-ledger', (context) => createFateLedgerScene(context), {
        provideContext: provideSceneServices,
    });

    stage.register('gameplay', (context) =>
        createGameplayScene(context, {
            onUpdate: runGameplayUpdate,
            onSuspend: () => {
                runtimeInput.resetLaunchTrigger();
            },
            onResume: () => {
                runtimeInput.resetLaunchTrigger();
            },
        }),
        { provideContext: provideSceneServices },
    );

    const quitLabel = 'Tap here or press Q to quit to menu';

    stage.register('pause', (context) =>
        createPauseScene(context, {
            resumeLabel: 'Tap to resume',
            quitLabel,
        }),
        { provideContext: provideSceneServices },
    );

    stage.register('level-complete', (context) =>
        createLevelCompleteScene(context, {
            prompt: 'Tap to continue',
        }),
        { provideContext: provideSceneServices },
    );

    stage.register('bias-phase', (context) => createBiasPhaseScene(context), {
        provideContext: provideSceneServices,
    });

    stage.register('game-over', (context) =>
        createGameOverScene(context, {
            prompt: 'Tap to return to menu',
            onRestart: () => {
                void quitToMenu();
            },
        }),
        { provideContext: provideSceneServices },
    );

    await stage.transitionTo('main-menu', undefined, { immediate: true });
    renderStageSoon();
    gameContainer.visible = false;
    hudContainer.visible = false;

    async function quitToMenu(): Promise<void> {
        if (!loop) {
            return;
        }

        while (true) {
            const top = stage.getCurrentScene();
            if (!top || top === 'gameplay' || top === 'main-menu') {
                break;
            }
            stage.pop();
        }

        isPaused = false;
        loop.stop();
        gameContainer.visible = false;
        hudContainer.visible = false;

        try {
            await stage.transitionTo('main-menu', undefined, { immediate: true });
        } catch (error) {
            runtimeLogger.error('Failed to transition to main menu', { error });
        }

        renderStageSoon();
    }

    const resumeFromPause = () => {
        if (!loop || !isPaused) {
            return;
        }

        if (stage.getCurrentScene() === 'pause') {
            stage.pop();
        }

        isPaused = false;
        loop.start();
        renderStageSoon();
    };

    const pauseGame = () => {
        if (!loop || isPaused || !loop.isRunning()) {
            return;
        }

        isPaused = true;
        loop.stop();

        const payload = {
            score: scoringState.score,
            legendTitle: 'Power-Up Legend',
            legendLines: pauseLegendLines,
            onResume: () => {
                resumeFromPause();
            },
            onQuit: () => {
                void quitToMenu();
            },
        } as const;

        void stage.push('pause', payload)
            .then(() => {
                renderStageSoon();
            })
            .catch((error) => {
                isPaused = false;
                loop.start();
                runtimeLogger.error('Failed to push pause overlay', { error });
            });
    };

    const spawnCheatPowerUp = (type: PowerUpType) => {
        if (stage.getCurrentScene() !== 'gameplay') {
            runtimeLogger.warn('Developer cheat ignored: spawn power-up outside gameplay scene', { type });
            return;
        }
        const spawnX = paddle.physicsBody.position.x;
        const spawnY = Math.max(POWER_UP_RADIUS, paddle.physicsBody.position.y - 120);
        levelRuntime.spawnPowerUp(type, { x: spawnX, y: spawnY });
        runtimeLogger.info('Developer cheat spawned power-up', { type, position: { x: spawnX, y: spawnY } });
        renderStageSoon();
    };

    const applyCheatReward = (rewardType: RewardType) => {
        if (stage.getCurrentScene() !== 'gameplay') {
            runtimeLogger.warn('Developer cheat ignored: reward activation outside gameplay', { rewardType });
            return;
        }
        const reward = createReward(rewardType);
        roundMachine.setPendingReward(null);
        powerups.activateReward(reward);
        refreshHud();
        runtimeLogger.info('Developer cheat activated reward', { rewardType });
        renderStageSoon();
    };

    const skipToNextLevelCheat = () => {
        if (stage.getCurrentScene() !== 'gameplay') {
            runtimeLogger.warn('Developer cheat ignored: skip level outside gameplay');
            return;
        }
        runtimeLogger.info('Developer cheat skipping current level', { level: roundMachine.getCurrentLevelIndex() + 1 });
        session.completeRound();
        handleLevelComplete();
        renderStageSoon();
    };


    registerE2EHarnessControls();


    const cleanupVisuals = () => {
        if (pendingVisualTimers.size > 0) {
            for (const timer of pendingVisualTimers) {
                clearTimeout(timer);
            }
            pendingVisualTimers.clear();
        }
        unsubscribeSettings?.();
        unsubscribeSettings = null;
        unsubscribeMeta?.();
        unsubscribeMeta = null;
        unsubscribeTheme?.();
        unsubscribeTheme = null;
        visuals?.dispose();
        visuals = null;
        gambleHighlight?.dispose();
        gambleHighlight = null;
        musicDirector.setBeatCallback(null);
        musicDirector.setMeasureCallback(null);
        runtimeDebug?.resetVisibility();
        runtimeDebug?.updateOverlays({ input: null, physics: null });
        runtimeState.lastPhysicsDebugState = null;
        runtimeState.syncDriftHistory.length = 0;
        runtimeState.syncDriftAverageMs = 0;
        runtimeState.syncDriftPeakMs = 0;
        runtimeState.syncDriftPeakRecordedAt = runtimeState.sessionElapsedSeconds;
        nextSyncDriftTelemetryLogAt = runtimeState.sessionElapsedSeconds + SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
        syncDriftWarnActive = false;
        dynamicPerformanceMode = false;
        accumulatedLowFpsMs = 0;
        accumulatedHighFpsMs = 0;
        applyVisualPerformanceProfile();
    };

    const lifecycle = createRuntimeLifecycle();

    const idleSimulation = createIdleSimulation({
        session,
        random,
        fateLedger,
        lifecycle,
    });
    let idleResumeSummary: IdleSimulationResultSummary | null = null;

    lifecycle.register(() => {
        midiEngine.dispose();
    });
    lifecycle.register(() => {
        disposeForeshadower();
    });
    lifecycle.register(() => {
        resetForeshadowing();
    });
    lifecycle.register(() => {
        disposeInitializer();
    });
    lifecycle.register(() => {
        cleanupVisuals();
    });
    lifecycle.register(() => {
        runtimeInput.dispose();
    });
    lifecycle.register(() => {
        runtimeDebug?.dispose();
        runtimeDebug = null;
    });
    lifecycle.register(() => {
        collisionRuntime?.unwire();
        collisionRuntime = null;
    });
    lifecycle.register(() => {
        laserController?.dispose();
        laserController = null;
    });

    lifecycle.install();

    runtimeDebug = createRuntimeDebug({
        logger: runtimeLogger,
        developerCheats,
        cheatPowerUpBindings,
        toggleTheme,
        pauseGame,
        resumeGame: () => {
            void resumeFromPause();
        },
        quitToMenu,
        spawnCheatPowerUp,
        applyCheatReward,
        skipLevel: () => {
            void skipToNextLevelCheat();
        },
        renderStageSoon,
        isPaused: () => isPaused,
        isLoopRunning: () => Boolean(loop?.isRunning()),
        getPhysicsDebugState: () => runtimeState.lastPhysicsDebugState,
    });
    runtimeDebug.install();
    runtimeDebug.updateOverlays({
        input: visuals?.inputDebugOverlay ?? null,
        physics: visuals?.physicsDebugOverlay ?? null,
    });

    idleResumeSummary = idleSimulation.resumeIfNeeded();
    idleSimulation.persistSnapshot();
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
    ensureToneAudio,
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
