import { describe, expect, it } from 'vitest';
import { createRandomManager, mulberry32 } from 'util/random';

const sample = (source: () => number, count: number): number[] => {
    return Array.from({ length: count }, () => source());
};

describe('mulberry32', () => {
    it('produces deterministic sequences for the same seed', () => {
        const sequenceA = sample(mulberry32(1234), 5);
        const sequenceB = sample(mulberry32(1234), 5);
        expect(sequenceA).toEqual(sequenceB);
    });

    it('produces distinct sequences for different seeds', () => {
        const sequenceA = sample(mulberry32(1), 3);
        const sequenceB = sample(mulberry32(2), 3);
        expect(sequenceA).not.toEqual(sequenceB);
    });
});

describe('createRandomManager', () => {
    it('resets to the same sequence when requested', () => {
        const manager = createRandomManager(42);
        const firstRun = [manager.next(), manager.next(), manager.next()];
        manager.reset();
        const secondRun = [manager.next(), manager.next(), manager.next()];
        expect(secondRun).toEqual(firstRun);
    });

    it('re-seeds to produce a new deterministic sequence', () => {
        const manager = createRandomManager(7);
        const initial = [manager.next(), manager.next()];
        const nextSeed = manager.setSeed(99);
        expect(nextSeed).toBeGreaterThan(0);
        const reseeded = [manager.next(), manager.next()];
        expect(reseeded).not.toEqual(initial);
        manager.reset();
        const repeated = [manager.next(), manager.next()];
        expect(repeated).toEqual(reseeded);
    });

    it('generates bounded integers within range', () => {
        const manager = createRandomManager(123);
        for (let i = 0; i < 10; i += 1) {
            const value = manager.nextInt(5);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(5);
        }
    });
});
