import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from 'physics/index';

describe('physics barrel', () => {
    it('exposes the world factory', () => {
        expect(typeof createPhysicsWorld).toBe('function');
    });
});
