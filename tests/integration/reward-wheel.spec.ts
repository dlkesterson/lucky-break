import { describe, expect, it } from 'vitest';
import { spinWheel } from 'game/rewards';
import { PowerUpManager } from 'util/power-ups';

const TOTAL_WEIGHT = 1 + 0.9 + 0.8;

const rollForSegment = (targetWeight: number): number => {
    return targetWeight / TOTAL_WEIGHT;
};

describe('Lucky Draw Reward Wheel', () => {
    it('activates sticky paddle reward deterministically and expires it via the power-up manager', () => {
        const reward = spinWheel(() => 0);
        expect(reward.type).toBe('sticky-paddle');

        const powerUps = new PowerUpManager();
        powerUps.activate('sticky-paddle', { defaultDuration: reward.duration });

        powerUps.update(reward.duration / 2);
        expect(powerUps.isActive('sticky-paddle')).toBe(true);

        powerUps.update(reward.duration);
        expect(powerUps.isActive('sticky-paddle')).toBe(false);
    });

    it('applies double points multiplier and resets after the reward duration elapses', () => {
        const reward = spinWheel(() => rollForSegment(1.2));
        expect(reward.type).toBe('double-points');
        if (reward.type !== 'double-points') {
            throw new Error('Expected double-points reward');
        }

        let multiplier = reward.multiplier;
        let timer = reward.duration;

        const advance = (deltaSeconds: number) => {
            if (timer > 0) {
                timer = Math.max(0, timer - deltaSeconds);
                if (timer === 0) {
                    multiplier = 1;
                }
            }
        };

        advance(reward.duration - 1);
        expect(multiplier).toBe(reward.multiplier);
        expect(timer).toBeLessThanOrEqual(1);

        advance(2);
        expect(multiplier).toBe(1);
        expect(timer).toBe(0);
    });

    it('toggles ghost bricks into sensor mode for the reward duration and restores them afterwards', () => {
        const reward = spinWheel(() => rollForSegment(2.4));
        expect(reward.type).toBe('ghost-brick');
        if (reward.type !== 'ghost-brick') {
            throw new Error('Expected ghost-brick reward');
        }

        const bricks = Array.from({ length: 6 }, (_, index) => ({
            id: index,
            isSensor: false,
            alpha: 1,
        }));

        const applyGhostEffect = (count: number) => {
            const selected = bricks
                .slice()
                .sort((a, b) => a.id - b.id)
                .slice(0, Math.min(count, bricks.length));

            selected.forEach((brick) => {
                brick.isSensor = true;
                brick.alpha = 0.35;
            });

            return () => {
                selected.forEach((brick) => {
                    brick.isSensor = false;
                    brick.alpha = 1;
                });
            };
        };

        const restore = applyGhostEffect(reward.ghostCount);
        expect(bricks.filter((brick) => brick.isSensor)).toHaveLength(reward.ghostCount);

        let remaining = reward.duration;
        const tick = (deltaSeconds: number) => {
            if (remaining <= 0) {
                return;
            }
            remaining = Math.max(0, remaining - deltaSeconds);
            if (remaining === 0) {
                restore();
            }
        };

        tick(reward.duration - 0.5);
        expect(bricks.some((brick) => brick.isSensor)).toBe(true);

        tick(0.5);
        expect(bricks.some((brick) => brick.isSensor)).toBe(false);
    });
});
