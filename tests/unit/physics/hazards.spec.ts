import { describe, expect, it, vi } from 'vitest';
import { createPhysicsWorld } from 'physics/world';
import { createGravityWellHazard, createMovingBumperHazard, createPortalHazard } from 'physics/hazards';

describe('physics hazards', () => {
    it('attracts ball bodies toward gravity well centers', () => {
        const world = createPhysicsWorld({
            gravity: 0,
            dimensions: { width: 1000, height: 600 },
        });

        const ball = world.factory.ball({
            radius: 12,
            position: { x: 300, y: 300 },
            velocity: { x: 0, y: 0 },
        });
        world.add(ball);

        const hazard = createGravityWellHazard({
            position: { x: 600, y: 300 },
            radius: 400,
            strength: 0.02,
        });
        world.addHazard(hazard);

        const initialVelocityX = ball.velocity.x;
        world.step(16);
        const subsequentVelocityX = ball.velocity.x;

        expect(subsequentVelocityX).toBeGreaterThan(initialVelocityX);

        world.dispose();
    });

    it('moves bumpers along their configured path and emits direction updates', () => {
        const world = createPhysicsWorld({
            gravity: 0,
            dimensions: { width: 800, height: 600 },
        });

        const onPositionChange = vi.fn();
        const bumper = createMovingBumperHazard({
            start: { x: 200, y: 200 },
            end: { x: 500, y: 200 },
            radius: 24,
            speed: 180,
            impulse: 4,
            onPositionChange,
        });

        world.addHazard(bumper);
        const initialX = bumper.position.x;
        world.step(500);
        world.step(500);

        expect(bumper.position.x).not.toBe(initialX);
        expect(onPositionChange).toHaveBeenCalled();
        const lastCallIndex = onPositionChange.mock.calls.length - 1;
        expect(lastCallIndex).toBeGreaterThanOrEqual(0);
        const [, direction] = onPositionChange.mock.calls[lastCallIndex]!;
        const magnitude = Math.hypot(direction.x, direction.y);
        expect(magnitude).toBeGreaterThan(0.9);

        world.dispose();
    });

    it('creates portal hazards with expected metadata', () => {
        const entry = { x: 150, y: 220 };
        const exit = { x: 420, y: 510 };
        const portal = createPortalHazard({
            entry,
            exit,
            radius: 48,
            cooldownSeconds: 0.75,
        });

        expect(portal.type).toBe('portal');
        expect(portal.position).toEqual(entry);
        expect(portal.exit).toEqual(exit);
        expect(portal.radius).toBe(48);
        expect(portal.cooldownSeconds).toBeCloseTo(0.75);
    });
});
