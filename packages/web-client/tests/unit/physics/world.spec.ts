import { describe, expect, it, vi } from 'vitest';
import type { MatterBody as Body } from 'physics/matter';
import { createPhysicsWorld } from 'physics/world';

describe('createPhysicsWorld', () => {
    it('applies gravity and steps bodies forward', () => {
        const handle = createPhysicsWorld({ gravity: 1.2 });
        const ball = handle.factory.ball({ radius: 20, position: { x: 150, y: 0 } });

        handle.add(ball);

        const startY = ball.position.y;
        handle.step();

        expect(ball.position.y).toBeGreaterThan(startY);
        expect(handle.engine.world.gravity.y).toBeCloseTo(1.2, 5);

        handle.dispose();
    });

    it('creates static boundary walls sized to the playfield', () => {
        const handle = createPhysicsWorld({
            gravity: 0,
            dimensions: { width: 800, height: 600, wallThickness: 16 },
        });

        const walls = handle.factory.bounds();

        const getLabel = (body: Body): string => body.label;

        expect(walls).toHaveLength(4);
        expect(walls.map(getLabel)).toEqual(['wall-top', 'wall-right', 'wall-bottom', 'wall-left']);
        walls.forEach((wall: Body) => {
            expect(wall.isStatic).toBe(true);
        });

        handle.add(walls);
        expect(handle.world.bodies).toContain(walls[0]);

        handle.dispose();
    });

    it('creates paddle and brick bodies with sensible defaults', () => {
        const handle = createPhysicsWorld();

        const paddle = handle.factory.paddle({
            size: { width: 150, height: 18 },
            position: { x: 200, y: 540 },
        });
        const brick = handle.factory.brick({
            size: { width: 48, height: 20 },
            position: { x: 100, y: 120 },
        });

        expect(paddle.label).toBe('paddle');
        expect(paddle.isStatic).toBe(true);
        expect(brick.label).toBe('brick');
        expect(brick.isStatic).toBe(true);

        handle.dispose();
    });

    it('logs and prunes attachments when physics bodies disappear', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
            /* swallow logs */
        });

        const handle = createPhysicsWorld({ gravity: 0 });
        try {
            const paddle = handle.factory.paddle({
                size: { width: 140, height: 18 },
                position: { x: 200, y: 500 },
            });
            const ball = handle.factory.ball({
                radius: 12,
                position: { x: 200, y: 470 },
            });

            handle.add([paddle, ball]);
            handle.attachBallToPaddle(ball, paddle, { x: 0, y: -24 });

            handle.remove(ball);
            handle.step();

            expect(handle.isBallAttached(ball)).toBe(false);
            expect(warnSpy).toHaveBeenCalledTimes(1);
            const [message] = warnSpy.mock.calls[0];
            expect(String(message)).toContain('[WARN][app:physics:world]');
        } finally {
            handle.dispose();
            warnSpy.mockRestore();
        }
    });
});
