import { describe, expect, it } from 'vitest';
import { bootstrapAudio } from 'audio/index';

describe('audio barrel', () => {
    it('exposes bootstrapAudio factory', () => {
        expect(typeof bootstrapAudio).toBe('function');
    });
});
