import { describe, expect, it } from 'vitest';
import type { MatterBody as Body } from 'physics/matter';
import type { Vector2 } from 'physics/contracts';
import { createVortexFieldManager } from 'physics/field-effects';

const makeBrick = (id: number, x: number, y: number): Body => ({
    id,
    label: 'brick',
    position: { x, y },
} as unknown as Body);

describe('createVortexFieldManager', () => {
    it('spawns vortex at specified position', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 6,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 300, y: 400 });

        const vortices: { x: number; y: number }[] = [];
        manager.forEach(v => {
            vortices.push({ x: v.position.x, y: v.position.y });
        });

        expect(vortices).toHaveLength(1);
        expect(vortices[0]).toEqual({ x: 300, y: 400 });
    });

    it('applies pull forces to bricks within radius', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 6,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 300, y: 400 });

        const brick = makeBrick(1, 350, 450);
        const appliedForces: Vector2[] = [];

        manager.applyPullForces(
            [brick],
            (b) => b.position,
            (_b, force) => {
                appliedForces.push(force);
            },
        );

        expect(appliedForces).toHaveLength(1);
        expect(appliedForces[0]?.x).toBeLessThan(0); // Pull towards center (left)
        expect(appliedForces[0]?.y).toBeLessThan(0); // Pull towards center (up)
    });

    it('does not apply force to bricks outside radius', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 6,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 300, y: 400 });

        const brick = makeBrick(1, 500, 600); // Far from vortex
        const appliedForces: Vector2[] = [];

        manager.applyPullForces(
            [brick],
            (b) => b.position,
            (_b, force) => {
                appliedForces.push(force);
            },
        );

        expect(appliedForces).toHaveLength(0);
    });

    it('decays vortex over time and removes expired ones', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 4,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 300, y: 400 });

        manager.tick(2);
        expect(manager.count()).toBe(1);

        manager.tick(3);
        expect(manager.count()).toBe(0);
    });

    it('detects position near vortex portal', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 6,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 300, y: 400 });

        const nearPos: Vector2 = { x: 310, y: 410 };
        const farPos: Vector2 = { x: 500, y: 600 };

        expect(manager.isNearPortal(nearPos, 30)).toBe(true);
        expect(manager.isNearPortal(farPos, 30)).toBe(false);
    });

    it('tracks portal hits and chain bonuses', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 6,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 300, y: 400 });

        const position: Vector2 = { x: 300, y: 400 };

        expect(manager.wasHitThroughPortal(position)).toBe(false);

        manager.markPortalHit(position);

        expect(manager.wasHitThroughPortal(position)).toBe(true);
    });

    it('manages multiple vortices independently', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 6,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 100, y: 200 });
        manager.spawn({ x: 500, y: 600 });

        const vortices: { x: number; y: number }[] = [];
        manager.forEach(v => {
            vortices.push({ x: v.position.x, y: v.position.y });
        });

        expect(vortices).toHaveLength(2);
        expect(vortices).toContainEqual({ x: 100, y: 200 });
        expect(vortices).toContainEqual({ x: 500, y: 600 });
    });

    it('clears all vortices on clear()', () => {
        const manager = createVortexFieldManager({
            pullStrength: 0.35,
            radiusPixels: 120,
            durationSeconds: 6,
            chainBonus: 0.25,
        });

        manager.spawn({ x: 100, y: 200 });
        manager.spawn({ x: 500, y: 600 });

        manager.clear();
        expect(manager.count()).toBe(0);
    });
});
