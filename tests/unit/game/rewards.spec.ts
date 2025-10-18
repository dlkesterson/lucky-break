import { describe, expect, it } from 'vitest';
import { spinWheel, type Reward } from 'game/rewards';

describe('spinWheel', () => {
    const select = (value: number): Reward => spinWheel(() => value);

    it('returns a sticky paddle reward for low rolls', () => {
        const reward = select(0.05);
        expect(reward.type).toBe('sticky-paddle');
        expect(reward.duration).toBeGreaterThan(0);
    });

    it('returns a double points reward for mid-range rolls', () => {
        const reward = select(0.5);
        expect(reward.type).toBe('double-points');
        if (reward.type === 'double-points') {
            expect(reward.multiplier).toBeGreaterThan(1);
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
});
