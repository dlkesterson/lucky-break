import { describe, expect, it } from 'vitest';
import type { MatterBody as Body } from 'physics/matter';
import { createEchoTrailManager } from 'game/echo-trails';

const makeBall = (id: number): Body => ({ id, label: 'ball' } as unknown as Body);

describe('createEchoTrailManager', () => {
    it('registers echo trails and allows phase-through based on chance', () => {
        const manager = createEchoTrailManager({
            durationSeconds: 4,
            phaseChance: 1.0, // 100% phase chance for deterministic test
        });
        const ball = makeBall(1);

        manager.register(ball, { x: 100, y: 200 }, { x: 5, y: -3 });

        const rng = () => 0.5; // Always returns 0.5, which is < 1.0
        const canPhase = manager.canPhaseThrough(ball, rng);
        expect(canPhase).toBe(true);
    });

    it('prevents phase-through when chance is zero', () => {
        const manager = createEchoTrailManager({
            durationSeconds: 4,
            phaseChance: 0, // 0% phase chance
        });
        const ball = makeBall(1);

        manager.register(ball, { x: 100, y: 200 }, { x: 5, y: -3 });

        const rng = () => 0.5;
        const canPhase = manager.canPhaseThrough(ball, rng);
        expect(canPhase).toBe(false);
    });

    it('prevents multiple phase-throughs per echo trail', () => {
        const manager = createEchoTrailManager({
            durationSeconds: 4,
            phaseChance: 1.0,
        });
        const ball = makeBall(1);

        manager.register(ball, { x: 100, y: 200 }, { x: 5, y: -3 });

        const rng = () => 0.5;
        const firstPhase = manager.canPhaseThrough(ball, rng);
        expect(firstPhase).toBe(true);

        manager.markPhased(ball);

        const secondPhase = manager.canPhaseThrough(ball, rng);
        expect(secondPhase).toBe(false);
    });

    it('decays echo trails over time and removes expired ones', () => {
        const manager = createEchoTrailManager({
            durationSeconds: 2,
            phaseChance: 0.5,
        });
        const ball = makeBall(1);

        manager.register(ball, { x: 100, y: 200 }, { x: 5, y: -3 });

        let trail = manager.getTrail(ball);
        expect(trail).not.toBeNull();
        expect(trail?.remainingSeconds).toBe(2);

        manager.tick(1);
        trail = manager.getTrail(ball);
        expect(trail?.remainingSeconds).toBe(1);

        manager.tick(1.5);
        trail = manager.getTrail(ball);
        expect(trail).toBeNull();
    });

    it('iterates over all active trails', () => {
        const manager = createEchoTrailManager({
            durationSeconds: 3,
            phaseChance: 0.2,
        });
        const ball1 = makeBall(1);
        const ball2 = makeBall(2);

        manager.register(ball1, { x: 100, y: 200 }, { x: 5, y: -3 });
        manager.register(ball2, { x: 150, y: 250 }, { x: -2, y: 4 });

        const trails: { position: { x: number; y: number } }[] = [];
        manager.forEach((_ball, snapshot) => {
            trails.push({ position: snapshot.position });
        });

        expect(trails).toHaveLength(2);
        expect(trails[0]?.position).toEqual({ x: 100, y: 200 });
        expect(trails[1]?.position).toEqual({ x: 150, y: 250 });
    });

    it('clears all trails on clear()', () => {
        const manager = createEchoTrailManager({
            durationSeconds: 3,
            phaseChance: 0.2,
        });
        const ball = makeBall(1);

        manager.register(ball, { x: 100, y: 200 }, { x: 5, y: -3 });
        expect(manager.getTrail(ball)).not.toBeNull();

        manager.clear();
        expect(manager.getTrail(ball)).toBeNull();
    });
});
