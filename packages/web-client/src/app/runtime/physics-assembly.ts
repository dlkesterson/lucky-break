import { GlowFilter } from '@pixi/filter-glow';
import { ColorMatrixFilter, Container, Graphics, type Filter } from 'pixi.js';
import { BallAttachmentController } from 'physics/ball-attachment';
import { PhysicsBallLaunchController } from 'physics/ball-launch';
import type { MatterBody as Body } from 'physics/matter';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { StageHandle } from 'render/stage';
import { PaddleBodyController } from 'render/paddle-body';
import type { VisualFactoryHandle } from 'render/visual-factory';
import { createPhysicsWorld, type PhysicsWorldHandle } from 'physics/world';
import type { RandomManager } from 'util/random';
import { createMultiBallController, type MultiBallController, type MultiBallColors } from '../multi-ball-controller';
import { createRuntimeInput, type RuntimeInput } from './input';
import { createRuntimeState, type RuntimeStateDefaults } from './state-store';
import { createRuntimeVisuals } from './visuals';
import type { GameplayRuntimeState } from './types';

export type RuntimeVisuals = ReturnType<typeof createRuntimeVisuals>;

export interface PhysicsAssemblyOptions {
    readonly container: HTMLElement;
    readonly stage: StageHandle;
    readonly playfieldDimensions: { readonly width: number; readonly height: number };
    readonly themeBallColors: MultiBallColors;
    readonly themeAccents: { readonly combo: number; readonly powerUp: number };
    readonly random: RandomManager;
    readonly visualFactory: VisualFactoryHandle;
    readonly visualBodies: Map<Body, Container>;
    readonly runtimeStateDefaults: RuntimeStateDefaults;
    readonly physics: { readonly width: number; readonly height: number; readonly gravity: number };
    readonly paddle: {
        readonly width: number;
        readonly height: number;
        readonly speed: number;
        readonly spawnPosition: { readonly x: number; readonly y: number };
    };
    readonly paddleSmoothing: {
        readonly responsiveness: number;
        readonly snapThreshold: number;
    };
    readonly ball: { readonly radius: number };
    readonly ballMaxSpeed: number;
    readonly multiBall: {
        readonly multiplier: number;
        readonly maxExtraBalls: number;
    };
}

export interface PhysicsAssemblyResult {
    readonly physics: PhysicsWorldHandle;
    readonly runtimeState: GameplayRuntimeState;
    readonly ballController: BallAttachmentController;
    readonly paddleController: PaddleBodyController;
    readonly launchController: PhysicsBallLaunchController;
    readonly runtimeInput: RuntimeInput;
    readonly ball: Ball;
    readonly paddle: Paddle;
    readonly visuals: RuntimeVisuals;
    readonly ballGraphics: Graphics;
    readonly paddleGraphics: Graphics;
    readonly ballGlowFilter: GlowFilter;
    readonly ballHueFilter: ColorMatrixFilter;
    readonly gameContainer: Container;
    readonly multiBallController: MultiBallController;
}

export const createPhysicsAssembly = (
    options: PhysicsAssemblyOptions,
): PhysicsAssemblyResult => {
    const physics = createPhysicsWorld({
        dimensions: {
            width: options.physics.width,
            height: options.physics.height,
        },
        gravity: options.physics.gravity,
    });

    const runtimeState = createRuntimeState(options.runtimeStateDefaults);

    const ballController = new BallAttachmentController();
    const paddleController = new PaddleBodyController();
    const runtimeInput = createRuntimeInput({
        container: options.container,
        stage: options.stage,
        playfieldWidth: options.playfieldDimensions.width,
        smoothing: options.paddleSmoothing,
    });
    const launchController = new PhysicsBallLaunchController();

    const paddle = paddleController.createPaddle(options.paddle.spawnPosition, {
        width: options.paddle.width,
        height: options.paddle.height,
        speed: options.paddle.speed,
    });
    physics.add(paddle.physicsBody);

    const ball = ballController.createAttachedBall(paddleController.getPaddleCenter(paddle), {
        radius: options.ball.radius,
        restitution: runtimeState.ballRestitution,
    });
    physics.add(ball.physicsBody);
    ball.physicsBody.restitution = runtimeState.ballRestitution;

    runtimeInput.install();

    const visuals = createRuntimeVisuals({
        stage: options.stage,
        playfieldDimensions: options.playfieldDimensions,
        themeBallColors: options.themeBallColors,
        themeAccents: options.themeAccents,
        random: options.random,
        ball,
        paddle,
        ballController,
        paddleController,
        inputManager: runtimeInput.manager,
        ballMaxSpeed: options.ballMaxSpeed,
    });
    const gameContainer = visuals.gameContainer;

    const ballGraphics = options.visualFactory.ball.create({ radius: ball.radius });
    ballGraphics.zIndex = 50;
    const ballGlowFilter = new GlowFilter({
        distance: 18,
        outerStrength: 1.4,
        innerStrength: 0,
        color: options.themeBallColors.highlight,
        quality: 0.3,
    });
    const ballHueFilter = new ColorMatrixFilter();
    ballGraphics.filters = [ballGlowFilter as unknown as Filter, ballHueFilter];
    gameContainer.addChild(ballGraphics);
    options.visualBodies.set(ball.physicsBody, ballGraphics);

    const multiBallController = createMultiBallController({
        physics,
        ball,
        paddle,
        ballGraphics,
        gameContainer,
        visualBodies: options.visualBodies,
        drawBallVisual: (graphics, radius, palette) =>
            options.visualFactory.ball.draw(graphics, radius, palette),
        colors: options.themeBallColors,
        multiplier: options.multiBall.multiplier,
        maxExtraBalls: options.multiBall.maxExtraBalls,
        sampleRestitution: () => runtimeState.ballRestitution,
        initialShape: 'sphere',
    });
    multiBallController.setRestitution(runtimeState.ballRestitution);

    const paddleGraphics = options.visualFactory.paddle.create({ width: paddle.width, height: paddle.height });
    paddleGraphics.zIndex = 60;
    gameContainer.addChild(paddleGraphics);
    options.visualBodies.set(paddle.physicsBody, paddleGraphics);

    return {
        physics,
        runtimeState,
        ballController,
        paddleController,
        launchController,
        runtimeInput,
        ball,
        paddle,
        visuals,
        ballGraphics,
        paddleGraphics,
        ballGlowFilter,
        ballHueFilter,
        gameContainer,
        multiBallController,
    } satisfies PhysicsAssemblyResult;
};
