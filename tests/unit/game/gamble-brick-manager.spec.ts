import { describe, expect, it } from 'vitest';
import type { Body } from 'matter-js';
import { createGambleBrickManager } from 'game/gamble-brick-manager';

const makeBrick = (): Body => ({ label: 'brick' } as unknown as Body);

describe('createGambleBrickManager', () => {
    it('primes a registered brick on first hit and rewards on second', () => {
        const manager = createGambleBrickManager({
            timerSeconds: 3,
            rewardMultiplier: 4,
            primeResetHp: 1,
            failPenaltyHp: 3,
        });
        const brick = makeBrick();

        manager.register(brick);
        const firstHit = manager.onHit(brick);
        expect(firstHit).toEqual({ type: 'prime', resetHp: 1 });
        expect(manager.getState(brick)).toBe('primed');

        const secondHit = manager.onHit(brick);
        expect(secondHit).toEqual({ type: 'success', rewardMultiplier: 4 });
        expect(manager.getState(brick)).toBeNull();
    });

    it('expires primed bricks after timer elapses and reports penalty', () => {
        const manager = createGambleBrickManager({
            timerSeconds: 1.5,
            rewardMultiplier: 3,
            primeResetHp: 1,
            failPenaltyHp: 2,
        });
        const brick = makeBrick();

        manager.register(brick);
        manager.onHit(brick); // primes the brick
        const expirations = manager.tick(2);

        expect(expirations).toHaveLength(1);
        expect(expirations[0]).toMatchObject({ brick, penaltyHp: 2 });
        expect(manager.getState(brick)).toBeNull();
    });

    it('ignores hits for bricks that were never registered', () => {
        const manager = createGambleBrickManager({
            timerSeconds: 2,
            rewardMultiplier: 3,
            primeResetHp: 1,
            failPenaltyHp: 2,
        });
        const brick = makeBrick();

        const result = manager.onHit(brick);
        expect(result).toEqual({ type: 'standard' });
        expect(manager.getState(brick)).toBeNull();
    });
});
