import { describe, it, expect } from 'vitest';
import { createPhysicsWorld } from 'physics/world';

describe('boundary walls', () => {
    it('creates all 4 boundary walls (top, right, bottom, left)', () => {
        const world = createPhysicsWorld();
        const walls = world.factory.bounds();

        expect(walls).toHaveLength(4);

        const labels = walls.map((wall) => wall.label);
        expect(labels).toContain('wall-top');
        expect(labels).toContain('wall-right');
        expect(labels).toContain('wall-bottom');
        expect(labels).toContain('wall-left');
    });

    it('creates top wall at correct position', () => {
        const world = createPhysicsWorld({
            dimensions: { width: 1280, height: 720 },
        });
        const walls = world.factory.bounds();
        const topWall = walls.find((wall) => wall.label === 'wall-top');

        expect(topWall).toBeDefined();
        expect(topWall?.isStatic).toBe(true);
        expect(topWall?.restitution).toBe(1);
        expect(topWall?.position.y).toBeLessThan(0);
    });

    it('creates all walls for different playfield dimensions', () => {
        const dimensions = [
            { width: 800, height: 600 },
            { width: 1280, height: 720 },
            { width: 1920, height: 1080 },
        ];

        dimensions.forEach(({ width, height }) => {
            const world = createPhysicsWorld({ dimensions: { width, height } });
            const walls = world.factory.bounds();

            expect(walls, `Expected 4 walls for ${width}x${height}`).toHaveLength(4);

            const labels = walls.map((w) => w.label);
            expect(labels, `Expected all wall labels for ${width}x${height}`).toEqual(
                expect.arrayContaining(['wall-top', 'wall-right', 'wall-bottom', 'wall-left']),
            );
        });
    });

    it('creates walls with proper restitution for bouncing', () => {
        const world = createPhysicsWorld();
        const walls = world.factory.bounds();

        walls.forEach((wall) => {
            expect(wall.restitution, `Wall ${wall.label} should have restitution of 1`).toBe(1);
            expect(wall.isStatic, `Wall ${wall.label} should be static`).toBe(true);
        });
    });

    it('positions walls to form complete boundary', () => {
        const width = 1280;
        const height = 720;
        const world = createPhysicsWorld({
            dimensions: { width, height },
        });
        const walls = world.factory.bounds();

        const topWall = walls.find((w) => w.label === 'wall-top');
        const rightWall = walls.find((w) => w.label === 'wall-right');
        const bottomWall = walls.find((w) => w.label === 'wall-bottom');
        const leftWall = walls.find((w) => w.label === 'wall-left');

        expect(topWall).toBeDefined();
        expect(rightWall).toBeDefined();
        expect(bottomWall).toBeDefined();
        expect(leftWall).toBeDefined();

        expect(topWall?.position.y).toBeLessThan(0);

        expect(rightWall?.position.x).toBeGreaterThan(width / 2);

        expect(bottomWall?.position.y).toBeGreaterThan(height / 2);

        expect(leftWall?.position.x).toBeLessThan(width / 2);
    });
});
