import { createPreloader } from './preloader';
import { createSceneManager } from 'render/scene-manager';
import { createPhysicsWorld } from 'physics/world';
import { createGameLoop } from './loop';
import { createGameSessionManager } from './state';
import { buildHudScoreboard } from 'render/hud';
import { createDynamicLight } from 'render/effects/dynamic-light';
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
import { Text, Container, Graphics, Assets, TilingSprite, Texture } from 'pixi.js';
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
    const rowColors = [0x7fdbff, 0x39cccc, 0x85144b, 0x3498db] as const;
    const STARFIELD_SCROLL_SPEED = { x: 8, y: 4 } as const;
    const fontDescriptors = [
        '400 32px "Overpass"',
        '600 56px "Overpass"',
        '700 64px "Overpass"',
    ] as const;
    const STARFIELD_TEXTURE_DEF = {
        alias: 'starfield-background',
        src: new URL('../../assets/Starfield_08-512x512.png', import.meta.url).href,
    } as const;

    let starfieldTexture: Texture | null = null;
    let playfieldBackgroundLayer: { container: Container; tiling: TilingSprite } | null = null;

    interface BallVisualPalette {
        readonly baseColor: number;
        readonly baseAlpha?: number;
        readonly rimColor?: number;
        readonly rimAlpha?: number;
        readonly innerColor?: number;
        readonly innerAlpha?: number;
        readonly innerScale?: number;
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
        return mixColors(baseColor, 0xfff4d3, damageInfluence * 0.6);
    };

    const paintBrickVisual = (graphics: Graphics, width: number, height: number, color: number): void => {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const highlightHeight = height * 0.35;

        graphics.clear();
        graphics.rect(-halfWidth, -halfHeight, width, height);
        graphics.fill({ color, alpha: 0.95 });
        graphics.stroke({ color: 0xffffff, width: 2, alpha: 0.18 });

        graphics.rect(-halfWidth, -halfHeight, width, highlightHeight);
        graphics.fill({ color: 0xffffff, alpha: 0.16 });

        graphics.rect(-halfWidth, halfHeight - highlightHeight, width, highlightHeight);
        graphics.fill({ color: 0x000000, alpha: 0.12 });

        graphics.alpha = BRICK_REST_ALPHA;
        graphics.tint = 0xffffff;
    };

    const drawBallVisual = (graphics: Graphics, radius: number, palette?: BallVisualPalette): void => {
        const settings: Required<BallVisualPalette> = {
            baseColor: palette?.baseColor ?? 0xff4136,
            baseAlpha: palette?.baseAlpha ?? 0.72,
            rimColor: palette?.rimColor ?? 0xff7256,
            rimAlpha: palette?.rimAlpha ?? 0.32,
            innerColor: palette?.innerColor ?? 0xffffff,
            innerAlpha: palette?.innerAlpha ?? 0.25,
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

    const drawPaddleVisual = (graphics: Graphics, width: number, height: number, baseColor: number): void => {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const shineHeight = height * 0.4;

        graphics.clear();
        graphics.rect(-halfWidth, -halfHeight, width, height);
        graphics.fill({ color: baseColor, alpha: 0.9 });
        graphics.stroke({ color: 0xffffff, width: 2, alpha: 0.3 });

        graphics.rect(-halfWidth, -halfHeight, width, shineHeight);
        graphics.fill({ color: 0xffffff, alpha: 0.15 });

        graphics.rect(-halfWidth, halfHeight - shineHeight * 0.75, width, shineHeight * 0.75);
        graphics.fill({ color: 0x003322, alpha: 0.12 });

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
            const stage = await createSceneManager({ parent: container });

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

            const dynamicLight = createDynamicLight({
                speedForMaxIntensity: BALL_MAX_SPEED * 1.1,
            });
            dynamicLight.container.zIndex = 5;
            stage.addToLayer('effects', dynamicLight.container);

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

                // Generate new level layout
                const baseSpec = getLevelSpec(levelIndex);
                const loopCount = Math.floor(levelIndex / PRESET_LEVEL_COUNT);
                const effectiveSpec = loopCount > 0 ? remixLevel(baseSpec, loopCount) : baseSpec;
                const layout = generateLevelLayout(effectiveSpec, BRICK_WIDTH, BRICK_HEIGHT, PLAYFIELD_WIDTH);
                powerUpChanceMultiplier = effectiveSpec.powerUpChanceMultiplier ?? 1;
                levelDifficultyMultiplier = getLevelDifficultyMultiplier(levelIndex);

                // Create bricks from layout
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
                    paintBrickVisual(brickVisual, BRICK_WIDTH, BRICK_HEIGHT, initialColor);
                    brickVisual.position.set(brickSpec.x, brickSpec.y);
                    brickVisual.zIndex = 5;
                    brickVisual.eventMode = 'none';
                    visualBodies.set(brick, brickVisual);
                    stage.layers.playfield.addChild(brickVisual);

                    brickHealth.set(brick, maxHp);
                    brickMetadata.set(brick, brickSpec);
                    brickVisualState.set(brick, { baseColor: paletteColor, maxHp, currentHp: maxHp });
                });

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
                                    paintBrickVisual(brickVisual, BRICK_WIDTH, BRICK_HEIGHT, fillColor);
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

                        dynamicLight.flash();

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
            stage.layers.hud.addChild(hudContainer);
            hudContainer.visible = false;

            const pauseLegendLines = [
                'Cyan Paddle Width - Widens your paddle for extra coverage.',
                'Orange Ball Speed - Speeds up the ball and boosts scoring.',
                'Pink Multi Ball - Splits the active ball into additional balls.',
                'Green Sticky Paddle - Catches the ball until you launch again.',
            ] as const;

            const refreshHud = () => {
                const snapshot = session.snapshot();
                const hudView = buildHudScoreboard(snapshot);

                hudContainer.removeChildren();

                const statusText = new Text({
                    text: hudView.statusText,
                    style: {
                        fill: 0xffffff,
                        fontSize: 18,
                        letterSpacing: 1,
                        dropShadow: {
                            color: 0x000000,
                            distance: 2,
                            blur: 4,
                            alpha: 0.6,
                            angle: Math.PI / 2,
                        },
                    }
                });
                statusText.x = 20;
                statusText.y = 20;
                hudContainer.addChild(statusText);

                if (hudView.summaryLine) {
                    const summaryText = new Text({
                        text: hudView.summaryLine,
                        style: {
                            fill: 0x7fdbff,
                            fontSize: 14,
                            dropShadow: {
                                color: 0x000000,
                                distance: 1,
                                blur: 3,
                                alpha: 0.45,
                                angle: Math.PI / 2,
                            },
                        }
                    });
                    summaryText.x = 20;
                    summaryText.y = 50;
                    hudContainer.addChild(summaryText);
                }

                hudView.entries.forEach((entry, index) => {
                    const entryText = new Text({
                        text: `${entry.label}: ${entry.value}`,
                        style: {
                            fill: 0xffffff,
                            fontSize: 13,
                            dropShadow: {
                                color: 0x000000,
                                distance: 1,
                                blur: 2,
                                alpha: 0.5,
                                angle: Math.PI / 2,
                            },
                        }
                    });
                    entryText.x = 20;
                    entryText.y = 80 + index * 20;
                    hudContainer.addChild(entryText);
                });

                const difficultyText = new Text({
                    text: `Difficulty: x${levelDifficultyMultiplier.toFixed(2)}`,
                    style: {
                        fill: 0x88ccff,
                        fontSize: 12,
                        dropShadow: {
                            color: 0x000000,
                            distance: 1,
                            blur: 2,
                            alpha: 0.45,
                            angle: Math.PI / 2,
                        },
                    }
                });
                difficultyText.x = 20;
                difficultyText.y = 80 + hudView.entries.length * 20 + 5;
                hudContainer.addChild(difficultyText);

                if (scoringState.combo > 0) {
                    const comboText = new Text({
                        text: `Combo: ${scoringState.combo}x (${scoringState.comboTimer.toFixed(1)}s)`,
                        style: {
                            fill: 0xffe066,
                            fontSize: 16,
                            fontWeight: 'bold',
                            dropShadow: {
                                color: 0x000000,
                                distance: 2,
                                blur: 4,
                                alpha: 0.6,
                                angle: Math.PI / 2,
                            },
                        }
                    });
                    comboText.x = 20;
                    comboText.y = difficultyText.y + 20;
                    hudContainer.addChild(comboText);
                }

                const activePowerUpsView = powerUpManager.getActiveEffects();
                const powerUpBaseY = difficultyText.y + 40;
                activePowerUpsView.forEach((effect, index) => {
                    const powerUpText = new Text({
                        text: `${effect.type}: ${effect.remainingTime.toFixed(1)}s`,
                        style: {
                            fill: 0x00ffff,
                            fontSize: 12,
                            dropShadow: {
                                color: 0x000000,
                                distance: 1,
                                blur: 2,
                                alpha: 0.5,
                                angle: Math.PI / 2,
                            },
                        }
                    });
                    powerUpText.x = 20;
                    powerUpText.y = powerUpBaseY + index * 18;
                    hudContainer.addChild(powerUpText);
                });

                const rewardYOffset = powerUpBaseY + activePowerUpsView.length * 18 + 10;
                if (activeReward) {
                    const rewardLabel = (() => {
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
                    if (activeReward.type === 'double-points') {
                        remaining = doublePointsTimer;
                    } else if (activeReward.type === 'ghost-brick') {
                        remaining = ghostBrickEffects.reduce((max, effect) => Math.max(max, effect.remaining), 0);
                    } else if (activeReward.type === 'sticky-paddle') {
                        remaining = powerUpManager.getEffect('sticky-paddle')?.remainingTime ?? 0;
                    }

                    if (remaining > 0 || activeReward.type === 'sticky-paddle') {
                        const rewardText = new Text({
                            text: `Reward: ${rewardLabel}${remaining > 0 ? ` (${remaining.toFixed(1)}s)` : ''}`,
                            style: {
                                fill: 0xffb347,
                                fontSize: 13,
                                dropShadow: {
                                    color: 0x000000,
                                    distance: 1,
                                    blur: 3,
                                    alpha: 0.5,
                                    angle: Math.PI / 2,
                                },
                            },
                        });
                        rewardText.x = 20;
                        rewardText.y = rewardYOffset;
                        hudContainer.addChild(rewardText);
                    }
                }
            };

            const backgroundTexture = starfieldTexture ?? Texture.WHITE;
            playfieldBackgroundLayer = createPlayfieldBackgroundLayer(backgroundTexture);
            stage.addToLayer('playfield', playfieldBackgroundLayer.container);

            // Create game objects container
            const gameContainer = new Container();
            gameContainer.zIndex = 10;
            stage.addToLayer('playfield', gameContainer);
            gameContainer.visible = false;

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

            // Create ball attached to paddle
            const ball = ballController.createAttachedBall(
                paddleController.getPaddleCenter(paddle),
                { radius: 10, restitution: 0.98 }
            );
            physics.add(ball.physicsBody);

            // Create visual ball
            const ballGraphics = new Graphics();
            drawBallVisual(ballGraphics, ball.radius);
            ballGraphics.eventMode = 'none';
            gameContainer.addChild(ballGraphics);
            visualBodies.set(ball.physicsBody, ballGraphics);

            // Create visual paddle
            const paddleGraphics = new Graphics();
            drawPaddleVisual(paddleGraphics, paddle.width, paddle.height, 0x2ecc40);
            paddleGraphics.eventMode = 'none';
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
                inputManager.syncPaddlePosition(paddleController.getPaddleCenter(paddle));
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
                    await stage.switch('gameplay');
                    loop?.start();
                };

                void stage.switch('level-complete', {
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
                void stage.switch('game-over', { score: scoringState.score });
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
                            baseColor: 0xffc94c,
                            baseAlpha: 0.8,
                            rimColor: 0xfff2a6,
                            rimAlpha: 0.35,
                            innerColor: 0xffffff,
                            innerAlpha: 0.3,
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
                dynamicLight.flash(0.5);
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
                const paddleColor = powerUpManager.isActive('paddle-width') ? 0xffff66 : 0x2ecc40;
                drawPaddleVisual(paddleGraphics, paddle.width, paddle.height, paddleColor);

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

                // Update ball attachment to follow paddle
                ballController.updateAttachment(ball, paddleCenter);

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

                dynamicLight.update({
                    position: { x: ball.physicsBody.position.x, y: ball.physicsBody.position.y },
                    speed: MatterVector.magnitude(ball.physicsBody.velocity),
                    deltaSeconds,
                });
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
                await stage.switch('gameplay');
                loop?.start();
            };

            stage.register('main-menu', (context) => createMainMenuScene(context, {
                helpText: [
                    'Drag or use arrow keys to aim the paddle',
                    'Tap, space, or click to launch the ball',
                    'Stack power-ups for massive combos',
                ],
                onStart: () => beginNewSession(),
            }));

            stage.register('gameplay', (context) => createGameplayScene(context, {
                onUpdate: runGameplayUpdate,
            }));

            const quitLabel = 'Tap here or press Q to quit to menu';

            stage.register('pause', (context) => createPauseScene(context, {
                resumeLabel: 'Tap to resume',
                quitLabel,
            }));

            stage.register('level-complete', (context) => createLevelCompleteScene(context, {
                prompt: 'Tap to continue',
            }));

            stage.register('game-over', (context) => createGameOverScene(context, {
                prompt: 'Tap to restart',
                onRestart: () => beginNewSession(),
            }));

            await stage.switch('main-menu');
            gameContainer.visible = false;
            hudContainer.visible = false;

            const quitToMenu = async () => {
                if (!loop) {
                    return;
                }

                isPaused = false;
                gameContainer.visible = false;
                hudContainer.visible = false;
                await stage.switch('main-menu');
            };

            const resumeFromPause = async () => {
                if (!loop || !isPaused) {
                    return;
                }

                isPaused = false;
                await stage.switch('gameplay');
                loop.start();
            };

            const pauseGame = () => {
                if (!loop || isPaused || !loop.isRunning()) {
                    return;
                }

                isPaused = true;
                loop.stop();
                void stage.switch('pause', {
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
                dynamicLight.destroy();
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
