import { Bodies, Body, Composite, Engine, World, type Vector } from 'matter-js';

const DEFAULT_TIMESTEP_MS = 1000 / 120;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_WALL_THICKNESS = 32;

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
    readonly position?: Vector;
    readonly restitution?: number;
    readonly label?: string;
    readonly velocity?: Vector;
}

export interface PaddleFactoryOptions {
    readonly size: { readonly width: number; readonly height: number };
    readonly position: Vector;
    readonly label?: string;
}

export interface BrickFactoryOptions {
    readonly size: { readonly width: number; readonly height: number };
    readonly position: Vector;
    readonly label?: string;
    readonly isSensor?: boolean;
}

export interface PhysicsFactories {
    readonly ball: (options: BallFactoryOptions) => Body;
    readonly paddle: (options: PaddleFactoryOptions) => Body;
    readonly brick: (options: BrickFactoryOptions) => Body;
    readonly bounds: () => Body[];
}

export interface PhysicsWorldHandle {
    readonly engine: Engine;
    readonly world: World;
    readonly step: (deltaMs?: number) => void;
    readonly add: (body: Body | readonly Body[]) => void;
    readonly remove: (body: Body | readonly Body[]) => void;
    readonly factory: PhysicsFactories;
    readonly dispose: () => void;
}

const withDefaultVector = (vector: Vector | undefined, fallback: Vector): Vector => vector ?? fallback;

const toBodyArray = (input: Body | readonly Body[]): Body[] => (Array.isArray(input) ? [...input] : [input]);

const configureGravity = (engine: Engine, gravity?: number): void => {
    engine.world.gravity.x = 0;
    engine.world.gravity.y = gravity ?? 1;
    engine.world.gravity.scale = 0.001;
};

const createFactories = (_world: World, dimensions: PhysicsWorldDimensions): PhysicsFactories => {
    const wallThickness = dimensions.wallThickness ?? DEFAULT_WALL_THICKNESS;
    const halfWidth = dimensions.width / 2;
    const halfHeight = dimensions.height / 2;

    const ball: PhysicsFactories['ball'] = (options) => {
        const position = withDefaultVector(options.position, { x: halfWidth, y: halfHeight });
        const body = Bodies.circle(position.x, position.y, options.radius, {
            restitution: options.restitution ?? 0.98,
            friction: 0,
            frictionAir: 0.001,
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

    const brick: PhysicsFactories['brick'] = (options) =>
        Bodies.rectangle(options.position.x, options.position.y, options.size.width, options.size.height, {
            label: options.label ?? 'brick',
            restitution: 1,
            friction: 0,
            frictionStatic: 0,
            isStatic: true,
            isSensor: options.isSensor ?? false,
        });

    const bounds: PhysicsFactories['bounds'] = () => {
        const horizontalWidth = dimensions.width + wallThickness * 2;
        const verticalHeight = dimensions.height + wallThickness * 2;
        const top = Bodies.rectangle(halfWidth, -wallThickness / 2, horizontalWidth, wallThickness, {
            label: 'wall-top',
            isStatic: true,
        });
        const right = Bodies.rectangle(dimensions.width + wallThickness / 2, halfHeight, wallThickness, verticalHeight, {
            label: 'wall-right',
            isStatic: true,
        });
        const bottom = Bodies.rectangle(halfWidth, dimensions.height + wallThickness / 2, horizontalWidth, wallThickness, {
            label: 'wall-bottom',
            isStatic: true,
            isSensor: true,
        });
        const left = Bodies.rectangle(-wallThickness / 2, halfHeight, wallThickness, verticalHeight, {
            label: 'wall-left',
            isStatic: true,
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

    const engine = Engine.create({ enableSleeping: config.enableSleeping ?? false });
    configureGravity(engine, config.gravity);
    const timeStep = config.timeStepMs ?? DEFAULT_TIMESTEP_MS;

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
        Engine.update(engine, deltaMs);
    };

    const dispose: PhysicsWorldHandle['dispose'] = () => {
        Composite.clear(engine.world, false);
        Engine.clear(engine);
    };

    return {
        engine,
        world: engine.world,
        add,
        remove,
        step,
        factory: createFactories(engine.world, dimensions),
        dispose,
    };
};
