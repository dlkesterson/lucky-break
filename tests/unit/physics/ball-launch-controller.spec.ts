import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MutableVector {
    x: number;
    y: number;
}

const matterMocks = vi.hoisted(() => {
    const setVelocityMock = vi.fn((body: { velocity: MutableVector }, velocity: MutableVector) => {
        body.velocity = { ...velocity };
    });
    const normaliseMock = vi.fn((vector: MutableVector): MutableVector => {
        const length = Math.hypot(vector.x, vector.y);
        if (length === 0) {
            return { x: 0, y: 0 };
        }
        return { x: vector.x / length, y: vector.y / length };
    });
    const multMock = vi.fn((vector: MutableVector, scalar: number): MutableVector => ({
        x: vector.x * scalar,
        y: vector.y * scalar,
    }));

    return { setVelocityMock, normaliseMock, multMock };
});

vi.mock('matter-js', () => ({
    Body: {
        setVelocity: matterMocks.setVelocityMock,
    },
    Vector: {
        normalise: matterMocks.normaliseMock,
        mult: matterMocks.multMock,
    },
}));

import { PhysicsBallLaunchController } from 'physics/ball-launch';
import type { Ball, Vector2 } from 'physics/contracts';

const createBall = (overrides: Partial<Ball> = {}): Ball => ({
    id: 'ball-test',
    physicsBody: {
        velocity: { x: 0, y: 0 },
    },
    isAttached: true,
    attachmentOffset: { x: 0, y: 0 },
    radius: 8,
    ...overrides,
});

describe('PhysicsBallLaunchController', () => {
    let controller: PhysicsBallLaunchController;

    beforeEach(() => {
        matterMocks.setVelocityMock.mockClear();
        matterMocks.normaliseMock.mockClear();
        matterMocks.multMock.mockClear();
        controller = new PhysicsBallLaunchController();
    });

    it('launches attached balls upward with default speed', () => {
        const ball = createBall();

        controller.launch(ball);

        expect(ball.isAttached).toBe(false);
        expect(matterMocks.setVelocityMock).toHaveBeenCalledWith(ball.physicsBody, { x: 0, y: -8 });
        expect(ball.physicsBody.velocity).toEqual({ x: 0, y: -8 });
        expect(matterMocks.normaliseMock).toHaveBeenCalledWith({ x: 0, y: -1 });
        expect(matterMocks.multMock).toHaveBeenCalledWith({ x: 0, y: -1 }, 8);

        const debug = controller.getLaunchDebugInfo(ball);
        expect(debug).toEqual({
            canLaunch: false,
            currentVelocity: { x: 0, y: -8 },
            launchSpeed: 8,
            lastLaunchDirection: { x: 0, y: -1 },
        });
    });

    it('does nothing when attempting to launch a free ball', () => {
        const ball = createBall({ isAttached: false });

        controller.launch(ball);

        expect(matterMocks.setVelocityMock).not.toHaveBeenCalled();
        expect(ball.physicsBody.velocity).toEqual({ x: 0, y: 0 });
        const debug = controller.getLaunchDebugInfo(ball);
        expect(debug.lastLaunchDirection).toBeUndefined();
        expect(debug.canLaunch).toBe(false);
    });

    it('applies custom direction and speed when launching', () => {
        const ball = createBall();
        const direction: Vector2 = { x: 3, y: 4 };

        controller.launch(ball, direction, 12);

        expect(matterMocks.setVelocityMock).toHaveBeenCalledTimes(1);
        const [, appliedVelocity] = matterMocks.setVelocityMock.mock.calls[0];
        expect(appliedVelocity.x).toBeCloseTo(7.2, 5);
        expect(appliedVelocity.y).toBeCloseTo(9.6, 5);
        expect(ball.physicsBody.velocity.x).toBeCloseTo(7.2, 5);
        expect(ball.physicsBody.velocity.y).toBeCloseTo(9.6, 5);
        expect(controller.getLaunchDebugInfo(ball).lastLaunchDirection).toEqual(direction);
    });

    it('calculates launch velocity with normalization and zero-vector fallback', () => {
        expect(controller.calculateLaunchVelocity({ x: 3, y: 4 }, 10)).toEqual({ x: 6, y: 8 });
        expect(controller.calculateLaunchVelocity({ x: 0, y: 0 }, 15)).toEqual({ x: 0, y: -15 });
    });

    it('reports launch availability based on attachment', () => {
        const attached = createBall({ isAttached: true });
        const detached = createBall({ isAttached: false });
        expect(controller.canLaunch(attached)).toBe(true);
        expect(controller.canLaunch(detached)).toBe(false);
    });
});
