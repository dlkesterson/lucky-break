export type RandomSource = () => number;

const UINT32_MAX = 0xffffffff;
const DEFAULT_SEED = 1;

const normalizeSeed = (seed: number): number => {
    if (!Number.isFinite(seed)) {
        return DEFAULT_SEED;
    }

    const normalized = seed >>> 0;
    return normalized === 0 ? DEFAULT_SEED : normalized;
};

const fallbackSeed = (): number => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer[0] === 0 ? DEFAULT_SEED : buffer[0];
    }

    const random = Math.floor(Math.random() * UINT32_MAX);
    return random === 0 ? DEFAULT_SEED : random;
};

export const mulberry32 = (seed: number): RandomSource => {
    let state = normalizeSeed(seed);
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export interface RandomManager {
    readonly seed: () => number;
    readonly setSeed: (seed: number) => number;
    readonly reset: () => void;
    readonly next: () => number;
    readonly random: RandomSource;
    readonly nextInt: (maxExclusive: number) => number;
    readonly boolean: (threshold?: number) => boolean;
}

export const createRandomManager = (seed?: number | null): RandomManager => {
    let currentSeed = seed === null || seed === undefined ? fallbackSeed() : normalizeSeed(seed);
    let generator = mulberry32(currentSeed);

    const reset = () => {
        generator = mulberry32(currentSeed);
    };

    const setSeed = (nextSeed: number) => {
        currentSeed = normalizeSeed(nextSeed);
        reset();
        return currentSeed;
    };

    const next = () => generator();

    const random: RandomSource = () => next();

    const nextInt = (maxExclusive: number): number => {
        if (!Number.isFinite(maxExclusive) || maxExclusive < 1) {
            throw new RangeError('maxExclusive must be a positive finite number');
        }
        return Math.floor(next() * maxExclusive);
    };

    const boolean = (threshold = 0.5): boolean => {
        const clamped = Math.max(0, Math.min(1, threshold));
        return next() < clamped;
    };

    return {
        seed: () => currentSeed,
        setSeed,
        reset,
        next,
        random,
        nextInt,
        boolean,
    };
};
