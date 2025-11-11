import { createAudioBootstrap } from './audio-bootstrap';
import type { MidiEngine, MidiPaletteConfig } from 'audio/midi-engine';

import {
    GameTheme,
    onThemeChange,
    toggleTheme,
} from 'render/theme';
import { createVisualEffectsConfig } from './config/visual-effects-config';
import { createEntropyActionConfig } from './config/entropy-actions';
import { volumeToDecibels, toMusicLives } from './utils/audio-utils';
import { sanitizeVoiceOverrides, toBallPaletteOverride } from './utils/loadout-utils';
import { createLevelRuntimeBundle } from './factories/level-runtime-factory';
import { GambleRuntimeManager } from './managers/gamble-runtime-manager';
import { createGameLoop } from '../loop';
import { createGameSessionManager } from 'app/state';
import type { GameSessionManager, PlayerPreferences } from 'app/state';
import { getAudioPreferences, persistAudioPreferences } from 'util/audio-preferences';
import { gameConfig } from 'config/game';
import { regulateSpeed } from 'util/speed-regulation';
import { getMomentumMetrics } from 'util/scoring';
import { type PowerUpType } from 'util/power-ups';
import { computePrestigeDust } from 'util/prestige';
import {
    toColorNumber,
    mixColors,
    type PaddleVisualDefaults,
    type BallVisualPalette,
} from 'render/playfield-visuals';
import { clampUnit } from 'util/math';
import { createVisualFactory } from 'render/visual-factory';
import { Sprite } from 'pixi.js';
import type { Container } from 'pixi.js';
import {
    Body as MatterBody,
    Vector as MatterVector,
} from 'physics/matter';
import type { MatterBody as Body } from 'physics/matter';
import type { MusicBeatEvent, MusicMeasureEvent } from 'audio/music-director';
import { type RandomManager } from 'util/random';
import type { ReplayBuffer } from 'app/replay-buffer';
import { createGameInitializer } from '../game-initializer';
import type { MultiBallColors } from '../multi-ball-controller';
import type { SpawnCoinOptions } from '../level-runtime';
import { createBrickDecorator } from '../brick-layout-decorator';
import { MAX_LEVEL_BRICK_HP } from 'util/levels';
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
import { createEchoTrailManager } from 'game/echo-trails';
import { createPhantomBrickManager } from 'game/phantom-bricks';
import { createVortexFieldManager } from 'physics/field-effects';
import { createRuntimeScoring, type RuntimeScoringHandle } from './scoring';
import { createRoundMachine, type RoundMachine } from './round-machine';
import type { RuntimePowerups } from './powerups';
import type { RuntimeInput } from './input';
import type { RuntimeDebug } from './debug';
import type { RuntimeLifecycle } from './lifecycle';
import { getSettings, subscribeSettings } from 'util/settings';
import { createLaserController } from './laser';
import type { RuntimeModifiers } from './modifiers';
import { createMetaProgressionService } from './meta-progress-service';
import { createVisualThemeDefaults, type VisualThemeSnapshot } from './visual-theme-defaults';
import {
    createSyncDriftTelemetry,
} from './state-store';
import {
    isAutoplayBlockedError,
} from './audio';
import { Destination } from 'tone';
import { createCollisionRuntime, type CollisionRuntime, type CollisionRuntimeDeps } from './collisions';
import type { RuntimeVisuals } from './physics-assembly';
import {
    createForeshadowingRuntime,
} from './foreshadowing';
import { registerRuntimeScenes } from './scene-registration';
import { createModifierPowerupServices } from './modifier-powerup-services';
import { initializeRuntimeLifecycle } from './lifecycle-manager';
import { setupDebugHarnessIntegrations } from './debug-harness-integration';
import { createRuntimePhysics } from './modules/runtime-physics';
import { createRuntimeHudCoordinator, type RuntimeHudCoordinator } from './modules/runtime-hud-coordinator';
import { createRuntimeAudio } from './modules/runtime-audio';
import { createRuntimeRewards, type RuntimeRewardsHandle } from './modules/runtime-rewards';
import { createRuntimePerformance } from './modules/runtime-performance';
import { createRuntimeThemeCoordinator } from './modules/runtime-theme';
import { createRuntimeRoundCoordinator, type RuntimeRoundCoordinatorHandle } from './modules/runtime-round';
import { createRuntimeSessionCoordinator } from './modules/runtime-session';
import { createVisualEffectsManager } from './modules/visual-effects';
import { createChromaticTrailManager } from './modules/chromatic-trail';
import { createCollisionContext } from './modules/collision-context-factory';
import { createRuntimeStateHolder } from './modules/runtime-state-coordinator';
import { createBallLifecycleManager } from './modules/ball-lifecycle';
import { createPaddleManager } from './modules/paddle-manager';
import { createLevelTransitionCoordinator } from './modules/level-transition-coordinator';
import {
    updateTimingAndSync,
    calculateSpeedTargets,
    buildMusicState,
    buildBallTrailSources,
    buildChromaticSources,
    buildHeatDistortionSources,
} from './modules/gameplay-pipeline';

import {
    createInputToPhysicsBridge,
    createRewardsWorldBridge,
    createScoringViewProvider,
} from './modules/runtime-bridges';
import type { InputToPhysicsBridge, RewardsWorldBridge, ScoringViewProvider } from './contracts';
import {
    computeLoadoutEffects,
    normalizeLoadoutSelection,
    type LoadoutEffectsBundle,
} from './loadouts';
import {
    defaultLoadoutSelection,
    type LoadoutSelection,
    type LoadoutVoiceId,
    type LoadoutVoicePaletteOverrides,
} from 'config/loadouts';
import { hudSetters, type HudPhysicsSnapshot } from '../../ui/state/game-bridge';
import { createNarrativeService, type NarrativeService } from '../narrative-service';
import { normalizeBallShape } from './ball-shape';
import { RuntimeConfigResolver } from './config-resolver';
import { CHEAT_POWERUP_BINDINGS } from './developer-cheats';

const runtimeLogger = rootLogger.child('game-runtime');

const runtimeVoiceState: {
    voiceId: LoadoutVoiceId;
    overrides: Partial<MidiPaletteConfig> | undefined;
} = {
    voiceId: defaultLoadoutSelection.voice,
    overrides: undefined,
};

type MutableCollisionDeps = CollisionRuntimeDeps & { midiEngine: MidiEngine };

const setRuntimeVoiceState = (
    voiceId: LoadoutVoiceId,
    overrides: LoadoutVoicePaletteOverrides | undefined,
): void => {
    runtimeVoiceState.voiceId = voiceId;
    runtimeVoiceState.overrides = sanitizeVoiceOverrides(overrides);
};

setRuntimeVoiceState(defaultLoadoutSelection.voice, undefined);

// Initialize configuration resolver to centralize all config access
const configResolver = new RuntimeConfigResolver(gameConfig);

// Visual effect constants (extracted to visual-effects-config.ts module)
const visualEffectsConfig = createVisualEffectsConfig(configResolver);

// Entropy action configuration (extracted to entropy-actions.ts module)
const entropyActionConfig = createEntropyActionConfig(configResolver);
const ENTROPY_ACTION_COSTS = entropyActionConfig.costs;
const ENTROPY_ACTION_BINDINGS = entropyActionConfig.bindings;
const ENTROPY_ACTION_SEQUENCE = entropyActionConfig.sequence;

const metaProgression = createMetaProgressionService({
    baseComboDecayWindow: configResolver.baseComboDecayWindow,
    baseLives: configResolver.baseLives,
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
    return Number.isFinite(window) && window > 0 ? window : configResolver.baseComboDecayWindow;
};

refreshMetaLoadout();

const audioBootstrap = createAudioBootstrap({
    logger: runtimeLogger,
    getPaletteConfig: () => getMetaLoadout().audioPalette.config,
    getPaletteOverrides: () => runtimeVoiceState.overrides,
    getVoiceId: () => runtimeVoiceState.voiceId,
});

export interface GameRuntimeOptions {
    readonly container: HTMLElement;
    readonly playfieldDimensions?: { readonly width: number; readonly height: number };
    readonly layoutOrientation?: 'portrait' | 'landscape';
    readonly random: RandomManager;
    readonly replayBuffer: ReplayBuffer;
    readonly onAudioBlocked?: (error: unknown) => void;
    readonly isMobile?: boolean;
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
    playfieldDimensions = configResolver.playfieldDefault,
    layoutOrientation,
    random,
    replayBuffer,
    onAudioBlocked,
    isMobile = false,
}: GameRuntimeOptions): Promise<RuntimeFacade> => {
    await audioBootstrap.ensureToneAudio().catch((error: unknown) => {
        if (isAutoplayBlockedError(error)) {
            onAudioBlocked?.(error);
            return;
        }
        throw error;
    });

    const runtimeContainer = (() => {
        if (container.id === 'stage-wrap') {
            return container;
        }
        const descendant = container.querySelector<HTMLElement>('#stage-wrap');
        if (descendant) {
            return descendant;
        }
        const doc = container.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
        if (doc) {
            const fromDocument = doc.getElementById('stage-wrap');
            if (fromDocument instanceof HTMLElement) {
                return fromDocument;
            }
        }
        return container;
    })();

    const PLAYFIELD_WIDTH = playfieldDimensions.width;
    const PLAYFIELD_HEIGHT = playfieldDimensions.height;
    const PLAYFIELD_SIZE_MAX = Math.max(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    const sessionOrientation = layoutOrientation ?? (PLAYFIELD_WIDTH >= PLAYFIELD_HEIGHT ? 'landscape' : 'portrait');
    const layoutDecorator = createBrickDecorator(sessionOrientation);

    const themeDefaults = createVisualThemeDefaults({
        initialTheme: GameTheme,
        getMetaLoadout,
    });

    const initialThemeSnapshot = themeDefaults.getSnapshot();
    let rowColors: readonly number[] = initialThemeSnapshot.rowColors;
    let themeBallColors: MultiBallColors = initialThemeSnapshot.ballColors;
    let themeAccents: { combo: number; powerUp: number } = {
        combo: initialThemeSnapshot.accents.combo,
        powerUp: initialThemeSnapshot.accents.powerUp,
    };
    let backgroundAccentColor = initialThemeSnapshot.backgroundAccentColor;
    let bloomAccentColor = initialThemeSnapshot.bloomAccentColor;
    let paddleVisualDefaults: PaddleVisualDefaults = initialThemeSnapshot.paddleDefaults;

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

    const gambleTintArmed = toColorNumber(configResolver.gambleTintArmed);
    const gambleTintPrimed = toColorNumber(configResolver.gambleTintPrimed);

    const visualFactory = createVisualFactory({
        ball: initialThemeSnapshot.ballDefaults,
        paddle: paddleVisualDefaults,
    });

    let runtimeThemeHandle: ReturnType<typeof createRuntimeThemeCoordinator> | null = null;
    let pendingBallPaletteOverride: Partial<BallVisualPalette> | null = null;

    const setLoadoutBallPalette = (override: Partial<BallVisualPalette> | null): void => {
        pendingBallPaletteOverride = override;
        runtimeThemeHandle?.setBallPaletteOverride(override);
    };

    let runtimeDebug: RuntimeDebug | null = null;

    const flashBallLight = (intensity: number) => {
        visuals?.ballLight?.flash(intensity);
    };

    const flashPaddleLight = (intensity: number) => {
        visuals?.paddleLight?.flash(intensity);
    };

    let unsubscribeThemeChange: (() => void) | null = null;
    let unsubscribeThemeSnapshot: (() => void) | null = null;

    const {
        stage,
        bus,
        scheduler,
        audioState$,
        musicDirector,
        renderStageSoon,
        dispose: disposeInitializer,
    } = await createGameInitializer({
        container: runtimeContainer,
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

    const narrativeService: NarrativeService = createNarrativeService({
        bus,
        random,
        logger: runtimeLogger,
        now: Date.now,
        isMobile,
    });

    const hasPerformanceNow = typeof performance !== 'undefined' && typeof performance.now === 'function';
    const syncDriftTelemetry = createSyncDriftTelemetry({
        logger: performanceLogger,
        hasPerformanceNow,
    });
    const runtimePhysics = createRuntimePhysics({
        container: runtimeContainer,
        stage,
        playfieldDimensions,
        random,
        visualFactory,
        themeBallColors,
        themeAccents,
        runtimeDefaults: {
            baseBallSpeed: configResolver.baseSpeed,
            maxBallSpeed: configResolver.maxSpeed,
            launchBallSpeed: configResolver.launchSpeed,
            gravity: configResolver.modifierGravityRange.default,
            ballRestitution: configResolver.baseBallRestitution,
            paddleBaseWidth: configResolver.paddleBaseWidth,
            paddleWidthMultiplier: configResolver.modifierPaddleWidthRange.default,
            speedGovernorMultiplier: configResolver.modifierSpeedGovernorRange.default,
        },
        paddle: {
            width: configResolver.paddleBaseWidth,
            height: configResolver.paddleBaseHeight,
            speed: configResolver.paddleBaseSpeed,
            spawnOffsetFromBottom: configResolver.paddleSpawnOffsetFromBottom,
        },
        paddleSmoothing: {
            responsiveness: configResolver.paddleSmoothResponsiveness,
            snapThreshold: configResolver.paddleSnapThreshold,
        },
        ball: { radius: configResolver.ballRadius },
        multiBall: {
            multiplier: configResolver.multiBallSpawnMultiplier,
            maxExtraBalls: configResolver.multiBallMaxCapacity,
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

    const chromaticTrailManager = createChromaticTrailManager(
        visualEffectsConfig.chromaticTrail,
    );

    const visualEffectsManager = createVisualEffectsManager({
        visuals: createdVisuals,
        ballBody: ball.physicsBody,
        ballRadius: ball.radius,
        ballHueFilter,
        ballGlowFilter,
        multiBallController,
        themeBallColors,
        themeAccents,
        backgroundAccentColor,
        bloomAccentColor,
        playfieldWidth: PLAYFIELD_WIDTH,
        playfieldHeight: PLAYFIELD_HEIGHT,
        getCurrentBaseSpeed: () => runtimeState.currentBaseSpeed,
        getCurrentMaxSpeed: () => runtimeState.currentMaxSpeed,
    });

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

    const applyAudioPreferences = (preferences: PlayerPreferences) => {
        const volume = clampUnit(preferences.masterVolume);
        const shouldMute = preferences.muted || volume <= 1e-3;

        try {
            if (Destination) {
                Destination.mute = shouldMute;
                Destination.volume.value = shouldMute ? -60 : volumeToDecibels(volume);
            }
        } catch (error) {
            runtimeLogger.warn('Failed to apply audio preferences', { error });
        }

        if (shouldMute) {
            runtimeAudio.disableMusic();
        } else {
            runtimeAudio.enableMusic();
        }
    };

    const handleFrameMetrics = runtimePerformance.handleFrameMetrics;

    const sessionNow = (): number => Math.max(0, Math.floor(runtimeState.sessionElapsedSeconds * 1000));

    const createSession = () => {
        const savedAudioPreferences = getAudioPreferences();
        return createGameSessionManager({
            sessionId: 'game-session',
            initialLives: resolveInitialLives(),
            eventBus: bus,
            random: random.random,
            now: sessionNow,
            preferences: {
                masterVolume: savedAudioPreferences.masterVolume,
                muted: savedAudioPreferences.muted,
            },
        });
    };

    const inputToPhysics: InputToPhysicsBridge = createInputToPhysicsBridge(runtimeInput);

    let session = createSession();
    const initialPreferences = session.snapshot().preferences;
    applyAudioPreferences(initialPreferences);
    hudSetters.applySettings({
        muted: initialPreferences.muted,
        masterVolume: initialPreferences.masterVolume,
        reducedMotion: initialPreferences.reducedMotion,
    });
    let activeLoadoutBundle: LoadoutEffectsBundle = computeLoadoutEffects(normalizeLoadoutSelection(undefined));
    let loadoutPhysicsMultipliers = {
        baseSpeed: activeLoadoutBundle.combined.runtime.physics.baseSpeedMultiplier,
        maxSpeed: activeLoadoutBundle.combined.runtime.physics.maxSpeedMultiplier,
        launchSpeed: activeLoadoutBundle.combined.runtime.physics.launchSpeedMultiplier,
    } satisfies {
        baseSpeed: number;
        maxSpeed: number;
        launchSpeed: number;
    };
    const getSession = () => session;
    const replaceSession = (nextSession: GameSessionManager) => {
        session = nextSession;
        const preferences = session.snapshot().preferences;
        applyAudioPreferences(preferences);
        hudSetters.applySettings({
            muted: preferences.muted,
            masterVolume: preferences.masterVolume,
            reducedMotion: preferences.reducedMotion,
        });
    };
    const getActiveLoadoutSelection = (): LoadoutSelection => activeLoadoutBundle.selection;
    const sessionFacade: Pick<GameSessionManager, 'snapshot' | 'recordLifeLost' | 'recordEntropyEvent' | 'completeRound'> = {
        snapshot: () => session.snapshot(),
        recordLifeLost: (cause) => session.recordLifeLost(cause),
        recordEntropyEvent: (event) => session.recordEntropyEvent(event),
        completeRound: () => session.completeRound(),
    };
    const scoring = createRuntimeScoring({
        bus,
        scoringConfig: gameConfig.scoring,
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
        autoCompleteEnabled: configResolver.autoCompleteEnabled,
        autoCompleteCountdown: configResolver.autoCompleteCountdown,
        autoCompleteTrigger: configResolver.autoCompleteTrigger,
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

    // Phase 3: Consolidated lifecycle state
    const lifecycleState = createRuntimeStateHolder();

    const startGameLoop = () => {
        lifecycleState.loop?.start();
        lifecycleState.startHudMetricsBridge();
    };
    const stopGameLoop = () => {
        lifecycleState.loop?.stop();
        lifecycleState.stopHudMetricsBridge();
    };
    const stopLoopIfRunning = () => {
        if (lifecycleState.loop?.isRunning()) {
            lifecycleState.loop.stop();
            lifecycleState.stopHudMetricsBridge();
        }
    };

    const setPaused = (paused: boolean) => {
        lifecycleState.isPaused = paused;
    };
    const getIsPaused = () => lifecycleState.isPaused;

    const rebuildMidiEngine = () => {
        const engine = runtimeAudio.rebuildMidiEngine();
        if (lifecycleState.collisionDeps) {
            (lifecycleState.collisionDeps as MutableCollisionDeps).midiEngine = engine;
        }
    };

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
        narrative: narrativeService,
    };

    const provideSceneServices = (): GameSceneServices => sharedSceneServices;

    const removeBodyVisual = (body: Body): void => {
        const visual = visualBodies.get(body);
        if (!visual) {
            return;
        }
        getGambleRuntime()?.handleBrickRemoved(body, visual);

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

    const { levelRuntime, brickHealth, brickMetadata, brickVisualState } = createLevelRuntimeBundle({
        physics,
        stage,
        visualBodies,
        removeBodyVisual,
        playfieldWidth: PLAYFIELD_WIDTH,
        configResolver,
        rowColors,
        sessionOrientation,
        random,
        layoutDecorator,
    });

    const foreshadowing = createForeshadowingRuntime({
        randomSeed: random.seed(),
        runtimeState,
        multiBallController,
        levelRuntime,
        config: visualEffectsConfig.foreshadow,
    });

    const gambleRuntimeManager = new GambleRuntimeManager({
        configResolver,
        gambleTintArmed,
        gambleTintPrimed,
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

    // Convenience accessors for gamble runtime
    const getGambleRuntime = () => gambleRuntimeManager;
    const gambleManager = gambleRuntimeManager.manager;

    const echoTrailManager = createEchoTrailManager({
        durationSeconds: 4,
        phaseChance: 0,
    });

    const phantomBrickManager = createPhantomBrickManager({
        entropyReward: 5,
    });

    const vortexFieldManager = createVortexFieldManager({
        pullStrength: 0,
        radiusPixels: 120,
        durationSeconds: 6,
        chainBonus: 0,
    });

    const applyGambleAppearance = (body: Body): void => {
        getGambleRuntime()?.applyAppearance(body);
    };

    const reapplyGambleAppearances = (): void => {
        getGambleRuntime()?.reapplyAppearances();
    };

    const registerGambleBricks = (): void => {
        getGambleRuntime()?.registerBricks();
    };

    // Wrap levelRuntime methods to preserve `this` binding
    const updateBrickLighting = (position: { x: number; y: number }) => levelRuntime.updateBrickLighting(position);
    const spawnCoin = (options: SpawnCoinOptions) => levelRuntime.spawnCoin(options);
    const clearGhostEffect = (brick: Body) => levelRuntime.clearGhostEffect(brick);
    const resetGhostBricks = () => levelRuntime.resetGhostBricks();
    const applyGhostBrickReward = (duration: number, count: number) => levelRuntime.applyGhostBrickReward(duration, count);
    const updateGhostBricks = (dt: number) => levelRuntime.updateGhostBricks(dt);
    const getGhostBrickRemainingDuration = () => levelRuntime.getGhostBrickRemainingDuration();
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

    const internalLoadLevel = async (levelIndex: number) => {
        getGambleRuntime()?.prepareLevel();
        const result = await levelRuntime.loadLevel(levelIndex);
        roundMachine.setPowerUpChanceMultiplier(result.powerUpChanceMultiplier);
        roundMachine.setLevelDifficultyMultiplier(result.difficultyMultiplier);
        session.startRound({
            breakableBricks: result.breakableBricks,
            roundNumber: levelIndex + 1,
        });
        visuals?.brickParticles?.reset();
        visuals?.heatRippleEffect?.clear();
        registerGambleBricks();
    };

    const handleMusicBeat = (event: MusicBeatEvent) => {
        const strength = event.isDownbeat ? 0.85 : 0.45;
        visuals?.playfieldBackground?.applyBeatPulse(strength);
    };

    const bounds = physics.factory.bounds();
    physics.add(bounds);

    const { manager: inputManager } = runtimeInput;
    visuals = createdVisuals;
    runtimePerformance.updateVisuals(createdVisuals);
    if (createdVisuals) {
        createdVisuals.playfieldBackground?.setTint(backgroundAccentColor, { immediate: true, accentMix: 0.2 });
    }

    const inputDebugOverlay = createdVisuals?.inputDebugOverlay ?? null;
    const physicsDebugOverlay = createdVisuals?.physicsDebugOverlay ?? null;

    if (runtimeDebug) {
        (runtimeDebug as RuntimeDebug).updateOverlays({ input: inputDebugOverlay, physics: physicsDebugOverlay });
    }

    syncAutoCompleteCountdownDisplay();

    const paddleManager = createPaddleManager({ paddle });
    const { setPaddleWidth } = paddleManager;

    runtimeState.previousPaddlePosition = { x: paddle.position.x, y: paddle.position.y };
    runtimeState.lastRecordedInputTarget = null;
    runtimeState.currentBaseSpeed = configResolver.baseSpeed * loadoutPhysicsMultipliers.baseSpeed;
    runtimeState.currentMaxSpeed = configResolver.maxSpeed * loadoutPhysicsMultipliers.maxSpeed;
    runtimeState.currentLaunchSpeed = configResolver.launchSpeed * loadoutPhysicsMultipliers.launchSpeed;

    const ballLifecycle = createBallLifecycleManager({
        ball,
        paddle,
        ballGraphics,
        physics,
        foreshadowing,
        ballController,
        paddleController,
        multiBallController,
        inputToPhysics,
        visualBodies,
        runtimeState,
        visuals,
    });

    const {
        reattachBallToPaddle,
        promoteExtraBallToPrimary,
        removeExtraBallByBody,
        clearExtraBalls,
        resetForeshadowing,
        spawnExtraBalls,
        applyBallRestitution,
        applyBallShape,
    } = ballLifecycle;

    const {
        powerups,
        powerUpManager,
        runtimeModifiers,
        bindLaserController,
    } = createModifierPowerupServices({
        logger: runtimeLogger,
        modifierConfig: gameConfig.modifiers,
        runtimeState,
        basePaddleWidth: configResolver.paddleBaseWidth,
        defaults: {
            paddleWidthMultiplier: configResolver.paddleExpandedWidthMultiplier,
            multiBallCapacity: configResolver.multiBallMaxCapacity,
            multiBallMaxDuration: configResolver.multiBallMaxDuration,
            slowTimeMaxDuration: configResolver.slowTimeMaxDuration,
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

    let runtimeHudCoordinator: RuntimeHudCoordinator | null = null;
    let roundCoordinator: RuntimeRoundCoordinatorHandle | null = null;

    const toSafeNumber = (value: number | undefined): number =>
        typeof value === 'number' && Number.isFinite(value) ? value : 0;

    const resolveHudPhysicsState = (): HudPhysicsSnapshot => {
        const overlay = runtimeState.lastPhysicsDebugState;
        const baseSpeed = toSafeNumber(runtimeState.currentBaseSpeed);
        const maxSpeed = toSafeNumber(runtimeState.currentMaxSpeed);
        const gravity = toSafeNumber(runtimeState.gravity);
        const overlaySpeed = overlay && typeof overlay.currentSpeed === 'number' && Number.isFinite(overlay.currentSpeed)
            ? overlay.currentSpeed
            : undefined;
        const currentSpeed = toSafeNumber(overlaySpeed ?? runtimeState.currentBaseSpeed);

        return {
            currentSpeed,
            baseSpeed,
            maxSpeed,
            gravity,
        };
    };

    const refreshHud = () => {
        runtimeHudCoordinator?.refresh();
    };

    // Reactive HUD updates - refresh happens in runGameplayUpdate, not via polling
    lifecycleState.startHudMetricsBridge = () => {
        hudSetters.setVisibility(true);
        refreshHud(); // Initial refresh on start
    };

    lifecycleState.stopHudMetricsBridge = () => {
        hudSetters.setVisibility(false);
    };

    const applyLoadoutBundle = (bundle: LoadoutEffectsBundle): void => {
        activeLoadoutBundle = bundle;
        setRuntimeVoiceState(bundle.selection.voice, bundle.combined.runtime.audio.paletteOverrides);
        loadoutPhysicsMultipliers = {
            baseSpeed: bundle.combined.runtime.physics.baseSpeedMultiplier,
            maxSpeed: bundle.combined.runtime.physics.maxSpeedMultiplier,
            launchSpeed: bundle.combined.runtime.physics.launchSpeedMultiplier,
        } satisfies {
            baseSpeed: number;
            maxSpeed: number;
            launchSpeed: number;
        };

        const sessionManager = getSession();
        sessionManager.setLoadout(bundle.selection, bundle.combined.session);

        const physicsEffects = bundle.combined.runtime.physics;
        const ruleEffects = bundle.combined.runtime.rules;
        const ballVisualOverride = toBallPaletteOverride(bundle.combined.visuals.ball);
        setLoadoutBallPalette(ballVisualOverride);
        applyBallShape(normalizeBallShape(bundle.combined.visuals.ball?.shape));

        powerups.setBaselineDoublePointsMultiplier(ruleEffects.doublePointsMultiplier);
        levelRuntime.setHazardIntensityMultiplier(ruleEffects.hazardIntensityMultiplier);

        const gravityTarget = configResolver.modifierGravityRange.default + physicsEffects.gravityOffset;
        runtimeModifiers.setGravity(gravityTarget);
        runtimeModifiers.setRestitution(configResolver.baseBallRestitution * physicsEffects.restitutionMultiplier);
        runtimeModifiers.setPaddleWidthMultiplier(physicsEffects.paddleWidthMultiplier);
        runtimeModifiers.setSpeedGovernorMultiplier(physicsEffects.speedGovernorMultiplier);

        roundMachine.setLevelDifficultyMultiplier(ruleEffects.difficultyMultiplier);
        roundMachine.setPowerUpChanceMultiplier(ruleEffects.powerUpChanceMultiplier);
        roundMachine.setRoundRules({
            coinsAlwaysDrop: ruleEffects.coinsAlwaysDrop,
            gambleBricksMoreLikely: ruleEffects.gambleBricksMoreLikely,
        });

        echoTrailManager.clear();
        phantomBrickManager.clear();
        vortexFieldManager.clear();

        runtimeState.currentBaseSpeed = configResolver.baseSpeed * loadoutPhysicsMultipliers.baseSpeed;
        runtimeState.currentMaxSpeed = configResolver.maxSpeed * loadoutPhysicsMultipliers.maxSpeed;
        runtimeState.currentLaunchSpeed = configResolver.launchSpeed * loadoutPhysicsMultipliers.launchSpeed;

        rebuildMidiEngine();
        refreshHud();
        renderStageSoon();
    };

    applyLoadoutBundle(activeLoadoutBundle);

    const hudContainer = {} as Pick<Container, 'visible'>;
    let hudVisible = false;
    Object.defineProperty(hudContainer, 'visible', {
        get: () => hudVisible,
        set: (next: boolean) => {
            if (hudVisible === next) {
                return;
            }
            hudVisible = next;
            hudSetters.setVisibility(next);
            if (!next) {
                hudSetters.reset();
            }
        },
        enumerable: true,
        configurable: true,
    });

    const runtimeTheme = createRuntimeThemeCoordinator({
        defaults: themeDefaults,
        initialTheme: GameTheme,
        levelRuntime: {
            setRowColors: (colors: readonly number[]) => {
                levelRuntime.setRowColors(colors);
            },
        },
        reapplyGambleAppearances: () => {
            reapplyGambleAppearances();
        },
        visualFactory,
        ball,
        paddle,
        ballGraphics,
        paddleGraphics,
        ballGlowFilter,
        multiBallController,
        stage,
        visualsProvider: () => visuals,
        renderStageSoon,
    });

    runtimeThemeHandle = runtimeTheme;
    runtimeTheme.setBallPaletteOverride(pendingBallPaletteOverride);

    unsubscribeThemeSnapshot = runtimeTheme.subscribe((snapshot: VisualThemeSnapshot) => {
        rowColors = snapshot.rowColors;
        themeBallColors = snapshot.ballColors;
        themeAccents = {
            combo: snapshot.accents.combo,
            powerUp: snapshot.accents.powerUp,
        };
        backgroundAccentColor = snapshot.backgroundAccentColor;
        bloomAccentColor = snapshot.bloomAccentColor;
        paddleVisualDefaults = snapshot.paddleDefaults;
    });

    unsubscribeThemeChange = onThemeChange((theme, name) => {
        runtimeLogger.info('Applied theme change', { theme: name });
        runtimeTheme.applyTheme(theme);
    });

    const handleMusicMeasure = (_event: MusicMeasureEvent) => {
        void _event;
        runtimeTheme.cycleBackgroundAccent(1);
    };
    runtimeAudio.setBeatCallback(handleMusicBeat);
    runtimeAudio.setMeasureCallback(handleMusicMeasure);

    const scoringViewProvider: ScoringViewProvider = createScoringViewProvider(scoringState);

    const rewardsWorldBridge: RewardsWorldBridge = createRewardsWorldBridge({
        renderStageSoon: () => {
            renderStageSoon();
        },
        requestHudRefresh: () => {
            refreshHud();
        },
        pulseHudCombo: (intensity: number) => {
            hudSetters.pulseCombo(intensity);
        },
        flashPaddleLight: (intensity: number) => {
            flashPaddleLight(intensity);
        },
        clearExtraBalls: () => {
            clearExtraBalls();
        },
        reattachBallToPaddle: () => {
            reattachBallToPaddle();
        },
        resetAutoCompleteCountdown: () => {
            resetAutoCompleteCountdown();
        },
    });

    const runtimeRewards = createRuntimeRewards({
        random,
        roundMachine,
        sessionNow,
        getSessionSnapshot: () => session.snapshot(),
        spendStoredEntropy: (options: Parameters<GameSessionManager['spendStoredEntropy']>[0]) =>
            session.spendStoredEntropy(options),
        spendCoins: (amount: Parameters<GameSessionManager['spendCoins']>[0]) => session.spendCoins(amount),
        eventBus: bus,
        wheelSegments: configResolver.rewardWheelSegments,
        entropyCosts: ENTROPY_ACTION_COSTS,
        entropyBindings: ENTROPY_ACTION_BINDINGS,
        entropyOrder: ENTROPY_ACTION_SEQUENCE,
        lockCoinCost: configResolver.rewardLockCoinCost,
        spinReward: (rng) => spinWheel(rng),
        setRewardOverride,
        createReward,
        worldBridge: rewardsWorldBridge,
    });

    hudSetters.setEntropyActionHandler((action) => {
        runtimeRewards.attemptEntropyAction(action);
    });

    hudSetters.setSettingsUpdater((changes) => {
        const updates: { masterVolume?: number; muted?: boolean } = {};
        if (changes.masterVolume !== undefined) {
            updates.masterVolume = changes.masterVolume;
        }
        if (changes.muted !== undefined) {
            updates.muted = changes.muted;
        }

        if (updates.masterVolume === undefined && updates.muted === undefined) {
            return;
        }

        const nextPreferences = session.updatePreferences(updates);

        // Persist audio preferences to localStorage
        persistAudioPreferences({
            masterVolume: nextPreferences.masterVolume,
            muted: nextPreferences.muted,
        });

        hudSetters.applySettings({
            muted: nextPreferences.muted,
            masterVolume: nextPreferences.masterVolume,
            reducedMotion: nextPreferences.reducedMotion,
        });
        applyAudioPreferences(nextPreferences);
        refreshHud();
    });

    runtimeHudCoordinator = createRuntimeHudCoordinator({
        scoring: scoringViewProvider,
        roundMachine,
        runtimeRewards,
        powerups,
        getSessionSnapshot: () => session.snapshot(),
        getGambleStatus: () => gambleManager.snapshot(),
        getPhysicsState: resolveHudPhysicsState,
    });

    const runtimeSession = createRuntimeSessionCoordinator({
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
        transitionToGameplay: () => stage.transitionTo('gameplay'),
        resetAutoCompleteCountdown,
        scoring,
        scoringState,
        syncMomentum,
        setIsPaused: setPaused,
        containers: {
            game: gameContainer,
            hud: hudContainer,
        },
        clearExtraBalls,
        loadLevel: (levelIndex) => {
            void internalLoadLevel(levelIndex);
        },
        getBiasCoordinator: () => roundCoordinator?.getBiasCoordinator() ?? null,
        reattachBallToPaddle,
        refreshHud,
        startLoop: startGameLoop,
        stopLoopIfRunning,
        onLoadoutApplied: (bundle) => {
            applyLoadoutBundle(bundle);
        },
    });

    const { beginNewSession, startLevel } = runtimeSession;

    refreshHud();

    const { rewardWheel } = runtimeRewards;

    roundCoordinator = createRuntimeRoundCoordinator({
        logger: runtimeLogger,
        random,
        roundMachine,
        runtimeModifiers,
        modifierConfig: gameConfig.modifiers,
        stage,
        startLoop: startGameLoop,
        stopLoop: stopGameLoop,
        startLevel,
        renderStageSoon,
        replayBuffer,
        runtimeState,
        getSessionSnapshot: () => session.snapshot(),
        spendStoredEntropy: (options) => session.spendStoredEntropy(options),
        achievements,
        refreshAchievementUpgrades,
        scoringState,
        sessionNow,
        rewardWheel,
        resetAutoCompleteCountdown,
        clearExtraBalls,
        resetForeshadowing,
        setPaused,
        spinReward: (rng) => spinWheel(rng),
        entropyCosts: {
            reroll: configResolver.entropyRerollCost,
        },
        metaUpgrades,
        powerupsReset: () => {
            powerups.reset();
        },
        disableMusic: () => {
            runtimeAudio.disableMusic();
        },
        bus,
        computePrestigeDust: (input) => computePrestigeDust(input, configResolver.prestigeConfig),
        recordHighScore,
        hudContainer,
    });

    const applyMetaSnapshot = (snapshotReason: 'loadout-changed' | 'dust-updated', details?: unknown) => {
        refreshMetaLoadout();
        runtimeTheme.applyTheme(GameTheme);
        rebuildMidiEngine();
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

    const levelTransitions = createLevelTransitionCoordinator({
        roundCoordinator,
        logger: runtimeLogger,
    });
    const { handleLevelComplete, handleGameOver } = levelTransitions;

    // Build collision context using factory (extracted to reduce facade complexity)
    const collisionContext = createCollisionContext({
        session,
        scoring,
        gambleManager,
        echoTrailManager,
        phantomBrickManager,
        vortexFieldManager,
        levelRuntime,
        brickHealth,
        brickMetadata,
        brickVisualState,
        powerUpManager,
        multiBallController,
        ball,
        paddle,
        physics,
        inputManager,
        roundMachine,
        configResolver,
        gameConfig,
        powerups,
        achievements,
        foreshadowing,
        visuals,
        hudSetters,
        PLAYFIELD_WIDTH,
        PLAYFIELD_HEIGHT,
        PLAYFIELD_SIZE_MAX,
        MAX_LEVEL_BRICK_HP,
        themeBallColors,
        getRuntimeState: () => runtimeState,
        getActiveLoadoutBundle: () => activeLoadoutBundle,
        resolveComboDecayWindow,
        refreshAchievementUpgrades,
        computeScheduledAudioTime,
        scheduleVisualEffect,
        flashBallLight: (intensity?: number) => flashBallLight(intensity ?? 0.35),
        flashPaddleLight: (intensity?: number) => flashPaddleLight(intensity ?? 0.3),
        applyGambleAppearance,
        clearGhostEffect,
        removeBodyVisual,
        clearExtraBalls,
        reattachBallToPaddle,
        removeExtraBallByBody,
        promoteExtraBallToPrimary,
        handleLevelComplete,
        handleGameOver,
        spawnCoin,
        syncMomentum,
    });

    lifecycleState.collisionDeps = {
        engine: physics.engine,
        bus,
        midiEngine: resolveMidiEngine(),
        random,
        context: collisionContext,
    };
    lifecycleState.collisionRuntime = createCollisionRuntime(lifecycleState.collisionDeps);
    lifecycleState.collisionRuntime.wire();

    lifecycleState.laserController = createLaserController({
        collisionRuntime: lifecycleState.collisionRuntime,
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
    bindLaserController(lifecycleState.laserController);

    const runGameplayUpdate = (deltaSeconds: number): void => {
        // Update timing and synchronization metrics
        updateTimingAndSync({
            deltaSeconds,
            scheduler,
            runtimeState,
            replayBuffer,
            sessionNow,
            hasPerformanceNow,
            syncDriftTelemetry,
        });

        powerups.tick(deltaSeconds);
        lifecycleState.laserController?.update(deltaSeconds);

        for (const binding of runtimeRewards.getActionBindings()) {
            if (inputToPhysics.consumeKeyPress(binding.key)) {
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
            getGambleRuntime()?.clearAll();
            forceClearBreakableBricks();
            clearActivePowerUps();
            clearActiveCoins();
            session.completeRound();
            handleLevelComplete();
            return;
        }

        // Calculate current speed targets based on powerups and difficulty
        const speedTargets = calculateSpeedTargets({
            runtimeState,
            scoringState,
            powerUpManager,
            roundMachine,
            configResolver,
            loadoutPhysicsMultipliers,
        });
        runtimeState.currentBaseSpeed = speedTargets.currentBaseSpeed;
        runtimeState.currentMaxSpeed = speedTargets.currentMaxSpeed;
        runtimeState.currentLaunchSpeed = speedTargets.currentLaunchSpeed;

        audioState$.next({
            combo: scoringState.combo,
            activePowerUps: powerUpManager.getActiveEffects().map((effect) => ({ type: effect.type })),
            lookAheadMs: scheduler.lookAheadMs,
        });

        updateGhostBricks(deltaSeconds);
        getGambleRuntime()?.tick(deltaSeconds);
        echoTrailManager.tick(deltaSeconds);
        vortexFieldManager.tick(deltaSeconds);

        const paddleScale = powerups.getPaddleWidthScale();
        const targetPaddleWidth = runtimeState.paddleBaseWidth * paddleScale;
        setPaddleWidth(targetPaddleWidth);

        const comboBeforeDecay = scoringState.combo;
        scoring.decayCombo(deltaSeconds);
        if (comboBeforeDecay > 0 && scoringState.combo === 0) {
            session.recordEntropyEvent({ type: 'combo-reset', comboHeat: comboBeforeDecay });
        }
        syncMomentum();

        const { screen: paddleTarget, playfield: paddleTargetPlayfield } = inputToPhysics.resolveTarget();
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
            const nextX = inputToPhysics.computeNextX({
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
            inputToPhysics.syncPaddlePosition(paddleCenter);
        }

        const launchIntent = inputToPhysics.shouldLaunch() ? inputToPhysics.consumeLaunchIntent() : null;
        if (ball.isAttached && launchIntent) {
            replayBuffer.recordLaunch(runtimeState.sessionElapsedSeconds);
            physics.detachBallFromPaddle(ball.physicsBody);
            launchController.launch(ball, launchIntent.direction, runtimeState.currentLaunchSpeed);
            inputToPhysics.resetLaunchTrigger();
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
            inputToPhysics.resetLaunchTrigger();
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

        // Build and push music state from gameplay metrics
        const musicState = buildMusicState(
            speedAfterRegulation,
            runtimeState.currentBaseSpeed,
            runtimeState.currentMaxSpeed,
            bricksRemaining,
            bricksTotal,
            sessionSnapshot.livesRemaining,
            scoringState.combo,
        );
        pushMusicState(musicState);

        const physicsOverlayState: PhysicsDebugOverlayState = {
            currentSpeed: speedAfterRegulation,
            baseSpeed: runtimeState.currentBaseSpeed,
            maxSpeed: runtimeState.currentMaxSpeed,
            timeScale,
            slowTimeScale,
            slowTimeRemaining,
            regulation: regulationInfo,
            extraBalls: multiBallController.count(),
            extraBallCapacity: configResolver.multiBallMaxCapacity,
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

        const comboActive = scoringState.combo >= 2 && scoringState.comboTimer > 0;
        const comboIntensity = comboActive ? clampUnit(scoringState.combo / 14) : 0;
        const decayWindow = resolveComboDecayWindow();
        const comboTimerFactor = comboActive ? clampUnit(scoringState.comboTimer / decayWindow) : 0;
        const comboEnergy = Math.min(
            1.15,
            runtimeState.comboRingPulse * 0.85 + comboIntensity * 0.6 + comboTimerFactor * 0.45,
        );

        // Build visual effects sources from active balls
        const ballTrailSources = visuals?.ballTrailSources;
        if (ballTrailSources) {
            ballTrailSources.length = 0;
            const sources = buildBallTrailSources(
                multiBallController,
                ball.radius,
                runtimeState.currentMaxSpeed,
            );
            ballTrailSources.push(...sources);
        }

        const chromaticActiveBalls = buildChromaticSources(
            multiBallController,
            runtimeState.currentMaxSpeed,
        );

        const chromaticTrailSources = chromaticTrailManager.buildSources({
            ballRadius: ball.radius,
            comboScore: scoringState.combo,
            comboEnergy,
            sessionTime: runtimeState.sessionElapsedSeconds,
            deltaSeconds,
            activeBalls: chromaticActiveBalls,
        });

        const heatDistortionSources = buildHeatDistortionSources(
            multiBallController,
            runtimeState.currentMaxSpeed,
            PLAYFIELD_WIDTH,
            PLAYFIELD_HEIGHT,
        );

        const echoTrails: import('game/echo-trails').EchoTrailSnapshot[] = [];
        echoTrailManager.forEach((_ball: Body, snapshot: import('game/echo-trails').EchoTrailSnapshot) => {
            echoTrails.push(snapshot);
        });

        const vortexFields: import('physics/field-effects').VortexInstance[] = [];
        vortexFieldManager.forEach((vortex: import('physics/field-effects').VortexInstance) => {
            vortexFields.push(vortex);
        });

        visualEffectsManager.state.lastPhysicsDebugState = runtimeState.lastPhysicsDebugState;

        visualEffectsManager.update({
            deltaSeconds: movementDelta,
            comboScore: scoringState.combo,
            comboTimer: scoringState.comboTimer,
            comboDecayWindow: decayWindow,
            comboEnergy,
            currentBaseSpeed: runtimeState.currentBaseSpeed,
            currentMaxSpeed: runtimeState.currentMaxSpeed,
            ballTrailSources,
            chromaticTrailSources,
            heatDistortionSources,
            echoTrails,
            vortexFields,
        });

        runtimeState.ballGlowPulse = visualEffectsManager.state.ballGlowPulse;
        runtimeState.paddleGlowPulse = visualEffectsManager.state.paddleGlowPulse;
        runtimeState.comboRingPulse = visualEffectsManager.state.comboRingPulse;
        runtimeState.comboRingPhase = visualEffectsManager.state.comboRingPhase;

        // Reactive HUD update - refresh after each gameplay frame
        refreshHud();
    };

    lifecycleState.loop = createGameLoop(
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
        getLoop: () => lifecycleState.loop,
        renderStageSoon,
        provideSceneServices,
        beginNewSession,
        runGameplayUpdate,
        runtimeInput,
        gameContainer,
        hudContainer,
        getScore: () => scoringState.score,
        getIsPaused,
        setIsPaused: (paused) => {
            setPaused(paused);
        },
        getActiveLoadoutSelection,
        onLoopStarted: lifecycleState.startHudMetricsBridge,
        onLoopStopped: lifecycleState.stopHudMetricsBridge,
        logger: runtimeLogger,
    });

    const { runtimeDebug: createdRuntimeDebug } = setupDebugHarnessIntegrations({
        logger: runtimeLogger,
        cheatPowerUpBindings: CHEAT_POWERUP_BINDINGS,
        toggleTheme,
        pauseGame,
        resumeGame: () => {
            resumeFromPause();
        },
        quitToMenu,
        renderStageSoon,
        isPaused: () => lifecycleState.isPaused,
        isLoopRunning: () => Boolean(lifecycleState.loop?.isRunning()),
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
            powerUpRadius: configResolver.powerUpRadius,
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
            isLoopRunning: () => Boolean(lifecycleState.loop?.isRunning()),
            getIsPaused: () => lifecycleState.isPaused,
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
            biasCoordinator: roundCoordinator?.getBiasCoordinator() ?? null,
            runtimeModifiers,
            levelRuntime,
        },
        overlays: {
            input: visuals?.inputDebugOverlay ?? null,
            physics: visuals?.physicsDebugOverlay ?? null,
        },
    });

    runtimeDebug = createdRuntimeDebug;


    const cleanupVisuals = () => {
        runtimeAudio.clearScheduledVisualEffects();
        getGambleRuntime()?.dispose();
        unsubscribeMeta?.();
        unsubscribeMeta = null;
        unsubscribeThemeChange?.();
        unsubscribeThemeChange = null;
        unsubscribeThemeSnapshot?.();
        unsubscribeThemeSnapshot = null;
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
                narrativeService.dispose();
            },
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
                lifecycleState.stopHudMetricsBridge();
            },
            () => {
                hudSetters.setEntropyActionHandler(undefined);
            },
            () => {
                hudSetters.reset();
            },
            () => {
                runtimeInput.dispose();
            },
            () => {
                runtimeDebug?.dispose();
                runtimeDebug = null;
            },
            () => {
                lifecycleState.collisionRuntime?.unwire();
                lifecycleState.collisionRuntime = null;
                lifecycleState.collisionDeps = null;
            },
            () => {
                bindLaserController(null);
                lifecycleState.laserController?.dispose();
                lifecycleState.laserController = null;
            },
        ],
    });
    if (idleResumeSummary) {
        refreshHud();
        hudSetters.pulseCombo(0.35);
        narrativeService.handleIdleResume(idleResumeSummary);
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
            collisions: lifecycleState.collisionRuntime,
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


