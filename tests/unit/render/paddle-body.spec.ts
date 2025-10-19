import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('physics/world', () => ({
    createPhysicsWorld: vi.fn(),
}));

import { createPhysicsWorld } from 'physics/world';
import { PaddleBodyController } from 'render/paddle-body';
import type { InputState, Vector2 } from 'render/contracts';

type StubWorld = ReturnType<typeof createStubWorld>;

const createPhysicsWorldMock = vi.mocked(createPhysicsWorld);

const createStubWorld = () => {
    let nextId = 1;
    const paddles: unknown[] = [];
    const factory = {
        paddle: vi.fn((options: { position: Vector2; size: { width: number; height: number } }) => {
            const body = {
                id: nextId++,
                position: { x: options.position.x, y: options.position.y },
            } as { id: number; position: { x: number; y: number } };
            paddles.push(body);
            return body;
        }),
    };

    return {
        factory,
        paddles,
    };
};

describe('PaddleBodyController', () => {
    let controller: PaddleBodyController;
    let stubWorld: StubWorld;

    const createInput = (overrides: Partial<InputState> = {}): InputState => ({
        leftPressed: false,
        rightPressed: false,
        launchRequested: false,
        ...overrides,
    });

    const createPaddle = (position: Vector2 = { x: 200, y: 300 }, options = {}) => {
        return controller.createPaddle(position, options);
    };

    beforeEach(() => {
        stubWorld = createStubWorld();
        createPhysicsWorldMock.mockReturnValue(stubWorld as unknown as ReturnType<typeof createPhysicsWorld>);
        controller = new PaddleBodyController();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('creates paddles with physics bodies using provided options', () => {
        const paddle = createPaddle({ x: 150, y: 400 }, { width: 120, height: 24, speed: 420 });

        expect(stubWorld.factory.paddle).toHaveBeenCalledWith({
            position: { x: 150, y: 400 },
            size: { width: 120, height: 24 },
        });
        expect(paddle.width).toBe(120);
        expect(paddle.height).toBe(24);
        expect(paddle.speed).toBe(420);
        expect(paddle.physicsBody.position).toEqual({ x: 150, y: 400 });
    });

    it('moves left and clamps to minimum boundary when using keyboard input', () => {
        const paddle = createPaddle({ x: 80, y: 300 }, { width: 120, speed: 240 });
        const input = createInput({ leftPressed: true });

        controller.updatePaddle(paddle, 1, input, 500);

        const halfWidth = paddle.width / 2;
        expect(paddle.position.x).toBe(halfWidth);
        expect(paddle.physicsBody.position.x).toBe(halfWidth);
    });

    it('moves right within bounds when only right input is pressed', () => {
        const paddle = createPaddle({ x: 200, y: 320 }, { width: 100, speed: 150 });
        const input = createInput({ rightPressed: true });

        controller.updatePaddle(paddle, 0.5, input, 400);

        expect(paddle.position.x).toBeCloseTo(275, 5);
        expect(paddle.physicsBody.position.x).toBeCloseTo(275, 5);
    });

    it('prioritises mouse input over keyboard and clamps to playfield width', () => {
        const paddle = createPaddle({ x: 200, y: 300 }, { width: 100 });
        const input = createInput({ leftPressed: true, mouseX: 460 });

        controller.updatePaddle(paddle, 1, input, 500);

        expect(paddle.position.x).toBe(450);
    });

    it('uses touch input when mouse is undefined', () => {
        const paddle = createPaddle({ x: 400, y: 300 }, { width: 80 });
        const input = createInput({ touchX: 50 });

        controller.updatePaddle(paddle, 0.2, input, 500);

        expect(paddle.position.x).toBe(50);
    });

    it('sets paddle position directly while respecting bounds', () => {
        const paddle = createPaddle({ x: 100, y: 220 }, { width: 90 });

        controller.setPaddlePosition(paddle, { x: 10, y: 260 }, 400);
        expect(paddle.position.x).toBe(45);

        controller.setPaddlePosition(paddle, { x: 500, y: 260 }, 400);
        expect(paddle.position.x).toBe(355);
    });

    it('returns accurate bounds and center details', () => {
        const paddle = createPaddle({ x: 300, y: 360 }, { width: 120, height: 30 });

        const bounds = controller.getPaddleBounds(paddle);
        expect(bounds).toEqual({ x: 240, y: 345, width: 120, height: 30 });

        const center = controller.getPaddleCenter(paddle);
        expect(center).toEqual({ x: 300, y: 360 });
    });

    it('detects boundary collisions based on paddle placement', () => {
        const paddle = createPaddle({ x: 50, y: 300 }, { width: 100 });
        let collision = controller.checkBoundaryCollision(paddle, 500);
        expect(collision).toEqual({ left: true, right: false });

        controller.setPaddlePosition(paddle, { x: 450, y: 300 }, 500);
        collision = controller.checkBoundaryCollision(paddle, 500);
        expect(collision).toEqual({ left: false, right: true });
    });

    it('returns debug info including derived bounds and physics id', () => {
        const paddle = createPaddle({ x: 220, y: 340 }, { width: 110, height: 22 });

        const debug = controller.getDebugInfo(paddle);

        expect(debug.position).toEqual({ x: 220, y: 340 });
        expect(debug.bounds).toEqual({ x: 165, y: 329, width: 110, height: 22 });
        expect(debug.physicsBodyId).toBe(paddle.physicsBody.id);
        expect(debug.inputState.leftPressed).toBe(false);
        expect(debug.velocity).toEqual({ x: 0, y: 0 });
    });
});
