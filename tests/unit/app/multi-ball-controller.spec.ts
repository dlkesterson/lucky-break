import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
    const createPoint = () => {
        return {
            x: 0,
            y: 0,
            set(x: number, y?: number) {
                this.x = x;
                this.y = y ?? x;
            },
        };
    };

    class MockContainer {
        public children: unknown[] = [];
        public visible = true;
        public alpha = 1;
        public eventMode: string | undefined;
        public position = createPoint();
        public scale = createPoint();
        public parent: MockContainer | null = null;
        public x = 0;
        public y = 0;
        public rotation = 0;
        public zIndex = 0;
        public destroyed = false;

        addChild<T>(...items: T[]): T {
            this.children.push(...items);
            items.forEach((item) => {
                if (item && typeof item === 'object') {
                    (item as { parent?: MockContainer | null }).parent = this;
                }
            });
            return items[0];
        }

        removeChild<T>(item: T): T {
            this.children = this.children.filter((candidate) => candidate !== item);
            if (item && typeof item === 'object') {
                (item as { parent?: MockContainer | null }).parent = null;
            }
            return item;
        }

        removeChildren(): void {
            this.children.forEach((child) => {
                if (child && typeof child === 'object') {
                    (child as { parent?: MockContainer | null }).parent = null;
                }
            });
            this.children = [];
        }

        destroy(options?: { children?: boolean }): void {
            this.destroyed = true;
            if (options?.children) {
                this.children = [];
            }
        }
    }

    class Graphics extends MockContainer {
        public destroyed = false;
        public destroy = vi.fn(() => {
            this.destroyed = true;
        });
        public circle = vi.fn(() => this);
        public fill = vi.fn(() => this);
        public stroke = vi.fn(() => this);
        public clear = vi.fn(() => this);
    }

    return {
        Container: MockContainer,
        Graphics,
    };
});

const matterMocks = vi.hoisted(() => ({
    setVelocity: vi.fn((body: any, velocity: { x: number; y: number }) => {
        body.velocity = { ...velocity };
    }),
}));

vi.mock('physics/matter', () => {
    const { setVelocity } = matterMocks;
    const magnitude = (vector: { x: number; y: number }) => Math.hypot(vector.x, vector.y);
    const normalise = (vector: { x: number; y: number }) => {
        const length = magnitude(vector);
        if (length === 0) {
            return { x: 0, y: -1 };
        }
        return { x: vector.x / length, y: vector.y / length };
    };
    const create = (x: number, y: number) => ({ x, y });
    const rotate = (vector: { x: number; y: number }, angle: number) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: vector.x * cos - vector.y * sin,
            y: vector.x * sin + vector.y * cos,
        };
    };
    const clone = (vector: { x: number; y: number }) => ({ ...vector });
    const mult = (vector: { x: number; y: number }, scalar: number) => ({
        x: vector.x * scalar,
        y: vector.y * scalar,
    });

    const exports = {
        Body: { setVelocity },
        Vector: { magnitude, normalise, create, rotate, clone, mult },
    };

    return {
        ...exports,
        default: exports,
    };
});

import { Body as MatterBody } from 'physics/matter';
import type { MatterBody as Body } from 'physics/matter';
import { createMultiBallController } from 'app/multi-ball-controller';
import { mixColors } from 'render/playfield-visuals';

const matterBodyMock = vi.mocked(MatterBody);

const createBody = (id: number, position: { x: number; y: number }, velocity: { x: number; y: number }) => ({
    id,
    position: { ...position },
    velocity: { ...velocity },
    angle: 0,
});

describe('createMultiBallController', () => {
    let physics: any;
    let ball: any;
    let paddle: any;
    let ballGraphics: any;
    let gameContainer: any;
    let visualBodies: Map<Body, any>;
    let drawBallVisual: ReturnType<typeof vi.fn>;
    let colors: any;
    let multiplier: number;
    let maxExtraBalls: number;
    let sampleRestitution: () => number;

    beforeEach(async () => {
        const pixi = await import('pixi.js');
        const { Container, Graphics } = pixi;
        let nextId = 10;
        physics = {
            factory: {
                ball: vi.fn(({ position, radius, restitution }: { position: { x: number; y: number }; radius: number; restitution?: number }) => {
                    return {
                        id: nextId++,
                        position: { ...position },
                        velocity: { x: 0, y: 0 },
                        angle: 0,
                        radius,
                        restitution: restitution ?? 1,
                    };
                }),
            },
            add: vi.fn(),
            remove: vi.fn(),
        };

        ball = {
            radius: 14,
            physicsBody: createBody(1, { x: 200, y: 320 }, { x: 4, y: -8 }) as any,
            isAttached: true,
            attachmentOffset: { x: 0, y: 0 },
        };

        paddle = { height: 24 };
        ballGraphics = new Graphics();
        gameContainer = new Container();
        visualBodies = new Map<Body, any>();
        drawBallVisual = vi.fn();
        colors = { core: 0x112233, aura: 0x445566, highlight: 0x778899 };
        multiplier = 3;
        maxExtraBalls = 4;
        sampleRestitution = vi.fn(() => 0.98) as unknown as () => number;
        matterBodyMock.setVelocity.mockClear();
        matterMocks.setVelocity.mockClear();
    });

    it('spawns extra balls with cloned visuals and velocity', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 9 });

        expect(physics.factory.ball).toHaveBeenCalledTimes(2);
        expect(physics.add).toHaveBeenCalledTimes(2);
        expect(matterBodyMock.setVelocity).toHaveBeenCalledTimes(2);
        expect(drawBallVisual).toHaveBeenCalledTimes(2);
        expect(gameContainer.children).toHaveLength(controller.count() * 2);
        expect(controller.count()).toBe(2);

        const expectedBaseColor = mixColors(colors.core, 0xffc94c, 0.5);
        const palette = drawBallVisual.mock.calls[0]?.[2];
        expect(palette).toMatchObject({
            baseColor: expectedBaseColor,
            baseAlpha: 0.8,
            rimColor: colors.highlight,
            rimAlpha: 0.5,
            innerColor: colors.aura,
            innerAlpha: 0.4,
            innerScale: 0.5,
        });

        const createdBodies = Array.from(visualBodies.keys());
        expect(createdBodies).toHaveLength(2);
        createdBodies.forEach((bodyLike) => {
            expect(controller.isExtraBallBody(bodyLike)).toBe(true);
            expect(visualBodies.get(bodyLike)?.parent).toBe(gameContainer);
        });
    });

    it('recolors existing extra balls when applying a new theme', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 9 });
        expect(controller.count()).toBeGreaterThan(0);

        drawBallVisual.mockClear();
        const nextColors = { core: 0x998877, aura: 0x556677, highlight: 0xaabbcc };
        controller.applyTheme(nextColors);

        expect(drawBallVisual).toHaveBeenCalledTimes(controller.count());
        const palette = drawBallVisual.mock.calls[0]?.[2];
        expect(palette).toMatchObject({
            baseColor: mixColors(nextColors.core, 0xffc94c, 0.5),
            rimColor: nextColors.highlight,
            innerColor: nextColors.aura,
        });
    });

    it('respects an explicit requested extra ball count', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 9, requestedCount: 1 });

        expect(controller.count()).toBe(1);
        expect(physics.factory.ball).toHaveBeenCalledTimes(1);
        expect(drawBallVisual).toHaveBeenCalledTimes(1);
    });

    it('clamps requested extra balls to the remaining capacity', () => {
        maxExtraBalls = 3;
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 9, requestedCount: 2 });
        expect(controller.count()).toBeLessThanOrEqual(2);

        controller.spawnExtraBalls({ currentLaunchSpeed: 9, requestedCount: 3 });
        expect(controller.count()).toBe(maxExtraBalls);
    });

    it('promotes the earliest extra ball to become primary', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 10 });
        const originalPrimary = ball.physicsBody;

        const promoted = controller.promoteExtraBallToPrimary(originalPrimary);

        expect(promoted).toBe(true);
        expect(physics.remove).toHaveBeenCalledWith(originalPrimary);
        expect(controller.isExtraBallBody(originalPrimary)).toBe(false);
        expect(ball.physicsBody).not.toBe(originalPrimary);
        expect(ball.isAttached).toBe(false);
        expect(ball.attachmentOffset).toEqual({ x: 0, y: -ball.radius - paddle.height / 2 });
        expect(ballGraphics.x).toBeCloseTo(ball.physicsBody.position.x, 5);
        expect(ballGraphics.y).toBeCloseTo(ball.physicsBody.position.y, 5);
        expect(ballGraphics.rotation).toBe(ball.physicsBody.angle);
        expect(visualBodies.get(ball.physicsBody)).toBe(ballGraphics);
        expect(controller.count()).toBe(1);
    });

    it('returns false when promoting without extra balls', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier: 1,
            maxExtraBalls,
            sampleRestitution,
        });

        physics.factory.ball.mockClear();
        controller.spawnExtraBalls({ currentLaunchSpeed: 10 });
        expect(physics.factory.ball).not.toHaveBeenCalled();

        expect(controller.promoteExtraBallToPrimary(ball.physicsBody)).toBe(false);
        expect(physics.remove).not.toHaveBeenCalled();
    });

    it('removes individual extra balls and clears the remainder', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 8 });
        const [firstExtra, secondExtra] = Array.from(visualBodies.keys());
        physics.remove.mockClear();

        controller.removeExtraBallByBody(firstExtra);

        expect(physics.remove).toHaveBeenCalledWith(expect.objectContaining({ id: firstExtra.id }));
        expect(controller.isExtraBallBody(firstExtra)).toBe(false);
        expect(controller.count()).toBe(1);

        controller.clear();

        expect(controller.count()).toBe(0);
        expect(controller.isExtraBallBody(secondExtra)).toBe(false);
        expect(visualBodies.size).toBe(0);
        expect(gameContainer.children).toHaveLength(0);
    });

    it('updates speed indicators to follow extra ball positions', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 12 });

        const bodies = Array.from(visualBodies.keys());
        expect(bodies).not.toHaveLength(0);

        bodies.forEach((body, index) => {
            const mutableBody = body as unknown as {
                position: { x: number; y: number };
                velocity: { x: number; y: number };
            };
            mutableBody.position.x = 100 + index * 15;
            mutableBody.position.y = 200 + index * 10;
            mutableBody.velocity.x = 6 + index;
            mutableBody.velocity.y = 3 + index * 0.5;
        });

        controller.updateSpeedIndicators({ baseSpeed: 6, maxSpeed: 18, deltaSeconds: 0.25 });

        const ringContainers = gameContainer.children.filter((_child: unknown, index: number) => index % 2 === 0) as unknown as {
            position: { x: number; y: number };
        }[];

        ringContainers.forEach((ring, index) => {
            expect(ring.position.x).toBeCloseTo(bodies[index].position.x, 6);
            expect(ring.position.y).toBeCloseTo(bodies[index].position.y, 6);
        });
    });

    it('never exceeds the configured extra ball capacity', () => {
        maxExtraBalls = 2;
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies,
            drawBallVisual,
            colors,
            multiplier,
            maxExtraBalls,
            sampleRestitution,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 9 });
        expect(controller.count()).toBeLessThanOrEqual(maxExtraBalls);

        controller.spawnExtraBalls({ currentLaunchSpeed: 9 });
        expect(controller.count()).toBeLessThanOrEqual(maxExtraBalls);
        expect(Array.from(visualBodies.keys())).toHaveLength(controller.count());
    });
});
