import { createPreloader } from './preloader';
import { createStage } from 'render/stage';
import { GameTheme } from 'render/theme';
import type { SceneContext } from 'render/scene-manager';
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
import { regulateSpeed } from 'util/speed-regulation';
import { createScoring, awardBrickPoints, decayCombo, resetCombo } from 'util/scoring';
import { PowerUpManager, shouldSpawnPowerUp, selectRandomPowerUpType, calculatePaddleWidthScale, calculateBallSpeedScale, type PowerUpType } from 'util/power-ups';
import { generateLevelLayout, getLevelSpec, getPresetLevelCount, getLevelDifficultyMultiplier, remixLevel } from 'util/levels';
import { distance } from 'util/geometry';
import type { BrickSpec } from 'util/levels';
import { Text, Container, Graphics, Assets, TilingSprite, Texture, ColorMatrixFilter, FillGradient, type Filter } from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import { Events, Body as MatterBody, Bodies, Vector as MatterVector, type IEventCollision, type Engine, type Body } from 'matter-js';
import { createEventBus } from 'app/events';
import { createToneScheduler, createReactiveAudioLayer, type ReactiveAudioGameState } from 'audio/scheduler';
import { createSfxRouter } from 'audio/sfx';
import { Players, Panner, Volume, Transport } from 'tone';
import { spinWheel, type Reward } from 'game/rewards';
import { createSubject } from 'util/observable';

export interface LuckyBreakOptions {
    readonly container?: HTMLElement;
}

export function bootstrapLuckyBreak(options: LuckyBreakOptions = {}): void {
    const container = options.container ?? document.body;
    const PLAYFIELD_WIDTH = 1280;
    const PLAYFIELD_HEIGHT = 720;
    const HALF_PLAYFIELD_WIDTH = PLAYFIELD_WIDTH / 2;
    const PRESET_LEVEL_COUNT = getPresetLevelCount();
    const BRICK_LIGHT_RADIUS = 180;
    const BRICK_REST_ALPHA = 0.9;
    const toColorNumber = (value: string): number => Number.parseInt(value.replace('#', ''), 16);
    const parsePrimaryFontFamily = (value: string): string => {
        const primary = value.split(',')[0]?.trim() ?? value;
        return primary.replace(/['"]/g, '');
    };
    const themeFontFamily = parsePrimaryFontFamily(GameTheme.font);
    const themeMonoFontFamily = parsePrimaryFontFamily(GameTheme.monoFont ?? GameTheme.font);
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
    const STARFIELD_SCROLL_SPEED = { x: 8, y: 4 } as const;
    const COMBO_DECAY_WINDOW = 1.6;
    const HUD_SCALE = 0.9;
    const HUD_MARGIN = 32;
    const MIN_HUD_SCALE = 0.55;
    const fontDescriptors: string[] = [
        `400 32px "${themeFontFamily}"`,
        `600 56px "${themeFontFamily}"`,
        `700 64px "${themeFontFamily}"`,
    ];
    if (themeMonoFontFamily && themeMonoFontFamily !== themeFontFamily) {
        fontDescriptors.push(
            `400 28px "${themeMonoFontFamily}"`,
            `600 32px "${themeMonoFontFamily}"`,
        );
    }
    const STARFIELD_TEXTURE_DEF = {
        alias: 'starfield-background',
        src: new URL('../../assets/Starfield_08-512x512.png', import.meta.url).href,
    } as const;

    let starfieldTexture: Texture | null = null;
    let playfieldBackgroundLayer: { container: Container; tiling: TilingSprite } | null = null;
    let ballLight: ReactiveLight | null = null;
    let paddleLight: ReactiveLight | null = null;

    interface BallVisualPalette {
        readonly baseColor: number;
        readonly baseAlpha?: number;
        readonly rimColor?: number;
        readonly rimAlpha?: number;
        readonly innerColor?: number;
        readonly innerAlpha?: number;
        readonly innerScale?: number;
    }

    interface PaddleVisualPalette {
        readonly gradient?: readonly number[];
        readonly accentColor?: number;
        readonly pulseStrength?: number;
    }

    interface ReactiveLight {
        readonly container: Container;
        update(payload: { readonly position: { readonly x: number; readonly y: number }; readonly speed: number; readonly deltaSeconds: number }): void;
        flash(intensityBoost?: number): void;
        destroy(): void;
    }

    const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

    const mixColors = (source: number, target: number, amount: number): number => {
        const t = clampUnit(amount);
        const sr = (source >> 16) & 0xff;
        const sg = (source >> 8) & 0xff;
        const sb = source & 0xff;
        const tr = (target >> 16) & 0xff;
        const tg = (target >> 8) & 0xff;
        const tb = target & 0xff;

        const r = Math.round(sr + (tr - sr) * t);
        const g = Math.round(sg + (tg - sg) * t);
        const b = Math.round(sb + (tb - sb) * t);

        return (r << 16) | (g << 8) | b;
    };

    const computeBrickFillColor = (baseColor: number, remainingHp: number, maxHp: number): number => {
        if (maxHp <= 1) {
            return baseColor;
        }
        const healthRatio = clampUnit(remainingHp / maxHp);
        const damageInfluence = 1 - healthRatio;
        if (damageInfluence <= 0) {
            return baseColor;
        }
        const warmed = mixColors(baseColor, 0xffe4c8, 0.4 + damageInfluence * 0.45);
        const cooled = mixColors(baseColor, 0x07121f, damageInfluence * 0.35);
        return mixColors(warmed, cooled, damageInfluence * 0.4);
    };

    const paintBrickVisual = (
        graphics: Graphics,
        width: number,
        height: number,
        color: number,
        damageLevel = 0,
    ): void => {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const cornerRadius = Math.min(halfHeight, 12);

        const damage = clampUnit(damageLevel);
        const highlightColor = mixColors(color, 0xffffff, 0.45 + damage * 0.35);
        const shadowColor = mixColors(color, 0x001020, 0.55 + damage * 0.15);

        const gradient = new FillGradient(-halfWidth, -halfHeight, halfWidth, halfHeight);
        gradient.addColorStop(0, highlightColor);
        gradient.addColorStop(1, shadowColor);

        graphics.clear();
        graphics.roundRect(-halfWidth, -halfHeight, width, height, cornerRadius);
        graphics.fill(gradient);
        graphics.stroke({ color: highlightColor, width: 2, alignment: 0.5, alpha: 0.45 + damage * 0.2 });

        const innerHighlightHeight = height * 0.32;
        graphics.roundRect(-halfWidth + 3, -halfHeight + 3, width - 6, innerHighlightHeight, cornerRadius * 0.6);
        graphics.fill({ color: 0xffffff, alpha: 0.12 + damage * 0.16 });

        graphics.roundRect(-halfWidth + 4, halfHeight - innerHighlightHeight + 2, width - 8, innerHighlightHeight, cornerRadius * 0.6);
        graphics.fill({ color, alpha: 0.18 + damage * 0.22 });

        if (damage > 0.01) {
            const crackAlpha = 0.12 + damage * 0.32;
            graphics.moveTo(-halfWidth + 6, -halfHeight + 10);
            graphics.lineTo(-halfWidth * 0.2, -halfHeight * 0.1);
            graphics.lineTo(halfWidth * 0.1, halfHeight * 0.25);
            graphics.lineTo(halfWidth - 12, halfHeight - 8);
            graphics.stroke({ color: 0xffffff, width: 1.4, alpha: crackAlpha });

            graphics.moveTo(-halfWidth + 18, halfHeight - 10);
            graphics.lineTo(-halfWidth * 0.05, halfHeight * 0.1);
            graphics.lineTo(halfWidth * 0.45, -halfHeight * 0.05);
            graphics.stroke({ color: 0x010a16, width: 1.2, alpha: crackAlpha * 0.6 });
        }

        graphics.alpha = BRICK_REST_ALPHA;
        graphics.tint = 0xffffff;
    };

    const drawBallVisual = (graphics: Graphics, radius: number, palette?: BallVisualPalette): void => {
        const settings: Required<BallVisualPalette> = {
            baseColor: palette?.baseColor ?? themeBallColors.core,
            baseAlpha: palette?.baseAlpha ?? 0.78,
            rimColor: palette?.rimColor ?? themeBallColors.highlight,
            rimAlpha: palette?.rimAlpha ?? 0.38,
            innerColor: palette?.innerColor ?? themeBallColors.aura,
            innerAlpha: palette?.innerAlpha ?? 0.32,
            innerScale: palette?.innerScale ?? 0.5,
        };

        graphics.clear();
        graphics.circle(0, 0, radius);
        graphics.fill({ color: settings.baseColor, alpha: settings.baseAlpha });
        graphics.stroke({ color: settings.rimColor, width: 3, alpha: settings.rimAlpha });

        const innerRadius = Math.max(1, radius * settings.innerScale);
        graphics.circle(0, -radius * 0.25, innerRadius);
        graphics.fill({ color: settings.innerColor, alpha: settings.innerAlpha });

        graphics.blendMode = 'normal';
    };

    const drawPaddleVisual = (
        graphics: Graphics,
        width: number,
        height: number,
        palette: PaddleVisualPalette = {},
    ): void => {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const cornerRadius = Math.min(halfHeight, 14);
        const gradientStops = palette.gradient ?? themePaddleGradient;
        const accentColor = palette.accentColor ?? themeBallColors.aura;
        const pulseStrength = Math.max(0, Math.min(1, palette.pulseStrength ?? 0));

        const gradient = new FillGradient(-halfWidth, -halfHeight, halfWidth, halfHeight);
        gradient.addColorStop(0, gradientStops[0] ?? themePaddleGradient[0]);
        gradient.addColorStop(1, gradientStops[gradientStops.length - 1] ?? themePaddleGradient[themePaddleGradient.length - 1]);

        graphics.clear();
        graphics.roundRect(-halfWidth, -halfHeight, width, height, cornerRadius);
        graphics.fill(gradient);
        graphics.stroke({ color: accentColor, width: 2, alpha: 0.4 + pulseStrength * 0.4 });

        const topBandAlpha = 0.16 + pulseStrength * 0.12;
        graphics.rect(-halfWidth + 3, -halfHeight + 2, width - 6, height * 0.35);
        graphics.fill({ color: 0xffffff, alpha: topBandAlpha });

        const baseBandAlpha = 0.1 + pulseStrength * 0.1;
        graphics.rect(-halfWidth + 2, halfHeight - height * 0.28, width - 4, height * 0.28);
        graphics.fill({ color: accentColor, alpha: baseBandAlpha });

        graphics.alpha = 0.96;
        graphics.blendMode = 'normal';
    };

    const drawBackgroundOverlay = (graphics: Graphics): void => {
        graphics.clear();
        graphics.rect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
        graphics.fill({ color: 0x05060d, alpha: 0.55 });
        graphics.stroke({ color: 0x2a2a2a, width: 4, alignment: 0, alpha: 0.35 });

        graphics.rect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT * 0.45);
        graphics.fill({ color: 0x0c1830, alpha: 0.25 });

        const gridSpacing = 80;
        for (let y = gridSpacing; y < PLAYFIELD_HEIGHT; y += gridSpacing) {
            graphics.rect(0, y, PLAYFIELD_WIDTH, 1);
            graphics.fill({ color: 0x10172a, alpha: 0.12 });
        }

        for (let x = gridSpacing; x < PLAYFIELD_WIDTH; x += gridSpacing) {
            graphics.rect(x, 0, 1, PLAYFIELD_HEIGHT);
            graphics.fill({ color: 0x10172a, alpha: 0.1 });
        }
    };

    const createPlayfieldBackgroundLayer = (texture: Texture): { container: Container; tiling: TilingSprite } => {
        const container = new Container();
        container.eventMode = 'none';
        container.zIndex = -100;

        const tiling = new TilingSprite({
            texture,
            width: PLAYFIELD_WIDTH,
            height: PLAYFIELD_HEIGHT,
        });
        tiling.eventMode = 'none';
        tiling.alpha = 0.78;
        tiling.tileScale.set(0.9, 0.9);
        tiling.tint = 0x2b4a7a;

        const overlay = new Graphics();
        drawBackgroundOverlay(overlay);
        overlay.eventMode = 'none';

        container.addChild(tiling, overlay);

        return { container, tiling };
    };

    const preloadFonts = async (
        report: (progress: { loaded: number; total: number }) => void,
    ): Promise<void> => {
        const total = fontDescriptors.length;

        report({ loaded: 0, total });

        const fontFaceSet = document.fonts;
        if (!fontFaceSet) {
            report({ loaded: total, total });
            return;
        }

        let loaded = 0;
        for (const descriptor of fontDescriptors) {
            await fontFaceSet.load(descriptor);
            loaded += 1;
            report({ loaded, total });
        }

        await fontFaceSet.ready;
        report({ loaded: total, total });
    };

    container.style.position = 'relative';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = '#000000';

    const preloader = createPreloader({
        container,
        loadAssets: async (report) => {
            const totalSteps = fontDescriptors.length + 1;
            const forward = (value: number) => {
                report({ loaded: Math.min(totalSteps, value), total: totalSteps });
            };

            await preloadFonts((progress) => {
                const fontsLoaded = Math.min(fontDescriptors.length, progress.loaded);
                forward(Math.min(totalSteps - 1, fontsLoaded));
            });

            forward(totalSteps - 1);

            const loadedTexture = await Assets.load<Texture>(STARFIELD_TEXTURE_DEF);
            starfieldTexture = loadedTexture;
            forward(totalSteps);
        },
        onStart: async () => {
            // Initialize the game components
            const stage = await createStage({ parent: container, theme: GameTheme });

            let ballHueShift = 0;
            let ballGlowPulse = 0;
            let paddleGlowPulse = 0;
            let comboRingPulse = 0;
            let comboRingPhase = 0;

            stage.layers.playfield.sortableChildren = true;
            stage.layers.effects.sortableChildren = true;

            // Set canvas to fill viewport
            stage.canvas.style.width = '100vw';
            stage.canvas.style.height = '100vh';
            stage.canvas.style.position = 'absolute';
            stage.canvas.style.top = '0';
            stage.canvas.style.left = '0';
            stage.canvas.style.display = 'block';
            stage.canvas.style.backgroundColor = '#000000';
            stage.canvas.style.touchAction = 'none';
            stage.canvas.style.userSelect = 'none';

            const bus = createEventBus();  // Create event bus

            const scheduler = createToneScheduler({ lookAheadMs: 120 });
            const audioState$ = createSubject<ReactiveAudioGameState>();
            const reactiveAudioLayer = createReactiveAudioLayer(audioState$, Transport, {
                lookAheadMs: scheduler.lookAheadMs,
                onFill: (event) => {
                    if (event.type === 'combo') {
                        comboRingPulse = Math.min(1, comboRingPulse + 0.45);
                        ballGlowPulse = Math.min(1, ballGlowPulse + 0.5);
                        ballLight?.flash(0.35);
                    } else if (event.type === 'power-up') {
                        paddleGlowPulse = Math.min(1, paddleGlowPulse + 0.6);
                        paddleLight?.flash(0.5);
                    }
                },
            });
            const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
                if (value === null) {
                    return false;
                }
                const candidate = value as { then?: unknown };
                return typeof candidate?.then === 'function';
            };
            const ensureAudioIsRunning = async () => {
                const ctx = scheduler.context;
                if (ctx.state === 'suspended') {
                    await ctx.resume();
                }
                if (Transport.state !== 'started') {
                    const result = Transport.start();
                    if (isPromiseLike(result)) {
                        await result;
                    }
                }
            };

            const toDecibels = (gain: number): number => {
                if (gain <= 0) {
                    return -60;
                }
                return Math.max(-30, Math.min(0, 20 * Math.log10(gain)));
            };

            const toPlaybackRate = (detuneCents: number): number => {
                const rate = 2 ** (detuneCents / 1200);
                return Math.max(0.5, Math.min(2, rate));
            };

            const brickSampleUrls = {
                'brick-hit-low': new URL('../../assets/bass-poweron.wav', import.meta.url).href,
                'brick-hit-mid': new URL('../../assets/double-acoustic-bassnote.wav', import.meta.url).href,
                'brick-hit-high': new URL('../../assets/eurobas.wav', import.meta.url).href,
            } as const;

            const volume = new Volume(-6);
            const panner = new Panner(0);
            volume.connect(panner);
            panner.toDestination();

            const brickPlayers = await new Promise<Players>((resolve) => {
                const players = new Players(brickSampleUrls, () => resolve(players));
                players.connect(volume);
            });

            // Ensure the audio graph and Tone transport are primed before any collision events fire.
            await ensureAudioIsRunning();

            const lastPlayerStart = new Map<string, number>();

            const router = createSfxRouter({
                bus,
                scheduler,
                brickSampleIds: Object.keys(brickSampleUrls),
                trigger: (descriptor) => {
                    void ensureAudioIsRunning().catch(console.warn);
                    const player = brickPlayers.player(descriptor.id);
                    if (!player) {
                        return;
                    }

                    const nowTime = scheduler.context.currentTime;
                    const lastStart = lastPlayerStart.get(descriptor.id) ?? -Infinity;
                    const minTime = Math.max(nowTime + 0.01, lastStart + 0.01);
                    const targetTime = Math.max(descriptor.time, minTime);

                    player.playbackRate = toPlaybackRate(descriptor.detune);
                    player.volume.value = toDecibels(descriptor.gain);
                    panner.pan.setValueAtTime(descriptor.pan, targetTime);
                    player.start(targetTime);
                    lastPlayerStart.set(descriptor.id, targetTime);
                },
            });

            // Add resize listener
            const handleResize = () => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                stage.resize({ width: w, height: h });

                const targetRatio = PLAYFIELD_WIDTH / PLAYFIELD_HEIGHT;
                const windowRatio = w / h;

                let scale = 1;
                let offsetX = 0;
                let offsetY = 0;

                if (windowRatio > targetRatio) {
                    scale = h / PLAYFIELD_HEIGHT;
                    offsetX = (w - PLAYFIELD_WIDTH * scale) / 2;
                } else {
                    scale = w / PLAYFIELD_WIDTH;
                    offsetY = (h - PLAYFIELD_HEIGHT * scale) / 2;
                }

                stage.layers.root.scale.set(scale, scale);
                stage.layers.root.position.set(Math.round(offsetX), Math.round(offsetY));
            };
            window.addEventListener('resize', handleResize);
            handleResize();  // Initial resize
            // Create physics world
            const physics = createPhysicsWorld({
                dimensions: { width: PLAYFIELD_WIDTH, height: PLAYFIELD_HEIGHT },
                gravity: 0
            });

            // Create game session manager
            const createSession = () => createGameSessionManager({
                sessionId: 'game-session',
                initialLives: 3,
                eventBus: bus,
            });
            let session = createSession();

            // Create scoring and power-up systems
            let scoringState = createScoring();
            const powerUpManager = new PowerUpManager();
            let currentLevelIndex = 0;
            let loop: ReturnType<typeof createGameLoop> | null = null;
            let isPaused = false;
            let levelDifficultyMultiplier = 1;
            let pendingReward: Reward | null = null;
            let activeReward: Reward | null = null;
            let doublePointsMultiplier = 1;
            let doublePointsTimer = 0;

            interface GhostBrickEffect {
                readonly body: Body;
                readonly restore: () => void;
                remaining: number;
            }

            const ghostBrickEffects: GhostBrickEffect[] = [];

            // Visuals and brick state tracking
            interface FallingPowerUp {
                readonly type: PowerUpType;
                readonly body: Body;
                readonly visual: Graphics;
            }

            const visualBodies = new Map<Body, Container>();
            const brickHealth = new Map<Body, number>();
            const brickMetadata = new Map<Body, BrickSpec>();
            const brickVisualState = new Map<Body, { baseColor: number; maxHp: number; currentHp: number }>();
            const activePowerUps: FallingPowerUp[] = [];
            const extraBalls = new Map<number, { body: Body; visual: Graphics }>();

            const removeBodyVisual = (body: Body): void => {
                const visual = visualBodies.get(body);
                if (!visual) {
                    return;
                }

                stage.removeFromLayer(visual);
                visualBodies.delete(body);
                brickVisualState.delete(body);
            };

            // Game configuration
            const BALL_BASE_SPEED = 8;
            const BALL_MAX_SPEED = 14;
            const BALL_LAUNCH_SPEED = 9;
            const MULTI_BALL_MULTIPLIER = 3;
            const BRICK_WIDTH = 100;
            const BRICK_HEIGHT = 40;
            const POWER_UP_RADIUS = 16;
            const POWER_UP_FALL_SPEED = 6;
            const POWER_UP_DURATION = 6;
            let powerUpChanceMultiplier = 1;
            let currentBaseSpeed = BALL_BASE_SPEED;
            let currentMaxSpeed = BALL_MAX_SPEED;
            let currentLaunchSpeed = BALL_LAUNCH_SPEED;
            let previousPaddlePosition = { x: HALF_PLAYFIELD_WIDTH, y: PLAYFIELD_HEIGHT - 70 };

            ballLight = createDynamicLight({
                speedForMaxIntensity: BALL_MAX_SPEED * 1.1,
            });
            ballLight.container.zIndex = 5;
            stage.addToLayer('effects', ballLight.container);

            paddleLight = createDynamicLight({
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
            paddleLight.container.zIndex = 4;
            paddleLight.container.alpha = 0.9;
            stage.addToLayer('effects', paddleLight.container);

            const updateBrickLighting = (ballPosition: { readonly x: number; readonly y: number }): void => {
                brickVisualState.forEach((state, body) => {
                    const visual = visualBodies.get(body);
                    if (!(visual instanceof Graphics)) {
                        return;
                    }

                    const dist = distance(ballPosition, body.position);
                    if (dist < BRICK_LIGHT_RADIUS) {
                        const proximity = 1 - dist / BRICK_LIGHT_RADIUS;
                        const eased = Math.pow(proximity, 0.75);
                        const tint = mixColors(0xffffff, state.baseColor, Math.min(1, 1 - eased * 0.85));
                        visual.tint = tint;
                        visual.alpha = Math.min(1.3, BRICK_REST_ALPHA + eased * 0.45);
                        visual.blendMode = 'add';
                    } else {
                        visual.tint = 0xffffff;
                        visual.alpha = BRICK_REST_ALPHA;
                        visual.blendMode = 'normal';
                    }
                });
            };

            // Function to load a level
            const removePowerUp = (powerUp: FallingPowerUp) => {
                physics.remove(powerUp.body);
                removeBodyVisual(powerUp.body);
                const index = activePowerUps.indexOf(powerUp);
                if (index >= 0) {
                    activePowerUps.splice(index, 1);
                }
            };

            const clearActivePowerUps = () => {
                while (activePowerUps.length > 0) {
                    removePowerUp(activePowerUps[activePowerUps.length - 1]);
                }
            };

            const removeExtraBallByBody = (body: Body) => {
                const entry = extraBalls.get(body.id);
                if (!entry) {
                    return;
                }

                physics.remove(entry.body);
                removeBodyVisual(entry.body);
                extraBalls.delete(entry.body.id);
            };

            const clearExtraBalls = () => {
                for (const entry of extraBalls.values()) {
                    physics.remove(entry.body);
                    removeBodyVisual(entry.body);
                }
                extraBalls.clear();
            };

            const clearGhostEffect = (body: Body) => {
                const index = ghostBrickEffects.findIndex((effect) => effect.body === body);
                if (index >= 0) {
                    ghostBrickEffects[index].restore();
                    ghostBrickEffects.splice(index, 1);
                }
            };

            const resetGhostBricks = () => {
                while (ghostBrickEffects.length > 0) {
                    ghostBrickEffects.pop()?.restore();
                }
            };

            const applyGhostBrickReward = (duration: number, count: number) => {
                resetGhostBricks();

                if (count <= 0) {
                    return;
                }

                const bricks = Array.from(brickHealth.keys()).filter((body) => body.label === 'brick');
                if (bricks.length === 0) {
                    return;
                }

                const selected = [...bricks]
                    .sort((lhs, rhs) => lhs.id - rhs.id)
                    .slice(0, Math.min(count, bricks.length));

                selected.forEach((body) => {
                    const originalSensor = body.isSensor;
                    body.isSensor = true;

                    const visual = visualBodies.get(body);
                    const originalAlpha = visual instanceof Graphics ? visual.alpha : undefined;
                    if (visual instanceof Graphics) {
                        visual.alpha = 0.35;
                    }

                    ghostBrickEffects.push({
                        body,
                        remaining: duration,
                        restore: () => {
                            body.isSensor = originalSensor;
                            if (visual instanceof Graphics && originalAlpha !== undefined) {
                                visual.alpha = originalAlpha;
                            }
                        },
                    });
                });
            };

            const activateReward = (reward: Reward | null) => {
                activeReward = reward;

                if (!reward) {
                    doublePointsMultiplier = 1;
                    doublePointsTimer = 0;
                    resetGhostBricks();
                    return;
                }

                doublePointsMultiplier = 1;
                doublePointsTimer = 0;
                resetGhostBricks();

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
                }
            };

            const spawnPowerUp = (type: PowerUpType, position: { readonly x: number; readonly y: number }) => {
                const body = Bodies.circle(position.x, position.y, POWER_UP_RADIUS, {
                    label: 'powerup',
                    isSensor: true,
                    frictionAir: 0,
                });

                MatterBody.setVelocity(body, { x: 0, y: POWER_UP_FALL_SPEED });
                physics.add(body);

                const colorMap: Record<PowerUpType, number> = {
                    'paddle-width': 0x00ffff,
                    'ball-speed': 0xffaa33,
                    'multi-ball': 0xff66cc,
                    'sticky-paddle': 0x66ff99,
                };

                const visual = new Graphics();
                visual.circle(0, 0, POWER_UP_RADIUS);
                visual.fill({ color: colorMap[type], alpha: 0.9 });
                visual.position.set(position.x, position.y);
                stage.addToLayer('effects', visual);

                visualBodies.set(body, visual);
                activePowerUps.push({ type, body, visual });
            };

            const findPowerUp = (body: Body): FallingPowerUp | null => {
                return activePowerUps.find((entry) => entry.body === body) ?? null;
            };

            const loadLevel = (levelIndex: number) => {
                resetGhostBricks();
                // Clear existing bricks
                visualBodies.forEach((_visual, body) => {
                    if (body.label === 'brick') {
                        physics.remove(body);
                        removeBodyVisual(body);
                        brickHealth.delete(body);
                        brickMetadata.delete(body);
                        brickVisualState.delete(body);
                    }
                });
                brickVisualState.clear();

                clearActivePowerUps();
                brickLayoutBounds = null;

                // Generate new level layout
                const baseSpec = getLevelSpec(levelIndex);
                const loopCount = Math.floor(levelIndex / PRESET_LEVEL_COUNT);
                const effectiveSpec = loopCount > 0 ? remixLevel(baseSpec, loopCount) : baseSpec;
                const layout = generateLevelLayout(effectiveSpec, BRICK_WIDTH, BRICK_HEIGHT, PLAYFIELD_WIDTH);
                powerUpChanceMultiplier = effectiveSpec.powerUpChanceMultiplier ?? 1;
                levelDifficultyMultiplier = getLevelDifficultyMultiplier(levelIndex);

                // Create bricks from layout
                const layoutBounds = {
                    minX: Number.POSITIVE_INFINITY,
                    maxX: Number.NEGATIVE_INFINITY,
                    minY: Number.POSITIVE_INFINITY,
                    maxY: Number.NEGATIVE_INFINITY,
                };

                layout.bricks.forEach((brickSpec) => {
                    const brick = physics.factory.brick({
                        size: { width: BRICK_WIDTH, height: BRICK_HEIGHT },
                        position: { x: brickSpec.x, y: brickSpec.y },
                    });
                    physics.add(brick);

                    const paletteColor = rowColors[brickSpec.row % rowColors.length];
                    const maxHp = Math.max(1, brickSpec.hp);
                    const initialColor = computeBrickFillColor(paletteColor, maxHp, maxHp);
                    const brickVisual = new Graphics();
                    paintBrickVisual(brickVisual, BRICK_WIDTH, BRICK_HEIGHT, initialColor, 0);
                    brickVisual.position.set(brickSpec.x, brickSpec.y);
                    brickVisual.zIndex = 5;
                    brickVisual.eventMode = 'none';
                    visualBodies.set(brick, brickVisual);
                    stage.layers.playfield.addChild(brickVisual);

                    brickHealth.set(brick, maxHp);
                    brickMetadata.set(brick, brickSpec);
                    brickVisualState.set(brick, { baseColor: paletteColor, maxHp, currentHp: maxHp });

                    layoutBounds.minX = Math.min(layoutBounds.minX, brickSpec.x - BRICK_WIDTH / 2);
                    layoutBounds.maxX = Math.max(layoutBounds.maxX, brickSpec.x + BRICK_WIDTH / 2);
                    layoutBounds.minY = Math.min(layoutBounds.minY, brickSpec.y - BRICK_HEIGHT / 2);
                    layoutBounds.maxY = Math.max(layoutBounds.maxY, brickSpec.y + BRICK_HEIGHT / 2);
                });

                if (layout.bricks.length > 0) {
                    brickLayoutBounds = layoutBounds;
                    positionHud();
                }

                // Start the round
                session.startRound({ breakableBricks: layout.breakableCount });
            };

            // Add collision event handling
            Events.on(physics.engine, 'collisionStart', (event: IEventCollision<Engine>) => {
                event.pairs.forEach((pair) => {
                    const { bodyA, bodyB } = pair;
                    const sessionId = session.snapshot().sessionId;

                    // Brick contact
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

                            const brickVisual = visualBodies.get(brick);
                            if (brickVisual instanceof Graphics) {
                                const visualState = brickVisualState.get(brick);
                                if (visualState) {
                                    visualState.currentHp = nextHp;
                                    const fillColor = computeBrickFillColor(visualState.baseColor, nextHp, visualState.maxHp);
                                    const damageLevel = visualState.maxHp > 0 ? 1 - (nextHp / visualState.maxHp) : 0;
                                    paintBrickVisual(brickVisual, BRICK_WIDTH, BRICK_HEIGHT, fillColor, damageLevel);
                                }
                            }

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
                                brickType: 'standard', // TODO: Should be dynamic once types exist
                                initialHp,
                            });

                            const basePoints = awardBrickPoints(scoringState);
                            let points = basePoints;
                            if (doublePointsMultiplier > 1) {
                                const bonus = Math.round(basePoints * (doublePointsMultiplier - 1));
                                points += bonus;
                                scoringState.score += bonus;
                            }
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
                            if (shouldSpawnPowerUp({ spawnChance })) {
                                const powerUpType = selectRandomPowerUpType();
                                spawnPowerUp(powerUpType, { x: brick.position.x, y: brick.position.y });
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

                    // Paddle-ball collision with advanced reflection
                    if ((bodyA.label === 'ball' && bodyB.label === 'paddle') || (bodyA.label === 'paddle' && bodyB.label === 'ball')) {
                        const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;
                        const paddleBody = bodyA.label === 'paddle' ? bodyA : bodyB;
                        const reflectionData = calculateReflectionData(
                            ballBody.position.x,
                            paddleBody.position.x,
                            {
                                paddleWidth: paddle.width,
                                minSpeed: currentBaseSpeed,
                            },
                        );
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
                            // Apply paddle reflection
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

                    // Ball colliding with arena walls
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

                    // Ball hitting bottom (lose life)
                    if ((bodyA.label === 'ball' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'ball')) {
                        const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;

                        if (extraBalls.has(ballBody.id)) {
                            removeExtraBallByBody(ballBody);
                            return;
                        }

                        if (promoteExtraBallToPrimary(ballBody)) {
                            return;
                        }

                        // Lose a life and reset combo
                        session.recordLifeLost('ball-drop');
                        resetCombo(scoringState);

                        if (session.snapshot().livesRemaining > 0) {
                            // Reset ball to paddle
                            clearExtraBalls();
                            reattachBallToPaddle();
                        } else {
                            handleGameOver();
                        }
                    }

                    // Power-up collected by paddle
                    if ((bodyA.label === 'powerup' && bodyB.label === 'paddle') || (bodyA.label === 'paddle' && bodyB.label === 'powerup')) {
                        const powerUpBody = bodyA.label === 'powerup' ? bodyA : bodyB;
                        const entry = findPowerUp(powerUpBody);
                        if (entry) {
                            powerUpManager.activate(entry.type, { defaultDuration: POWER_UP_DURATION });
                            removePowerUp(entry);
                            handlePowerUpActivation(entry.type);
                        }
                    }

                    // Power-up missed
                    if ((bodyA.label === 'powerup' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'powerup')) {
                        const powerUpBody = bodyA.label === 'powerup' ? bodyA : bodyB;
                        const entry = findPowerUp(powerUpBody);
                        if (entry) {
                            removePowerUp(entry);
                        }
                    }
                });
            });

            // Create HUD container
            const hudContainer = new Container();
            hudContainer.eventMode = 'none';
            stage.layers.hud.addChild(hudContainer);
            hudContainer.visible = false;

            const hudDisplay = createHudDisplay(GameTheme);
            hudContainer.addChild(hudDisplay.container);

            let brickLayoutBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

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

                const placements: Array<{ priority: number; scale: number; x: number; y: number }> = [];

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
                        default:
                            return 'Lucky Reward';
                    }
                })();

                let remaining = 0;
                switch (activeReward.type) {
                    case 'double-points':
                        remaining = Math.max(0, doublePointsTimer);
                        break;
                    case 'ghost-brick':
                        remaining = ghostBrickEffects.reduce((max, effect) => Math.max(max, effect.remaining), 0);
                        break;
                    case 'sticky-paddle': {
                        const sticky = powerUpManager.getEffect('sticky-paddle');
                        remaining = sticky ? Math.max(0, sticky.remainingTime) : 0;
                        break;
                    }
                    default:
                        remaining = 0;
                        break;
                }

                if (remaining <= 0 && activeReward.type !== 'sticky-paddle') {
                    return { label };
                }

                return {
                    label,
                    remaining: remaining > 0 ? `${remaining.toFixed(1)}s` : undefined,
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

            const backgroundTexture = starfieldTexture ?? Texture.WHITE;
            playfieldBackgroundLayer = createPlayfieldBackgroundLayer(backgroundTexture);
            stage.addToLayer('playfield', playfieldBackgroundLayer.container);

            // Create game objects container
            const gameContainer = new Container();
            gameContainer.zIndex = 10;
            stage.addToLayer('playfield', gameContainer);
            gameContainer.visible = false;
            gameContainer.sortableChildren = true;

            // Add some initial game objects for testing
            const bounds = physics.factory.bounds();
            physics.add(bounds);

            const SHOW_BOUNDARY_OVERLAY = false;

            if (SHOW_BOUNDARY_OVERLAY) {
                bounds.forEach(bound => {
                    const graphics = new Graphics();
                    graphics.rect(bound.position.x - bound.bounds.max.x + bound.bounds.min.x,
                        bound.position.y - bound.bounds.max.y + bound.bounds.min.y,
                        bound.bounds.max.x - bound.bounds.min.x,
                        bound.bounds.max.y - bound.bounds.min.y);
                    graphics.fill({ color: 0x111111, alpha: 0.45 });
                    graphics.eventMode = 'none';
                    gameContainer.addChild(graphics);
                    visualBodies.set(bound, graphics);
                });
            }

            // Create controllers
            const ballController = new BallAttachmentController();
            const paddleController = new PaddleBodyController();
            const inputManager = new GameInputManager();
            const launchController = new PhysicsBallLaunchController();

            // Create paddle first at center bottom
            const paddle = paddleController.createPaddle(
                { x: HALF_PLAYFIELD_WIDTH, y: PLAYFIELD_HEIGHT - 70 },
                { width: 100, height: 20, speed: 300 }
            );
            physics.add(paddle.physicsBody);
            previousPaddlePosition = { x: paddle.position.x, y: paddle.position.y };

            // Create ball attached to paddle
            const ball = ballController.createAttachedBall(
                paddleController.getPaddleCenter(paddle),
                { radius: 10, restitution: 0.98 }
            );
            physics.add(ball.physicsBody);

            // Create visual ball
            const comboRing = new Graphics();
            comboRing.eventMode = 'none';
            comboRing.visible = false;
            comboRing.alpha = 0;
            comboRing.blendMode = 'add';
            comboRing.zIndex = 40;
            gameContainer.addChild(comboRing);

            const ballGraphics = new Graphics();
            drawBallVisual(ballGraphics, ball.radius);
            ballGraphics.eventMode = 'none';
            ballGraphics.zIndex = 50;
            const ballGlowFilter = new GlowFilter({ distance: 18, outerStrength: 1.4, innerStrength: 0, color: themeBallColors.highlight, quality: 0.3 });
            const ballHueFilter = new ColorMatrixFilter();
            ballGraphics.filters = [ballGlowFilter as unknown as Filter, ballHueFilter];
            gameContainer.addChild(ballGraphics);
            visualBodies.set(ball.physicsBody, ballGraphics);

            // Create visual paddle
            const paddleGraphics = new Graphics();
            drawPaddleVisual(paddleGraphics, paddle.width, paddle.height);
            paddleGraphics.eventMode = 'none';
            paddleGraphics.zIndex = 60;
            const paddleGlowFilter = new GlowFilter({ distance: 14, outerStrength: 1.2, innerStrength: 0, color: themePaddleGradient[1] ?? themeBallColors.aura, quality: 0.3 });
            paddleGraphics.filters = [paddleGlowFilter as unknown as Filter];
            gameContainer.addChild(paddleGraphics);
            visualBodies.set(paddle.physicsBody, paddleGraphics);

            // Initialize input manager AFTER preloader completes to avoid capturing the "Tap to Start" click
            inputManager.initialize(container);

            // Helper to convert canvas coordinates to playfield (PLAYFIELD_WIDTH × PLAYFIELD_HEIGHT) coordinates
            const toPlayfield = (canvasPt: { x: number; y: number }) => {
                const root = stage.layers.root;
                const s = root.scale.x; // uniform scale
                return {
                    x: (canvasPt.x - root.position.x) / s,
                    y: (canvasPt.y - root.position.y) / s,
                };
            };

            function reattachBallToPaddle(): void {
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
            }

            function startLevel(levelIndex: number, options: { resetScore?: boolean } = {}): void {
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
                if (pendingReward) {
                    activateReward(pendingReward);
                    pendingReward = null;
                } else {
                    activateReward(null);
                }
                reattachBallToPaddle();
                refreshHud();
            }

            function handleLevelComplete(): void {
                clearExtraBalls();
                isPaused = false;
                loop?.stop();
                pendingReward = spinWheel();

                const completedLevel = currentLevelIndex + 1;
                let handled = false;
                const continueToNextLevel = async () => {
                    if (handled) {
                        return;
                    }
                    handled = true;
                    currentLevelIndex += 1;
                    startLevel(currentLevelIndex);
                    await stage.transitionTo('gameplay');
                    loop?.start();
                };

                void stage.transitionTo('level-complete', {
                    level: completedLevel,
                    score: scoringState.score,
                    reward: pendingReward ?? undefined,
                    onContinue: continueToNextLevel,
                });
            }

            function handleGameOver(): void {
                clearExtraBalls();
                isPaused = false;
                loop?.stop();
                pendingReward = null;
                activateReward(null);
                void stage.transitionTo('game-over', { score: scoringState.score });
            }

            const collectBallBodies = (): Body[] => {
                return [
                    ball.physicsBody,
                    ...Array.from(extraBalls.values()).map((entry) => entry.body),
                ];
            };

            const createAngularOffsets = (count: number): number[] => {
                if (count <= 0) {
                    return [];
                }
                if (count === 1) {
                    return [0.25];
                }

                const spread = 0.35;
                const midpoint = (count - 1) / 2;
                return Array.from({ length: count }, (_, index) => (index - midpoint) * spread);
            };

            const spawnExtraBalls = () => {
                const sourceBodies = collectBallBodies();
                const clonesPerBall = MULTI_BALL_MULTIPLIER - 1;

                if (clonesPerBall <= 0 || sourceBodies.length === 0) {
                    return;
                }

                sourceBodies.forEach((sourceBody) => {
                    const baseVelocity = sourceBody.velocity;
                    const baseSpeed = MatterVector.magnitude(baseVelocity);
                    const hasMotion = baseSpeed > 0.01;
                    const direction = hasMotion ? MatterVector.normalise(baseVelocity) : MatterVector.create(0, -1);
                    const speed = hasMotion ? baseSpeed : currentLaunchSpeed;
                    const effectiveSpeed = Math.max(currentLaunchSpeed, speed);
                    const offsets = createAngularOffsets(clonesPerBall);

                    offsets.forEach((offset, index) => {
                        const rotated = MatterVector.rotate(MatterVector.clone(direction), offset);
                        const velocity = MatterVector.mult(rotated, effectiveSpeed);
                        const lateralNormal = { x: -rotated.y, y: rotated.x };
                        const separation = (index - (offsets.length - 1) / 2) * 12;
                        const spawnPosition = {
                            x: sourceBody.position.x + lateralNormal.x * separation,
                            y: sourceBody.position.y + lateralNormal.y * separation,
                        };

                        const extraBody = physics.factory.ball({
                            radius: ball.radius,
                            position: spawnPosition,
                            restitution: 0.98,
                        });

                        MatterBody.setVelocity(extraBody, velocity);
                        physics.add(extraBody);

                        const extraVisual = new Graphics();
                        drawBallVisual(extraVisual, ball.radius, {
                            baseColor: mixColors(themeBallColors.core, 0xffc94c, 0.5),
                            baseAlpha: 0.8,
                            rimColor: themeBallColors.highlight,
                            rimAlpha: 0.5,
                            innerColor: themeBallColors.aura,
                            innerAlpha: 0.4,
                            innerScale: 0.5,
                        });
                        extraVisual.eventMode = 'none';
                        gameContainer.addChild(extraVisual);
                        visualBodies.set(extraBody, extraVisual);
                        extraBalls.set(extraBody.id, { body: extraBody, visual: extraVisual });
                    });
                });
            };

            // Promote a surviving extra ball when the primary ball exits the playfield
            const promoteExtraBallToPrimary = (expiredBody: Body): boolean => {
                const iterator = extraBalls.entries().next();
                if (iterator.done) {
                    return false;
                }

                const [extraId, extra] = iterator.value;
                extraBalls.delete(extraId);

                visualBodies.delete(expiredBody);
                physics.remove(expiredBody);

                if (extra.visual.parent) {
                    extra.visual.parent.removeChild(extra.visual);
                }
                extra.visual.destroy();

                ball.physicsBody = extra.body;
                ball.isAttached = false;
                ball.attachmentOffset = { x: 0, y: -ball.radius - paddle.height / 2 };

                visualBodies.set(extra.body, ballGraphics);
                ballGraphics.x = extra.body.position.x;
                ballGraphics.y = extra.body.position.y;
                ballGraphics.rotation = extra.body.angle;

                return true;
            };

            function handlePowerUpActivation(type: PowerUpType): void {
                ballLight?.flash(0.5);
                paddleLight?.flash(0.45);
                if (type === 'multi-ball') {
                    spawnExtraBalls();
                }
            }

            const runGameplayUpdate = (deltaSeconds: number): void => {
                // Update power-ups
                powerUpManager.update(deltaSeconds);

                const speedMultiplier = calculateBallSpeedScale(
                    powerUpManager.getEffect('ball-speed'),
                );
                const difficultyScale = levelDifficultyMultiplier;
                currentBaseSpeed = BALL_BASE_SPEED * speedMultiplier * difficultyScale;
                currentMaxSpeed = BALL_MAX_SPEED * speedMultiplier * difficultyScale;
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

                for (let index = ghostBrickEffects.length - 1; index >= 0; index -= 1) {
                    const effect = ghostBrickEffects[index];
                    effect.remaining -= deltaSeconds;
                    if (effect.remaining <= 0) {
                        effect.restore();
                        ghostBrickEffects.splice(index, 1);
                    }
                }

                if (ghostBrickEffects.length === 0 && activeReward?.type === 'ghost-brick') {
                    activeReward = null;
                }

                if (activeReward?.type === 'sticky-paddle' && !powerUpManager.isActive('sticky-paddle')) {
                    activeReward = null;
                }

                // Update paddle size based on power-ups
                const paddleScale = calculatePaddleWidthScale(
                    powerUpManager.getEffect('paddle-width'),
                    { paddleWidthMultiplier: 1.5 }
                );
                const basePaddleWidth = 100;
                paddle.width = basePaddleWidth * paddleScale;

                // Update paddle visual to reflect new width or power-up state
                const paddleWidthActive = powerUpManager.isActive('paddle-width');
                const paddlePulseInfluence = Math.min(1, paddleGlowPulse);
                const paddlePulseLevel = Math.max(paddleWidthActive ? 0.65 : 0, paddlePulseInfluence * 0.85);
                const paddleAccentColor = paddleWidthActive
                    ? themeAccents.powerUp
                    : (paddlePulseInfluence > 0 ? mixColors(themeBallColors.aura, themeAccents.powerUp, paddlePulseInfluence) : undefined);

                drawPaddleVisual(paddleGraphics, paddle.width, paddle.height, {
                    accentColor: paddleAccentColor,
                    pulseStrength: paddlePulseLevel,
                });

                // Decay combo timer
                decayCombo(scoringState, deltaSeconds);

                // Process input
                const paddleTarget = inputManager.getPaddleTarget();
                if (paddleTarget) {
                    const pf = toPlayfield(paddleTarget);

                    const targetX = pf.x;
                    const halfPaddleWidth = paddle.width / 2;
                    const clampedX = Math.max(halfPaddleWidth, Math.min(targetX, PLAYFIELD_WIDTH - halfPaddleWidth));
                    MatterBody.setPosition(paddle.physicsBody, { x: clampedX, y: paddle.physicsBody.position.y });
                    paddle.position.x = clampedX;
                }

                // Ensure paddle state stays synchronized with physics body
                paddle.position.y = paddle.physicsBody.position.y;

                const paddleCenter = paddleController.getPaddleCenter(paddle);
                const safeDelta = deltaSeconds > 0 ? deltaSeconds : 1 / 240;
                const paddleDelta = Math.hypot(
                    paddleCenter.x - previousPaddlePosition.x,
                    paddleCenter.y - previousPaddlePosition.y,
                );
                const paddleSpeed = paddleDelta / safeDelta;
                if (paddleLight) {
                    paddleLight.update({
                        position: { x: paddleCenter.x, y: paddleCenter.y },
                        speed: paddleSpeed,
                        deltaSeconds,
                    });
                }
                previousPaddlePosition = { x: paddleCenter.x, y: paddleCenter.y };

                // Update ball attachment to follow paddle
                ballController.updateAttachment(ball, paddleCenter);
                if (ball.isAttached) {
                    physics.updateBallAttachment(ball.physicsBody, paddleCenter);
                }

                if (ball.isAttached) {
                    inputManager.syncPaddlePosition(paddleCenter);
                }

                // Check for launch triggers (tap/click only)
                if (ball.isAttached && inputManager.shouldLaunch()) {
                    physics.detachBallFromPaddle(ball.physicsBody);
                    launchController.launch(ball, undefined, currentLaunchSpeed);
                    inputManager.resetLaunchTrigger();
                }

                // Regulate ball speed before stepping physics to minimize collision spikes
                regulateSpeed(ball.physicsBody, {
                    baseSpeed: currentBaseSpeed,
                    maxSpeed: currentMaxSpeed,
                });

                physics.step(deltaSeconds * 1000);

                // Update visual positions to match physics bodies
                visualBodies.forEach((visual, body) => {
                    visual.x = body.position.x;
                    visual.y = body.position.y;
                    visual.rotation = body.angle;
                });

                if (playfieldBackgroundLayer) {
                    const tiling = playfieldBackgroundLayer.tiling;
                    const parallaxX = (ball.physicsBody.position.x - HALF_PLAYFIELD_WIDTH) * 0.05 * deltaSeconds;
                    const parallaxY = (ball.physicsBody.position.y - PLAYFIELD_HEIGHT * 0.5) * 0.03 * deltaSeconds;
                    tiling.tilePosition.x += deltaSeconds * STARFIELD_SCROLL_SPEED.x + parallaxX;
                    tiling.tilePosition.y += deltaSeconds * STARFIELD_SCROLL_SPEED.y + parallaxY;
                }

                updateBrickLighting(ball.physicsBody.position);

                if (ballLight) {
                    ballLight.update({
                        position: { x: ball.physicsBody.position.x, y: ball.physicsBody.position.y },
                        speed: MatterVector.magnitude(ball.physicsBody.velocity),
                        deltaSeconds,
                    });
                }

                // Animate reactive glow and combo ring visuals
                const comboActive = scoringState.combo >= 2 && scoringState.comboTimer > 0;
                const comboIntensity = comboActive ? clampUnit(scoringState.combo / 14) : 0;
                const comboTimerFactor = comboActive ? clampUnit(scoringState.comboTimer / COMBO_DECAY_WINDOW) : 0;
                const comboEnergy = Math.min(1.15, comboRingPulse * 0.85 + comboIntensity * 0.6 + comboTimerFactor * 0.45);
                if (comboEnergy > 0) {
                    const comboPhaseSpeed = 2.4 + comboIntensity * 3 + comboRingPulse * 2.5;
                    comboRingPhase = (comboRingPhase + deltaSeconds * comboPhaseSpeed) % (Math.PI * 2);
                }

                const shouldDisplayComboRing = comboEnergy > 0.02;
                if (shouldDisplayComboRing) {
                    const ringPos = ball.physicsBody.position;
                    comboRing.visible = true;
                    comboRing.position.set(ringPos.x, ringPos.y);
                    comboRing.alpha = 0.25 + comboEnergy * 0.45;

                    const baseRadius = ball.radius * (2 + comboIntensity * 0.55);
                    const wobble = Math.sin(comboRingPhase * 2) * 0.18;
                    const radius = baseRadius * (1 + wobble) + comboEnergy * ball.radius * 0.4;

                    const outerColor = mixColors(themeBallColors.highlight, themeAccents.combo, Math.min(1, comboEnergy * 0.7));
                    const innerColor = mixColors(themeAccents.combo, themeBallColors.aura, 0.3 + comboEnergy * 0.4);
                    const outerWidth = 3.5 + comboEnergy * 6;
                    const innerWidth = 1.5 + comboEnergy * 3;

                    comboRing.clear();
                    comboRing.circle(0, 0, radius);
                    comboRing.fill({ color: innerColor, alpha: 0.05 + comboEnergy * 0.12 });
                    comboRing.circle(0, 0, radius);
                    comboRing.stroke({ color: outerColor, width: outerWidth, alpha: 0.35 + comboEnergy * 0.4 });
                    comboRing.circle(0, 0, radius * (0.72 + Math.sin(comboRingPhase) * 0.04));
                    comboRing.stroke({ color: innerColor, width: innerWidth, alpha: 0.28 + comboEnergy * 0.32 });
                } else if (comboRing.visible) {
                    comboRing.visible = false;
                    comboRing.alpha = 0;
                    comboRing.clear();
                }

                const ballPulse = Math.min(1, comboEnergy * 0.5 + ballGlowPulse);
                const ballHueSpeed = 24 + comboEnergy * 120 + ballPulse * 90;
                ballHueShift = (ballHueShift + deltaSeconds * ballHueSpeed) % 360;
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

            const beginNewSession = async (): Promise<void> => {
                if (loop?.isRunning()) {
                    loop.stop();
                }

                session = createSession();
                currentLevelIndex = 0;
                pendingReward = null;
                activateReward(null);
                levelDifficultyMultiplier = 1;
                startLevel(currentLevelIndex, { resetScore: true });
                await stage.transitionTo('gameplay');
                loop?.start();
            };

            stage.register('main-menu', (context: SceneContext) => createMainMenuScene(context, {
                helpText: [
                    'Drag or use arrow keys to aim the paddle',
                    'Tap, space, or click to launch the ball',
                    'Stack power-ups for massive combos',
                ],
                onStart: () => beginNewSession(),
            }));

            stage.register('gameplay', (context: SceneContext) => createGameplayScene(context, {
                onUpdate: runGameplayUpdate,
            }));

            const quitLabel = 'Tap here or press Q to quit to menu';

            stage.register('pause', (context: SceneContext) => createPauseScene(context, {
                resumeLabel: 'Tap to resume',
                quitLabel,
            }));

            stage.register('level-complete', (context: SceneContext) => createLevelCompleteScene(context, {
                prompt: 'Tap to continue',
            }));

            stage.register('game-over', (context: SceneContext) => createGameOverScene(context, {
                prompt: 'Tap to restart',
                onRestart: () => beginNewSession(),
            }));

            await stage.transitionTo('main-menu', undefined, { skipFadeOut: true });
            gameContainer.visible = false;
            hudContainer.visible = false;

            const quitToMenu = async () => {
                if (!loop) {
                    return;
                }

                isPaused = false;
                gameContainer.visible = false;
                hudContainer.visible = false;
                await stage.transitionTo('main-menu');
            };

            const resumeFromPause = async () => {
                if (!loop || !isPaused) {
                    return;
                }

                isPaused = false;
                await stage.transitionTo('gameplay');
                loop.start();
            };

            const pauseGame = () => {
                if (!loop || isPaused || !loop.isRunning()) {
                    return;
                }

                isPaused = true;
                loop.stop();
                void stage.transitionTo('pause', {
                    score: scoringState.score,
                    legendTitle: 'Power-Up Legend',
                    legendLines: pauseLegendLines,
                    onResume: () => resumeFromPause(),
                    onQuit: () => quitToMenu(),
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

            // Add dispose on unload (optional):
            window.addEventListener('beforeunload', () => {
                router.dispose();
                scheduler.dispose();
                reactiveAudioLayer.dispose();
                audioState$.complete();
                brickPlayers.dispose();
                volume.dispose();
                panner.dispose();
                ballLight?.destroy();
                paddleLight?.destroy();
                ballLight = null;
                paddleLight = null;
                document.removeEventListener('keydown', handleGlobalKeyDown);
            });
        }
    });

    preloader.prepare().catch(console.error);
}

const container = document.getElementById('app');
if (container) {
    bootstrapLuckyBreak({ container });
}
