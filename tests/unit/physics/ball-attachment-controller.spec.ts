import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('physics/world', () => ({
    createPhysicsWorld: vi.fn(),
}));

import { createPhysicsWorld } from 'physics/world';
import { BallAttachmentController } from 'physics/ball-attachment';
import { Body } from 'physics/matter';
import type { Vector2 } from 'physics/contracts';

type StubWorld = ReturnType<typeof createStubWorld>;

const createPhysicsWorldMock = vi.mocked(createPhysicsWorld);

const createStubWorld = () => {
    let nextId = 1;
    const factory = {
        ball: vi.fn((options: { position: Vector2; radius: number; restitution: number }) => ({
            id: nextId++,
            position: { x: options.position.x, y: options.position.y },
            velocity: { x: 0, y: 0 },
            angularVelocity: 0,
            force: { x: 0, y: 0 },
            circleRadius: options.radius,
        })),
        paddle: vi.fn((options: { position: Vector2; size: { width: number; height: number } }) => ({
            id: `paddle-${nextId++}`,
            position: { x: options.position.x, y: options.position.y },
            size: options.size,
        })),
        brick: vi.fn(),
        bounds: vi.fn(),
    };

    return {
        factory,
        attachBallToPaddle: vi.fn(),
        detachBallFromPaddle: vi.fn(),
        updateBallAttachment: vi.fn(),
        isBallAttached: vi.fn(() => true),
        getBallAttachment: vi.fn(() => ({
            isAttached: true,
            attachmentOffset: { x: 0, y: -15 },
            paddlePosition: { x: 0, y: 0 },
        })),
    };
};

describe('BallAttachmentController', () => {
    let controller: BallAttachmentController;
    let stubWorld: StubWorld;
    let setPositionSpy: ReturnType<typeof vi.spyOn>;
    let setVelocitySpy: ReturnType<typeof vi.spyOn>;
    let setAngularVelocitySpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        setPositionSpy = vi.spyOn(Body, 'setPosition') as ReturnType<typeof vi.spyOn>;
        setPositionSpy.mockImplementation((body: any, position: any) => {
            body.position = { ...position };
            return body;
        });
        setVelocitySpy = vi.spyOn(Body, 'setVelocity') as ReturnType<typeof vi.spyOn>;
        setVelocitySpy.mockImplementation((body: any, velocity: any) => {
            body.velocity = { ...velocity };
            return body;
        });
        setAngularVelocitySpy = vi.spyOn(Body, 'setAngularVelocity') as ReturnType<typeof vi.spyOn>;
        setAngularVelocitySpy.mockImplementation((body: any, angularVelocity: number) => {
            body.angularVelocity = angularVelocity;
            return body;
        });

        stubWorld = createStubWorld();
        createPhysicsWorldMock.mockReturnValue(stubWorld as any);
        controller = new BallAttachmentController();
    });

    afterEach(() => {
        setPositionSpy.mockRestore();
        setVelocitySpy.mockRestore();
        setAngularVelocitySpy.mockRestore();
        createPhysicsWorldMock.mockReset();
        vi.clearAllMocks();
    });

    it('creates an attached ball with expected defaults', () => {
        const paddlePosition: Vector2 = { x: 200, y: 300 };
        const ball = controller.createAttachedBall(paddlePosition, { radius: 12, restitution: 0.9 });

        expect(stubWorld.factory.ball).toHaveBeenCalledWith({
            position: { x: 200, y: 278 },
            radius: 12,
            restitution: 0.9,
        });
        expect(stubWorld.factory.paddle).toHaveBeenCalledWith({
            position: paddlePosition,
            size: { width: 100, height: 20 },
        });
        expect(stubWorld.attachBallToPaddle).toHaveBeenCalledWith(
            ball.physicsBody,
            expect.any(Object),
            { x: 0, y: -22 },
        );
        expect(ball.isAttached).toBe(true);
        expect(ball.attachmentOffset).toEqual({ x: 0, y: -22 });
        expect(ball.radius).toBe(12);
    });

    it('updates attachment while the ball remains attached', () => {
        const paddlePosition: Vector2 = { x: 100, y: 250 };
        const ball = controller.createAttachedBall(paddlePosition, { radius: 10 });

        setPositionSpy.mockClear();
        setVelocitySpy.mockClear();
        setAngularVelocitySpy.mockClear();

        controller.updateAttachment(ball, { x: 140, y: 260 });

        expect(setPositionSpy).toHaveBeenCalledWith(ball.physicsBody, { x: 140, y: 240 });
        expect(setVelocitySpy).toHaveBeenCalledWith(ball.physicsBody, { x: 0, y: 0 });
        expect(setAngularVelocitySpy).toHaveBeenCalledWith(ball.physicsBody, 0);
    });

    it('skips attachment updates for detached balls', () => {
        const ball = controller.createAttachedBall({ x: 50, y: 60 });
        ball.isAttached = false;

        controller.updateAttachment(ball, { x: 70, y: 90 });

        expect(setPositionSpy).not.toHaveBeenCalled();
    });

    it('launches the ball and normalises the provided direction', () => {
        const ball = controller.createAttachedBall({ x: 0, y: 0 }, { radius: 10 });

        controller.launchBall(ball, { x: 3, y: 4 });

        expect(ball.isAttached).toBe(false);
        expect(ball.physicsBody.velocity).toEqual({ x: 180, y: 240 });
    });

    it('defaults to upward launch when zero direction is provided', () => {
        const ball = controller.createAttachedBall({ x: 0, y: 0 }, { radius: 8 });

        controller.launchBall(ball, { x: 0, y: 0 });

        expect(ball.physicsBody.velocity).toEqual({ x: 0, y: -300 });
    });

    it('resets the ball back to attached state with derived offset', () => {
        const ball = controller.createAttachedBall({ x: 20, y: 40 }, { radius: 9 });
        ball.isAttached = false;
        ball.physicsBody.force = { x: 5, y: -3 };

        setPositionSpy.mockClear();
        setVelocitySpy.mockClear();
        setAngularVelocitySpy.mockClear();

        controller.resetToAttached(ball, { x: 30, y: 80 });

        expect(ball.isAttached).toBe(true);
        expect(ball.attachmentOffset).toEqual({ x: 0, y: -19 });
        expect(setPositionSpy).toHaveBeenCalledWith(ball.physicsBody, { x: 30, y: 61 });
        expect(setVelocitySpy).toHaveBeenCalledWith(ball.physicsBody, { x: 0, y: 0 });
        expect(setAngularVelocitySpy).toHaveBeenCalledWith(ball.physicsBody, 0);
        expect(ball.physicsBody.force).toEqual({ x: 0, y: 0 });
    });

    it('reports attachment state via getter', () => {
        const ball = controller.createAttachedBall({ x: 0, y: 0 });
        expect(controller.isAttached(ball)).toBe(true);

        ball.isAttached = false;
        expect(controller.isAttached(ball)).toBe(false);
    });

    it('returns debug info referencing the underlying physics body', () => {
        const ball = controller.createAttachedBall({ x: 10, y: 20 });
    (ball.physicsBody as any).velocity = { x: 5, y: -2 };

        const info = controller.getDebugInfo(ball);

        expect(stubWorld.getBallAttachment).toHaveBeenCalledWith(ball.physicsBody);
        expect(info).toEqual({
            position: ball.physicsBody.position,
            velocity: ball.physicsBody.velocity,
            isAttached: ball.isAttached,
            attachmentOffset: ball.attachmentOffset,
            physicsBodyId: ball.physicsBody.id,
        });
    });
});
