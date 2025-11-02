import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRandomManager, mulberry32 } from 'util/random';

const sample = (source: () => number, count: number): number[] => {
    return Array.from({ length: count }, () => source());
};

afterEach(() => {
    vi.restoreAllMocks();
    const unstub = (vi as unknown as { unstubAllGlobals?: () => void }).unstubAllGlobals;
    unstub?.();
});

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

    it('normalizes zero and non-finite seeds to the default seed', () => {
        const zeroManager = createRandomManager(0);
        expect(zeroManager.seed()).toBe(1);

        const manager = createRandomManager(5);
        expect(manager.setSeed(Number.POSITIVE_INFINITY)).toBe(1);
        expect(manager.seed()).toBe(1);
    });

    it('throws for invalid nextInt bounds', () => {
        const manager = createRandomManager(11);
        expect(() => manager.nextInt(0)).toThrow(RangeError);
        expect(() => manager.nextInt(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });

    it('clamps boolean thresholds outside the unit interval', () => {
        const manager = createRandomManager(77);
        expect(manager.boolean(2)).toBe(true);
        expect(manager.boolean(-5)).toBe(false);
    });

    it('falls back to default seeding when crypto returns zero', () => {
        const cryptoGlobal = globalThis.crypto as Crypto | undefined;

        if (cryptoGlobal && typeof cryptoGlobal.getRandomValues === 'function') {
            const spy = vi.spyOn(cryptoGlobal, 'getRandomValues').mockImplementation((array: ArrayBufferView) => {
                const view = new Uint32Array(array.buffer, array.byteOffset, Math.floor(array.byteLength / Uint32Array.BYTES_PER_ELEMENT));
                if (view.length > 0) {
                    view[0] = 0;
                }
                return array;
            });

            const manager = createRandomManager(undefined);
            expect(manager.seed()).toBe(1);

            spy.mockRestore();
        } else {
            vi.stubGlobal('crypto', {
                getRandomValues: (array: ArrayBufferView) => {
                    const view = new Uint32Array(array.buffer, array.byteOffset, Math.floor(array.byteLength / Uint32Array.BYTES_PER_ELEMENT));
                    if (view.length > 0) {
                        view[0] = 0;
                    }
                    return array;
                },
            });

            const manager = createRandomManager(undefined);
            expect(manager.seed()).toBe(1);
        }
    });

    it('uses Math.random fallback when crypto is unavailable', () => {
        const originalCrypto = globalThis.crypto;
        vi.stubGlobal('crypto', undefined as unknown as Crypto);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

        const manager = createRandomManager(undefined);

        expect(manager.seed()).toBe(1);

        randomSpy.mockRestore();
        if (originalCrypto !== undefined) {
            vi.stubGlobal('crypto', originalCrypto);
        }
    });
});
