/**
 * Paddle Ball Flow Integration Test
 *
 * Feature: Paddle Control and Ball Launch
 * Date: 2025-10-15
 * Purpose: End-to-end test of paddle control and ball launch mechanics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameInputManager } from 'input/input-manager';
import { PaddleBodyController } from 'render/paddle-body';
import { BallAttachmentController } from 'physics/ball-attachment';
import { PhysicsBallLaunchController } from 'physics/ball-launch';
import { createPhysicsWorld } from 'physics/world';
import { Bodies, Body, Vector } from 'matter-js';
import { reflectOffPaddle } from 'util/paddle-reflection';
import { PowerUpManager } from 'util/power-ups';
import { spinWheel } from 'game/rewards';

const PLAYFIELD_WIDTH = 1280;

describe('Paddle Ball Flow Integration', () => {
    let inputManager: GameInputManager;
    let paddleController: PaddleBodyController;
    let ballController: BallAttachmentController;
    let launchController: PhysicsBallLaunchController;
    let physicsWorld: ReturnType<typeof createPhysicsWorld>;
    let paddle: any;
    let ball: any;
    let mockContainer: HTMLElement;

    beforeEach(() => {
        mockContainer = document.createElement('div');
        mockContainer.style.width = '800px';
        mockContainer.style.height = '600px';
        document.body.appendChild(mockContainer);

        inputManager = new GameInputManager();
        paddleController = new PaddleBodyController();
        ballController = new BallAttachmentController();
        launchController = new PhysicsBallLaunchController();
        physicsWorld = createPhysicsWorld();

        inputManager.initialize(mockContainer);

        // Create paddle
        paddle = paddleController.createPaddle(
            { x: 400, y: 350 },
            { width: 100, height: 20, speed: 300 }
        );
        physicsWorld.add(paddle.physicsBody);

        // Create ball attached to paddle
        ball = ballController.createAttachedBall(
            paddleController.getPaddleCenter(paddle),
            { radius: 10, restitution: 0.98 }
        );
        physicsWorld.add(ball.physicsBody);
    });

    afterEach(() => {
        inputManager.destroy();
        physicsWorld.dispose();
        document.body.removeChild(mockContainer);
    });

    describe('Initial State', () => {
        it('should start with ball attached to paddle', () => {
            expect(ballController.isAttached(ball)).toBe(true);
            expect(ball.physicsBody.velocity.x).toBe(0);
            expect(ball.physicsBody.velocity.y).toBe(0);
        });

        it('should have paddle at initial position', () => {
            const center = paddleController.getPaddleCenter(paddle);
            expect(center.x).toBe(400);
            expect(center.y).toBe(350);
        });

        it('should have no launch pending initially', () => {
            expect(inputManager.shouldLaunch()).toBe(false);
        });
    });

    describe('Paddle Movement', () => {
        it('should move paddle with mouse input', () => {
            // Move mouse
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 500,
                clientY: 350,
                bubbles: true,
            }));

            // Update paddle
            const paddleTarget = inputManager.getPaddleTarget();
            if (paddleTarget) {
                paddleController.updatePaddle(paddle, 1 / 60, {
                    leftPressed: false,
                    rightPressed: false,
                    mouseX: paddleTarget.x,
                    touchX: undefined,
                    launchRequested: false,
                }, PLAYFIELD_WIDTH);
            }

            // Ball should follow paddle
            ballController.updateAttachment(ball, paddleController.getPaddleCenter(paddle));

            const paddleCenter = paddleController.getPaddleCenter(paddle);
            expect(paddleCenter.x).toBe(500);
            expect(ballController.isAttached(ball)).toBe(true);
        });

        it('should constrain paddle within boundaries', () => {
            // Try to move paddle out of bounds
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 10, // Out of bounds
                clientY: 350,
                bubbles: true,
            }));

            const paddleTarget = inputManager.getPaddleTarget();
            if (paddleTarget) {
                paddleController.updatePaddle(paddle, 1 / 60, {
                    leftPressed: false,
                    rightPressed: false,
                    mouseX: paddleTarget.x,
                    touchX: undefined,
                    launchRequested: false,
                }, PLAYFIELD_WIDTH);
            }

            const paddleCenter = paddleController.getPaddleCenter(paddle);
            expect(paddleCenter.x).toBe(50); // Constrained to half width
        });
    });

    describe('Ball Launch Triggers', () => {
        it('should launch ball on mouse click', () => {
            // Click to launch
            mockContainer.dispatchEvent(new MouseEvent('mousedown', {
                clientX: 400,
                clientY: 350,
                bubbles: true,
            }));

            // Process launch
            if (inputManager.shouldLaunch()) {
                launchController.launch(ball);
                inputManager.resetLaunchTrigger();
            }

            expect(ballController.isAttached(ball)).toBe(false);
            expect(ball.physicsBody.velocity.y).toBeLessThan(0); // Moving upward
        });

        it('should launch ball on paddle movement', () => {
            // Move paddle significantly
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 400,
                clientY: 350,
                bubbles: true,
            }));

            // Simulate paddle movement detection (this would happen in the game loop)
            const hasMovement = (inputManager as any).launchManager.shouldTriggerLaunch(
                { x: 410, y: 350 },
                { x: 400, y: 350 },
                5
            );

            if (hasMovement) {
                launchController.launch(ball);
            }

            expect(ballController.isAttached(ball)).toBe(false);
            expect(ball.physicsBody.velocity.y).toBeLessThan(0);
        });
    });

    describe('Post-Launch Behavior', () => {
        it('should allow ball to move freely after launch', () => {
            // Launch ball
            launchController.launch(ball);

            // Step physics
            physicsWorld.step(1 / 60);

            const initialPosition = { ...ball.physicsBody.position };

            // Step more physics
            for (let i = 0; i < 10; i++) {
                physicsWorld.step(1 / 60);
            }

            const finalPosition = ball.physicsBody.position;
            const deltaX = Math.abs(finalPosition.x - initialPosition.x);
            const deltaY = Math.abs(finalPosition.y - initialPosition.y);

            expect(deltaX + deltaY).toBeGreaterThan(1); // Should have moved
        });

        it('should maintain ball physics after launch', () => {
            const initialVelocity = { ...ball.physicsBody.velocity };

            launchController.launch(ball);

            // Step physics multiple times
            for (let i = 0; i < 60; i++) { // 1 second
                physicsWorld.step(1 / 60);
            }

            const finalVelocity = ball.physicsBody.velocity;
            const speedChange = Math.abs(
                Math.sqrt(finalVelocity.x ** 2 + finalVelocity.y ** 2) -
                Math.sqrt(initialVelocity.x ** 2 + initialVelocity.y ** 2)
            );

            expect(speedChange).toBeLessThan(50); // Should maintain most velocity
        });
    });

    describe('Reset and Replay', () => {
        it('should reset ball to attached state', () => {
            // Launch ball
            launchController.launch(ball);
            expect(ballController.isAttached(ball)).toBe(false);

            // Reset to attached
            ballController.resetToAttached(ball, paddleController.getPaddleCenter(paddle));
            expect(ballController.isAttached(ball)).toBe(true);
            expect(ball.physicsBody.velocity.x).toBe(0);
            expect(ball.physicsBody.velocity.y).toBe(0);
        });

        it('should handle multiple launch cycles', () => {
            const paddleCenter = paddleController.getPaddleCenter(paddle);

            // Cycle 1
            launchController.launch(ball);
            expect(ballController.isAttached(ball)).toBe(false);

            ballController.resetToAttached(ball, paddleCenter);
            expect(ballController.isAttached(ball)).toBe(true);

            // Cycle 2
            launchController.launch(ball, { x: 0, y: -1 });
            expect(ballController.isAttached(ball)).toBe(false);

            ballController.resetToAttached(ball, paddleCenter);
            expect(ballController.isAttached(ball)).toBe(true);
        });
    });

    describe('Cross-Platform Input', () => {
        it('should handle touch input', () => {
            const touchEvent = new TouchEvent('touchstart', {
                touches: [
                    new Touch({
                        identifier: 1,
                        target: mockContainer,
                        clientX: 450,
                        clientY: 375,
                    }),
                ],
                bubbles: true,
            });

            mockContainer.dispatchEvent(touchEvent);

            expect(inputManager.shouldLaunch()).toBe(true);

            const debugState = inputManager.getDebugState();
            expect(debugState.primaryInput).toBe('touch');
            expect(debugState.touchPosition).toEqual({ x: 450, y: 375 });
        });

        it('should handle keyboard input', () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));

            const debugState = inputManager.getDebugState();
            expect(debugState.keyboardPressed).toContain('ArrowLeft');
            expect(debugState.primaryInput).toBe('keyboard');
        });
    });

    describe('Integration Flow', () => {
        it('should complete full paddle-ball interaction cycle', () => {
            // 1. Initial state
            expect(ballController.isAttached(ball)).toBe(true);

            // 2. Move paddle
            mockContainer.dispatchEvent(new MouseEvent('mousemove', {
                clientX: 450,
                clientY: 350,
                bubbles: true,
            }));

            const paddleTarget = inputManager.getPaddleTarget();
            if (paddleTarget) {
                paddleController.updatePaddle(paddle, 1 / 60, {
                    leftPressed: false,
                    rightPressed: false,
                    mouseX: paddleTarget.x,
                    touchX: undefined,
                    launchRequested: false,
                }, PLAYFIELD_WIDTH);
            }

            ballController.updateAttachment(ball, paddleController.getPaddleCenter(paddle));

            expect(paddleController.getPaddleCenter(paddle).x).toBe(450);
            expect(ballController.isAttached(ball)).toBe(true);

            // 3. Launch ball
            mockContainer.dispatchEvent(new MouseEvent('mousedown', {
                clientX: 450,
                clientY: 350,
                bubbles: true,
            }));

            if (inputManager.shouldLaunch()) {
                launchController.launch(ball);
                inputManager.resetLaunchTrigger();
            }

            expect(ballController.isAttached(ball)).toBe(false);
            expect(ball.physicsBody.velocity.y).toBeLessThan(0);

            // 4. Ball moves freely
            physicsWorld.step(1 / 60);
            const postLaunchPosition = { ...ball.physicsBody.position };

            physicsWorld.step(1 / 60);
            const newPosition = ball.physicsBody.position;

            expect(newPosition.x).not.toBe(postLaunchPosition.x);
            expect(newPosition.y).not.toBe(postLaunchPosition.y);
        });
    });

    describe('Reflection Dynamics', () => {
        it('keeps horizontal velocity near zero for center paddle hits', () => {
            const paddleBody = Bodies.rectangle(400, 560, 100, 20, { isStatic: true, label: 'paddle' });
            const ballBody = Bodies.circle(400, 540, 10, { label: 'ball' });

            Body.setVelocity(ballBody, { x: 2, y: 9 });

            reflectOffPaddle(ballBody, paddleBody, {
                paddleWidth: 100,
                minSpeed: 8,
            });

            expect(Math.abs(ballBody.velocity.x)).toBeLessThan(0.5);
            expect(ballBody.velocity.y).toBeLessThan(0);
            expect(Vector.magnitude(ballBody.velocity)).toBeGreaterThanOrEqual(8);
        });

        it('produces steep deflection angles for edge hits and enforces minimum speed', () => {
            const paddleBody = Bodies.rectangle(400, 560, 100, 20, { isStatic: true, label: 'paddle' });
            const ballBody = Bodies.circle(455, 540, 10, { label: 'ball' });

            Body.setVelocity(ballBody, { x: -1, y: 9 });

            reflectOffPaddle(ballBody, paddleBody, {
                paddleWidth: 100,
                minSpeed: 9,
            });

            const speed = Vector.magnitude(ballBody.velocity);
            expect(speed).toBeGreaterThanOrEqual(9);
            expect(Math.abs(ballBody.velocity.x)).toBeGreaterThan(Math.abs(ballBody.velocity.y) * 0.5);
            expect(ballBody.velocity.y).toBeLessThan(0);
        });
    });

    describe('Sticky Reward Interplay', () => {
        it('reattaches the primary ball when the sticky reward is active', () => {
            const reward = spinWheel(() => 0);
            expect(reward.type).toBe('sticky-paddle');
            if (reward.type !== 'sticky-paddle') {
                throw new Error('Expected sticky-paddle reward');
            }

            const powerUps = new PowerUpManager();
            powerUps.activate('sticky-paddle', { defaultDuration: reward.duration });

            launchController.launch(ball);
            expect(ballController.isAttached(ball)).toBe(false);
            expect(powerUps.isActive('sticky-paddle')).toBe(true);

            const attachmentOffset = {
                x: ball.physicsBody.position.x - paddle.physicsBody.position.x,
                y: -ball.radius - paddle.height / 2,
            };

            physicsWorld.attachBallToPaddle(ball.physicsBody, paddle.physicsBody, attachmentOffset);
            ball.isAttached = true;
            ball.attachmentOffset = attachmentOffset;

            expect(physicsWorld.isBallAttached(ball.physicsBody)).toBe(true);

            powerUps.update(reward.duration);
            expect(powerUps.isActive('sticky-paddle')).toBe(false);

            physicsWorld.detachBallFromPaddle(ball.physicsBody);
            ball.isAttached = false;
            Body.setVelocity(ball.physicsBody, { x: 0, y: -5 });

            expect(physicsWorld.isBallAttached(ball.physicsBody)).toBe(false);
        });
    });
});