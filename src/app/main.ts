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
import { Text, Container, Graphics, Sprite } from 'pixi.js';
import type { Body } from 'matter-js';

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
            const physics = createPhysicsWorld({
                dimensions: { width: 1280, height: 720 }
            });

            // Create game session manager
            const session = createGameSessionManager({
                sessionId: 'game-session',
                initialLives: 3
            });

            // Start the round
            session.startRound({ breakableBricks: 18 });

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
            visualBodies.set(paddle.physicsBody, paddleGraphics);            // Create game loop with paddle and ball control
            const loop = createGameLoop({
                world: physics,
                stage,
                hooks: {
                    beforeStep: (deltaMs) => {
                        // Process input
                        const paddleTarget = inputManager.getPaddleTarget();
                        if (paddleTarget) {
                            paddleController.updatePaddle(paddle, deltaMs / 1000, {
                                leftPressed: false, // Would come from keyboard input
                                rightPressed: false,
                                mouseX: paddleTarget.x,
                                touchX: undefined,
                                launchRequested: false,
                            });
                        }

                        // Update ball attachment to follow paddle
                        ballController.updateAttachment(ball, paddleController.getPaddleCenter(paddle));

                        // Check for launch triggers
                        if (inputManager.shouldLaunch() ||
                            inputManager.checkMovementLaunch(paddleController.getPaddleCenter(paddle))) {
                            launchController.launch(ball);
                            inputManager.resetLaunchTrigger();
                        }
                    },
                    afterStep: () => {
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
