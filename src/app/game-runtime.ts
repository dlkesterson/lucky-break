import {
    scheduleForeshadowEvent,
    initForeshadower,
    cancelForeshadowEvent,
    disposeForeshadower,
} from 'audio/foreshadow-api';

import {
    GameTheme,
    onThemeChange,
    toggleTheme,
    type GameThemeDefinition,
} from 'render/theme';
import { createPhysicsWorld } from 'physics/world';
import { createGameLoop } from './loop';
import { createGameSessionManager } from './state';
import { createAchievementManager, type AchievementUnlock } from './achievements';
import { buildHudScoreboard } from 'render/hud';
import { createDynamicLight } from 'render/effects/dynamic-light';
import { createSpeedRing } from 'render/effects/speed-ring';
import { createComboBloomEffect } from 'render/effects/combo-bloom';
import { createBallTrailsEffect, type BallTrailSource } from 'render/effects/ball-trails';
import { createHeatDistortionEffect, type HeatDistortionSource } from 'render/effects/heat-distortion';
import { createHeatRippleEffect } from 'render/effects/heat-ripple';
import { createBrickParticleSystem, type BrickParticleSystem } from 'render/effects/brick-particles';
import { createRoundCountdown, type RoundCountdownDisplay } from 'render/effects/round-countdown';
import { createHudDisplay, type HudPowerUpView, type HudRewardView } from 'render/hud-display';
import { createMobileHudDisplay } from 'render/mobile-hud-display';
import { createMainMenuScene } from 'scenes/main-menu';
import { createGameplayScene } from 'scenes/gameplay';
import { createLevelCompleteScene } from 'scenes/level-complete';
import { createGameOverScene } from 'scenes/game-over';
import { createPauseScene } from 'scenes/pause';
import { gameConfig, type GameConfig } from 'config/game';
import { BallAttachmentController } from 'physics/ball-attachment';
import { PaddleBodyController } from 'render/paddle-body';
import { GameInputManager } from 'input/input-manager';
import { PhysicsBallLaunchController } from 'physics/ball-launch';
import { reflectOffPaddle, calculateReflectionData } from 'util/paddle-reflection';
import { regulateSpeed, getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { createScoring, awardBrickPoints, decayCombo, resetCombo, getMomentumMetrics } from 'util/scoring';
import { publishComboMilestoneIfNeeded } from './combo-milestones';
import {
    PowerUpManager,
    shouldSpawnPowerUp,
    selectRandomPowerUpType,
    calculatePaddleWidthScale,
    calculateBallSpeedScale,
    type PowerUpType,
} from 'util/power-ups';
import type { Vector2 } from 'input/contracts';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import {
    toColorNumber,
    clampUnit,
    mixColors,
    createPlayfieldBackgroundLayer,
    type BallVisualDefaults,
    type BallVisualPalette,
    type PaddleVisualDefaults,
} from 'render/playfield-visuals';
import { createVisualFactory } from 'render/visual-factory';
import { createComboRing } from 'render/combo-ring';
import { InputDebugOverlay, PhysicsDebugOverlay, type PhysicsDebugOverlayState } from 'render/debug-overlay';
import { Sprite, Container, Graphics, ColorMatrixFilter, type Filter } from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import {
    Events,
    Body as MatterBody,
    Vector as MatterVector,
} from 'physics/matter';
import type { IEventCollision, MatterEngine as Engine, MatterBody as Body } from 'physics/matter';
import { Transport, getContext, getTransport, start as toneStart } from 'tone';
import type { MusicState } from 'audio/music-director';
import { createMidiEngine, type MidiEngine } from 'audio/midi-engine';
import { mulberry32, type RandomManager } from 'util/random';
import type { ReplayBuffer } from './replay-buffer';
import { createGameInitializer } from './game-initializer';
import { createMultiBallController, type MultiBallColors } from './multi-ball-controller';
import { createLevelRuntime, type BrickLayoutBounds } from './level-runtime';
import { createBrickDecorator } from './brick-layout-decorator';
import { getPresetLevelCount, setLevelPresetOffset, MAX_LEVEL_BRICK_HP } from 'util/levels';
import { spinWheel, createReward, type Reward, type RewardType } from 'game/rewards';
import { createGambleBrickManager } from 'game/gamble-brick-manager';
import { smoothTowards } from 'util/input-helpers';
import { rootLogger } from 'util/log';
import { getHighScores, recordHighScore } from 'util/high-scores';
import type { GameSceneServices } from './scene-services';
import { resolveMultiBallReward, resolveSlowTimeReward } from './reward-stack';
import { developerCheats } from './developer-cheats';

interface VisibleOverlayMap {
    inputDebug: boolean;
    physicsDebug: boolean;
}

const AUDIO_RESUME_TIMEOUT_MS = 250;
const runtimeLogger = rootLogger.child('game-runtime');

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
    if (value === null || value === undefined) {
        return false;
    }
    const candidate = value as { then?: unknown };
    return typeof candidate.then === 'function';
};

const waitForPromise = async (
    promiseLike: PromiseLike<unknown>,
    timeoutMs: number,
): Promise<void> => {
    let settled = false;
    const guarded = Promise.resolve(promiseLike).finally(() => {
        settled = true;
    });

    try {
        await Promise.race([guarded, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
    } catch (error) {
        throw error;
    } finally {
        if (!settled) {
            void guarded.catch(() => undefined);
        }
    }
};

const isAutoplayBlockedError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    if (error.name === 'NotAllowedError') {
        return true;
    }

    const message = error.message ?? '';
    return message.includes('was not allowed to start');
};

const getToneAudioContext = (): AudioContext => getContext().rawContext as AudioContext;

const resolveToneTransport = () => {
    try {
        if (typeof getTransport === 'function') {
            return getTransport();
        }
    } catch {
        // Swallow and fall back to Transport constant.
    }
    return Transport;
};

const ensureToneAudio = async (): Promise<void> => {
    const context = getToneAudioContext();
    const attemptToneStart = async () => {
        try {
            const result = toneStart();
            if (isPromiseLike(result)) {
                await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
            }
        } catch (error) {
            if (isAutoplayBlockedError(error)) {
                throw error;
            }
            runtimeLogger.warn('Tone.start failed', { error });
            throw error;
        }
    };

    if (context.state !== 'running') {
        await attemptToneStart();
    }

    if (context.state === 'suspended') {
        try {
            const result = context.resume();
            if (isPromiseLike(result)) {
                await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
            }
        } catch (error) {
            if (isAutoplayBlockedError(error)) {
                throw error;
            }
            runtimeLogger.warn('AudioContext.resume failed', { error });
            throw error;
        }
    }

    if (context.state !== 'running') {
        runtimeLogger.warn('Audio context is still suspended after resume attempt');
    }

    const transport = resolveToneTransport();
    if (transport?.state !== 'started' && typeof transport?.start === 'function') {
        try {
            const result = transport.start();
            if (isPromiseLike(result)) {
                await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
            }
        } catch (error) {
            if (isAutoplayBlockedError(error)) {
                throw error;
            }
            runtimeLogger.warn('Tone.Transport.start failed', { error });
            throw error;
        }
    }
};

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

const achievements = createAchievementManager();

let upgradeSnapshot = achievements.getUpgradeSnapshot();
let comboDecayWindow = BASE_COMBO_DECAY_WINDOW * upgradeSnapshot.comboDecayMultiplier;

const refreshAchievementUpgrades = () => {
    upgradeSnapshot = achievements.getUpgradeSnapshot();
    const candidate = BASE_COMBO_DECAY_WINDOW * upgradeSnapshot.comboDecayMultiplier;
    comboDecayWindow = Number.isFinite(candidate) && candidate > 0 ? candidate : BASE_COMBO_DECAY_WINDOW;
    return upgradeSnapshot;
};

if (!Number.isFinite(comboDecayWindow) || comboDecayWindow <= 0) {
    refreshAchievementUpgrades();
}

const resolveInitialLives = () => Math.max(1, BASE_LIVES + upgradeSnapshot.bonusLives);

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

type PaddleState = Paddle;
type BallState = Ball;

export const createGameRuntime = async ({
    container,
    playfieldDimensions = PLAYFIELD_DEFAULT,
    layoutOrientation,
    uiProfile,
    random,
    replayBuffer,
    onAudioBlocked,
}: GameRuntimeOptions): Promise<GameRuntimeHandle> => {
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

    let rowColors = GameTheme.brickColors.map(toColorNumber);
    let themeBallColors: MultiBallColors = {
        core: toColorNumber(GameTheme.ball.core),
        aura: toColorNumber(GameTheme.ball.aura),
        highlight: toColorNumber(GameTheme.ball.highlight),
    };
    let themeAccents = {
        combo: toColorNumber(GameTheme.accents.combo),
        powerUp: toColorNumber(GameTheme.accents.powerUp),
    };

    const gambleTintArmed = toColorNumber(GAMBLE_TINT_ARMED);
    const gambleTintPrimed = toColorNumber(GAMBLE_TINT_PRIMED);
    const gambleManager = createGambleBrickManager({
        timerSeconds: GAMBLE_TIMER_SECONDS,
        rewardMultiplier: Math.max(1, GAMBLE_REWARD_MULTIPLIER),
        primeResetHp: Math.max(1, GAMBLE_PRIME_RESET_HP),
        failPenaltyHp: Math.max(1, GAMBLE_FAIL_PENALTY_HP),
    });

    let ballVisualDefaults: BallVisualDefaults = {
        baseColor: themeBallColors.core,
        auraColor: themeBallColors.aura,
        highlightColor: themeBallColors.highlight,
        baseAlpha: 0.78,
        rimAlpha: 0.38,
        innerAlpha: 0.32,
        innerScale: 0.5,
    };

    let paddleVisualDefaults: PaddleVisualDefaults = {
        gradient: GameTheme.paddle.gradient.map(toColorNumber),
        accentColor: themeBallColors.aura,
    };

    const visualFactory = createVisualFactory({
        ball: ballVisualDefaults,
        paddle: paddleVisualDefaults,
    });

    let ballHueShift = 0;
    let ballGlowPulse = 0;
    let paddleGlowPulse = 0;
    let comboRingPulse = 0;
    let comboRingPhase = 0;
    let playfieldBackground: ReturnType<typeof createPlayfieldBackgroundLayer> | null = null;
    let comboBloomEffect: ReturnType<typeof createComboBloomEffect> | null = null;
    let ballTrailsEffect: ReturnType<typeof createBallTrailsEffect> | null = null;
    let heatDistortionEffect: ReturnType<typeof createHeatDistortionEffect> | null = null;
    let heatRippleEffect: ReturnType<typeof createHeatRippleEffect> | null = null;
    const ballTrailSources: BallTrailSource[] = [];
    const heatDistortionSources: HeatDistortionSource[] = [];
    let backgroundAccentIndex = 0;
    let backgroundAccentColor = themeAccents.combo;
    let bloomAccentColor = themeAccents.combo;
    let backgroundAccentPalette: number[] = [
        themeAccents.combo,
        themeBallColors.aura,
        mixColors(themeAccents.powerUp, themeBallColors.highlight, 0.45),
    ];

    const rebuildBackgroundPalette = () => {
        backgroundAccentPalette = [
            themeAccents.combo,
            themeBallColors.aura,
            mixColors(themeAccents.powerUp, themeBallColors.highlight, 0.45),
        ];
        if (backgroundAccentPalette.length === 0) {
            backgroundAccentPalette = [0xffffff];
        }
        backgroundAccentIndex %= backgroundAccentPalette.length;
        backgroundAccentColor = backgroundAccentPalette[backgroundAccentIndex] ?? themeAccents.combo;
        bloomAccentColor = backgroundAccentColor;
    };

    rebuildBackgroundPalette();

    let ballLight: ReturnType<typeof createDynamicLight> | null = null;
    let paddleLight: ReturnType<typeof createDynamicLight> | null = null;
    let brickParticles: BrickParticleSystem | null = null;
    let ballSpeedRing: ReturnType<typeof createSpeedRing> | null = null;
    let inputDebugOverlay: InputDebugOverlay | null = null;
    let physicsDebugOverlay: PhysicsDebugOverlay | null = null;
    const overlayVisibility: VisibleOverlayMap = { inputDebug: false, physicsDebug: false };
    const cheatPowerUpBindings: readonly { code: KeyboardEvent['code']; type: PowerUpType }[] = [
        { code: 'Digit1', type: 'paddle-width' },
        { code: 'Digit2', type: 'ball-speed' },
        { code: 'Digit3', type: 'multi-ball' },
        { code: 'Digit4', type: 'sticky-paddle' },
    ];
    let lastPhysicsDebugState: PhysicsDebugOverlayState | null = null;
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
                comboRingPulse = Math.min(1, comboRingPulse + ring);
                ballGlowPulse = Math.min(1, ballGlowPulse + ball);
                ballLight?.flash(0.35);
            },
            boostPowerUp: ({ paddle }) => {
                paddleGlowPulse = Math.min(1, paddleGlowPulse + paddle);
                paddleLight?.flash(0.5);
            },
        },
        onAudioBlocked,
    });

    const hasPerformanceNow = typeof performance !== 'undefined' && typeof performance.now === 'function';
    const pendingVisualTimers = new Set<ReturnType<typeof setTimeout>>();
    let audioVisualSkewSeconds = 0;
    let syncDriftMs = 0;
    const midiEngine: MidiEngine = createMidiEngine();

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
        const targetVisualSeconds = scheduledTime + audioVisualSkewSeconds;
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

    const attachPlayfieldFilter = (filter: Filter) => {
        const existing = stage.layers.playfield.filters;
        if (existing?.includes(filter)) {
            return;
        }
        const next = existing ? existing.slice() : [];
        next.push(filter);
        stage.layers.playfield.filters = next;
    };

    const detachPlayfieldFilter = (filter: Filter) => {
        const existing = stage.layers.playfield.filters;
        if (!existing) {
            return;
        }
        const next = existing.filter((entry) => entry !== filter);
        stage.layers.playfield.filters = next.length > 0 ? next : null;
    };

    comboBloomEffect = createComboBloomEffect({ baseColor: themeAccents.combo });
    if (comboBloomEffect) {
        attachPlayfieldFilter(comboBloomEffect.filter);
    }

    ballTrailsEffect = createBallTrailsEffect({
        coreColor: themeBallColors.core,
        auraColor: themeBallColors.aura,
        accentColor: themeAccents.combo,
    });
    stage.addToLayer('effects', ballTrailsEffect.container);

    heatDistortionEffect = createHeatDistortionEffect();
    if (heatDistortionEffect) {
        attachPlayfieldFilter(heatDistortionEffect.filter);
    }

    heatRippleEffect = createHeatRippleEffect();
    attachPlayfieldFilter(heatRippleEffect.filter);
    if (import.meta.env.DEV && typeof window !== 'undefined') {
        const globalRef = window as typeof window & {
            __LBHeatRipple?: { getActiveRippleCount: () => number };
        };
        globalRef.__LBHeatRipple = {
            getActiveRippleCount: () => heatRippleEffect?.getActiveRippleCount() ?? 0,
        };
    }

    const physics = createPhysicsWorld({
        dimensions: { width: PLAYFIELD_WIDTH, height: PLAYFIELD_HEIGHT },
        gravity: 0,
    });

    let sessionElapsedSeconds = 0;
    let frameTimestampMs = 0;

    const sessionNow = (): number => Math.max(0, Math.floor(sessionElapsedSeconds * 1000));

    const foreshadowScale = deriveForeshadowScale(random.seed());
    const foreshadowSeed = (random.seed() ^ FORESHADOW_EVENT_SALT) >>> 0;
    initForeshadower({
        scale: foreshadowScale,
        seed: foreshadowSeed,
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
    let scoringState = createScoring();
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
    const powerUpManager = new PowerUpManager();
    let runHighestCombo = 0;
    let levelBricksBroken = 0;
    let roundHighestCombo = 0;
    let roundScoreBaseline = 0;
    let roundCoinBaseline = 0;
    let levelAutoCompleted = false;
    let autoCompleteActive = false;
    let autoCompleteTimer = AUTO_COMPLETE_COUNTDOWN;
    let roundCountdownDisplay: RoundCountdownDisplay | null = null;
    const pendingAchievementNotifications: AchievementUnlock[] = [];

    const syncAutoCompleteCountdownDisplay = () => {
        if (!roundCountdownDisplay) {
            return;
        }
        if (!AUTO_COMPLETE_ENABLED || !autoCompleteActive) {
            roundCountdownDisplay.hide();
            return;
        }
        roundCountdownDisplay.show(autoCompleteTimer, AUTO_COMPLETE_COUNTDOWN);
    };

    const consumeAchievementNotifications = (): readonly AchievementUnlock[] => {
        if (pendingAchievementNotifications.length === 0) {
            return [];
        }
        const notifications = pendingAchievementNotifications.slice();
        pendingAchievementNotifications.length = 0;
        return notifications;
    };
    let currentLevelIndex = 0;
    let loop: ReturnType<typeof createGameLoop> | null = null;
    let isPaused = false;
    let levelDifficultyMultiplier = 1;
    let pendingReward: Reward | null = null;
    let activeReward: Reward | null = null;
    let doublePointsMultiplier = 1;
    let doublePointsTimer = 0;

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
    };

    const provideSceneServices = (): GameSceneServices => sharedSceneServices;

    const removeBodyVisual = (body: Body): void => {
        const visual = visualBodies.get(body);
        if (!visual) {
            return;
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
        const nowSeconds = sessionElapsedSeconds;
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
            const normalizedIntensity = clampUnit(prediction.speed / Math.max(FORESHADOW_MIN_SPEED, currentMaxSpeed || FORESHADOW_MIN_SPEED));
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
        } else if (state === 'armed') {
            visual.tint = gambleTintArmed;
        } else {
            visual.tint = 0xffffff;
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

    const tickGambleBricks = (deltaSeconds: number): void => {
        const expirations = gambleManager.tick(deltaSeconds);
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

    const findPowerUp = (
        ...args: Parameters<typeof levelRuntime.findPowerUp>
    ) => levelRuntime.findPowerUp(...args);
    const removePowerUp = (
        ...args: Parameters<typeof levelRuntime.removePowerUp>
    ) => levelRuntime.removePowerUp(...args);
    const spawnCoin = (
        ...args: Parameters<typeof levelRuntime.spawnCoin>
    ) => levelRuntime.spawnCoin(...args);
    const findCoin = (
        ...args: Parameters<typeof levelRuntime.findCoin>
    ) => levelRuntime.findCoin(...args);
    const removeCoin = (
        ...args: Parameters<typeof levelRuntime.removeCoin>
    ) => levelRuntime.removeCoin(...args);
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
    const clearActivePowerUps = () => levelRuntime.clearActivePowerUps();
    const clearActiveCoins = () => levelRuntime.clearActiveCoins();

    const resetAutoCompleteCountdown = () => {
        autoCompleteActive = false;
        autoCompleteTimer = AUTO_COMPLETE_COUNTDOWN;
        syncAutoCompleteCountdownDisplay();
    };

    const beginAutoCompleteCountdown = () => {
        autoCompleteActive = true;
        autoCompleteTimer = AUTO_COMPLETE_COUNTDOWN;
        syncAutoCompleteCountdownDisplay();
    };

    const loadLevel = (levelIndex: number) => {
        gambleManager.clear();
        const result = levelRuntime.loadLevel(levelIndex);
        powerUpChanceMultiplier = result.powerUpChanceMultiplier;
        levelDifficultyMultiplier = result.difficultyMultiplier;
        brickLayoutBounds = result.layoutBounds;
        session.startRound({ breakableBricks: result.breakableBricks });
        brickParticles?.reset();
        heatRippleEffect?.clear();
        registerGambleBricks();
    };

    playfieldBackground = createPlayfieldBackgroundLayer(playfieldDimensions);
    stage.addToLayer('playfield', playfieldBackground.container);

    const applyBackgroundAccent = (accentIndexDelta: number) => {
        if (backgroundAccentPalette.length === 0) {
            return;
        }
        backgroundAccentIndex = (backgroundAccentIndex + accentIndexDelta + backgroundAccentPalette.length) %
            backgroundAccentPalette.length;
        backgroundAccentColor = backgroundAccentPalette[backgroundAccentIndex];
        bloomAccentColor = backgroundAccentColor;
    };

    const handleMusicMeasure = () => {
        applyBackgroundAccent(1);
    };
    musicDirector.setBeatCallback(null);
    musicDirector.setMeasureCallback(handleMusicMeasure);

    roundCountdownDisplay = createRoundCountdown({
        playfieldSize: playfieldDimensions,
        theme: GameTheme,
    });
    stage.addToLayer('playfield', roundCountdownDisplay.container);
    syncAutoCompleteCountdownDisplay();

    brickParticles = createBrickParticleSystem({
        random: random.random,
    });
    brickParticles.container.zIndex = 42;
    stage.addToLayer('effects', brickParticles.container);

    const gameContainer = new Container();
    gameContainer.zIndex = 10;
    gameContainer.visible = false;
    gameContainer.sortableChildren = true;
    stage.addToLayer('playfield', gameContainer);

    const bounds = physics.factory.bounds();
    physics.add(bounds);

    const ballLightHandle = createDynamicLight({
        speedForMaxIntensity: BALL_MAX_SPEED * 1.1,
    });
    ballLightHandle.container.zIndex = 5;
    stage.addToLayer('effects', ballLightHandle.container);
    ballLight = ballLightHandle;

    const buildPaddleLight = (color: number) => {
        const handle = createDynamicLight({
            color,
            minRadius: 140,
            maxRadius: 140,
            baseRadius: 140,
            minIntensity: 0,
            maxIntensity: 0,
            speedForMaxIntensity: Number.POSITIVE_INFINITY,
            radiusLerpSpeed: 6,
            intensityLerpSpeed: 5,
        });
        handle.container.zIndex = 4;
        handle.container.alpha = 0.9;
        stage.addToLayer('effects', handle.container);
        return handle;
    };

    const replacePaddleLight = (color: number) => {
        if (paddleLight) {
            const parent = paddleLight.container.parent;
            if (parent) {
                parent.removeChild(paddleLight.container);
            }
            paddleLight.destroy();
        }
        paddleLight = buildPaddleLight(color);
    };

    replacePaddleLight(themeAccents.powerUp);

    const ballController = new BallAttachmentController();
    const paddleController = new PaddleBodyController();
    const inputManager = new GameInputManager();
    const launchController = new PhysicsBallLaunchController();

    const paddle: PaddleState = paddleController.createPaddle(
        { x: HALF_PLAYFIELD_WIDTH, y: PLAYFIELD_HEIGHT - 70 },
        { width: 100, height: 20, speed: 300 },
    );
    physics.add(paddle.physicsBody);

    const ball: BallState = ballController.createAttachedBall(
        paddleController.getPaddleCenter(paddle),
        { radius: 10, restitution: 0.98 },
    );
    physics.add(ball.physicsBody);

    const comboRing = createComboRing(stage.app.renderer);
    comboRing.container.zIndex = 40;
    gameContainer.addChild(comboRing.container);

    const drawBallSprite = (graphics: Graphics, radius: number, palette?: Partial<BallVisualPalette>) => {
        visualFactory.ball.draw(graphics, radius, palette);
    };

    ballSpeedRing = createSpeedRing({
        minRadius: ball.radius + 6,
        maxRadius: ball.radius + 28,
        haloRadiusOffset: 14,
        ringThickness: 3,
        palette: {
            ringColor: themeBallColors.highlight,
            haloColor: themeBallColors.aura,
        },
    });
    ballSpeedRing.container.zIndex = 49;
    gameContainer.addChild(ballSpeedRing.container);

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
    });

    const paddleGraphics = visualFactory.paddle.create({ width: paddle.width, height: paddle.height });
    paddleGraphics.zIndex = 60;
    gameContainer.addChild(paddleGraphics);
    visualBodies.set(paddle.physicsBody, paddleGraphics);

    inputManager.initialize(container);

    inputDebugOverlay = new InputDebugOverlay({
        inputManager,
        paddleController,
        ballController,
        paddle,
        ball,
        stage,
    });
    stage.layers.hud.addChild(inputDebugOverlay.getContainer());

    physicsDebugOverlay = new PhysicsDebugOverlay();
    stage.layers.hud.addChild(physicsDebugOverlay.getContainer());
    physicsDebugOverlay.setVisible(false);

    let previousPaddlePosition = { x: paddle.position.x, y: paddle.position.y };
    let lastRecordedInputTarget: Vector2 | null = null;
    let currentBaseSpeed = BALL_BASE_SPEED;
    let currentMaxSpeed = BALL_MAX_SPEED;
    let currentLaunchSpeed = BALL_LAUNCH_SPEED;
    let powerUpChanceMultiplier = 1;
    let rewardPaddleWidthMultiplier = DEFAULT_PADDLE_WIDTH_MULTIPLIER;
    let slowTimeTimer = 0;
    let slowTimeScale = 1;
    let multiBallRewardTimer = 0;
    let widePaddleRewardActive = false;

    const reattachBallToPaddle = (): void => {
        const attachmentOffset = { x: 0, y: -ball.radius - paddle.height / 2 };
        cancelForeshadowForBall(ball.physicsBody.id);
        physics.attachBallToPaddle(ball.physicsBody, paddle.physicsBody, attachmentOffset);
        ball.isAttached = true;
        ball.attachmentOffset = attachmentOffset;
        MatterBody.setVelocity(ball.physicsBody, { x: 0, y: 0 });
        MatterBody.setAngularVelocity(ball.physicsBody, 0);
        inputManager.resetLaunchTrigger();
        const center = paddleController.getPaddleCenter(paddle);
        previousPaddlePosition = { x: center.x, y: center.y };
        inputManager.syncPaddlePosition(center);
        ballSpeedRing?.reset();
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
        multiBallController.spawnExtraBalls({ currentLaunchSpeed, requestedCount });
    };

    const handlePowerUpActivation = (type: PowerUpType): void => {
        const lightBoost = (() => {
            switch (type) {
                case 'multi-ball':
                    return 0.9;
                case 'ball-speed':
                    return 0.7;
                case 'paddle-width':
                    return 0.55;
                case 'sticky-paddle':
                    return 0.5;
                default:
                    return 0.6;
            }
        })();
        ballLight?.flash(lightBoost);
        paddleLight?.flash(Math.min(0.8, lightBoost * 0.75 + 0.25));
        if (type === 'multi-ball') {
            spawnExtraBalls();
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

        themeBallColors = {
            core: toColorNumber(theme.ball.core),
            aura: toColorNumber(theme.ball.aura),
            highlight: toColorNumber(theme.ball.highlight),
        };

        ballVisualDefaults = {
            baseColor: themeBallColors.core,
            auraColor: themeBallColors.aura,
            highlightColor: themeBallColors.highlight,
            baseAlpha: 0.78,
            rimAlpha: 0.38,
            innerAlpha: 0.32,
            innerScale: 0.5,
        } satisfies BallVisualDefaults;

        paddleVisualDefaults = {
            gradient: theme.paddle.gradient.map(toColorNumber),
            accentColor: themeBallColors.aura,
        } satisfies PaddleVisualDefaults;

        themeAccents = {
            combo: toColorNumber(theme.accents.combo),
            powerUp: toColorNumber(theme.accents.powerUp),
        };

        visualFactory.ball.setDefaults(ballVisualDefaults);
        visualFactory.paddle.setDefaults(paddleVisualDefaults);

        ballGlowFilter.color = themeBallColors.highlight;
        ballSpeedRing?.setPalette({
            ringColor: themeBallColors.highlight,
            haloColor: themeBallColors.aura,
        });
        drawBallSprite(ballGraphics, ball.radius);
        visualFactory.paddle.draw(paddleGraphics, paddle.width, paddle.height);

        multiBallController.applyTheme(themeBallColors);

        hudDisplay.setTheme(theme);
        roundCountdownDisplay?.setTheme(theme);
        stage.applyTheme(theme);
        ballTrailsEffect?.applyTheme({
            coreColor: themeBallColors.core,
            auraColor: themeBallColors.aura,
            accentColor: themeAccents.combo,
        });
        comboBloomEffect?.applyTheme(themeAccents.combo);
        replacePaddleLight(themeAccents.powerUp);
        rebuildBackgroundPalette();

        renderStageSoon();
    };

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

    const formatPowerUpLabel = (type: PowerUpType): string => {
        switch (type) {
            case 'paddle-width':
                return 'Paddle Width';
            case 'ball-speed':
                return 'Ball Speed';
            case 'multi-ball':
                return 'Multi Ball';
            case 'sticky-paddle':
                return 'Sticky Paddle';
            default:
                return type;
        }
    };

    const collectActivePowerUps = (): HudPowerUpView[] =>
        powerUpManager.getActiveEffects().map((effect) => ({
            label: formatPowerUpLabel(effect.type),
            remaining: `${Math.max(0, effect.remainingTime).toFixed(1)}s`,
        }));

    const resolveRewardView = (): HudRewardView | null => {
        if (!activeReward) {
            return null;
        }

        const label = (() => {
            switch (activeReward.type) {
                case 'double-points':
                    return 'Double Points';
                case 'ghost-brick':
                    return 'Ghost Bricks';
                case 'sticky-paddle':
                    return 'Sticky Paddle';
                case 'multi-ball':
                    return 'Multi Ball';
                case 'slow-time':
                    return 'Slow Time';
                case 'wide-paddle':
                    return 'Wide Paddle';
                default:
                    return 'Lucky Reward';
            }
        })();

        let remaining = 0;
        let remainingLabel: string | undefined;
        switch (activeReward.type) {
            case 'double-points':
                remaining = Math.max(0, doublePointsTimer);
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            case 'ghost-brick':
                remaining = getGhostBrickRemainingDuration();
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            case 'sticky-paddle': {
                const sticky = powerUpManager.getEffect('sticky-paddle');
                remaining = sticky ? Math.max(0, sticky.remainingTime) : 0;
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            }
            case 'multi-ball': {
                remaining = Math.max(0, multiBallRewardTimer);
                const extras = multiBallController.count();
                if (extras > 0) {
                    remainingLabel = `${extras} extra`;
                } else if (remaining > 0) {
                    remainingLabel = `${remaining.toFixed(1)}s`;
                }
                break;
            }
            case 'slow-time':
                remaining = Math.max(0, slowTimeTimer);
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            case 'wide-paddle': {
                const widthEffect = powerUpManager.getEffect('paddle-width');
                remaining = widthEffect ? Math.max(0, widthEffect.remainingTime) : 0;
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            }
            default:
                remaining = 0;
                break;
        }

        if (!remainingLabel && activeReward.type !== 'sticky-paddle') {
            return { label };
        }

        return {
            label,
            remaining: remainingLabel,
        } satisfies HudRewardView;
    };

    let lastComboCount = 0;

    const refreshHud = () => {
        const snapshot = session.snapshot();
        const hudView = buildHudScoreboard(snapshot);

        const prompts = (() => {
            if (!AUTO_COMPLETE_ENABLED || !autoCompleteActive) {
                return hudView.prompts;
            }
            const secondsRemaining = Math.max(0, autoCompleteTimer);
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
            difficultyMultiplier: levelDifficultyMultiplier,
            comboCount: scoringState.combo,
            comboTimer: scoringState.comboTimer,
            activePowerUps: collectActivePowerUps(),
            reward: resolveRewardView(),
            momentum: snapshot.hud.momentum,
        });

        if (scoringState.combo > lastComboCount) {
            const pulseStrength = Math.min(1, 0.55 + scoringState.combo * 0.04);
            hudDisplay.pulseCombo(pulseStrength);
        }
        lastComboCount = scoringState.combo;
        positionHud();
    };

    const activateReward = (reward: Reward | null) => {
        const existingSlowTime = slowTimeTimer > 0 ? { remaining: slowTimeTimer, scale: slowTimeScale } : null;
        activeReward = reward;

        doublePointsMultiplier = 1;
        doublePointsTimer = 0;
        rewardPaddleWidthMultiplier = DEFAULT_PADDLE_WIDTH_MULTIPLIER;
        slowTimeTimer = 0;
        slowTimeScale = 1;
        multiBallRewardTimer = 0;
        widePaddleRewardActive = false;
        resetGhostBricks();

        if (!reward) {
            return;
        }

        switch (reward.type) {
            case 'sticky-paddle':
                powerUpManager.refresh('sticky-paddle', { defaultDuration: reward.duration });
                break;
            case 'double-points':
                doublePointsMultiplier = reward.multiplier;
                doublePointsTimer = reward.duration;
                break;
            case 'ghost-brick':
                applyGhostBrickReward(reward.duration, reward.ghostCount);
                break;
            case 'multi-ball':
                {
                    const currentExtras = multiBallController.count();
                    const resolution = resolveMultiBallReward({
                        reward,
                        currentExtraCount: currentExtras,
                        capacity: MULTI_BALL_CAPACITY,
                        maxDuration: MULTI_BALL_MAX_DURATION,
                    });
                    multiBallRewardTimer = resolution.duration;
                    if (resolution.extrasToSpawn > 0) {
                        spawnExtraBalls(resolution.extrasToSpawn);
                    }
                    const afterCount = multiBallController.count();
                    runtimeLogger.info('Multi-ball reward applied', {
                        duration: resolution.duration,
                        previousExtras: currentExtras,
                        afterCount,
                        capacity: MULTI_BALL_CAPACITY,
                        requestedExtras: reward.extraBalls,
                        spawnedExtras: resolution.extrasToSpawn,
                    });
                }
                break;
            case 'slow-time':
                {
                    const resolution = resolveSlowTimeReward({
                        reward,
                        maxDuration: SLOW_TIME_MAX_DURATION,
                        activeRemaining: existingSlowTime?.remaining,
                        activeScale: existingSlowTime?.scale,
                    });
                    slowTimeTimer = resolution.duration;
                    slowTimeScale = resolution.duration > 0 ? resolution.scale : 1;
                    runtimeLogger.info('Slow-time reward applied', {
                        duration: resolution.duration,
                        targetScale: resolution.scale,
                        extended: resolution.extended,
                        previousDuration: existingSlowTime?.remaining ?? 0,
                        previousScale: existingSlowTime?.scale ?? 1,
                    });
                }
                break;
            case 'wide-paddle':
                rewardPaddleWidthMultiplier = Math.max(1, reward.widthMultiplier);
                powerUpManager.refresh('paddle-width', { defaultDuration: reward.duration });
                widePaddleRewardActive = true;
                break;
        }
    };

    const beginNewSession = async (): Promise<void> => {
        if (loop?.isRunning()) {
            loop.stop();
        }

        musicDirector.setEnabled(true);
        random.reset();
        const activeSeed = random.seed();
        sessionElapsedSeconds = 0;
        frameTimestampMs = 0;
        lastRecordedInputTarget = null;
        replayBuffer.begin(activeSeed);

        resetForeshadowing();

        refreshAchievementUpgrades();
        pendingAchievementNotifications.length = 0;

        session = createSession();
        runHighestCombo = 0;
        levelBricksBroken = 0;
        pushMusicState({
            lives: toMusicLives(resolveInitialLives()),
            combo: 0,
            tempoRatio: 0,
            bricksRemainingRatio: 1,
            warbleIntensity: 0,
        });
        currentLevelIndex = 0;
        pendingReward = null;
        activateReward(null);
        levelDifficultyMultiplier = 1;
        startLevel(currentLevelIndex, { resetScore: true });
        await stage.transitionTo('gameplay');
        loop?.start();
    };

    const registerE2EHarnessControls = (): void => {
        const candidate = globalThis as { __LB_E2E_HOOKS__?: unknown };
        const harness = candidate.__LB_E2E_HOOKS__;
        if (!harness || typeof harness !== 'object') {
            return;
        }

        const controls = harness as { startGameplay?: () => Promise<void> };
        controls.startGameplay = () => beginNewSession();
    };

    registerE2EHarnessControls();

    const startLevel = (levelIndex: number, options: { resetScore?: boolean } = {}): void => {
        isPaused = false;

        gameContainer.visible = true;
        hudContainer.visible = true;

        levelAutoCompleted = false;
        resetAutoCompleteCountdown();

        if (options.resetScore) {
            scoringState = createScoring();
        } else {
            resetCombo(scoringState);
        }
        syncMomentum();

        levelBricksBroken = 0;
        roundHighestCombo = scoringState.combo;
        roundScoreBaseline = scoringState.score;
        roundCoinBaseline = session.snapshot().coins;

        powerUpManager.clearAll();
        clearExtraBalls();
        resetForeshadowing();
        loadLevel(levelIndex);
        reattachBallToPaddle();
        if (pendingReward) {
            activateReward(pendingReward);
            pendingReward = null;
        } else {
            activateReward(null);
        }
        refreshHud();
    };

    const handleLevelComplete = (): void => {
        clearExtraBalls();
        resetForeshadowing();
        isPaused = false;
        loop?.stop();
        pendingReward = spinWheel(random.random);
        resetAutoCompleteCountdown();

        const autoCompletedThisLevel = levelAutoCompleted;
        levelAutoCompleted = false;

        const roundUnlocks = achievements.recordRoundComplete({ bricksBroken: levelBricksBroken });
        if (roundUnlocks.length > 0) {
            pendingAchievementNotifications.push(...roundUnlocks);
            refreshAchievementUpgrades();
        }

        const achievementsToShow = consumeAchievementNotifications();
        const sessionSnapshot = session.snapshot();
        const hudSnapshot = sessionSnapshot.hud;

        const bricksBroken = Math.max(0, hudSnapshot.brickTotal - hudSnapshot.brickRemaining);
        const roundScoreGain = Math.max(0, scoringState.score - roundScoreBaseline);
        const coinsCollected = Math.max(0, sessionSnapshot.coins - roundCoinBaseline);
        const durationMs = sessionSnapshot.lastOutcome?.durationMs ?? 0;
        const volleyLength = hudSnapshot.momentum.volleyLength;
        const speedPressure = hudSnapshot.momentum.speedPressure;

        const milestones: string[] = [];
        if (roundScoreGain > 0) {
            milestones.push(`+${roundScoreGain.toLocaleString()} points`);
        }
        if (roundHighestCombo > 0) {
            milestones.push(`Combo x${roundHighestCombo}`);
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

        roundScoreBaseline = scoringState.score;
        roundCoinBaseline = sessionSnapshot.coins;
        roundHighestCombo = scoringState.combo;

        const completedLevel = currentLevelIndex + 1;
        let handled = false;
        const continueToNextLevel = () => {
            if (handled) {
                return;
            }
            handled = true;
            if (stage.getCurrentScene() === 'level-complete') {
                stage.pop();
            }
            currentLevelIndex += 1;
            startLevel(currentLevelIndex);
            loop?.start();
            renderStageSoon();
        };

        void stage.push('level-complete', {
            level: completedLevel,
            score: scoringState.score,
            reward: pendingReward ?? undefined,
            achievements: achievementsToShow.length > 0 ? achievementsToShow : undefined,
            recap: {
                roundScore: roundScoreGain,
                totalScore: scoringState.score,
                bricksBroken,
                brickTotal: hudSnapshot.brickTotal,
                bestCombo: roundHighestCombo,
                volleyLength,
                speedPressure,
                coinsCollected,
                durationMs,
            },
            milestones: milestones.length > 0 ? milestones : undefined,
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
        pendingReward = null;
        activateReward(null);
        musicDirector.setEnabled(false);

        const sessionUnlocks = achievements.recordSessionSummary({ highestCombo: runHighestCombo });
        if (sessionUnlocks.length > 0) {
            pendingAchievementNotifications.push(...sessionUnlocks);
            refreshAchievementUpgrades();
        }

        const achievementsToShow = consumeAchievementNotifications();
        recordHighScore(scoringState.score, {
            round: currentLevelIndex + 1,
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

    Events.on(physics.engine, 'collisionStart', (event: IEventCollision<Engine>) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;
            // Capture session state once per collision; keeps brick counts consistent with HUD updates.
            const sessionSnapshot = session.snapshot();
            const sessionId = sessionSnapshot.sessionId;

            if ((bodyA.label === 'ball' && bodyB.label === 'brick') || (bodyA.label === 'brick' && bodyB.label === 'ball')) {
                const brick = bodyA.label === 'brick' ? bodyA : bodyB;
                const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;
                releaseForeshadowForBall(ballBody.id, sessionElapsedSeconds);

                const currentHp = brickHealth.get(brick) ?? 1;
                const nextHp = currentHp - 1;
                const metadata = brickMetadata.get(brick);
                const row = metadata?.row ?? Math.floor((brick.position.y - 100) / BRICK_HEIGHT);
                const col = metadata?.col ?? Math.floor((brick.position.x - 50) / BRICK_WIDTH);
                const impactVelocity = MatterVector.magnitude(ballBody.velocity);
                const impactStrength = clampUnit(impactVelocity / Math.max(1, currentMaxSpeed));
                const initialHp = metadata?.hp ?? currentHp;

                const isFortified = metadata?.traits?.includes('fortified') ?? false;
                const isBreakableBrick = metadata?.breakable !== false;

                if (!isBreakableBrick) {
                    const scheduledTime = computeScheduledAudioTime();
                    bus.publish('BrickHit', {
                        sessionId,
                        row,
                        col,
                        impactVelocity,
                        brickType: 'indestructible',
                        comboHeat: scoringState.combo,
                        previousHp: currentHp,
                        remainingHp: currentHp,
                        scheduledTime,
                    }, frameTimestampMs);

                    session.recordEntropyEvent({
                        type: 'wall-hit',
                        comboHeat: scoringState.combo,
                        impactVelocity,
                        speed: impactVelocity,
                    });
                    midiEngine.triggerBrickAccent({
                        combo: Math.max(1, scoringState.combo),
                        intensity: impactStrength,
                        time: scheduledTime,
                        accent: 'hit',
                    });
                    return;
                }

                if (nextHp > 0) {
                    brickHealth.set(brick, nextHp);
                    levelRuntime.updateBrickDamage(brick, nextHp);
                    applyGambleAppearance(brick);

                    const brickType = gambleManager.getState(brick)
                        ? ('gamble' as const)
                        : isFortified
                            ? ('multi-hit' as const)
                            : ('standard' as const);

                    const scheduledTime = computeScheduledAudioTime();
                    bus.publish('BrickHit', {
                        sessionId,
                        row,
                        col,
                        impactVelocity,
                        brickType,
                        comboHeat: scoringState.combo,
                        previousHp: currentHp,
                        remainingHp: nextHp,
                        scheduledTime,
                    }, frameTimestampMs);

                    session.recordEntropyEvent({
                        type: 'brick-hit',
                        comboHeat: scoringState.combo,
                        impactVelocity,
                        speed: impactVelocity,
                    });

                    midiEngine.triggerBrickAccent({
                        combo: Math.max(1, scoringState.combo),
                        intensity: impactStrength,
                        time: scheduledTime,
                        accent: 'hit',
                    });

                    scheduleVisualEffect(scheduledTime, () => {
                        if (!heatRippleEffect) {
                            return;
                        }
                        const normalizedX = clampUnit(brick.position.x / PLAYFIELD_WIDTH);
                        const normalizedY = clampUnit(brick.position.y / PLAYFIELD_HEIGHT);
                        const hitSpeedIntensity = clampUnit((impactVelocity ?? 0) / Math.max(1, currentMaxSpeed));
                        const hitComboIntensity = clampUnit(
                            scoringState.combo / Math.max(1, config.scoring.multiplierThreshold * 2),
                        );
                        const rippleIntensity = Math.min(1, 0.18 + hitSpeedIntensity * 0.45 + hitComboIntensity * 0.3);
                        const contactRadius = typeof ballBody.circleRadius === 'number' && Number.isFinite(ballBody.circleRadius)
                            ? Math.max(2, ballBody.circleRadius)
                            : ball.radius;
                        const normalizedRadius = clampUnit(contactRadius / PLAYFIELD_SIZE_MAX);
                        heatRippleEffect.spawnRipple({
                            position: { x: normalizedX, y: normalizedY },
                            intensity: rippleIntensity * 0.8,
                            startRadius: Math.max(0.012, normalizedRadius * 1.4),
                            endRadius: Math.min(0.45, normalizedRadius * 1.3 + 0.15 + rippleIntensity * 0.2),
                        });
                    });
                } else {
                    const gambleHitResult = gambleManager.onHit(brick);
                    if (gambleHitResult.type === 'prime') {
                        const resetHp = Math.max(1, Math.round(gambleHitResult.resetHp));
                        const clampedReset = Math.min(MAX_LEVEL_BRICK_HP, resetHp);
                        brickHealth.set(brick, clampedReset);
                        const visualState = brickVisualState.get(brick);
                        if (visualState) {
                            const nextMax = visualState.isBreakable
                                ? Math.min(MAX_LEVEL_BRICK_HP, Math.max(visualState.maxHp, clampedReset))
                                : Math.max(visualState.maxHp, clampedReset);
                            visualState.maxHp = nextMax;
                            visualState.hasHpLabel = visualState.isBreakable && visualState.maxHp > 1;
                        }
                        levelRuntime.updateBrickDamage(brick, clampedReset);
                        applyGambleAppearance(brick);

                        const scheduledTime = computeScheduledAudioTime();
                        bus.publish('BrickHit', {
                            sessionId,
                            row,
                            col,
                            impactVelocity,
                            brickType: 'gamble',
                            comboHeat: scoringState.combo,
                            previousHp: currentHp,
                            remainingHp: clampedReset,
                            scheduledTime,
                        }, frameTimestampMs);

                        session.recordEntropyEvent({
                            type: 'brick-hit',
                            comboHeat: scoringState.combo,
                            impactVelocity,
                            speed: impactVelocity,
                        });
                        midiEngine.triggerBrickAccent({
                            combo: Math.max(1, scoringState.combo),
                            intensity: impactStrength,
                            time: scheduledTime,
                            accent: 'hit',
                        });
                        return;
                    }

                    const gambleSuccess = gambleHitResult.type === 'success';
                    const brickBreakType = gambleSuccess
                        ? ('gamble' as const)
                        : isFortified
                            ? ('multi-hit' as const)
                            : ('standard' as const);

                    const scheduledTime = computeScheduledAudioTime();
                    bus.publish('BrickBreak', {
                        sessionId,
                        row,
                        col,
                        impactVelocity,
                        comboHeat: scoringState.combo,
                        brickType: brickBreakType,
                        initialHp,
                        scheduledTime,
                    }, frameTimestampMs);

                    const bricksRemainingBefore = sessionSnapshot.brickRemaining;
                    const bricksTotal = sessionSnapshot.brickTotal;
                    const previousCombo = scoringState.combo;
                    const bricksRemainingAfter = Math.max(0, bricksRemainingBefore - 1);
                    // Provide brick context so scoring momentum metrics mirror what the HUD will show.
                    const basePoints = awardBrickPoints(
                        scoringState,
                        { comboDecayTime: comboDecayWindow },
                        {
                            bricksRemaining: bricksRemainingAfter,
                            brickTotal: bricksTotal,
                            impactSpeed: impactVelocity,
                            maxSpeed: currentMaxSpeed,
                        },
                    );
                    let points = basePoints;
                    if (gambleSuccess) {
                        const multiplier = Math.max(1, gambleHitResult.rewardMultiplier);
                        const boosted = Math.max(basePoints, Math.round(basePoints * multiplier));
                        const bonus = Math.max(0, boosted - basePoints);
                        points = boosted;
                        if (bonus > 0) {
                            scoringState.score += bonus;
                        }
                    }
                    if (doublePointsMultiplier > 1) {
                        const bonus = Math.round(points * (doublePointsMultiplier - 1));
                        points += bonus;
                        if (bonus > 0) {
                            scoringState.score += bonus;
                        }
                    }

                    levelBricksBroken += 1;
                    if (scoringState.combo > runHighestCombo) {
                        runHighestCombo = scoringState.combo;
                    }
                    if (scoringState.combo > roundHighestCombo) {
                        roundHighestCombo = scoringState.combo;
                    }

                    const achievementUnlocks = achievements.recordBrickBreak({ combo: scoringState.combo });
                    if (achievementUnlocks.length > 0) {
                        pendingAchievementNotifications.push(...achievementUnlocks);
                        refreshAchievementUpgrades();
                        const nextDecay = comboDecayWindow;
                        if (Number.isFinite(nextDecay) && nextDecay > 0) {
                            scoringState.comboTimer = Math.max(scoringState.comboTimer, nextDecay);
                            scoringState.momentum.comboTimer = scoringState.comboTimer;
                        }
                    }

                    publishComboMilestoneIfNeeded({
                        bus,
                        sessionId,
                        previousCombo,
                        currentCombo: scoringState.combo,
                        pointsAwarded: points,
                        totalScore: scoringState.score,
                        timestampMs: frameTimestampMs,
                    });
                    session.recordBrickBreak({
                        points,
                        event: {
                            row,
                            col,
                            impactVelocity,
                            brickType: brickBreakType,
                            initialHp,
                            comboHeat: scoringState.combo,
                        },
                        momentum: getMomentumMetrics(scoringState),
                    });

                    const speedIntensity = clampUnit((impactVelocity ?? 0) / Math.max(1, currentMaxSpeed));
                    const comboIntensity = clampUnit(
                        scoringState.combo / Math.max(1, config.scoring.multiplierThreshold * 2),
                    );
                    const breakAccentIntensity = Math.min(1, speedIntensity * 0.7 + comboIntensity * 0.6);
                    midiEngine.triggerBrickAccent({
                        combo: scoringState.combo,
                        intensity: breakAccentIntensity,
                        time: scheduledTime,
                        accent: 'break',
                    });
                    scheduleVisualEffect(scheduledTime, () => {
                        if (!brickParticles) {
                            return;
                        }
                        const visualState = brickVisualState.get(brick);
                        if (!visualState) {
                            return;
                        }
                        const burstStrength = Math.max(0.3, Math.min(1, comboIntensity * 0.5 + speedIntensity * 0.7));
                        brickParticles.emit({
                            position: { x: brick.position.x, y: brick.position.y },
                            baseColor: visualState.baseColor,
                            intensity: burstStrength,
                            impactSpeed: impactVelocity,
                        });
                    });

                    scheduleVisualEffect(scheduledTime, () => {
                        if (!heatRippleEffect) {
                            return;
                        }
                        const normalizedX = clampUnit(brick.position.x / PLAYFIELD_WIDTH);
                        const normalizedY = clampUnit(brick.position.y / PLAYFIELD_HEIGHT);
                        const rippleIntensity = Math.min(1, 0.28 + speedIntensity * 0.55 + comboIntensity * 0.45);
                        const contactRadius = typeof ballBody.circleRadius === 'number' && Number.isFinite(ballBody.circleRadius)
                            ? Math.max(2, ballBody.circleRadius)
                            : ball.radius;
                        const normalizedRadius = clampUnit(contactRadius / PLAYFIELD_SIZE_MAX);
                        heatRippleEffect.spawnRipple({
                            position: { x: normalizedX, y: normalizedY },
                            intensity: rippleIntensity,
                            startRadius: Math.max(0.015, normalizedRadius * 1.6),
                            endRadius: Math.min(0.65, normalizedRadius * 1.6 + 0.22 + rippleIntensity * 0.3),
                        });
                    });

                    const spawnChance = Math.min(1, 0.25 * powerUpChanceMultiplier);
                    if (shouldSpawnPowerUp({ spawnChance }, random.random)) {
                        const powerUpType = selectRandomPowerUpType(random.random);
                        levelRuntime.spawnPowerUp(powerUpType, { x: brick.position.x, y: brick.position.y });
                    }

                    const entropyState = session.getEntropyState();
                    const entropyRatio = Math.max(0, Math.min(1, entropyState.charge / 100));
                    const baseCoinChance = 0.18;
                    const comboBonus = Math.min(0.3, scoringState.combo * 0.015);
                    const entropyBonus = Math.min(0.25, entropyRatio * 0.4);
                    const rewardBonus = activeReward?.type === 'double-points' ? 0.05 : 0;
                    const coinChance = Math.min(0.75, baseCoinChance + comboBonus + entropyBonus + rewardBonus);
                    if (random.random() < coinChance) {
                        const valueSeed = Math.round(COIN_BASE_VALUE + scoringState.combo * 0.4 + entropyRatio * 12);
                        const coinValue = Math.max(COIN_MIN_VALUE, Math.min(COIN_MAX_VALUE, valueSeed));
                        spawnCoin({
                            value: coinValue,
                            position: { x: brick.position.x, y: brick.position.y },
                        });
                    }

                    clearGhostEffect(brick);

                    physics.remove(brick);
                    removeBodyVisual(brick);

                    brickHealth.delete(brick);
                    brickMetadata.delete(brick);
                    brickVisualState.delete(brick);

                    if (session.snapshot().brickRemaining === 0) {
                        session.completeRound();
                        handleLevelComplete();
                    }
                }
            }

            if ((bodyA.label === 'ball' && bodyB.label === 'paddle') || (bodyA.label === 'paddle' && bodyB.label === 'ball')) {
                const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;
                const paddleBody = bodyA.label === 'paddle' ? bodyA : bodyB;
                const reflectionData = calculateReflectionData(ballBody.position.x, paddleBody.position.x, {
                    paddleWidth: paddle.width,
                    minSpeed: currentBaseSpeed,
                });
                const impactSpeed = MatterVector.magnitude(ballBody.velocity);

                if (powerUpManager.isActive('sticky-paddle') && ballBody === ball.physicsBody) {
                    releaseForeshadowForBall(ballBody.id, sessionElapsedSeconds);
                    const offsetX = ball.physicsBody.position.x - paddle.physicsBody.position.x;
                    const offsetY = -ball.radius - paddle.height / 2;
                    const attachmentOffset = { x: offsetX, y: offsetY };
                    physics.attachBallToPaddle(ball.physicsBody, paddle.physicsBody, attachmentOffset);
                    ball.isAttached = true;
                    ball.attachmentOffset = attachmentOffset;
                    MatterBody.setVelocity(ball.physicsBody, { x: 0, y: 0 });
                    inputManager.resetLaunchTrigger();
                } else {
                    reflectOffPaddle(ballBody, paddleBody, {
                        paddleWidth: paddle.width,
                        minSpeed: currentBaseSpeed,
                    });
                }

                const scheduledTime = computeScheduledAudioTime();
                scheduleVisualEffect(scheduledTime, () => {
                    ballLight?.flash();
                    paddleLight?.flash(0.3);
                });

                bus.publish('PaddleHit', {
                    sessionId,
                    angle: reflectionData.angle,
                    speed: impactSpeed,
                    impactOffset: reflectionData.impactOffset,
                    scheduledTime,
                }, frameTimestampMs);

                session.recordEntropyEvent({
                    type: 'paddle-hit',
                    speed: impactSpeed,
                    comboHeat: scoringState.combo,
                });
            }

            if ((bodyA.label === 'ball' && bodyB.label.startsWith('wall-')) || (bodyB.label === 'ball' && bodyA.label.startsWith('wall-'))) {
                const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;
                const wallBody = bodyA.label === 'ball' ? bodyB : bodyA;
                const wallToSide: Record<string, 'left' | 'right' | 'top' | 'bottom'> = {
                    'wall-left': 'left',
                    'wall-right': 'right',
                    'wall-top': 'top',
                    'wall-bottom': 'bottom',
                };
                const side = wallToSide[wallBody.label];
                if (side) {
                    const wallSpeed = MatterVector.magnitude(ballBody.velocity);
                    const scheduledTime = computeScheduledAudioTime();
                    bus.publish('WallHit', {
                        sessionId,
                        side,
                        speed: wallSpeed,
                        scheduledTime,
                    }, frameTimestampMs);

                    midiEngine.triggerWallHit({
                        speed: wallSpeed,
                        time: scheduledTime,
                    });

                    session.recordEntropyEvent({
                        type: 'wall-hit',
                        speed: wallSpeed,
                    });
                }
            }

            if ((bodyA.label === 'ball' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'ball')) {
                const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;

                releaseForeshadowForBall(ballBody.id, sessionElapsedSeconds);

                if (multiBallController.isExtraBallBody(ballBody)) {
                    removeExtraBallByBody(ballBody);
                    return;
                }

                if (promoteExtraBallToPrimary(ballBody)) {
                    return;
                }

                const comboBeforeReset = scoringState.combo;
                session.recordLifeLost('ball-drop');
                session.recordEntropyEvent({ type: 'combo-reset', comboHeat: comboBeforeReset });
                resetCombo(scoringState);
                syncMomentum();

                if (session.snapshot().livesRemaining > 0) {
                    clearExtraBalls();
                    reattachBallToPaddle();
                } else {
                    handleGameOver();
                }
            }

            if ((bodyA.label === 'powerup' && bodyB.label === 'paddle') || (bodyA.label === 'paddle' && bodyB.label === 'powerup')) {
                const powerUpBody = bodyA.label === 'powerup' ? bodyA : bodyB;
                const entry = findPowerUp(powerUpBody);
                if (entry) {
                    const scheduledTime = computeScheduledAudioTime();
                    powerUpManager.activate(entry.type, { defaultDuration: POWER_UP_DURATION });
                    removePowerUp(entry);
                    handlePowerUpActivation(entry.type);
                    const sparkle = clampUnit(scoringState.combo / Math.max(1, config.scoring.multiplierThreshold));
                    midiEngine.triggerPowerUp({
                        time: scheduledTime,
                        sparkle,
                    });
                }
            }

            if ((bodyA.label === 'coin' && bodyB.label === 'paddle') || (bodyA.label === 'paddle' && bodyB.label === 'coin')) {
                const coinBody = bodyA.label === 'coin' ? bodyA : bodyB;
                const entry = findCoin(coinBody);
                if (entry) {
                    session.collectCoins(entry.value);
                    session.recordEntropyEvent({
                        type: 'coin-collect',
                        coinValue: entry.value,
                        comboHeat: scoringState.combo,
                    });
                    removeCoin(entry);
                    hudDisplay.pulseCombo(0.4);
                }
            }

            if ((bodyA.label === 'powerup' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'powerup')) {
                const powerUpBody = bodyA.label === 'powerup' ? bodyA : bodyB;
                const entry = findPowerUp(powerUpBody);
                if (entry) {
                    removePowerUp(entry);
                }
            }

            if ((bodyA.label === 'coin' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'coin')) {
                const coinBody = bodyA.label === 'coin' ? bodyA : bodyB;
                const entry = findCoin(coinBody);
                if (entry) {
                    removeCoin(entry);
                }
            }
        });
    });

    const runGameplayUpdate = (deltaSeconds: number): void => {
        const audioTimeSeconds = scheduler.now();
        if (hasPerformanceNow) {
            const wallClockSeconds = performance.now() / 1000;
            audioVisualSkewSeconds = wallClockSeconds - audioTimeSeconds;
            syncDriftMs = audioVisualSkewSeconds * 1000;
        } else {
            audioVisualSkewSeconds = 0;
            syncDriftMs = 0;
        }

        sessionElapsedSeconds += deltaSeconds;
        replayBuffer.markTime(sessionElapsedSeconds);
        frameTimestampMs = sessionNow();

        powerUpManager.update(deltaSeconds);

        const slowTimeActive = slowTimeTimer > 0;
        const timeScale = slowTimeActive ? slowTimeScale : 1;
        const movementDelta = deltaSeconds * timeScale;
        const safeMovementDelta = movementDelta > 0 ? movementDelta : 1 / 240;

        const sessionSnapshot = session.snapshot();
        const bricksRemaining = sessionSnapshot.brickRemaining;
        const bricksTotal = sessionSnapshot.brickTotal;

        if (AUTO_COMPLETE_ENABLED && sessionSnapshot.status === 'active') {
            if (bricksRemaining > 0 && bricksRemaining <= AUTO_COMPLETE_TRIGGER) {
                if (!autoCompleteActive) {
                    beginAutoCompleteCountdown();
                } else {
                    autoCompleteTimer = Math.max(0, autoCompleteTimer - deltaSeconds);
                    syncAutoCompleteCountdownDisplay();
                }

                if (autoCompleteActive && autoCompleteTimer <= 0) {
                    levelAutoCompleted = true;
                    resetAutoCompleteCountdown();
                    gambleManager.clear();
                    forceClearBreakableBricks();
                    clearActivePowerUps();
                    clearActiveCoins();
                    session.completeRound();
                    handleLevelComplete();
                    return;
                }
            } else if (autoCompleteActive) {
                resetAutoCompleteCountdown();
            }
        } else if (autoCompleteActive) {
            resetAutoCompleteCountdown();
        }

        const speedMultiplier = calculateBallSpeedScale(powerUpManager.getEffect('ball-speed'));
        const difficultyScale = levelDifficultyMultiplier;
        const baseTargetSpeed = BALL_BASE_SPEED * speedMultiplier * difficultyScale;
        currentMaxSpeed = BALL_MAX_SPEED * speedMultiplier * difficultyScale;
        currentBaseSpeed = getAdaptiveBaseSpeed(baseTargetSpeed, currentMaxSpeed, scoringState.combo);
        currentLaunchSpeed = BALL_LAUNCH_SPEED * speedMultiplier * difficultyScale;

        audioState$.next({
            combo: scoringState.combo,
            activePowerUps: powerUpManager.getActiveEffects().map((effect) => ({ type: effect.type })),
            lookAheadMs: scheduler.lookAheadMs,
        });

        if (doublePointsTimer > 0) {
            doublePointsTimer = Math.max(0, doublePointsTimer - deltaSeconds);
            if (doublePointsTimer === 0 && activeReward?.type === 'double-points') {
                doublePointsMultiplier = 1;
                activeReward = null;
            }
        }

        if (slowTimeTimer > 0) {
            slowTimeTimer = Math.max(0, slowTimeTimer - deltaSeconds);
            if (slowTimeTimer === 0) {
                slowTimeScale = 1;
                if (activeReward?.type === 'slow-time') {
                    activeReward = null;
                }
            }
        }

        if (multiBallRewardTimer > 0) {
            multiBallRewardTimer = Math.max(0, multiBallRewardTimer - deltaSeconds);
        }

        if (activeReward?.type === 'multi-ball' && multiBallRewardTimer <= 0 && multiBallController.count() === 0) {
            activeReward = null;
        }

        updateGhostBricks(deltaSeconds);
        tickGambleBricks(deltaSeconds);

        if (activeReward?.type === 'ghost-brick' && getGhostBrickRemainingDuration() <= 0) {
            activeReward = null;
        }

        if (activeReward?.type === 'sticky-paddle' && !powerUpManager.isActive('sticky-paddle')) {
            activeReward = null;
        }

        if (widePaddleRewardActive) {
            const widthEffect = powerUpManager.getEffect('paddle-width');
            if (!widthEffect || widthEffect.remainingTime <= 0) {
                widePaddleRewardActive = false;
                rewardPaddleWidthMultiplier = DEFAULT_PADDLE_WIDTH_MULTIPLIER;
                if (activeReward?.type === 'wide-paddle') {
                    activeReward = null;
                }
            }
        }

        const paddleWidthMultiplier = widePaddleRewardActive
            ? rewardPaddleWidthMultiplier
            : DEFAULT_PADDLE_WIDTH_MULTIPLIER;
        const paddleScale = calculatePaddleWidthScale(powerUpManager.getEffect('paddle-width'), {
            paddleWidthMultiplier,
        });
        const basePaddleWidth = 100;
        paddle.width = basePaddleWidth * paddleScale;

        const comboBeforeDecay = scoringState.combo;
        decayCombo(scoringState, deltaSeconds);
        if (comboBeforeDecay > 0 && scoringState.combo === 0) {
            session.recordEntropyEvent({ type: 'combo-reset', comboHeat: comboBeforeDecay });
        }
        syncMomentum();

        const paddleTarget = inputManager.getPaddleTarget();
        const targetSnapshot = paddleTarget ? { x: paddleTarget.x, y: paddleTarget.y } : null;
        if (
            (lastRecordedInputTarget?.x ?? null) !== (targetSnapshot?.x ?? null) ||
            (lastRecordedInputTarget?.y ?? null) !== (targetSnapshot?.y ?? null)
        ) {
            replayBuffer.recordPaddleTarget(sessionElapsedSeconds, targetSnapshot);
            lastRecordedInputTarget = targetSnapshot ? { ...targetSnapshot } : null;
        }

        if (paddleTarget) {
            const pf = stage.toPlayfield(paddleTarget);
            const halfPaddleWidth = paddle.width / 2;
            const desiredX = Math.max(halfPaddleWidth, Math.min(pf.x, PLAYFIELD_WIDTH - halfPaddleWidth));
            const currentX = paddle.physicsBody.position.x;
            const smoothedX = smoothTowards(currentX, desiredX, deltaSeconds, {
                responsiveness: PADDLE_SMOOTH_RESPONSIVENESS,
                snapThreshold: PADDLE_SNAP_THRESHOLD,
            });
            const nextX = Math.max(halfPaddleWidth, Math.min(smoothedX, PLAYFIELD_WIDTH - halfPaddleWidth));
            MatterBody.setPosition(paddle.physicsBody, { x: nextX, y: paddle.physicsBody.position.y });
            paddle.position.x = nextX;
        } else {
            paddle.position.x = paddle.physicsBody.position.x;
        }

        paddle.position.y = paddle.physicsBody.position.y;

        const paddleCenter = paddleController.getPaddleCenter(paddle);
        const paddleDelta = Math.hypot(paddleCenter.x - previousPaddlePosition.x, paddleCenter.y - previousPaddlePosition.y);
        const paddleSpeed = paddleDelta / safeMovementDelta;
        paddleLight?.update({
            position: { x: paddleCenter.x, y: paddleCenter.y },
            speed: paddleSpeed,
            deltaSeconds: movementDelta,
        });
        previousPaddlePosition = { x: paddleCenter.x, y: paddleCenter.y };

        const paddleWidthActive = powerUpManager.isActive('paddle-width');
        const paddlePulseInfluence = clampUnit(paddleGlowPulse);
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
            inputManager.syncPaddlePosition(paddleCenter);
        }

        const launchIntent = inputManager.shouldLaunch() ? inputManager.consumeLaunchIntent() : null;
        if (ball.isAttached && launchIntent) {
            replayBuffer.recordLaunch(sessionElapsedSeconds);
            physics.detachBallFromPaddle(ball.physicsBody);
            launchController.launch(ball, launchIntent.direction, currentLaunchSpeed);
            inputManager.resetLaunchTrigger();
        } else if (launchIntent) {
            inputManager.resetLaunchTrigger();
        }

        const speedBeforeRegulation = MatterVector.magnitude(ball.physicsBody.velocity);

        regulateSpeed(ball.physicsBody, {
            baseSpeed: currentBaseSpeed,
            maxSpeed: currentMaxSpeed,
        });

        const speedAfterRegulation = MatterVector.magnitude(ball.physicsBody.velocity);
        const speedDelta = speedAfterRegulation - speedBeforeRegulation;
        const regulationInfo = Math.abs(speedDelta) > 0.01
            ? {
                direction: speedDelta >= 0 ? ('boost' as const) : ('clamp' as const),
                delta: speedDelta,
            }
            : null;

        const speedRange = Math.max(1, currentMaxSpeed - currentBaseSpeed);
        const normalizedSpeed = speedRange <= 1
            ? clampUnit(speedAfterRegulation / Math.max(1, currentMaxSpeed))
            : clampUnit((speedAfterRegulation - currentBaseSpeed) / speedRange);
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
            baseSpeed: currentBaseSpeed,
            maxSpeed: currentMaxSpeed,
            timeScale,
            slowTimeScale,
            slowTimeRemaining: slowTimeTimer,
            regulation: regulationInfo,
            extraBalls: multiBallController.count(),
            extraBallCapacity: MULTI_BALL_CAPACITY,
            syncDriftMs,
        };

        lastPhysicsDebugState = physicsOverlayState;

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

        ballLight?.update({
            position: { x: ball.physicsBody.position.x, y: ball.physicsBody.position.y },
            speed: MatterVector.magnitude(ball.physicsBody.velocity),
            deltaSeconds: movementDelta,
        });

        ballSpeedRing?.update({
            position: { x: ball.physicsBody.position.x, y: ball.physicsBody.position.y },
            speed: speedAfterRegulation,
            baseSpeed: currentBaseSpeed,
            maxSpeed: currentMaxSpeed,
            deltaSeconds: movementDelta,
        });

        multiBallController.updateSpeedIndicators({
            baseSpeed: currentBaseSpeed,
            maxSpeed: currentMaxSpeed,
            deltaSeconds: movementDelta,
        });

        brickParticles?.update(deltaSeconds);

        const comboActive = scoringState.combo >= 2 && scoringState.comboTimer > 0;
        const comboIntensity = comboActive ? clampUnit(scoringState.combo / 14) : 0;
        const decayWindow = comboDecayWindow > 0 ? comboDecayWindow : BASE_COMBO_DECAY_WINDOW;
        const comboTimerFactor = comboActive ? clampUnit(scoringState.comboTimer / decayWindow) : 0;
        const comboEnergy = Math.min(1.15, comboRingPulse * 0.85 + comboIntensity * 0.6 + comboTimerFactor * 0.45);
        if (comboEnergy > 0) {
            const comboPhaseSpeed = 2.4 + comboIntensity * 3 + comboRingPulse * 2.5;
            comboRingPhase = (comboRingPhase + movementDelta * comboPhaseSpeed) % (Math.PI * 2);
        }

        const shouldDisplayComboRing = comboEnergy > 0.02;
        if (shouldDisplayComboRing) {
            const ringPos = ball.physicsBody.position;
            const baseRadius = ball.radius * (2 + comboIntensity * 0.55);
            const wobble = Math.sin(comboRingPhase * 2) * 0.18;
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

        const ballPulse = Math.min(1, comboEnergy * 0.5 + ballGlowPulse);
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
        comboBloomEffect?.update({
            comboEnergy: bloomEnergy,
            deltaSeconds,
            accentColor: bloomAccentColor,
        });

        if (ballTrailsEffect) {
            ballTrailSources.length = 0;
            multiBallController.visitActiveBalls(({ body, isPrimary }) => {
                const normalizedSpeed = clampUnit(
                    MatterVector.magnitude(body.velocity) / Math.max(1, currentMaxSpeed),
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

        if (heatDistortionEffect) {
            heatDistortionSources.length = 0;
            multiBallController.visitActiveBalls(({ body }) => {
                const normalizedX = clampUnit(body.position.x / PLAYFIELD_WIDTH);
                const normalizedY = clampUnit(body.position.y / PLAYFIELD_HEIGHT);
                const speed = MatterVector.magnitude(body.velocity);
                const normalizedSpeed = clampUnit(speed / Math.max(1, currentMaxSpeed));
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

        heatRippleEffect?.update(deltaSeconds);

        ballGlowPulse = Math.max(0, ballGlowPulse - deltaSeconds * 1.6);
        paddleGlowPulse = Math.max(0, paddleGlowPulse - deltaSeconds * 1.3);
        comboRingPulse = Math.max(0, comboRingPulse - deltaSeconds * 1.05);

        if (overlayVisibility.inputDebug && inputDebugOverlay) {
            inputDebugOverlay.update();
        }
        if (overlayVisibility.physicsDebug && physicsDebugOverlay && lastPhysicsDebugState) {
            physicsDebugOverlay.update(lastPhysicsDebugState);
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

    stage.register('gameplay', (context) =>
        createGameplayScene(context, {
            onUpdate: runGameplayUpdate,
            onSuspend: () => {
                inputManager.resetLaunchTrigger();
            },
            onResume: () => {
                inputManager.resetLaunchTrigger();
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
        pendingReward = null;
        activateReward(reward);
        refreshHud();
        runtimeLogger.info('Developer cheat activated reward', { rewardType });
        renderStageSoon();
    };

    const skipToNextLevelCheat = () => {
        if (stage.getCurrentScene() !== 'gameplay') {
            runtimeLogger.warn('Developer cheat ignored: skip level outside gameplay');
            return;
        }
        runtimeLogger.info('Developer cheat skipping current level', { level: currentLevelIndex + 1 });
        session.completeRound();
        handleLevelComplete();
        renderStageSoon();
    };

    const handleCheatKeyDown = (event: KeyboardEvent): boolean => {
        if (event.code === 'F10' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const nextState = developerCheats.toggleEnabled();
            runtimeLogger.info('Developer cheats toggled', {
                enabled: nextState.enabled,
                forcedReward: nextState.forcedReward,
            });
            return true;
        }

        if (!developerCheats.isEnabled()) {
            return false;
        }

        if (event.code === 'KeyN' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            skipToNextLevelCheat();
            return true;
        }

        if (event.code === 'KeyR' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const direction: 1 | -1 = event.altKey ? -1 : 1;
            const nextState = developerCheats.cycleForcedReward(direction);
            runtimeLogger.info('Developer forced reward updated', { forcedReward: nextState.forcedReward });
            return true;
        }

        if (event.code === 'Digit0' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const nextState = developerCheats.clearForcedReward();
            runtimeLogger.info('Developer forced reward cleared', { forcedReward: nextState.forcedReward });
            return true;
        }

        if (event.code === 'KeyF' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const forcedReward = developerCheats.getState().forcedReward;
            if (forcedReward) {
                applyCheatReward(forcedReward);
            } else {
                runtimeLogger.info('Developer cheat ignored: no forced reward selected');
            }
            return true;
        }

        const powerUpBinding = cheatPowerUpBindings.find((binding) => binding.code === event.code);
        if (powerUpBinding && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            spawnCheatPowerUp(powerUpBinding.type);
            return true;
        }

        return false;
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
        if (handleCheatKeyDown(event)) {
            return;
        }
        if (event.code === 'KeyP' || event.code === 'Escape') {
            if (isPaused) {
                event.preventDefault();
                void resumeFromPause();
            } else if (loop?.isRunning()) {
                event.preventDefault();
                pauseGame();
            }
        } else if (event.code === 'KeyQ' && isPaused) {
            event.preventDefault();
            void quitToMenu();
        } else if (event.code === 'KeyC' && event.shiftKey) {
            event.preventDefault();
            toggleTheme();
        } else if (event.code === 'F2') {
            event.preventDefault();
            overlayVisibility.inputDebug = !overlayVisibility.inputDebug;
            if (inputDebugOverlay) {
                inputDebugOverlay.setVisible(overlayVisibility.inputDebug);
                if (overlayVisibility.inputDebug) {
                    inputDebugOverlay.update();
                }
            }
            renderStageSoon();
        } else if (event.code === 'F3') {
            event.preventDefault();
            overlayVisibility.physicsDebug = !overlayVisibility.physicsDebug;
            if (physicsDebugOverlay) {
                physicsDebugOverlay.setVisible(overlayVisibility.physicsDebug);
                if (overlayVisibility.physicsDebug && lastPhysicsDebugState) {
                    physicsDebugOverlay.update(lastPhysicsDebugState);
                }
            }
            renderStageSoon();
        }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);

    const cleanupVisuals = () => {
        if (pendingVisualTimers.size > 0) {
            for (const timer of pendingVisualTimers) {
                clearTimeout(timer);
            }
            pendingVisualTimers.clear();
        }
        unsubscribeTheme?.();
        unsubscribeTheme = null;
        if (comboBloomEffect) {
            detachPlayfieldFilter(comboBloomEffect.filter);
            comboBloomEffect.destroy();
            comboBloomEffect = null;
        }
        if (ballTrailsEffect) {
            ballTrailsEffect.destroy();
            ballTrailsEffect = null;
        }
        if (heatDistortionEffect) {
            detachPlayfieldFilter(heatDistortionEffect.filter);
            heatDistortionEffect.destroy();
            heatDistortionEffect = null;
        }
        if (heatRippleEffect) {
            detachPlayfieldFilter(heatRippleEffect.filter);
            heatRippleEffect.destroy();
            heatRippleEffect = null;
        }
        if (import.meta.env.DEV && typeof window !== 'undefined') {
            const globalRef = window as typeof window & {
                __LBHeatRipple?: { getActiveRippleCount: () => number };
            };
            if (globalRef.__LBHeatRipple) {
                delete globalRef.__LBHeatRipple;
            }
        }
        ballTrailSources.length = 0;
        heatDistortionSources.length = 0;
        if (ballSpeedRing) {
            ballSpeedRing.container.removeFromParent();
            ballSpeedRing.destroy();
            ballSpeedRing = null;
        }
        ballLight?.destroy();
        paddleLight?.destroy();
        ballLight = null;
        paddleLight = null;
        inputDebugOverlay?.destroy();
        inputDebugOverlay = null;
        physicsDebugOverlay?.destroy();
        physicsDebugOverlay = null;
        overlayVisibility.inputDebug = false;
        overlayVisibility.physicsDebug = false;
        lastPhysicsDebugState = null;
        if (brickParticles) {
            brickParticles.container.removeFromParent();
            brickParticles.destroy();
            brickParticles = null;
        }
        if (roundCountdownDisplay) {
            roundCountdownDisplay.container.removeFromParent();
            roundCountdownDisplay = null;
        }
        comboRing.container.removeFromParent();
        comboRing.dispose();
        playfieldBackground = null;
        musicDirector.setBeatCallback(null);
        musicDirector.setMeasureCallback(null);
        document.removeEventListener('keydown', handleGlobalKeyDown);
    };

    const handleBeforeUnload = () => {
        cleanupVisuals();
        disposeInitializer();
        resetForeshadowing();
        disposeForeshadower();
        midiEngine.dispose();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const dispose = () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        cleanupVisuals();
        disposeInitializer();
        resetForeshadowing();
        disposeForeshadower();
        midiEngine.dispose();
    };

    return {
        getSessionElapsedSeconds: () => sessionElapsedSeconds,
        dispose,
    } satisfies GameRuntimeHandle;
};

export const __internalGameRuntimeTesting = {
    isPromiseLike,
    waitForPromise,
    isAutoplayBlockedError,
    resolveToneTransport,
    ensureToneAudio,
};
