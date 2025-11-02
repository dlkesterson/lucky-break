import { describe, expect, it } from 'vitest';
import { createBrickParticleSystem } from 'render/effects/brick-particles';
import { Sprite } from 'pixi.js';

const createDeterministicRandom = (values: readonly number[]) => {
    let index = 0;
    return () => {
        const value = values[index] ?? values[values.length - 1] ?? 0.5;
        index = (index + 1) % values.length;
        return value;
    };
};

describe('brick-particles', () => {
    it('emits tinted particles and disposes them after update', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.1, 0.35, 0.6, 0.85]),
        });

        expect(system.container.visible).toBe(false);
        expect(system.container.children).toHaveLength(0);

        system.emit({
            position: { x: 32, y: 48 },
            baseColor: 0xff3366,
            intensity: 0.7,
            impactSpeed: 10,
        });

        expect(system.container.visible).toBe(true);
        expect(system.container.children.length).toBeGreaterThan(0);

        const activeSprites = system.container.children.filter((child) => child.visible) as Sprite[];
        expect(activeSprites.length).toBeGreaterThan(0);
        expect(activeSprites[0].tint).toBe(0xff3366);

        system.update(1);
        expect(system.container.visible).toBe(false);
        expect(activeSprites.every((sprite) => !sprite.visible)).toBe(true);

        system.destroy();
    });

    it('reset clears active bursts without destroying pool', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.2, 0.4]),
        });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });
        expect(system.container.visible).toBe(true);

        system.reset();
        expect(system.container.visible).toBe(false);
        expect(system.container.children.length).toBeGreaterThan(0);

        system.destroy();
    });
});
