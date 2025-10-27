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
import { createGameLoop } from './loop';
import { createGameSessionManager } from './state';
import { createAchievementManager, type AchievementUnlock } from './achievements';
import { buildHudScoreboard } from 'render/hud';
import { createHudDisplay } from 'render/hud-display';
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
import { regulateSpeed, getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { getMomentumMetrics } from 'util/scoring';
import { calculateBallSpeedScale, type PowerUpType } from 'util/power-ups';
import type { Vector2 } from 'input/contracts';
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
import type { MusicState } from 'audio/music-director';
import { createMidiEngine, type MidiEngine } from 'audio/midi-engine';
import { mulberry32, type RandomManager } from 'util/random';
import type { ReplayBuffer } from './replay-buffer';
import { createGameInitializer } from './game-initializer';
import { createMultiBallController, type MultiBallColors } from './multi-ball-controller';
import { createLevelRuntime, type BrickLayoutBounds } from './level-runtime';
import { createBrickDecorator } from './brick-layout-decorator';
import { getPresetLevelCount, setLevelPresetOffset, MAX_LEVEL_BRICK_HP } from 'util/levels';
import { spinWheel, createReward, type RewardType } from 'game/rewards';
import { createGambleBrickManager } from 'game/gamble-brick-manager';
import { smoothTowards } from 'util/input-helpers';
import { rootLogger } from 'util/log';
import { getHighScores, recordHighScore } from 'util/high-scores';
import type { GameSceneServices } from './scene-services';
import { developerCheats } from './developer-cheats';
import { createRuntimeVisuals, type ForeshadowInstrument } from './runtime/visuals';
import { createRuntimeScoring } from './runtime/scoring';
import { createRoundMachine } from './runtime/round-machine';
import { createRuntimePowerups } from './runtime/powerups';
import type { PhysicsDebugOverlayState } from 'render/debug-overlay';

type RuntimeVisuals = ReturnType<typeof createRuntimeVisuals>;
import {
    ensureToneAudio as ensureToneAudioBase,
    isAutoplayBlockedError,
    resolveToneTransport,
    isPromiseLike,
    waitForPromise,
} from './runtime/audio';
import { createCollisionRuntime } from './runtime/collisions';

interface VisibleOverlayMap {
    inputDebug: boolean;
    physicsDebug: boolean;
}

const runtimeLogger = rootLogger.child('game-runtime');

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
    let visuals: RuntimeVisuals | null = null;

    const flashBallLight = (intensity: number) => {
        const handle = ballLight;
        if (!handle) {
            return;
        }
        handle.flash(intensity);
    };

    const flashPaddleLight = (intensity: number) => {
        const handle = paddleLight;
        if (!handle) {
            return;
        }
        handle.flash(intensity);
    };
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

    let audioWaveBackdrop: RuntimeVisuals['audioWaveBackdrop'] = null;
    let comboBloomEffect: RuntimeVisuals['comboBloomEffect'] = null;
    let ballTrailsEffect: RuntimeVisuals['ballTrailsEffect'] = null;
    let heatDistortionEffect: RuntimeVisuals['heatDistortionEffect'] = null;
    let heatRippleEffect: RuntimeVisuals['heatRippleEffect'] = null;
    let ballLight: RuntimeVisuals['ballLight'] = null;
    let paddleLight: RuntimeVisuals['paddleLight'] = null;
    let brickParticles: RuntimeVisuals['brickParticles'] = null;
    let ballSpeedRing: RuntimeVisuals['ballSpeedRing'] = null;
    let roundCountdownDisplay: RuntimeVisuals['roundCountdownDisplay'] = null;
    let inputDebugOverlay: RuntimeVisuals['inputDebugOverlay'] = null;
    let physicsDebugOverlay: RuntimeVisuals['physicsDebugOverlay'] = null;
    let ballTrailSources!: RuntimeVisuals['ballTrailSources'];
    let heatDistortionSources!: RuntimeVisuals['heatDistortionSources'];
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
                flashBallLight(0.35);
            },
            boostPowerUp: ({ paddle }) => {
                paddleGlowPulse = Math.min(1, paddleGlowPulse + paddle);
                flashPaddleLight(0.5);
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

    let sessionElapsedSeconds = 0;
    let frameTimestampMs = 0;

    const sessionNow = (): number => Math.max(0, Math.floor(sessionElapsedSeconds * 1000));

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
        if (!roundCountdownDisplay) {
            return;
        }
        const { enabled, active, timer, countdown } = roundMachine.getAutoCompleteState();
        if (!enabled || !active) {
            roundCountdownDisplay.hide();
            return;
        }
        roundCountdownDisplay.show(timer, countdown);
    };

    let loop: ReturnType<typeof createGameLoop> | null = null;
    let collisionRuntime: ReturnType<typeof createCollisionRuntime> | null = null;
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
        foreshadowVisualEvents.clear();
        if (audioWaveBackdrop) {
            audioWaveBackdrop.setVisible(false);
        }
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
        brickParticles?.reset();
        heatRippleEffect?.clear();
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
    };

    const handleMusicMeasure = () => {
        applyBackgroundAccent(1);
    };
    musicDirector.setBeatCallback(null);
    musicDirector.setMeasureCallback(handleMusicMeasure);

    const bounds = physics.factory.bounds();
    physics.add(bounds);

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

    visuals = createRuntimeVisuals({
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

    audioWaveBackdrop = visuals.audioWaveBackdrop;
    comboBloomEffect = visuals.comboBloomEffect;
    ballTrailsEffect = visuals.ballTrailsEffect;
    heatDistortionEffect = visuals.heatDistortionEffect;
    heatRippleEffect = visuals.heatRippleEffect;
    brickParticles = visuals.brickParticles;
    roundCountdownDisplay = visuals.roundCountdownDisplay;
    const comboRing = visuals.comboRing;
    const gameContainer = visuals.gameContainer;
    ballSpeedRing = visuals.ballSpeedRing;
    inputDebugOverlay = visuals.inputDebugOverlay;
    physicsDebugOverlay = visuals.physicsDebugOverlay;
    ballLight = visuals.ballLight;
    paddleLight = visuals.paddleLight;
    ballTrailSources = visuals.ballTrailSources;
    heatDistortionSources = visuals.heatDistortionSources;

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
    });

    const paddleGraphics = visualFactory.paddle.create({ width: paddle.width, height: paddle.height });
    paddleGraphics.zIndex = 60;
    gameContainer.addChild(paddleGraphics);
    visualBodies.set(paddle.physicsBody, paddleGraphics);

    inputManager.initialize(container);

    let previousPaddlePosition = { x: paddle.position.x, y: paddle.position.y };
    let lastRecordedInputTarget: Vector2 | null = null;
    let currentBaseSpeed = BALL_BASE_SPEED;
    let currentMaxSpeed = BALL_MAX_SPEED;
    let currentLaunchSpeed = BALL_LAUNCH_SPEED;
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

    const powerups = createRuntimePowerups({
        logger: runtimeLogger,
        multiBallController,
        flashBallLight,
        flashPaddleLight,
        spawnExtraBalls,
        resetGhostBricks,
        applyGhostBrickReward,
        getGhostBrickRemainingDuration,
        defaults: {
            paddleWidthMultiplier: DEFAULT_PADDLE_WIDTH_MULTIPLIER,
            multiBallCapacity: MULTI_BALL_CAPACITY,
            multiBallMaxDuration: MULTI_BALL_MAX_DURATION,
            slowTimeMaxDuration: SLOW_TIME_MAX_DURATION,
        },
    });
    const { manager: powerUpManager } = powerups;

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
        visuals?.replacePaddleLight(themeAccents.powerUp);
        paddleLight = visuals?.paddleLight ?? null;
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

    let lastComboCount = 0;

    const refreshHud = () => {
        const snapshot = session.snapshot();
        const hudView = buildHudScoreboard(snapshot);

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
        });

        if (scoringState.combo > lastComboCount) {
            const pulseStrength = Math.min(1, 0.55 + scoringState.combo * 0.04);
            hudDisplay.pulseCombo(pulseStrength);
        }
        lastComboCount = scoringState.combo;
        positionHud();
    };

    scoring.setHudUpdater(refreshHud);

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

        powerups.reset();
        clearExtraBalls();
        resetForeshadowing();
        loadLevel(levelIndex);
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

    const handleLevelComplete = (): void => {
        clearExtraBalls();
        resetForeshadowing();
        isPaused = false;
        loop?.stop();
        const spunReward = spinWheel(random.random);
        roundMachine.setPendingReward(spunReward);
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
            const nextLevelIndex = roundMachine.incrementLevelIndex();
            startLevel(nextLevelIndex);
            loop?.start();
            renderStageSoon();
        };

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

    collisionRuntime = createCollisionRuntime({
        engine: physics.engine,
        bus,
        midiEngine,
        random,
        context: {
            session,
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
                getSessionElapsedSeconds: () => sessionElapsedSeconds,
                getFrameTimestampMs: () => frameTimestampMs,
                getComboDecayWindow: () => comboDecayWindow,
                getCurrentBaseSpeed: () => currentBaseSpeed,
                getCurrentMaxSpeed: () => currentMaxSpeed,
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
                    heatRippleEffect?.spawnRipple(options);
                },
                emitBrickParticles: (options) => {
                    brickParticles?.emit(options);
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
        },
    });
    collisionRuntime.wire();

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

        powerups.tick(deltaSeconds);

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
        const baseTargetSpeed = BALL_BASE_SPEED * speedMultiplier * difficultyScale;
        currentMaxSpeed = BALL_MAX_SPEED * speedMultiplier * difficultyScale;
        currentBaseSpeed = getAdaptiveBaseSpeed(baseTargetSpeed, currentMaxSpeed, scoringState.combo);
        currentLaunchSpeed = BALL_LAUNCH_SPEED * speedMultiplier * difficultyScale;

        audioState$.next({
            combo: scoringState.combo,
            activePowerUps: powerUpManager.getActiveEffects().map((effect) => ({ type: effect.type })),
            lookAheadMs: scheduler.lookAheadMs,
        });

        updateGhostBricks(deltaSeconds);
        tickGambleBricks(deltaSeconds);
        const paddleScale = powerups.getPaddleWidthScale();
        const basePaddleWidth = 100;
        paddle.width = basePaddleWidth * paddleScale;

        const comboBeforeDecay = scoringState.combo;
        scoring.decayCombo(deltaSeconds);
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
            slowTimeRemaining,
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
        if (audioWaveBackdrop) {
            audioWaveBackdrop.update(deltaSeconds);
        }

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
        visuals?.dispose();
        visuals = null;
        audioWaveBackdrop = null;
        comboBloomEffect = null;
        ballTrailsEffect = null;
        heatDistortionEffect = null;
        heatRippleEffect = null;
        ballLight = null;
        paddleLight = null;
        brickParticles = null;
        ballSpeedRing = null;
        roundCountdownDisplay = null;
        inputDebugOverlay = null;
        physicsDebugOverlay = null;
        ballTrailSources = [] as RuntimeVisuals['ballTrailSources'];
        heatDistortionSources = [] as RuntimeVisuals['heatDistortionSources'];
        overlayVisibility.inputDebug = false;
        overlayVisibility.physicsDebug = false;
        lastPhysicsDebugState = null;
        musicDirector.setBeatCallback(null);
        musicDirector.setMeasureCallback(null);
        document.removeEventListener('keydown', handleGlobalKeyDown);
    };

    const handleBeforeUnload = () => {
        collisionRuntime?.unwire();
        collisionRuntime = null;
        cleanupVisuals();
        disposeInitializer();
        resetForeshadowing();
        disposeForeshadower();
        midiEngine.dispose();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const dispose = () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        collisionRuntime?.unwire();
        collisionRuntime = null;
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
    resolveBallRadius,
    intersectRayWithExpandedAabb,
    deriveLayoutSeed,
    clampMidiNote,
};
