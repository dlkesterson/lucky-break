import { createPreloader } from './preloader';
import { createStage } from 'render/stage';
import { createPhysicsWorld } from 'physics/world';
import { createGameLoop } from './loop';
import { createGameSessionManager } from './state';
import { buildHudScoreboard } from 'render/hud';
import { BallAttachmentController } from 'physics/ball-attachment';
import { PaddleBodyController } from 'render/paddle-body';
import { GameInputManager } from 'input/input-manager';
import { PhysicsBallLaunchController } from 'physics/ball-launch';
import { reflectOffPaddle } from 'util/paddle-reflection';
import { regulateSpeed } from 'util/speed-regulation';
import { createScoring, awardBrickPoints, decayCombo, resetCombo } from 'util/scoring';
import { PowerUpManager, shouldSpawnPowerUp, selectRandomPowerUpType, calculatePaddleWidthScale, calculateBallSpeedScale, type PowerUpType } from 'util/power-ups';
import { generateLevelLayout, getLevelSpec } from 'util/levels';
import type { BrickSpec } from 'util/levels';
import { Text, Container, Graphics } from 'pixi.js';
import type { Body } from 'matter-js';
import { Events, Body as MatterBody, Bodies, Vector as MatterVector } from 'matter-js';
import { createEventBus } from 'app/events';
import { createToneScheduler } from 'audio/scheduler';
import { createSfxRouter } from 'audio/sfx';
import { Players, Panner, Volume, start as toneStart } from 'tone';

export interface LuckyBreakOptions {
    readonly container?: HTMLElement;
}

export function bootstrapLuckyBreak(options: LuckyBreakOptions = {}): void {
    const container = options.container ?? document.body;
    const PLAYFIELD_WIDTH = 1280;
    const PLAYFIELD_HEIGHT = 720;
    const HALF_PLAYFIELD_WIDTH = PLAYFIELD_WIDTH / 2;
    const HALF_PLAYFIELD_HEIGHT = PLAYFIELD_HEIGHT / 2;

    container.style.position = 'relative';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = '#000000';

    const preloader = createPreloader({
        container,
        onStart: async () => {
            // Initialize the game components
            const stage = await createStage({ parent: container });

            stage.layers.playfield.sortableChildren = true;

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

            await toneStart();  // Start Tone.js audio context (call once)

            const bus = createEventBus();  // Create event bus

            const scheduler = createToneScheduler({ lookAheadMs: 120 });

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

            const brickPlayers = new Players(brickSampleUrls).connect(volume);
            await brickPlayers.loaded;

            const router = createSfxRouter({
                bus,
                scheduler,
                brickSampleIds: Object.keys(brickSampleUrls),
                trigger: (descriptor) => {
                    const player = brickPlayers.player(descriptor.id);
                    if (!player) {
                        return;
                    }

                    player.playbackRate = toPlaybackRate(descriptor.detune);
                    player.volume.value = toDecibels(descriptor.gain);
                    panner.pan.setValueAtTime(descriptor.pan, descriptor.time);
                    player.start(descriptor.time);
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

            // Visuals and brick state tracking
            interface FallingPowerUp {
                readonly type: PowerUpType;
                readonly body: Body;
                readonly visual: Graphics;
            }

            const visualBodies = new Map<Body, Container>();
            const brickHealth = new Map<Body, number>();
            const brickMetadata = new Map<Body, BrickSpec>();
            const activePowerUps: FallingPowerUp[] = [];
            const extraBalls = new Map<number, { body: Body; visual: Graphics }>();

            const removeBodyVisual = (body: Body): void => {
                const visual = visualBodies.get(body);
                if (!visual) {
                    return;
                }

                stage.removeFromLayer(visual);
                visualBodies.delete(body);
            };

            // Game configuration
            const BALL_BASE_SPEED = 8;
            const BALL_MAX_SPEED = 14;
            const BALL_LAUNCH_SPEED = 8;
            const BRICK_WIDTH = 100;
            const BRICK_HEIGHT = 40;
            const POWER_UP_RADIUS = 16;
            const POWER_UP_FALL_SPEED = 6;
            const POWER_UP_DURATION = 6;
            let powerUpChanceMultiplier = 1;
            let currentBaseSpeed = BALL_BASE_SPEED;
            let currentMaxSpeed = BALL_MAX_SPEED;
            let currentLaunchSpeed = BALL_LAUNCH_SPEED;

            const getBrickColor = (hp: number): number => {
                if (hp >= 3) {
                    return 0xff4444;
                }
                if (hp === 2) {
                    return 0xff8844;
                }
                return 0xaaaaaa;
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
                // Clear existing bricks
                visualBodies.forEach((_visual, body) => {
                    if (body.label === 'brick') {
                        physics.remove(body);
                        removeBodyVisual(body);
                        brickHealth.delete(body);
                        brickMetadata.delete(body);
                    }
                });

                clearActivePowerUps();

                // Generate new level layout
                const levelSpec = getLevelSpec(levelIndex);
                const layout = generateLevelLayout(levelSpec, BRICK_WIDTH, BRICK_HEIGHT, PLAYFIELD_WIDTH);
                powerUpChanceMultiplier = levelSpec.powerUpChanceMultiplier ?? 1;

                // Create bricks from layout
                layout.bricks.forEach(brickSpec => {
                    const brick = physics.factory.brick({
                        size: { width: BRICK_WIDTH, height: BRICK_HEIGHT },
                        position: { x: brickSpec.x, y: brickSpec.y },
                    });
                    physics.add(brick);

                    // Add visual brick with color based on HP
                    const color = getBrickColor(brickSpec.hp);
                    const brickVisual = new Graphics()
                        .beginFill(color)
                        .drawRect(-BRICK_WIDTH / 2, -BRICK_HEIGHT / 2, BRICK_WIDTH, BRICK_HEIGHT)
                        .endFill();
                    brickVisual.position.set(brickSpec.x, brickSpec.y);
                    brickVisual.zIndex = 5;
                    brickVisual.eventMode = 'none';
                    visualBodies.set(brick, brickVisual);
                    stage.layers.playfield.addChild(brickVisual);

                    brickHealth.set(brick, Math.max(1, brickSpec.hp));
                    brickMetadata.set(brick, brickSpec);
                });

                // Start the round
                session.startRound({ breakableBricks: layout.breakableCount });
            };

            // Add collision event handling
            Events.on(physics.engine, 'collisionStart', (event) => {
                event.pairs.forEach((pair) => {
                    const { bodyA, bodyB } = pair;

                    // Brick contact
                    if ((bodyA.label === 'ball' && bodyB.label === 'brick') || (bodyA.label === 'brick' && bodyB.label === 'ball')) {
                        const brick = bodyA.label === 'brick' ? bodyA : bodyB;
                        const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;

                        const currentHp = brickHealth.get(brick) ?? 1;
                        const nextHp = currentHp - 1;

                        if (nextHp > 0) {
                            brickHealth.set(brick, nextHp);

                            const brickVisual = visualBodies.get(brick);
                            if (brickVisual instanceof Graphics) {
                                brickVisual.clear();
                                brickVisual.beginFill(getBrickColor(nextHp));
                                brickVisual.drawRect(-BRICK_WIDTH / 2, -BRICK_HEIGHT / 2, BRICK_WIDTH, BRICK_HEIGHT);
                                brickVisual.endFill();
                            }
                        } else {
                            const metadata = brickMetadata.get(brick);

                            bus.publish('BrickBreak', {
                                sessionId: session.snapshot().sessionId,
                                row: metadata?.row ?? Math.floor((brick.position.y - 100) / BRICK_HEIGHT),
                                col: metadata?.col ?? Math.floor((brick.position.x - 50) / BRICK_WIDTH),
                                velocity: ballBody.speed,
                                comboHeat: scoringState.combo,
                                brickType: 'standard', // TODO: Should be dynamic once types exist
                            });

                            const points = awardBrickPoints(scoringState);
                            session.recordBrickBreak({
                                points,
                                event: metadata
                                    ? {
                                        row: metadata.row,
                                        col: metadata.col,
                                        velocity: ballBody.speed,
                                        brickType: 'standard',
                                    }
                                    : undefined,
                            });

                            const spawnChance = Math.min(1, 0.25 * powerUpChanceMultiplier);
                            if (shouldSpawnPowerUp({ spawnChance })) {
                                const powerUpType = selectRandomPowerUpType();
                                spawnPowerUp(powerUpType, { x: brick.position.x, y: brick.position.y });
                            }

                            physics.remove(brick);
                            removeBodyVisual(brick);

                            brickHealth.delete(brick);
                            brickMetadata.delete(brick);

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

            const overlayContainer = new Container();
            overlayContainer.visible = false;
            overlayContainer.eventMode = 'none';

            const overlayBackground = new Graphics();
            overlayBackground.rect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
            overlayBackground.fill({ color: 0x000000, alpha: 0.6 });
            overlayBackground.eventMode = 'none';
            overlayContainer.addChild(overlayBackground);

            const overlayTitle = new Text({
                text: '',
                style: { fill: 0xffffff, fontSize: 64, fontWeight: 'bold', align: 'center' },
            });
            overlayTitle.anchor.set(0.5);
            overlayTitle.position.set(HALF_PLAYFIELD_WIDTH, HALF_PLAYFIELD_HEIGHT - 60);
            overlayContainer.addChild(overlayTitle);

            const overlayMessage = new Text({
                text: '',
                style: { fill: 0xffffff, fontSize: 24, align: 'center' },
            });
            overlayMessage.anchor.set(0.5);
            overlayMessage.position.set(HALF_PLAYFIELD_WIDTH, HALF_PLAYFIELD_HEIGHT + 20);
            overlayContainer.addChild(overlayMessage);

            const overlayAction = new Text({
                text: '',
                style: { fill: 0xffff66, fontSize: 20, align: 'center' },
            });
            overlayAction.anchor.set(0.5);
            overlayAction.position.set(HALF_PLAYFIELD_WIDTH, HALF_PLAYFIELD_HEIGHT + 80);
            overlayContainer.addChild(overlayAction);

            stage.layers.hud.addChild(overlayContainer);

            let overlayPointerHandler: ((event: PointerEvent) => void) | null = null;

            const clearOverlayPointerHandler = () => {
                if (!overlayPointerHandler) {
                    return;
                }

                stage.canvas.removeEventListener('pointerup', overlayPointerHandler);
                overlayPointerHandler = null;
            };

            const registerOverlayPointerHandler = (handler: () => void) => {
                clearOverlayPointerHandler();

                overlayPointerHandler = (event: PointerEvent) => {
                    if (!overlayContainer.visible) {
                        return;
                    }

                    // Ignore right/middle clicks to avoid accidental resumes
                    if (event.button && event.button !== 0) {
                        return;
                    }

                    handler();
                };

                stage.canvas.addEventListener('pointerup', overlayPointerHandler);
            };

            const refreshHud = () => {
                const snapshot = session.snapshot();
                const hudView = buildHudScoreboard(snapshot);

                hudContainer.removeChildren();

                const statusText = new Text({
                    text: hudView.statusText,
                    style: { fill: 0xffffff, fontSize: 16 }
                });
                statusText.x = 20;
                statusText.y = 20;
                hudContainer.addChild(statusText);

                if (hudView.summaryLine) {
                    const summaryText = new Text({
                        text: hudView.summaryLine,
                        style: { fill: 0xcccccc, fontSize: 14 }
                    });
                    summaryText.x = 20;
                    summaryText.y = 50;
                    hudContainer.addChild(summaryText);
                }

                hudView.entries.forEach((entry, index) => {
                    const entryText = new Text({
                        text: `${entry.label}: ${entry.value}`,
                        style: { fill: 0xffffff, fontSize: 12 }
                    });
                    entryText.x = 20;
                    entryText.y = 80 + index * 20;
                    hudContainer.addChild(entryText);
                });

                if (scoringState.combo > 0) {
                    const comboText = new Text({
                        text: `Combo: ${scoringState.combo}x (${scoringState.comboTimer.toFixed(1)}s)`,
                        style: { fill: 0xffff00, fontSize: 14, fontWeight: 'bold' }
                    });
                    comboText.x = 20;
                    comboText.y = 80 + hudView.entries.length * 20 + 10;
                    hudContainer.addChild(comboText);
                }

                const activePowerUpsView = powerUpManager.getActiveEffects();
                activePowerUpsView.forEach((effect, index) => {
                    const powerUpText = new Text({
                        text: `${effect.type}: ${effect.remainingTime.toFixed(1)}s`,
                        style: { fill: 0x00ffff, fontSize: 12 }
                    });
                    powerUpText.x = 20;
                    powerUpText.y = 80 + hudView.entries.length * 20 + 35 + index * 18;
                    hudContainer.addChild(powerUpText);
                });
            };

            const hideOverlay = () => {
                overlayContainer.visible = false;
                overlayContainer.eventMode = 'none';
                overlayContainer.cursor = 'auto';
                overlayContainer.removeAllListeners();
                clearOverlayPointerHandler();
            };

            const showOverlay = (
                title: string,
                message: string,
                actionLabel: string | null,
                onAction?: () => void,
            ) => {
                overlayTitle.text = title;
                overlayMessage.text = message;
                overlayAction.text = actionLabel ?? '';
                overlayAction.visible = Boolean(actionLabel);

                overlayContainer.removeAllListeners();
                if (onAction) {
                    overlayContainer.eventMode = 'static';
                    overlayContainer.cursor = 'pointer';
                    const runAction = () => {
                        hideOverlay();
                        onAction();
                    };
                    overlayContainer.on('pointertap', runAction);
                    registerOverlayPointerHandler(runAction);
                } else {
                    overlayContainer.eventMode = 'none';
                    overlayContainer.cursor = 'auto';
                    clearOverlayPointerHandler();
                }

                overlayContainer.visible = true;
            };

            const playfieldBackground = new Graphics();
            playfieldBackground.rect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
            playfieldBackground.fill({ color: 0x080808, alpha: 1 });
            playfieldBackground.stroke({ color: 0x2a2a2a, width: 4, alignment: 0 });
            playfieldBackground.eventMode = 'none';
            playfieldBackground.zIndex = -100;
            stage.layers.playfield.addChild(playfieldBackground);

            // Create game objects container
            let gameContainer: Container;
            gameContainer = new Container();
            gameContainer.zIndex = 10;
            stage.addToLayer('playfield', gameContainer);

            // Add some initial game objects for testing
            const bounds = physics.factory.bounds();
            physics.add(bounds);

            // Create visual bounds (walls)
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
            ballGraphics.circle(0, 0, ball.radius);
            ballGraphics.fill({ color: 0xff0000 });
            gameContainer.addChild(ballGraphics);
            visualBodies.set(ball.physicsBody, ballGraphics);

            // Create visual paddle
            const paddleGraphics = new Graphics();
            paddleGraphics.rect(-paddle.width / 2, -paddle.height / 2, paddle.width, paddle.height);
            paddleGraphics.fill({ color: 0x00ff00 });
            gameContainer.addChild(paddleGraphics);
            visualBodies.set(paddle.physicsBody, paddleGraphics);

            // Load initial level
            startLevel(currentLevelIndex, { resetScore: true });

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
            }

            function startLevel(levelIndex: number, options: { resetScore?: boolean } = {}): void {
                hideOverlay();
                isPaused = false;

                if (options.resetScore) {
                    scoringState = createScoring();
                } else {
                    resetCombo(scoringState);
                }

                powerUpManager.clearAll();
                clearExtraBalls();
                loadLevel(levelIndex);
                reattachBallToPaddle();
                refreshHud();
            }

            function handleLevelComplete(): void {
                clearExtraBalls();
                isPaused = false;
                loop?.stop();

                const completedLevel = currentLevelIndex + 1;
                showOverlay(
                    `Level ${completedLevel} Complete`,
                    `Score: ${scoringState.score}`,
                    'Tap to continue',
                    () => {
                        currentLevelIndex += 1;
                        startLevel(currentLevelIndex);
                        loop?.start();
                    },
                );
            }

            function handleGameOver(): void {
                clearExtraBalls();
                isPaused = false;
                loop?.stop();

                showOverlay(
                    'Game Over',
                    `Final Score: ${scoringState.score}`,
                    'Tap to restart',
                    () => {
                        session = createSession();
                        currentLevelIndex = 0;
                        startLevel(currentLevelIndex, { resetScore: true });
                        loop?.start();
                    },
                );
            }

            const spawnExtraBalls = () => {
                if (extraBalls.size >= 2) {
                    return;
                }

                const baseVelocity = ball.physicsBody.velocity;
                const baseSpeed = MatterVector.magnitude(baseVelocity);
                const hasMotion = baseSpeed > 0.01;
                const direction = hasMotion ? MatterVector.normalise(baseVelocity) : MatterVector.create(0, -1);
                const speed = hasMotion ? baseSpeed : currentLaunchSpeed;
                const effectiveSpeed = Math.max(currentLaunchSpeed, speed);
                const offsets = [-0.35, 0.35];

                offsets.forEach((offset) => {
                    if (extraBalls.size >= 2) {
                        return;
                    }

                    const rotated = MatterVector.rotate(MatterVector.clone(direction), offset);
                    const velocity = MatterVector.mult(rotated, effectiveSpeed);

                    const extraBody = physics.factory.ball({
                        radius: ball.radius,
                        position: {
                            x: ball.physicsBody.position.x,
                            y: ball.physicsBody.position.y,
                        },
                        restitution: 0.98,
                    });

                    MatterBody.setVelocity(extraBody, velocity);
                    physics.add(extraBody);

                    const extraVisual = new Graphics();
                    extraVisual.circle(0, 0, ball.radius);
                    extraVisual.fill({ color: 0xffcc00 });
                    gameContainer.addChild(extraVisual);
                    visualBodies.set(extraBody, extraVisual);
                    extraBalls.set(extraBody.id, { body: extraBody, visual: extraVisual });
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
                if (type === 'multi-ball') {
                    spawnExtraBalls();
                }
            }

            loop = createGameLoop({
                world: physics,
                stage,
                hooks: {
                    beforeStep: (deltaMs) => {
                        const deltaSeconds = deltaMs / 1000;

                        // Update power-ups
                        powerUpManager.update(deltaSeconds);

                        const speedMultiplier = calculateBallSpeedScale(
                            powerUpManager.getEffect('ball-speed'),
                        );
                        currentBaseSpeed = BALL_BASE_SPEED * speedMultiplier;
                        currentMaxSpeed = BALL_MAX_SPEED * speedMultiplier;
                        currentLaunchSpeed = BALL_LAUNCH_SPEED * speedMultiplier;

                        // Update paddle size based on power-ups
                        const paddleScale = calculatePaddleWidthScale(
                            powerUpManager.getEffect('paddle-width'),
                            { paddleWidthMultiplier: 1.5 }
                        );
                        const basePaddleWidth = 100;
                        paddle.width = basePaddleWidth * paddleScale;

                        // Update paddle visual
                        paddleGraphics.clear();
                        paddleGraphics.rect(-paddle.width / 2, -paddle.height / 2, paddle.width, paddle.height);
                        const paddleColor = powerUpManager.isActive('paddle-width') ? 0xffff66 : 0x00ff00;
                        paddleGraphics.fill({ color: paddleColor });

                        // Decay combo timer
                        decayCombo(scoringState, deltaSeconds);

                        // Process input
                        const paddleTarget = inputManager.getPaddleTarget();
                        if (paddleTarget) {
                            const rect = stage.canvas.getBoundingClientRect();  // Ensure relative to canvas
                            const canvasX = paddleTarget.x - rect.left;  // Explicitly correct for any offset
                            const canvasY = paddleTarget.y - rect.top;

                            const pf = toPlayfield({ x: canvasX, y: canvasY });  // Use corrected canvas coords

                            const targetX = pf.x;
                            const halfPaddleWidth = paddle.width / 2;
                            const clampedX = Math.max(halfPaddleWidth, Math.min(targetX, PLAYFIELD_WIDTH - halfPaddleWidth));
                            MatterBody.setPosition(paddle.physicsBody, { x: clampedX, y: paddle.physicsBody.position.y });
                            paddle.position.x = clampedX;
                        }

                        // Ensure paddle state stays synchronized with physics body
                        paddle.position.y = paddle.physicsBody.position.y;

                        // Update ball attachment to follow paddle
                        ballController.updateAttachment(ball, paddleController.getPaddleCenter(paddle));

                        // Check for launch triggers
                        if (inputManager.shouldLaunch() ||
                            inputManager.checkMovementLaunch(paddleController.getPaddleCenter(paddle))) {
                            physics.detachBallFromPaddle(ball.physicsBody);
                            launchController.launch(ball, undefined, currentLaunchSpeed);
                            inputManager.resetLaunchTrigger();
                        }

                        // Regulate ball speed before stepping physics to minimize collision spikes
                        regulateSpeed(ball.physicsBody, {
                            baseSpeed: currentBaseSpeed,
                            maxSpeed: currentMaxSpeed,
                        });
                    },
                    afterStep: () => {
                        // Update visual positions to match physics bodies
                        visualBodies.forEach((visual, body) => {
                            visual.x = body.position.x;
                            visual.y = body.position.y;
                            visual.rotation = body.angle;
                        });
                    },
                    beforeRender: () => {
                        refreshHud();
                    },
                }
            });

            const resumeFromPause = () => {
                if (!loop || !isPaused) {
                    return;
                }

                isPaused = false;
                hideOverlay();
                loop.start();
            };

            const pauseGame = () => {
                if (!loop || isPaused || !loop.isRunning()) {
                    return;
                }

                isPaused = true;
                loop.stop();
                showOverlay(
                    'Paused',
                    `Score: ${scoringState.score}\nPress P or Esc to resume`,
                    'Tap to resume',
                    () => {
                        resumeFromPause();
                    },
                );
            };

            const handleGlobalKeyDown = (event: KeyboardEvent) => {
                if (event.code === 'KeyP' || event.code === 'Escape') {
                    if (isPaused) {
                        event.preventDefault();
                        resumeFromPause();
                    } else if (loop?.isRunning()) {
                        event.preventDefault();
                        pauseGame();
                    }
                }
            };

            document.addEventListener('keydown', handleGlobalKeyDown);

            // Start the game loop
            loop?.start();

            // Add dispose on unload (optional):
            window.addEventListener('beforeunload', () => {
                router.dispose();
                scheduler.dispose();
                brickPlayers.dispose();
                volume.dispose();
                panner.dispose();
                document.removeEventListener('keydown', handleGlobalKeyDown);
                clearOverlayPointerHandler();
            });
        }
    });

    preloader.prepare().catch(console.error);
}

const container = document.getElementById('app');
if (container) {
    bootstrapLuckyBreak({ container });
}
