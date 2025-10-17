import { createPreloader } from './preloader';
import { createStage } from '@render/stage';
import { createPhysicsWorld } from '@physics/world';
import { createGameLoop } from './loop';
import { createGameSessionManager } from './state';
import { buildHudScoreboard } from '@render/hud';
import { BallAttachmentController } from '@physics/ball-attachment';
import { PaddleBodyController } from '@render/paddle-body';
import { GameInputManager } from '@input/input-manager';
import { PhysicsBallLaunchController } from '@physics/ball-launch';
import { reflectOffPaddle } from '../util/paddle-reflection';
import { regulateSpeed } from '../util/speed-regulation';
import { createScoring, awardBrickPoints, decayCombo } from '../util/scoring';
import { PowerUpManager, shouldSpawnPowerUp, selectRandomPowerUpType, calculatePaddleWidthScale } from '../util/power-ups';
import { generateLevelLayout, getLevelSpec } from '../util/levels';
import { Text, Container, Graphics, Sprite } from 'pixi.js';
import type { Body } from 'matter-js';
import { Events, Body as MatterBody } from 'matter-js';

export interface LuckyBreakOptions {
    readonly container?: HTMLElement;
}

export function bootstrapLuckyBreak(options: LuckyBreakOptions = {}): void {
    const container = options.container ?? document.body;

    const preloader = createPreloader({
        container,
        onStart: async () => {
            // Initialize the game components
            const stage = await createStage({ parent: container });

            // Set canvas to fill viewport
            stage.canvas.style.width = '100vw';
            stage.canvas.style.height = '100vh';
            stage.canvas.style.position = 'absolute';
            stage.canvas.style.top = '0';
            stage.canvas.style.left = '0';

            // Add resize listener
            const handleResize = () => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                stage.resize({ width: w, height: h });

                // Scale playfield to maintain aspect (optional: for fixed physics)
                const scaleX = w / 1280;
                const scaleY = h / 720;
                const scale = Math.min(scaleX, scaleY);
                stage.layers.root.scale.set(scale);
                stage.layers.root.position.set((w - 1280 * scale) / 2, (h - 720 * scale) / 2);
            };
            window.addEventListener('resize', handleResize);
            handleResize();  // Initial resize
            // Create physics world
            const physics = createPhysicsWorld({
                dimensions: { width: 1280, height: 720 },
                gravity: 0
            });

            // Create game session manager
            const session = createGameSessionManager({
                sessionId: 'game-session',
                initialLives: 3
            });

            // Create scoring and power-up systems
            const scoringState = createScoring();
            const powerUpManager = new PowerUpManager();
            let currentLevelIndex = 0;

            // Game configuration
            const BALL_BASE_SPEED = 8;
            const BALL_MAX_SPEED = 14;
            const BRICK_WIDTH = 100;
            const BRICK_HEIGHT = 40;

            // Function to load a level
            const loadLevel = (levelIndex: number) => {
                // Clear existing bricks
                visualBodies.forEach((visual, body) => {
                    if (body.label === 'brick') {
                        physics.remove(body);
                        stage.removeFromLayer(visual);
                        visualBodies.delete(body);
                    }
                });

                // Generate new level layout
                const layout = generateLevelLayout(getLevelSpec(levelIndex), BRICK_WIDTH, BRICK_HEIGHT, 1280);

                // Create bricks from layout
                layout.bricks.forEach(brickSpec => {
                    const brick = physics.factory.brick({
                        size: { width: BRICK_WIDTH, height: BRICK_HEIGHT },
                        position: { x: brickSpec.x, y: brickSpec.y },
                    });
                    physics.add(brick);

                    // Add visual brick with color based on HP
                    const color = brickSpec.hp === 1 ? 0xaaaaaa : brickSpec.hp === 2 ? 0xff8844 : 0xff4444;
                    const brickVisual = new Graphics()
                        .beginFill(color)
                        .drawRect(-BRICK_WIDTH / 2, -BRICK_HEIGHT / 2, BRICK_WIDTH, BRICK_HEIGHT)
                        .endFill();
                    brickVisual.position.set(brickSpec.x, brickSpec.y);
                    visualBodies.set(brick, brickVisual);
                    stage.layers.playfield.addChild(brickVisual);
                });

                // Start the round
                session.startRound({ breakableBricks: layout.breakableCount });
            };

            // Add collision event handling
            Events.on(physics.engine, 'collisionStart', (event) => {
                event.pairs.forEach((pair) => {
                    const { bodyA, bodyB } = pair;

                    // Brick break
                    if ((bodyA.label === 'ball' && bodyB.label === 'brick') || (bodyA.label === 'brick' && bodyB.label === 'ball')) {
                        const brick = bodyA.label === 'brick' ? bodyA : bodyB;
                        const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;

                        // Award points with combo system
                        const points = awardBrickPoints(scoringState);
                        session.recordBrickBreak({ points });

                        // Check for power-up spawn
                        if (shouldSpawnPowerUp({ spawnChance: 0.25 })) {
                            const powerUpType = selectRandomPowerUpType();
                            powerUpManager.activate(powerUpType, { defaultDuration: 2.5 });
                            console.log(`Power-up activated: ${powerUpType}`);
                        }

                        // Remove brick
                        physics.remove(brick);
                        const visual = visualBodies.get(brick);
                        if (visual) {
                            stage.removeFromLayer(visual);
                            visualBodies.delete(brick);
                        }

                        // Check win condition
                        if (session.snapshot().brickRemaining === 0) {
                            session.completeRound();
                            setTimeout(() => {
                                currentLevelIndex += 1;
                                loadLevel(currentLevelIndex);
                            }, 500);
                        }
                    }

                    // Paddle-ball collision with advanced reflection
                    if ((bodyA.label === 'ball' && bodyB.label === 'paddle') || (bodyA.label === 'paddle' && bodyB.label === 'ball')) {
                        const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;
                        const paddleBody = bodyA.label === 'paddle' ? bodyA : bodyB;

                        // Apply paddle reflection
                        reflectOffPaddle(ballBody, paddleBody, {
                            paddleWidth: paddle.width,
                            minSpeed: BALL_BASE_SPEED,
                        });
                    }

                    // Ball hitting bottom (lose life)
                    if ((bodyA.label === 'ball' && bodyB.label === 'wall-bottom') || (bodyA.label === 'wall-bottom' && bodyB.label === 'ball')) {
                        const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;

                        // Lose a life and reset combo
                        session.recordLifeLost('ball-drop');
                        scoringState.combo = 0;
                        scoringState.comboTimer = 0;

                        if (session.snapshot().livesRemaining > 0) {
                            // Reset ball to paddle
                            physics.attachBallToPaddle(ball.physicsBody, paddle.physicsBody);
                        } else {
                            // Game over
                            console.log('Game Over - Final Score:', scoringState.score);
                        }
                    }
                });
            });

            // Create HUD container
            const hudContainer = new Container();
            stage.addToLayer('hud', hudContainer);

            // Create game objects container
            const gameContainer = new Container();
            stage.addToLayer('playfield', gameContainer);

            // Create visual representations for physics objects
            const visualBodies = new Map<Body, Container>();

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
                graphics.fill({ color: 0x444444 });
                gameContainer.addChild(graphics);
                visualBodies.set(bound, graphics);
            });

            // Create controllers
            const ballController = new BallAttachmentController();
            const paddleController = new PaddleBodyController();
            const inputManager = new GameInputManager();
            const launchController = new PhysicsBallLaunchController();

            // Initialize input manager
            inputManager.initialize(container);

            // Create paddle first
            const paddle = paddleController.createPaddle(
                { x: 640, y: 650 },
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
            loadLevel(currentLevelIndex);

            const loop = createGameLoop({
                world: physics,
                stage,
                hooks: {
                    beforeStep: (deltaMs) => {
                        const deltaSeconds = deltaMs / 1000;

                        // Update power-ups
                        powerUpManager.update(deltaSeconds);

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
                            // Update paddle position
                            const targetX = paddleTarget.x;
                            const halfPaddleWidth = paddle.width / 2;
                            const clampedX = Math.max(halfPaddleWidth, Math.min(targetX, 1280 - halfPaddleWidth));
                            MatterBody.setPosition(paddle.physicsBody, { x: clampedX, y: paddle.physicsBody.position.y });
                        }

                        // Update ball attachment to follow paddle
                        ballController.updateAttachment(ball, paddleController.getPaddleCenter(paddle));

                        // Check for launch triggers
                        if (inputManager.shouldLaunch() ||
                            inputManager.checkMovementLaunch(paddleController.getPaddleCenter(paddle))) {
                            physics.detachBallFromPaddle(ball.physicsBody);
                            launchController.launch(ball);
                            inputManager.resetLaunchTrigger();
                        }
                    },
                    afterStep: () => {
                        // Regulate ball speed
                        regulateSpeed(ball.physicsBody, {
                            baseSpeed: BALL_BASE_SPEED,
                            maxSpeed: BALL_MAX_SPEED,
                        });

                        // Update visual positions to match physics bodies
                        visualBodies.forEach((visual, body) => {
                            visual.x = body.position.x;
                            visual.y = body.position.y;
                            visual.rotation = body.angle;
                        });
                    },
                    afterRender: () => {
                        // Update HUD
                        const snapshot = session.snapshot();
                        const hudView = buildHudScoreboard(snapshot);

                        // Clear existing HUD
                        hudContainer.removeChildren();

                        // Add status text
                        const statusText = new Text({
                            text: hudView.statusText,
                            style: { fill: 0xffffff, fontSize: 16 }
                        });
                        statusText.x = 20;
                        statusText.y = 20;
                        hudContainer.addChild(statusText);

                        // Add summary
                        if (hudView.summaryLine) {
                            const summaryText = new Text({
                                text: hudView.summaryLine,
                                style: { fill: 0xcccccc, fontSize: 14 }
                            });
                            summaryText.x = 20;
                            summaryText.y = 50;
                            hudContainer.addChild(summaryText);
                        }

                        // Add scoreboard entries
                        hudView.entries.forEach((entry, index) => {
                            const entryText = new Text({
                                text: `${entry.label}: ${entry.value}`,
                                style: { fill: 0xffffff, fontSize: 12 }
                            });
                            entryText.x = 20;
                            entryText.y = 80 + index * 20;
                            hudContainer.addChild(entryText);
                        });

                        // Add combo info
                        if (scoringState.combo > 0) {
                            const comboText = new Text({
                                text: `Combo: ${scoringState.combo}x (${scoringState.comboTimer.toFixed(1)}s)`,
                                style: { fill: 0xffff00, fontSize: 14, fontWeight: 'bold' }
                            });
                            comboText.x = 20;
                            comboText.y = 80 + hudView.entries.length * 20 + 10;
                            hudContainer.addChild(comboText);
                        }

                        // Add active power-ups
                        const activePowerUps = powerUpManager.getActiveEffects();
                        activePowerUps.forEach((effect, index) => {
                            const powerUpText = new Text({
                                text: `${effect.type}: ${effect.remainingTime.toFixed(1)}s`,
                                style: { fill: 0x00ffff, fontSize: 12 }
                            });
                            powerUpText.x = 20;
                            powerUpText.y = 80 + hudView.entries.length * 20 + 35 + index * 18;
                            hudContainer.addChild(powerUpText);
                        });
                    }
                }
            });

            // Start the game loop
            loop.start();
        }
    });

    preloader.prepare().catch(console.error);
}

const container = document.getElementById('app');
if (container) {
    bootstrapLuckyBreak({ container });
}
