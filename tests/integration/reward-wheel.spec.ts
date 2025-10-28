import { describe, expect, it } from 'vitest';
import { spinWheel } from 'game/rewards';
import { PowerUpManager } from 'util/power-ups';
import { gameConfig } from 'config/game';

const segments = gameConfig.rewards.wheelSegments;
const TOTAL_WEIGHT = segments.reduce((sum, segment) => sum + segment.weight, 0);

const rollForSegment = (type: typeof segments[number]['type']): number => {
    let cumulative = 0;
    for (const segment of segments) {
        const lowerBound = cumulative;
        cumulative += segment.weight;
        if (segment.type === type) {
            const midpoint = lowerBound + segment.weight * 0.5;
            return midpoint / TOTAL_WEIGHT;
        }
    }

    throw new Error(`Unknown reward segment type: ${type}`);
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
        const reward = spinWheel(() => rollForSegment('double-points'));
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
        const reward = spinWheel(() => rollForSegment('ghost-brick'));
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
    it('charges and releases the laser paddle reward with repeat fire support', () => {
        const reward = spinWheel(() => rollForSegment('laser-paddle'));
        expect(reward.type).toBe('laser-paddle');
        if (reward.type !== 'laser-paddle') {
            throw new Error('Expected laser-paddle reward');
        }

        let timeSinceFire = reward.cooldown;
        let shotsRemaining = reward.pierceCount;

        const canFire = (): boolean => timeSinceFire >= reward.cooldown && shotsRemaining > 0;
        const fire = () => {
            if (!canFire()) {
                return false;
            }
            shotsRemaining -= 1;
            timeSinceFire = 0;
            return true;
        };

        expect(fire()).toBe(true);
        expect(canFire()).toBe(false);

        const advance = (deltaSeconds: number) => {
            timeSinceFire = Math.min(reward.cooldown, timeSinceFire + deltaSeconds);
        };

        advance(reward.cooldown * 0.5);
        expect(fire()).toBe(false);

        advance(reward.cooldown * 0.5);
        expect(fire()).toBe(true);
        expect(shotsRemaining).toBeGreaterThanOrEqual(0);
    });
});
