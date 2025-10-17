import { describe, expect, it } from 'vitest';
import { bootstrapLuckyBreak } from 'app/main';

describe('bootstrapLuckyBreak', () => {
    it('initializes without throwing', () => {
        const container = document.createElement('div');
        expect(() => bootstrapLuckyBreak({ container })).not.toThrow();
    });
});
