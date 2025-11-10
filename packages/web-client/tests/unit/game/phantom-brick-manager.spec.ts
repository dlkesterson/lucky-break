import { describe, expect, it } from 'vitest';
import type { MatterBody as Body } from 'physics/matter';
import { createPhantomBrickManager } from 'game/phantom-bricks';

const makeBrick = (id: number): Body => ({ id, label: 'brick' } as unknown as Body);

describe('createPhantomBrickManager', () => {
    it('registers and identifies phantom bricks', () => {
        const manager = createPhantomBrickManager({ entropyReward: 5 });
        const brick = makeBrick(1);

        expect(manager.isPhantom(brick)).toBe(false);

        manager.register(brick);

        expect(manager.isPhantom(brick)).toBe(true);
        expect(manager.count()).toBe(1);
    });

    it('unregisters phantom bricks', () => {
        const manager = createPhantomBrickManager({ entropyReward: 5 });
        const brick = makeBrick(1);

        manager.register(brick);
        expect(manager.isPhantom(brick)).toBe(true);

        manager.unregister(brick);

        expect(manager.isPhantom(brick)).toBe(false);
        expect(manager.count()).toBe(0);
    });

    it('returns configured entropy reward', () => {
        const manager = createPhantomBrickManager({ entropyReward: 8 });

        expect(manager.getEntropyReward()).toBe(8);
    });

    it('tracks multiple phantom bricks independently', () => {
        const manager = createPhantomBrickManager({ entropyReward: 5 });
        const brick1 = makeBrick(1);
        const brick2 = makeBrick(2);
        const brick3 = makeBrick(3);

        manager.register(brick1);
        manager.register(brick2);

        expect(manager.isPhantom(brick1)).toBe(true);
        expect(manager.isPhantom(brick2)).toBe(true);
        expect(manager.isPhantom(brick3)).toBe(false);
        expect(manager.count()).toBe(2);
    });

    it('clears all phantom bricks on clear()', () => {
        const manager = createPhantomBrickManager({ entropyReward: 5 });
        const brick1 = makeBrick(1);
        const brick2 = makeBrick(2);

        manager.register(brick1);
        manager.register(brick2);
        expect(manager.count()).toBe(2);

        manager.clear();

        expect(manager.isPhantom(brick1)).toBe(false);
        expect(manager.isPhantom(brick2)).toBe(false);
        expect(manager.count()).toBe(0);
    });

    it('handles duplicate registrations gracefully', () => {
        const manager = createPhantomBrickManager({ entropyReward: 5 });
        const brick = makeBrick(1);

        manager.register(brick);
        manager.register(brick);

        expect(manager.count()).toBe(1);
    });
});
