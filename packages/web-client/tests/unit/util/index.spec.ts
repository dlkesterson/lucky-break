import { describe, expect, it } from 'vitest';
import { noop } from 'util/index';

describe('util barrel', () => {
    it('provides a noop helper', () => {
        expect(typeof noop).toBe('function');
        expect(noop()).toBeUndefined();
    });
});
