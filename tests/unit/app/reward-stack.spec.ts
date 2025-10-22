import { describe, expect, it } from 'vitest';
import { resolveMultiBallReward, resolveSlowTimeReward } from 'app/reward-stack';

describe('reward-stack', () => {
    it('caps multi-ball extras to capacity and ignores existing surplus', () => {
        const resolution = resolveMultiBallReward({
            reward: { type: 'multi-ball', duration: 8, extraBalls: 4 },
            currentExtraCount: 2,
            capacity: 3,
            maxDuration: 16,
        });

        expect(resolution.duration).toBe(8);
        expect(resolution.extrasToSpawn).toBe(1);
    });

    it('returns zero extras when already at capacity', () => {
        const resolution = resolveMultiBallReward({
            reward: { type: 'multi-ball', duration: 8, extraBalls: 2 },
            currentExtraCount: 3,
            capacity: 3,
            maxDuration: 16,
        });

        expect(resolution.duration).toBe(8);
        expect(resolution.extrasToSpawn).toBe(0);
    });

    it('clamps slow-time duration and scale to safe bounds', () => {
        const resolution = resolveSlowTimeReward({
            reward: { type: 'slow-time', duration: 20, timeScale: 0.05 },
            maxDuration: 12,
        });

        expect(resolution.duration).toBe(12);
        expect(resolution.scale).toBeCloseTo(0.1, 5);
        expect(resolution.extended).toBe(false);
    });

    it('extends slow-time duration when already active without deepening the slow effect', () => {
        const resolution = resolveSlowTimeReward({
            reward: { type: 'slow-time', duration: 4, timeScale: 0.35 },
            maxDuration: 10,
            activeRemaining: 3,
            activeScale: 0.5,
        });

        expect(resolution.duration).toBe(7);
        expect(resolution.scale).toBeCloseTo(0.5, 5);
        expect(resolution.extended).toBe(true);
    });

    it('respects maximum duration caps when extending slow-time', () => {
        const resolution = resolveSlowTimeReward({
            reward: { type: 'slow-time', duration: 6, timeScale: 0.4 },
            maxDuration: 8,
            activeRemaining: 7,
            activeScale: 0.6,
        });

        expect(resolution.duration).toBe(8);
        expect(resolution.scale).toBeCloseTo(0.6, 5);
        expect(resolution.extended).toBe(true);
    });
});
