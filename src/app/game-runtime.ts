import { GameTheme } from 'render/theme';
import { createPhysicsWorld } from 'physics/world';
import { createGameLoop } from './loop';
import { createGameSessionManager } from './state';
import { buildHudScoreboard } from 'render/hud';
import { createDynamicLight } from 'render/effects/dynamic-light';
import { createHudDisplay, type HudPowerUpView, type HudRewardView } from 'render/hud-display';
import { createMainMenuScene } from 'scenes/main-menu';
import { createGameplayScene } from 'scenes/gameplay';
import { createLevelCompleteScene } from 'scenes/level-complete';
import { createGameOverScene } from 'scenes/game-over';
import { createPauseScene } from 'scenes/pause';
import { BallAttachmentController } from 'physics/ball-attachment';
import { PaddleBodyController } from 'render/paddle-body';
import { GameInputManager } from 'input/input-manager';
import { PhysicsBallLaunchController } from 'physics/ball-launch';
import { reflectOffPaddle, calculateReflectionData } from 'util/paddle-reflection';
import { regulateSpeed, getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { createScoring, awardBrickPoints, decayCombo, resetCombo } from 'util/scoring';
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
    drawBallVisual,
    drawPaddleVisual,
    createPlayfieldBackgroundLayer,
    type BallVisualDefaults,
    type BallVisualPalette,
    type PaddleVisualDefaults,
} from 'render/playfield-visuals';
import { createComboRing } from 'render/combo-ring';
import { Sprite, Container, Graphics, Texture, ColorMatrixFilter, type Filter } from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import {
    Events,
    Body as MatterBody,
    Vector as MatterVector,
    type IEventCollision,
    type Engine,
    type Body,
} from 'matter-js';
import { Transport, getContext } from 'tone';
import type { MusicState } from 'audio/music-director';
import type { RandomManager } from 'util/random';
import type { ReplayBuffer } from './replay-buffer';
import { createGameInitializer } from './game-initializer';
import { createMultiBallController } from './multi-ball-controller';
import { createLevelRuntime, type BrickLayoutBounds } from './level-runtime';
import { spinWheel, type Reward } from 'game/rewards';
import { smoothTowards } from 'util/input-helpers';
import { rootLogger } from 'util/log';
import type { GameSceneServices } from './scene-services';

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

const ensureToneAudio = async (): Promise<void> => {
    const context = getToneAudioContext();
    if (context.state === 'suspended') {
        const result = context.resume();
        if (isPromiseLike(result)) {
            await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
        }
    }

    if (Transport.state !== 'started') {
        const result = Transport.start();
        if (isPromiseLike(result)) {
            await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
        }
    }
};

const PLAYFIELD_DEFAULT = { width: 1280, height: 720 } as const;
const BRICK_LIGHT_RADIUS = 180;
const BRICK_REST_ALPHA = 0.9;
const COMBO_DECAY_WINDOW = 1.6;
const HUD_SCALE = 0.9;
const HUD_MARGIN = 32;
const MIN_HUD_SCALE = 0.55;
const BALL_BASE_SPEED = 8;
const BALL_MAX_SPEED = 14;
const BALL_LAUNCH_SPEED = 9;
const MULTI_BALL_MULTIPLIER = 3;
const DEFAULT_PADDLE_WIDTH_MULTIPLIER = 1.5;
const BRICK_WIDTH = 100;
const BRICK_HEIGHT = 40;
const POWER_UP_RADIUS = 16;
const POWER_UP_FALL_SPEED = 6;
const POWER_UP_DURATION = 6;
const STARFIELD_SCROLL_SPEED = { x: 8, y: 4 } as const;
const PADDLE_SMOOTH_RESPONSIVENESS = 16;
const PADDLE_SNAP_THRESHOLD = 0.75;

export interface GameRuntimeOptions {
    readonly container: HTMLElement;
    readonly playfieldDimensions?: { readonly width: number; readonly height: number };
    readonly random: RandomManager;
    readonly replayBuffer: ReplayBuffer;
    readonly starfieldTexture: Texture | null;
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
    random,
    replayBuffer,
    starfieldTexture,
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
    const HALF_PLAYFIELD_WIDTH = PLAYFIELD_WIDTH / 2;

    const rowColors = GameTheme.brickColors.map(toColorNumber);
    const themeBallColors = {
        core: toColorNumber(GameTheme.ball.core),
        aura: toColorNumber(GameTheme.ball.aura),
        highlight: toColorNumber(GameTheme.ball.highlight),
    } as const;
    const themePaddleGradient = GameTheme.paddle.gradient.map(toColorNumber);
    const themeAccents = {
        combo: toColorNumber(GameTheme.accents.combo),
        powerUp: toColorNumber(GameTheme.accents.powerUp),
    } as const;

    const ballVisualDefaults: BallVisualDefaults = {
        baseColor: themeBallColors.core,
        auraColor: themeBallColors.aura,
        highlightColor: themeBallColors.highlight,
        baseAlpha: 0.78,
        rimAlpha: 0.38,
        innerAlpha: 0.32,
        innerScale: 0.5,
    };

    const paddleVisualDefaults: PaddleVisualDefaults = {
        gradient: themePaddleGradient,
        accentColor: themeBallColors.aura,
    };

    let ballHueShift = 0;
    let ballGlowPulse = 0;
    let paddleGlowPulse = 0;
    let comboRingPulse = 0;
    let comboRingPhase = 0;

    let ballLight: ReturnType<typeof createDynamicLight> | null = null;
    let paddleLight: ReturnType<typeof createDynamicLight> | null = null;

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

    const physics = createPhysicsWorld({
        dimensions: { width: PLAYFIELD_WIDTH, height: PLAYFIELD_HEIGHT },
        gravity: 0,
    });

    const createSession = () =>
        createGameSessionManager({
            sessionId: 'game-session',
            initialLives: 3,
            eventBus: bus,
            random: random.random,
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
        if (
            lastMusicState &&
            lastMusicState.lives === state.lives &&
            Math.abs(lastMusicState.combo - state.combo) <= 1e-3
        ) {
            return;
        }

        musicDirector.setState(state);
        lastMusicState = { ...state };
    };

    let session = createSession();
    let scoringState = createScoring();
    pushMusicState({ lives: 3, combo: 0 });
    const powerUpManager = new PowerUpManager();
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
    };

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
    });

    const brickHealth = levelRuntime.brickHealth;
    const brickMetadata = levelRuntime.brickMetadata;
    const brickVisualState = levelRuntime.brickVisualState;

    const updateBrickLighting = (
        ...args: Parameters<typeof levelRuntime.updateBrickLighting>
    ) => levelRuntime.updateBrickLighting(...args);

    const findPowerUp = (
        ...args: Parameters<typeof levelRuntime.findPowerUp>
    ) => levelRuntime.findPowerUp(...args);
    const removePowerUp = (
        ...args: Parameters<typeof levelRuntime.removePowerUp>
    ) => levelRuntime.removePowerUp(...args);
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

    const loadLevel = (levelIndex: number) => {
        const result = levelRuntime.loadLevel(levelIndex);
        powerUpChanceMultiplier = result.powerUpChanceMultiplier;
        levelDifficultyMultiplier = result.difficultyMultiplier;
        brickLayoutBounds = result.layoutBounds;
        session.startRound({ breakableBricks: result.breakableBricks });
    };

    const STARFIELD_TEXTURE = starfieldTexture ?? Texture.WHITE;
    const playfieldBackgroundLayer = createPlayfieldBackgroundLayer(playfieldDimensions, STARFIELD_TEXTURE);
    stage.addToLayer('playfield', playfieldBackgroundLayer.container);

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

    const paddleLightHandle = createDynamicLight({
        color: themeAccents.powerUp,
        minRadius: 55,
        maxRadius: 180,
        baseRadius: 200,
        minIntensity: 0.02,
        maxIntensity: 0.12,
        speedForMaxIntensity: BALL_MAX_SPEED * 0.55,
        radiusLerpSpeed: 6,
        intensityLerpSpeed: 5,
    });
    paddleLightHandle.container.zIndex = 4;
    paddleLightHandle.container.alpha = 0.9;
    stage.addToLayer('effects', paddleLightHandle.container);
    paddleLight = paddleLightHandle;

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

    const drawBallSprite = (graphics: Graphics, radius: number, palette?: BallVisualPalette) => {
        drawBallVisual(graphics, radius, ballVisualDefaults, palette);
    };

    const ballGraphics = new Graphics();
    drawBallSprite(ballGraphics, ball.radius);
    ballGraphics.eventMode = 'none';
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
    });

    const paddleGraphics = new Graphics();
    drawPaddleVisual(paddleGraphics, paddle.width, paddle.height, paddleVisualDefaults);
    paddleGraphics.eventMode = 'none';
    paddleGraphics.zIndex = 60;
    const paddleGlowFilter = new GlowFilter({
        distance: 14,
        outerStrength: 1.2,
        innerStrength: 0,
        color: themePaddleGradient[1] ?? themeBallColors.aura,
        quality: 0.3,
    });
    paddleGraphics.filters = [paddleGlowFilter as unknown as Filter];
    gameContainer.addChild(paddleGraphics);
    visualBodies.set(paddle.physicsBody, paddleGraphics);

    inputManager.initialize(container);

    let previousPaddlePosition = { x: paddle.position.x, y: paddle.position.y };
    let sessionElapsedSeconds = 0;
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
        physics.attachBallToPaddle(ball.physicsBody, paddle.physicsBody, attachmentOffset);
        ball.isAttached = true;
        ball.attachmentOffset = attachmentOffset;
        MatterBody.setVelocity(ball.physicsBody, { x: 0, y: 0 });
        MatterBody.setAngularVelocity(ball.physicsBody, 0);
        inputManager.resetLaunchTrigger();
        const center = paddleController.getPaddleCenter(paddle);
        previousPaddlePosition = { x: center.x, y: center.y };
        inputManager.syncPaddlePosition(center);
    };

    const promoteExtraBallToPrimary = (expiredBody: Body): boolean => {
        if (multiBallController.promoteExtraBallToPrimary(expiredBody)) {
            return true;
        }
        return false;
    };

    const removeExtraBallByBody = (body: Body) => {
        multiBallController.removeExtraBallByBody(body);
    };

    const clearExtraBalls = () => {
        multiBallController.clear();
    };

    const spawnExtraBalls = () => {
        multiBallController.spawnExtraBalls({ currentLaunchSpeed });
    };

    const handlePowerUpActivation = (type: PowerUpType): void => {
        ballLight?.flash(0.5);
        paddleLight?.flash(0.45);
        if (type === 'multi-ball') {
            spawnExtraBalls();
        }
    };

    const hudContainer = new Container();
    hudContainer.eventMode = 'none';
    hudContainer.visible = false;
    stage.layers.hud.addChild(hudContainer);

    const hudDisplay = createHudDisplay(GameTheme);
    hudContainer.addChild(hudDisplay.container);

    const positionHud = () => {
        const margin = HUD_MARGIN;
        const hudWidth = hudDisplay.width;
        const hudHeight = hudDisplay.getHeight();
        const clampScale = (value: number) => Math.max(MIN_HUD_SCALE, Math.min(HUD_SCALE, value));

        const place = (x: number, y: number, scale: number) => {
            hudDisplay.container.scale.set(scale);
            hudDisplay.container.position.set(Math.round(x), Math.round(y));
        };

        if (!brickLayoutBounds) {
            place(margin, margin, HUD_SCALE);
            return;
        }

        const fullWidthLimit = (PLAYFIELD_WIDTH - margin * 2) / hudWidth;
        const fullHeightLimit = (PLAYFIELD_HEIGHT - margin * 2) / hudHeight;
        const globalScaleLimit = Math.max(MIN_HUD_SCALE, Math.min(HUD_SCALE, fullWidthLimit, fullHeightLimit));

        const placements: { priority: number; scale: number; x: number; y: number }[] = [];
        const { minX, maxX, minY, maxY } = brickLayoutBounds;

        const tryTop = () => {
            const availableHeight = minY - margin;
            if (availableHeight <= 0) {
                return;
            }
            let scale = clampScale(Math.min(globalScaleLimit, availableHeight / hudHeight));
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            const width = hudWidth * scale;
            if (width > PLAYFIELD_WIDTH - margin * 2) {
                scale = clampScale((PLAYFIELD_WIDTH - margin * 2) / hudWidth);
            }
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            placements.push({ priority: 0, scale, x: margin, y: margin });
        };

        const tryRight = () => {
            const availableWidth = PLAYFIELD_WIDTH - maxX - margin;
            if (availableWidth <= 0) {
                return;
            }
            let scale = clampScale(Math.min(globalScaleLimit, availableWidth / hudWidth));
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            const height = hudHeight * scale;
            if (height > PLAYFIELD_HEIGHT - margin * 2) {
                scale = clampScale((PLAYFIELD_HEIGHT - margin * 2) / hudHeight);
            }
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            const width = hudWidth * scale;
            const y = Math.max(margin, Math.min(PLAYFIELD_HEIGHT - height - margin, minY));
            placements.push({ priority: 1, scale, x: PLAYFIELD_WIDTH - width - margin, y });
        };

        const tryLeft = () => {
            const availableWidth = minX - margin;
            if (availableWidth <= 0) {
                return;
            }
            let scale = clampScale(Math.min(globalScaleLimit, availableWidth / hudWidth));
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            const height = hudHeight * scale;
            if (height > PLAYFIELD_HEIGHT - margin * 2) {
                scale = clampScale((PLAYFIELD_HEIGHT - margin * 2) / hudHeight);
            }
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            const y = Math.max(margin, Math.min(PLAYFIELD_HEIGHT - hudHeight * scale - margin, minY));
            placements.push({ priority: 2, scale, x: margin, y });
        };

        const tryBottom = () => {
            const availableHeight = PLAYFIELD_HEIGHT - maxY - margin;
            if (availableHeight <= 0) {
                return;
            }
            let scale = clampScale(Math.min(globalScaleLimit, availableHeight / hudHeight));
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            const width = hudWidth * scale;
            if (width > PLAYFIELD_WIDTH - margin * 2) {
                scale = clampScale((PLAYFIELD_WIDTH - margin * 2) / hudWidth);
            }
            if (scale < MIN_HUD_SCALE) {
                return;
            }
            const height = hudHeight * scale;
            const y = PLAYFIELD_HEIGHT - height - margin;
            const x = Math.max(margin, Math.min(PLAYFIELD_WIDTH - width - margin, minX));
            placements.push({ priority: 3, scale, x, y });
        };

        tryTop();
        tryRight();
        tryLeft();
        tryBottom();

        if (placements.length === 0) {
            place(margin, margin, globalScaleLimit);
            return;
        }

        placements.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return b.scale - a.scale;
        });

        const chosen = placements[0];
        place(chosen.x, chosen.y, chosen.scale);
    };

    positionHud();
    window.addEventListener('resize', positionHud);

    const pauseLegendLines = [
        'Cyan Paddle Width - Widens your paddle for extra coverage.',
        'Orange Ball Speed - Speeds up the ball and boosts scoring.',
        'Pink Multi Ball - Splits the active ball into additional balls.',
        'Green Sticky Paddle - Catches the ball until you launch again.',
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

        hudDisplay.update({
            view: hudView,
            difficultyMultiplier: levelDifficultyMultiplier,
            comboCount: scoringState.combo,
            comboTimer: scoringState.comboTimer,
            activePowerUps: collectActivePowerUps(),
            reward: resolveRewardView(),
        });

        if (scoringState.combo > lastComboCount) {
            const pulseStrength = Math.min(1, 0.55 + scoringState.combo * 0.04);
            hudDisplay.pulseCombo(pulseStrength);
        }
        lastComboCount = scoringState.combo;
        positionHud();
    };

    const activateReward = (reward: Reward | null) => {
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
                powerUpManager.activate('sticky-paddle', { defaultDuration: reward.duration });
                break;
            case 'double-points':
                doublePointsMultiplier = reward.multiplier;
                doublePointsTimer = reward.duration;
                break;
            case 'ghost-brick':
                applyGhostBrickReward(reward.duration, reward.ghostCount);
                break;
            case 'multi-ball':
                multiBallRewardTimer = Math.max(0, reward.duration);
                spawnExtraBalls();
                break;
            case 'slow-time':
                slowTimeTimer = Math.max(0, reward.duration);
                slowTimeScale = Math.min(1, Math.max(0.1, reward.timeScale));
                break;
            case 'wide-paddle':
                rewardPaddleWidthMultiplier = Math.max(1, reward.widthMultiplier);
                powerUpManager.activate('paddle-width', { defaultDuration: reward.duration });
                widePaddleRewardActive = true;
                break;
        }
    };

    const beginNewSession = async (): Promise<void> => {
        if (loop?.isRunning()) {
            loop.stop();
        }

        random.reset();
        const activeSeed = random.seed();
        sessionElapsedSeconds = 0;
        lastRecordedInputTarget = null;
        replayBuffer.begin(activeSeed);

        session = createSession();
        pushMusicState({ lives: 3, combo: 0 });
        currentLevelIndex = 0;
        pendingReward = null;
        activateReward(null);
        levelDifficultyMultiplier = 1;
        startLevel(currentLevelIndex, { resetScore: true });
        await stage.transitionTo('gameplay');
        loop?.start();
    };

    const startLevel = (levelIndex: number, options: { resetScore?: boolean } = {}): void => {
        isPaused = false;

        gameContainer.visible = true;
        hudContainer.visible = true;

        if (options.resetScore) {
            scoringState = createScoring();
        } else {
            resetCombo(scoringState);
        }

        powerUpManager.clearAll();
        clearExtraBalls();
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
        isPaused = false;
        loop?.stop();
        pendingReward = spinWheel(random.random);

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
        isPaused = false;
        loop?.stop();
        pendingReward = null;
        activateReward(null);

        void stage.push('game-over', { score: scoringState.score })
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
            const sessionId = session.snapshot().sessionId;

            if ((bodyA.label === 'ball' && bodyB.label === 'brick') || (bodyA.label === 'brick' && bodyB.label === 'ball')) {
                const brick = bodyA.label === 'brick' ? bodyA : bodyB;
                const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;

                const currentHp = brickHealth.get(brick) ?? 1;
                const nextHp = currentHp - 1;
                const metadata = brickMetadata.get(brick);
                const row = metadata?.row ?? Math.floor((brick.position.y - 100) / BRICK_HEIGHT);
                const col = metadata?.col ?? Math.floor((brick.position.x - 50) / BRICK_WIDTH);
                const impactVelocity = MatterVector.magnitude(ballBody.velocity);
                const initialHp = metadata?.hp ?? currentHp;

                if (nextHp > 0) {
                    brickHealth.set(brick, nextHp);

                    levelRuntime.updateBrickDamage(brick, nextHp);

                    bus.publish('BrickHit', {
                        sessionId,
                        row,
                        col,
                        impactVelocity,
                        brickType: 'standard',
                        comboHeat: scoringState.combo,
                        previousHp: currentHp,
                        remainingHp: nextHp,
                    });
                } else {
                    bus.publish('BrickBreak', {
                        sessionId,
                        row,
                        col,
                        impactVelocity,
                        comboHeat: scoringState.combo,
                        brickType: 'standard',
                        initialHp,
                    });

                    const previousCombo = scoringState.combo;
                    const basePoints = awardBrickPoints(scoringState);
                    let points = basePoints;
                    if (doublePointsMultiplier > 1) {
                        const bonus = Math.round(basePoints * (doublePointsMultiplier - 1));
                        points += bonus;
                        scoringState.score += bonus;
                    }

                    publishComboMilestoneIfNeeded({
                        bus,
                        sessionId,
                        previousCombo,
                        currentCombo: scoringState.combo,
                        pointsAwarded: points,
                        totalScore: scoringState.score,
                    });
                    session.recordBrickBreak({
                        points,
                        event: {
                            row,
                            col,
                            impactVelocity,
                            brickType: 'standard',
                            initialHp,
                        },
                    });

                    const spawnChance = Math.min(1, 0.25 * powerUpChanceMultiplier);
                    if (shouldSpawnPowerUp({ spawnChance }, random.random)) {
                        const powerUpType = selectRandomPowerUpType(random.random);
                        levelRuntime.spawnPowerUp(powerUpType, { x: brick.position.x, y: brick.position.y });
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

                ballLight?.flash();
                paddleLight?.flash(0.3);

                bus.publish('PaddleHit', {
                    sessionId,
                    angle: reflectionData.angle,
                    speed: impactSpeed,
                    impactOffset: reflectionData.impactOffset,
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
                    bus.publish('WallHit', {
                        sessionId,
                        side,
                        speed: MatterVector.magnitude(ballBody.velocity),
                    });
                }
            }

            if ((bodyA.label === 'ball' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'ball')) {
                const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;

                if (multiBallController.isExtraBallBody(ballBody)) {
                    removeExtraBallByBody(ballBody);
                    return;
                }

                if (promoteExtraBallToPrimary(ballBody)) {
                    return;
                }

                session.recordLifeLost('ball-drop');
                resetCombo(scoringState);

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
                    powerUpManager.activate(entry.type, { defaultDuration: POWER_UP_DURATION });
                    removePowerUp(entry);
                    handlePowerUpActivation(entry.type);
                }
            }

            if ((bodyA.label === 'powerup' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'powerup')) {
                const powerUpBody = bodyA.label === 'powerup' ? bodyA : bodyB;
                const entry = findPowerUp(powerUpBody);
                if (entry) {
                    removePowerUp(entry);
                }
            }
        });
    });

    const runGameplayUpdate = (deltaSeconds: number): void => {
        sessionElapsedSeconds += deltaSeconds;
        replayBuffer.markTime(sessionElapsedSeconds);

        powerUpManager.update(deltaSeconds);

        const slowTimeActive = slowTimeTimer > 0;
        const timeScale = slowTimeActive ? slowTimeScale : 1;
        const movementDelta = deltaSeconds * timeScale;
        const safeMovementDelta = movementDelta > 0 ? movementDelta : 1 / 240;

        const sessionSnapshot = session.snapshot();
        pushMusicState({
            lives: toMusicLives(sessionSnapshot.livesRemaining),
            combo: scoringState.combo,
        });

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

        const paddleWidthActive = powerUpManager.isActive('paddle-width');
        const paddlePulseInfluence = Math.min(1, paddleGlowPulse);
        const paddlePulseLevel = Math.max(paddleWidthActive ? 0.65 : 0, paddlePulseInfluence * 0.85);
        const paddleAccentColor = paddleWidthActive
            ? themeAccents.powerUp
            : paddlePulseInfluence > 0
                ? mixColors(themeBallColors.aura, themeAccents.powerUp, paddlePulseInfluence)
                : undefined;

        drawPaddleVisual(paddleGraphics, paddle.width, paddle.height, paddleVisualDefaults, {
            accentColor: paddleAccentColor ?? paddleVisualDefaults.accentColor,
            pulseStrength: paddlePulseLevel,
        });

        decayCombo(scoringState, deltaSeconds);

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

        regulateSpeed(ball.physicsBody, {
            baseSpeed: currentBaseSpeed,
            maxSpeed: currentMaxSpeed,
        });

        if (movementDelta > 0) {
            physics.step(movementDelta * 1000);
        }

        visualBodies.forEach((visual, body) => {
            visual.x = body.position.x;
            visual.y = body.position.y;
            visual.rotation = body.angle;
        });

        playfieldBackgroundLayer.tiling.tilePosition.x += movementDelta * STARFIELD_SCROLL_SPEED.x;
        playfieldBackgroundLayer.tiling.tilePosition.y += movementDelta * STARFIELD_SCROLL_SPEED.y;

        updateBrickLighting(ball.physicsBody.position);

        ballLight?.update({
            position: { x: ball.physicsBody.position.x, y: ball.physicsBody.position.y },
            speed: MatterVector.magnitude(ball.physicsBody.velocity),
            deltaSeconds: movementDelta,
        });

        const comboActive = scoringState.combo >= 2 && scoringState.comboTimer > 0;
        const comboIntensity = comboActive ? clampUnit(scoringState.combo / 14) : 0;
        const comboTimerFactor = comboActive ? clampUnit(scoringState.comboTimer / COMBO_DECAY_WINDOW) : 0;
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

        const fallbackPaddleGlow = themePaddleGradient[themePaddleGradient.length - 1] ?? themeBallColors.aura;
        const paddleGlowIntensity = Math.max(paddleWidthActive ? 0.4 : 0, paddleGlowPulse * 0.8);
        paddleGlowFilter.outerStrength = Math.min(4.5, 1 + GameTheme.paddle.glow * 2 + paddleGlowIntensity * 2.2);
        const paddleGlowColor = paddleAccentColor ?? mixColors(fallbackPaddleGlow, themeAccents.powerUp, Math.min(1, paddleGlowPulse));
        paddleGlowFilter.color = paddleGlowColor;

        ballGlowPulse = Math.max(0, ballGlowPulse - deltaSeconds * 1.6);
        paddleGlowPulse = Math.max(0, paddleGlowPulse - deltaSeconds * 1.3);
        comboRingPulse = Math.max(0, comboRingPulse - deltaSeconds * 1.05);
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
            prompt: 'Tap to restart',
            onRestart: () => {
                if (stage.getCurrentScene() === 'game-over') {
                    stage.pop();
                }
                renderStageSoon();
                void beginNewSession();
            },
        }),
        { provideContext: provideSceneServices },
    );

    await stage.transitionTo('main-menu', undefined, { immediate: true });
    renderStageSoon();
    gameContainer.visible = false;
    hudContainer.visible = false;

    const quitToMenu = async () => {
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
    };

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

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
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
        }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);

    const cleanupVisuals = () => {
        ballLight?.destroy();
        paddleLight?.destroy();
        ballLight = null;
        paddleLight = null;
        comboRing.container.removeFromParent();
        comboRing.dispose();
        document.removeEventListener('keydown', handleGlobalKeyDown);
    };

    const handleBeforeUnload = () => {
        cleanupVisuals();
        disposeInitializer();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const dispose = () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        cleanupVisuals();
        disposeInitializer();
    };

    return {
        getSessionElapsedSeconds: () => sessionElapsedSeconds,
        dispose,
    } satisfies GameRuntimeHandle;
};
