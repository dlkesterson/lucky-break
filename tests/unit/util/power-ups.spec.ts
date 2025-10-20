import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PowerUpManager,
    calculateBallSpeedScale,
    calculatePaddleWidthScale,
    createPowerUpEffect,
    getPowerUpIntensity,
    isPowerUpFadingOut,
    selectRandomPowerUpType,
    shouldSpawnPowerUp,
    updatePowerUpEffect,
} from 'util/power-ups';

describe('power-up helpers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('spawns according to chance', () => {
        expect(shouldSpawnPowerUp({ spawnChance: 0.2 }, () => 0.1)).toBe(true);
        expect(shouldSpawnPowerUp({ spawnChance: 0.2 }, () => 0.3)).toBe(false);
    });

    it('selects random type from deterministic index', () => {
        expect(selectRandomPowerUpType(() => 0.99)).toBe('sticky-paddle');
        expect(selectRandomPowerUpType(() => 0.36)).toBe('ball-speed');
    });

    it('creates effects using supplied clock and duration', () => {
        const now = vi.fn(() => 1000);
        const effect = createPowerUpEffect('paddle-width', { defaultDuration: 4 }, now);
        expect(effect).toEqual({
            type: 'paddle-width',
            duration: 4,
            remainingTime: 4,
            startTime: 1000,
        });
    });

    it('updates effect lifetimes and reports expiration', () => {
        const effect = createPowerUpEffect('ball-speed', { defaultDuration: 3 }, () => 0);
        expect(updatePowerUpEffect(effect, 1)).toBe(true);
        expect(effect.remainingTime).toBe(2);
        expect(updatePowerUpEffect(effect, 2)).toBe(false);
        expect(effect.remainingTime).toBe(0);
    });

    it('computes fade-out status and intensity ramp', () => {
        const effect = createPowerUpEffect('paddle-width', { defaultDuration: 4 }, () => 0);
        expect(isPowerUpFadingOut(effect)).toBe(false);
        expect(getPowerUpIntensity(effect)).toBe(1);

        effect.remainingTime = 1;
        expect(isPowerUpFadingOut(effect)).toBe(true);
        effect.remainingTime = 0.25;
        expect(isPowerUpFadingOut(effect)).toBe(true);
        expect(getPowerUpIntensity(effect)).toBeCloseTo(0.25, 5);

        effect.remainingTime = 0;
        expect(getPowerUpIntensity(effect)).toBe(0);
        expect(isPowerUpFadingOut(effect)).toBe(false);
    });

    it('scales paddle width and ball speed only for matching effect types', () => {
        const paddleEffect = createPowerUpEffect('paddle-width', { defaultDuration: 4 }, () => 0);
        expect(calculatePaddleWidthScale(paddleEffect, { paddleWidthMultiplier: 2 })).toBe(2);
        expect(calculatePaddleWidthScale(null)).toBe(1);

        const ballEffect = createPowerUpEffect('ball-speed', { defaultDuration: 4 }, () => 0);
        expect(calculateBallSpeedScale(ballEffect, { ballSpeedMultiplier: 1.5 })).toBe(1.5);
        ballEffect.remainingTime = 0.25;
        expect(calculateBallSpeedScale(ballEffect, { ballSpeedMultiplier: 1.5 })).toBeCloseTo(1.125, 5);
        expect(calculateBallSpeedScale(null)).toBe(1);
    });
});

describe('PowerUpManager', () => {
    it('activates, updates, and clears effects', () => {
        const manager = new PowerUpManager();
        const now = vi.fn(() => 0);

        manager.activate('paddle-width', { defaultDuration: 4 }, now);
        manager.activate('ball-speed', { defaultDuration: 2 }, now);

        expect(manager.isActive('paddle-width')).toBe(true);
        expect(manager.getActiveEffects()).toHaveLength(2);

        manager.update(1);
        expect(manager.isActive('ball-speed')).toBe(true);
        expect(manager.isActive('paddle-width')).toBe(true);

        manager.update(1.5); // ball-speed expires
        expect(manager.isActive('ball-speed')).toBe(false);

        manager.update(2.5); // paddle-width expires
        expect(manager.getActiveEffects()).toHaveLength(0);

        manager.activate('sticky-paddle', { defaultDuration: 1 }, now);
        manager.clearAll();
        expect(manager.getActiveEffects()).toHaveLength(0);
    });

    it('extends duration when the same power-up is collected again', () => {
        const manager = new PowerUpManager();
        const now = vi.fn(() => 0);

        manager.activate('sticky-paddle', { defaultDuration: 5 }, now);
        manager.update(2);

        now.mockReturnValue(2000);
        manager.activate('sticky-paddle', { defaultDuration: 5 }, now);

        const effect = manager.getEffect('sticky-paddle');
        expect(effect?.remainingTime).toBeCloseTo(8, 5);
        expect(effect?.duration).toBeCloseTo(8, 5);
    });
});
