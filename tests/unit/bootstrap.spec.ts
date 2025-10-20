import { describe, expect, it } from 'vitest';
import { bootstrapLuckyBreak } from 'app/main';

describe('bootstrapLuckyBreak', () => {
    it('initializes and exposes replay handle', () => {
        const container = document.createElement('div');
        const handle = bootstrapLuckyBreak({ container });

        expect(handle.getReplay).toBeInstanceOf(Function);
        expect(handle.withSeed).toBeInstanceOf(Function);
        expect(handle.getSeed).toBeInstanceOf(Function);

        const initialSeed = handle.getSeed();
        expect(typeof initialSeed).toBe('number');
        expect(initialSeed).toBeGreaterThan(0);

        const recording = handle.getReplay();
        expect(recording.version).toBe(1);
        expect(recording.seed).toBe(initialSeed);
        expect(Array.isArray(recording.events)).toBe(true);

        handle.withSeed(1234);
        expect(handle.getSeed()).toBe(1234);
    });
});
