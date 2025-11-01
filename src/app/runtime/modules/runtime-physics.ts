import type { StageHandle } from 'render/stage';
import { Container } from 'pixi.js';
import type { MatterBody as Body } from 'physics/matter';
import { createPhysicsAssembly, type RuntimeVisuals } from '../physics-assembly';
import type { MultiBallColors } from '../../multi-ball-controller';
import type { RandomManager } from 'util/random';
import type { VisualFactoryHandle } from 'render/visual-factory';

export interface RuntimePhysicsOptions {
    readonly container: HTMLElement;
    readonly stage: StageHandle;
    readonly playfieldDimensions: {
        readonly width: number;
        readonly height: number;
    };
    readonly random: RandomManager;
    readonly visualFactory: VisualFactoryHandle;
    readonly themeBallColors: MultiBallColors;
    readonly themeAccents: {
        readonly combo: number;
        readonly powerUp: number;
    };
    readonly runtimeDefaults: {
        readonly baseBallSpeed: number;
        readonly maxBallSpeed: number;
        readonly launchBallSpeed: number;
        readonly gravity: number;
        readonly ballRestitution: number;
        readonly paddleBaseWidth: number;
        readonly paddleWidthMultiplier: number;
        readonly speedGovernorMultiplier: number;
    };
    readonly paddle: {
        readonly width: number;
        readonly height: number;
        readonly speed: number;
        readonly spawnOffsetFromBottom: number;
    };
    readonly paddleSmoothing: {
        readonly responsiveness: number;
        readonly snapThreshold: number;
    };
    readonly ball: {
        readonly radius: number;
    };
    readonly multiBall: {
        readonly multiplier: number;
        readonly maxExtraBalls: number;
    };
}

export interface RuntimePhysicsHandle {
    readonly physics: ReturnType<typeof createPhysicsAssembly>['physics'];
    readonly runtimeState: ReturnType<typeof createPhysicsAssembly>['runtimeState'];
    readonly ballController: ReturnType<typeof createPhysicsAssembly>['ballController'];
    readonly paddleController: ReturnType<typeof createPhysicsAssembly>['paddleController'];
    readonly launchController: ReturnType<typeof createPhysicsAssembly>['launchController'];
    readonly runtimeInput: ReturnType<typeof createPhysicsAssembly>['runtimeInput'];
    readonly ball: ReturnType<typeof createPhysicsAssembly>['ball'];
    readonly paddle: ReturnType<typeof createPhysicsAssembly>['paddle'];
    readonly visuals: RuntimeVisuals | null;
    readonly ballGraphics: ReturnType<typeof createPhysicsAssembly>['ballGraphics'];
    readonly paddleGraphics: ReturnType<typeof createPhysicsAssembly>['paddleGraphics'];
    readonly ballGlowFilter: ReturnType<typeof createPhysicsAssembly>['ballGlowFilter'];
    readonly ballHueFilter: ReturnType<typeof createPhysicsAssembly>['ballHueFilter'];
    readonly gameContainer: ReturnType<typeof createPhysicsAssembly>['gameContainer'];
    readonly multiBallController: ReturnType<typeof createPhysicsAssembly>['multiBallController'];
    readonly visualBodies: Map<Body, Container>;
}

export const createRuntimePhysics = ({
    container,
    stage,
    playfieldDimensions,
    random,
    visualFactory,
    themeBallColors,
    themeAccents,
    runtimeDefaults,
    paddle,
    paddleSmoothing,
    ball,
    multiBall,
}: RuntimePhysicsOptions): RuntimePhysicsHandle => {
    const visualBodies = new Map<Body, Container>();

    const physicsAssembly = createPhysicsAssembly({
        container,
        stage,
        playfieldDimensions,
        themeBallColors,
        themeAccents,
        random,
        visualFactory,
        visualBodies,
        runtimeStateDefaults: {
            baseBallSpeed: runtimeDefaults.baseBallSpeed,
            maxBallSpeed: runtimeDefaults.maxBallSpeed,
            launchBallSpeed: runtimeDefaults.launchBallSpeed,
            gravity: runtimeDefaults.gravity,
            ballRestitution: runtimeDefaults.ballRestitution,
            paddleBaseWidth: runtimeDefaults.paddleBaseWidth,
            paddleWidthMultiplier: runtimeDefaults.paddleWidthMultiplier,
            speedGovernorMultiplier: runtimeDefaults.speedGovernorMultiplier,
        },
        physics: {
            width: playfieldDimensions.width,
            height: playfieldDimensions.height,
            gravity: 0,
        },
        paddle: {
            width: paddle.width,
            height: paddle.height,
            speed: paddle.speed,
            spawnPosition: {
                x: playfieldDimensions.width / 2,
                y: playfieldDimensions.height - paddle.spawnOffsetFromBottom,
            },
        },
        paddleSmoothing,
        ball,
        ballMaxSpeed: runtimeDefaults.maxBallSpeed,
        multiBall,
    });

    return {
        ...physicsAssembly,
        visuals: physicsAssembly.visuals,
        visualBodies,
    };
};
