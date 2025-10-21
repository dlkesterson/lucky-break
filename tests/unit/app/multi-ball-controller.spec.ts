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
    }

    class Graphics extends MockContainer {
        public destroyed = false;
        public destroy = vi.fn(() => {
            this.destroyed = true;
        });
    }

    return {
        Container: MockContainer,
        Graphics,
    };
});

let setVelocity: ReturnType<typeof vi.fn>;

vi.mock('matter-js', () => {
    const setVelocity = vi.fn((body: any, velocity: { x: number; y: number }) => {
        body.velocity = { ...velocity };
    });
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

    return {
        Body: { setVelocity },
        Vector: { magnitude, normalise, create, rotate, clone, mult },
    };
});

import { Body as MatterBody, type Body } from 'matter-js';
import { createMultiBallController } from 'app/multi-ball-controller';
import { mixColors } from 'render/playfield-visuals';

const setVelocityMock = vi.mocked(MatterBody.setVelocity);

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
    let visualBodies: Map<any, any>;
    let drawBallVisual: ReturnType<typeof vi.fn>;
    let colors: any;
    let multiplier: number;

    beforeEach(async () => {
        const pixi = await import('pixi.js');
        const { Container, Graphics } = pixi;
        let nextId = 10;
        physics = {
            factory: {
                ball: vi.fn(({ position, radius }: { position: { x: number; y: number }; radius: number }) => {
                    return {
                        id: nextId++,
                        position: { ...position },
                        velocity: { x: 0, y: 0 },
                        angle: 0,
                        radius,
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
        visualBodies = new Map();
        drawBallVisual = vi.fn();
        colors = { core: 0x112233, aura: 0x445566, highlight: 0x778899 };
        multiplier = 3;
        setVelocityMock.mockClear();
    });

    it('spawns extra balls with cloned visuals and velocity', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies: visualBodies as unknown as Map<Body, any>,
            drawBallVisual,
            colors,
            multiplier,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 9 });

        expect(physics.factory.ball).toHaveBeenCalledTimes(2);
        expect(physics.add).toHaveBeenCalledTimes(2);
        expect(setVelocityMock).toHaveBeenCalledTimes(2);
        expect(drawBallVisual).toHaveBeenCalledTimes(2);
        expect(gameContainer.children).toHaveLength(2);
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

        const createdBodies = Array.from(visualBodies.keys()) as any[];
        expect(createdBodies).toHaveLength(2);
        createdBodies.forEach((bodyLike) => {
            expect(controller.isExtraBallBody(bodyLike as unknown as Body)).toBe(true);
            expect(visualBodies.get(bodyLike)?.parent).toBe(gameContainer);
        });
    });

    it('promotes the earliest extra ball to become primary', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies: visualBodies as unknown as Map<Body, any>,
            drawBallVisual,
            colors,
            multiplier,
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
            visualBodies: visualBodies as unknown as Map<Body, any>,
            drawBallVisual,
            colors,
            multiplier: 1,
        });

        physics.factory.ball.mockClear();
        controller.spawnExtraBalls({ currentLaunchSpeed: 10 });
        expect(physics.factory.ball).not.toHaveBeenCalled();

        expect(controller.promoteExtraBallToPrimary(ball.physicsBody as unknown as Body)).toBe(false);
        expect(physics.remove).not.toHaveBeenCalled();
    });

    it('removes individual extra balls and clears the remainder', () => {
        const controller = createMultiBallController({
            physics,
            ball,
            paddle,
            ballGraphics,
            gameContainer,
            visualBodies: visualBodies as unknown as Map<Body, any>,
            drawBallVisual,
            colors,
            multiplier,
        });

        controller.spawnExtraBalls({ currentLaunchSpeed: 8 });
        const [firstExtra, secondExtra] = Array.from(visualBodies.keys()) as any[];
        physics.remove.mockClear();

        controller.removeExtraBallByBody(firstExtra as unknown as Body);

        expect(physics.remove).toHaveBeenCalledWith(expect.objectContaining({ id: firstExtra.id }));
        expect(controller.isExtraBallBody(firstExtra as unknown as Body)).toBe(false);
        expect(controller.count()).toBe(1);

        controller.clear();

        expect(controller.count()).toBe(0);
        expect(controller.isExtraBallBody(secondExtra as unknown as Body)).toBe(false);
        expect(visualBodies.size).toBe(0);
        expect(gameContainer.children).toHaveLength(0);
    });
});
