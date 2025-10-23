import { afterEach, describe, expect, it } from 'vitest';
import { spinWheel, createReward, setRewardOverride, getRewardOverride, type Reward } from 'game/rewards';

describe('spinWheel', () => {
    const select = (value: number): Reward => spinWheel(() => value);

    afterEach(() => {
        setRewardOverride(null);
    });

    it('returns a sticky paddle reward for low rolls', () => {
        const reward = select(0.05);
        expect(reward.type).toBe('sticky-paddle');
        expect(reward.duration).toBeGreaterThan(0);
    });

    it('returns a double points reward for mid-range rolls', () => {
        const reward = select(0.3);
        expect(reward.type).toBe('double-points');
        if (reward.type === 'double-points') {
            expect(reward.multiplier).toBeGreaterThan(1);
        }
    });

    it('returns a wide paddle reward when landing on the width segment', () => {
        const reward = select(0.45);
        expect(reward.type).toBe('wide-paddle');
        if (reward.type === 'wide-paddle') {
            expect(reward.widthMultiplier).toBeGreaterThan(1);
            expect(reward.duration).toBeGreaterThan(0);
        }
    });

    it('returns a multi-ball reward for upper-middle rolls', () => {
        const reward = select(0.6);
        expect(reward.type).toBe('multi-ball');
        if (reward.type === 'multi-ball') {
            expect(reward.extraBalls).toBeGreaterThanOrEqual(1);
            expect(reward.duration).toBeGreaterThanOrEqual(0);
        }
    });

    it('returns a slow time reward when landing late on the wheel', () => {
        const reward = select(0.8);
        expect(reward.type).toBe('slow-time');
        if (reward.type === 'slow-time') {
            expect(reward.timeScale).toBeGreaterThan(0);
            expect(reward.timeScale).toBeLessThanOrEqual(1);
        }
    });

    it('returns a ghost brick reward for high rolls', () => {
        const reward = select(0.95);
        expect(reward.type).toBe('ghost-brick');
        if (reward.type === 'ghost-brick') {
            expect(reward.ghostCount).toBeGreaterThan(0);
        }
    });

    it('never produces NaN durations when RNG returns invalid values', () => {
        const reward = spinWheel(() => NaN);
        expect(Number.isNaN(reward.duration)).toBe(false);
    });

    it('uses reward override when provided for a single spin', () => {
        setRewardOverride({ type: 'multi-ball' });
        const reward = spinWheel(() => 0.1);
        expect(reward.type).toBe('multi-ball');
        const fallbackReward = spinWheel(() => 0.05);
        expect(fallbackReward.type).toBe('sticky-paddle');
        expect(getRewardOverride()).toBeNull();
    });

    it('persists reward override when marked as persistent', () => {
        setRewardOverride({ type: 'slow-time', persist: true });
        const first = spinWheel(() => 0.1);
        const second = spinWheel(() => 0.2);
        expect(first.type).toBe('slow-time');
        expect(second.type).toBe('slow-time');
        setRewardOverride(null);
    });

    it('creates reward instances with createReward helper', () => {
        const reward = createReward('double-points');
        expect(reward.type).toBe('double-points');
        if (reward.type === 'double-points') {
            expect(reward.multiplier).toBeGreaterThan(1);
        }
    });
});
