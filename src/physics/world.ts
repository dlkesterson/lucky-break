import { Bodies, Body, Composite, Engine } from 'physics/matter';
import type { MatterVector, MatterBody as BodyType, MatterEngine as EngineType, MatterWorld as WorldType } from 'physics/matter';
import type { BrickForm } from 'util/levels';
import { rootLogger } from 'util/log';
import type { Vector2, BallAttachment } from '../types';

type PhysicsVector = MatterVector;
type PhysicsBody = BodyType;
type PhysicsEngine = EngineType;
type PhysicsWorld = WorldType;

const DEFAULT_TIMESTEP_MS = 1000 / 120;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_WALL_THICKNESS = 32;

const physicsLogger = rootLogger.child('physics:world');

export interface PhysicsWorldDimensions {
    readonly width: number;
    readonly height: number;
    readonly wallThickness?: number;
}

export interface PhysicsWorldConfig {
    readonly gravity?: number;
    readonly timeStepMs?: number;
    readonly enableSleeping?: boolean;
    readonly dimensions?: PhysicsWorldDimensions;
}

export interface BallFactoryOptions {
    readonly radius: number;
    readonly position?: PhysicsVector;
    readonly restitution?: number;
    readonly label?: string;
    readonly velocity?: PhysicsVector;
}

export interface PaddleFactoryOptions {
    readonly size: { readonly width: number; readonly height: number };
    readonly position: PhysicsVector;
    readonly label?: string;
}

export interface BrickFactoryOptions {
    readonly size: { readonly width: number; readonly height: number };
    readonly position: PhysicsVector;
    readonly label?: string;
    readonly isSensor?: boolean;
    readonly shape?: BrickForm;
}

export interface PhysicsFactories {
    readonly ball: (options: BallFactoryOptions) => PhysicsBody;
    readonly paddle: (options: PaddleFactoryOptions) => PhysicsBody;
    readonly brick: (options: BrickFactoryOptions) => PhysicsBody;
    readonly bounds: () => PhysicsBody[];
}

export interface PhysicsWorldHandle {
    readonly engine: PhysicsEngine;
    readonly world: PhysicsWorld;
    readonly step: (deltaMs?: number) => void;
    readonly add: (body: PhysicsBody | PhysicsBody[]) => void;
    readonly remove: (body: PhysicsBody | PhysicsBody[]) => void;
    readonly factory: PhysicsFactories;
    readonly dispose: () => void;
    // Ball attachment tracking
    readonly attachBallToPaddle: (ball: PhysicsBody, paddle: PhysicsBody, offset?: Vector2) => void;
    readonly detachBallFromPaddle: (ball: PhysicsBody) => void;
    readonly updateBallAttachment: (ball: PhysicsBody, paddlePosition: Vector2) => void;
    readonly isBallAttached: (ball: PhysicsBody) => boolean;
    readonly getBallAttachment: (ball: PhysicsBody) => BallAttachment | null;
}

const withDefaultVector = (vector: PhysicsVector | undefined, fallback: PhysicsVector): PhysicsVector => vector ?? fallback;

const toBodyArray = (input: PhysicsBody | PhysicsBody[]): PhysicsBody[] => {
    if (Array.isArray(input)) {
        return [...input];
    }

    return [input];
};

const configureGravity = (engine: PhysicsEngine, gravity?: number): void => {
    engine.world.gravity.x = 0;
    engine.world.gravity.y = gravity ?? 1;
    engine.world.gravity.scale = 0.001;
};

const createFactories = (_world: PhysicsWorld, dimensions: PhysicsWorldDimensions): PhysicsFactories => {
    const wallThickness = dimensions.wallThickness ?? DEFAULT_WALL_THICKNESS;
    const halfWidth = dimensions.width / 2;
    const halfHeight = dimensions.height / 2;

    const ball: PhysicsFactories['ball'] = (options) => {
        const position = withDefaultVector(options.position, { x: halfWidth, y: halfHeight });
        const body = Bodies.circle(position.x, position.y, options.radius, {
            restitution: options.restitution ?? 1, // Perfect energy-preserving bounces
            friction: 0,
            frictionAir: 0,  // Remove air resistance for consistent ball speed
            label: options.label ?? 'ball',
        });

        if (options.velocity) {
            Body.setVelocity(body, options.velocity);
        }

        return body;
    };

    const paddle: PhysicsFactories['paddle'] = (options) => {
        const body = Bodies.rectangle(options.position.x, options.position.y, options.size.width, options.size.height, {
            label: options.label ?? 'paddle',
            inertia: Infinity,
            friction: 0,
            frictionStatic: 0,
            frictionAir: 0,
            restitution: 1,
            isStatic: true,
        });

        return body;
    };

    const brick: PhysicsFactories['brick'] = (options) => {
        const baseOptions = {
            label: options.label ?? 'brick',
            restitution: 1,
            friction: 0,
            frictionStatic: 0,
            isStatic: true,
            isSensor: options.isSensor ?? false,
        } as const;

        const shape: BrickForm = options.shape ?? 'rectangle';
        const { width, height } = options.size;
        const { x, y } = options.position;

        if (shape === 'circle') {
            const radius = Math.max(4, Math.min(width, height) / 2);
            return Bodies.circle(x, y, radius, baseOptions);
        }

        if (shape === 'diamond') {
            const halfWidth = Math.max(4, width / 2);
            const halfHeight = Math.max(4, height / 2);
            const vertices = [
                { x: 0, y: -halfHeight },
                { x: halfWidth, y: 0 },
                { x: 0, y: halfHeight },
                { x: -halfWidth, y: 0 },
            ];

            const body = Bodies.fromVertices(x, y, [vertices], baseOptions, true) as PhysicsBody | PhysicsBody[] | undefined;
            if (!body) {
                throw new Error('Failed to create diamond brick body.');
            }
            if (Array.isArray(body)) {
                const primary = body[0];
                if (!primary) {
                    throw new Error('Diamond brick body array was empty.');
                }
                return primary;
            }
            return body;
        }

        return Bodies.rectangle(x, y, width, height, baseOptions);
    };

    const bounds: PhysicsFactories['bounds'] = () => {
        const horizontalWidth = dimensions.width + wallThickness * 2;
        const verticalHeight = dimensions.height + wallThickness * 2;
        const top = Bodies.rectangle(halfWidth, -wallThickness / 2, horizontalWidth, wallThickness, {
            label: 'wall-top',
            isStatic: true,
            restitution: 1,
        });
        const right = Bodies.rectangle(dimensions.width + wallThickness / 2, halfHeight, wallThickness, verticalHeight, {
            label: 'wall-right',
            isStatic: true,
            restitution: 1,
        });
        const bottom = Bodies.rectangle(halfWidth, dimensions.height + wallThickness / 2, horizontalWidth, wallThickness, {
            label: 'wall-bottom',
            isStatic: true,
            restitution: 1,
        });
        const left = Bodies.rectangle(-wallThickness / 2, halfHeight, wallThickness, verticalHeight, {
            label: 'wall-left',
            isStatic: true,
            restitution: 1,
        });

        return [top, right, bottom, left];
    };

    return {
        ball,
        paddle,
        brick,
        bounds,
    };
};

export const createPhysicsWorld = (config: PhysicsWorldConfig = {}): PhysicsWorldHandle => {
    const dimensions: PhysicsWorldDimensions = config.dimensions ?? {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
    };

    const engine = Engine.create({
        enableSleeping: config.enableSleeping ?? false,
        constraintIterations: 4,
        velocityIterations: 8,
        positionIterations: 8, // Increased for better collision accuracy and prevent tunneling
    });
    configureGravity(engine, config.gravity);
    const timeStep = config.timeStepMs ?? DEFAULT_TIMESTEP_MS;

    // Set world bounds to prevent tunneling
    engine.world.bounds = {
        min: { x: 0, y: 0 },
        max: { x: dimensions.width, y: dimensions.height },
    };

    // Ball attachment tracking
    const ballAttachments = new Map<number, BallAttachment>();
    const orphanedAttachmentWarnings = new Set<number>();

    const attachBallToPaddle: PhysicsWorldHandle['attachBallToPaddle'] = (ball, paddle, offset = { x: 0, y: -ball.circleRadius! - paddle.circleRadius! }) => {
        orphanedAttachmentWarnings.delete(ball.id);

        ballAttachments.set(ball.id, {
            isAttached: true,
            attachmentOffset: offset,
            paddlePosition: { x: paddle.position.x, y: paddle.position.y },
        });

        // Set ball velocity to zero and position it relative to paddle
        Body.setVelocity(ball, { x: 0, y: 0 });
        Body.setPosition(ball, {
            x: paddle.position.x + offset.x,
            y: paddle.position.y + offset.y,
        });
    };

    const detachBallFromPaddle: PhysicsWorldHandle['detachBallFromPaddle'] = (ball) => {
        ballAttachments.delete(ball.id);
        orphanedAttachmentWarnings.delete(ball.id);
    };

    const updateBallAttachment: PhysicsWorldHandle['updateBallAttachment'] = (ball, paddlePosition) => {
        const attachment = ballAttachments.get(ball.id);
        if (attachment?.isAttached) {
            attachment.paddlePosition = paddlePosition;
            Body.setPosition(ball, {
                x: paddlePosition.x + attachment.attachmentOffset.x,
                y: paddlePosition.y + attachment.attachmentOffset.y,
            });
            Body.setVelocity(ball, { x: 0, y: 0 });
        }
    };

    const isBallAttached: PhysicsWorldHandle['isBallAttached'] = (ball) => {
        const attachment = ballAttachments.get(ball.id);
        return attachment?.isAttached ?? false;
    };

    const getBallAttachment: PhysicsWorldHandle['getBallAttachment'] = (ball) => {
        return ballAttachments.get(ball.id) ?? null;
    };

    const add: PhysicsWorldHandle['add'] = (bodyOrBodies) => {
        toBodyArray(bodyOrBodies).forEach((body) => {
            Composite.add(engine.world, body);
        });
    };

    const remove: PhysicsWorldHandle['remove'] = (bodyOrBodies) => {
        toBodyArray(bodyOrBodies).forEach((body) => {
            Composite.remove(engine.world, body);
        });
    };

    const step: PhysicsWorldHandle['step'] = (deltaMs = timeStep) => {
        // Update ball attachments before stepping physics
        const orphanedBallIds: number[] = [];

        ballAttachments.forEach((attachment, ballId) => {
            if (attachment.isAttached) {
                const ball = Composite.get(engine.world, ballId, 'body') as PhysicsBody;
                if (!ball) {
                    if (!orphanedAttachmentWarnings.has(ballId)) {
                        orphanedAttachmentWarnings.add(ballId);
                        physicsLogger.warn('Orphaned ball attachment removed after missing physics body', {
                            ballId,
                        });
                    }
                    orphanedBallIds.push(ballId);
                    return;
                }

                if (orphanedAttachmentWarnings.has(ballId)) {
                    orphanedAttachmentWarnings.delete(ballId);
                }

                Body.setPosition(ball, {
                    x: attachment.paddlePosition.x + attachment.attachmentOffset.x,
                    y: attachment.paddlePosition.y + attachment.attachmentOffset.y,
                });
                Body.setVelocity(ball, { x: 0, y: 0 });
                // Clear any forces that may have been applied
                Body.setVelocity(ball, { x: 0, y: 0 });
                if (ball.force) {
                    ball.force.x = 0;
                    ball.force.y = 0;
                }
            }
        });

        if (orphanedBallIds.length > 0) {
            orphanedBallIds.forEach((ballId) => {
                ballAttachments.delete(ballId);
                orphanedAttachmentWarnings.delete(ballId);
            });
        }

        Engine.update(engine, deltaMs);
    };

    const dispose: PhysicsWorldHandle['dispose'] = () => {
        Composite.clear(engine.world, false);
        Engine.clear(engine);
        ballAttachments.clear();
        orphanedAttachmentWarnings.clear();
    };

    return {
        engine,
        world: engine.world,
        add,
        remove,
        step,
        factory: createFactories(engine.world, dimensions),
        dispose,
        attachBallToPaddle,
        detachBallFromPaddle,
        updateBallAttachment,
        isBallAttached,
        getBallAttachment,
    };
};
