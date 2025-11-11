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

    it('emits particles with isBreak flag for brick destruction', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 10, y: 20 },
            baseColor: 0x00ff00,
            intensity: 0.8,
            isBreak: true,
        });

        expect(system.container.visible).toBe(true);
        const activeSprites = system.container.children.filter((child) => child.visible) as Sprite[];
        expect(activeSprites.length).toBeGreaterThan(0);

        system.destroy();
    });

    it('emits particles without isBreak flag for hits', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 10, y: 20 },
            baseColor: 0x0000ff,
            intensity: 0.5,
            isBreak: false,
        });

        expect(system.container.visible).toBe(true);
        const activeSprites = system.container.children.filter((child) => child.visible) as Sprite[];
        expect(activeSprites.length).toBeGreaterThan(0);

        system.destroy();
    });

    it('uses chromatic colors when provided', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 50, y: 60 },
            baseColor: 0xffffff,
            intensity: 0.6,
            chromaticColors: [0xff0000, 0x00ff00, 0x0000ff],
        });

        expect(system.container.visible).toBe(true);
        const activeSprites = system.container.children.filter((child) => child.visible) as Sprite[];
        expect(activeSprites.length).toBeGreaterThan(0);

        const tints = new Set(activeSprites.map((s) => s.tint));
        expect(tints.size).toBeGreaterThan(1);

        system.destroy();
    });

    it('does not emit particles when at max capacity', () => {
        const system = createBrickParticleSystem({
            maxParticles: 5,
            baseBurstCount: 10,
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        const firstCount = system.container.children.filter((child) => child.visible).length;
        expect(firstCount).toBeGreaterThan(0);

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        const secondCount = system.container.children.filter((child) => child.visible).length;
        expect(secondCount).toBe(firstCount);

        system.destroy();
    });

    it('handles update with zero delta', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        const countBefore = system.container.children.filter((child) => child.visible).length;

        system.update(0);

        const countAfter = system.container.children.filter((child) => child.visible).length;
        expect(countAfter).toBe(countBefore);

        system.destroy();
    });

    it('handles update with non-finite delta', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        const countBefore = system.container.children.filter((child) => child.visible).length;

        system.update(NaN);

        const countAfter = system.container.children.filter((child) => child.visible).length;
        expect(countAfter).toBe(countBefore);

        system.destroy();
    });

    it('setBudget adjusts maxParticles and removes overflow', () => {
        const system = createBrickParticleSystem({
            maxParticles: 20,
            baseBurstCount: 10,
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        const countBefore = system.container.children.filter((child) => child.visible).length;

        system.setBudget({ maxParticles: 3 });

        const countAfter = system.container.children.filter((child) => child.visible).length;
        expect(countAfter).toBeLessThanOrEqual(3);
        expect(countAfter).toBeLessThan(countBefore);

        system.destroy();
    });

    it('setBudget adjusts baseBurstCount', () => {
        const system = createBrickParticleSystem({
            maxParticles: 50,
            baseBurstCount: 10,
            random: createDeterministicRandom([0.5]),
        });

        system.setBudget({ baseBurstCount: 5 });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        const count = system.container.children.filter((child) => child.visible).length;
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(50);

        system.destroy();
    });

    it('setBudget handles non-finite values gracefully', () => {
        const system = createBrickParticleSystem({
            maxParticles: 20,
            baseBurstCount: 10,
        });

        system.setBudget({ maxParticles: NaN });
        system.setBudget({ baseBurstCount: Infinity });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        expect(system.container.visible).toBe(true);

        system.destroy();
    });

    it('handles pick function when min >= max', () => {
        const system = createBrickParticleSystem({
            random: () => 0.5,
        });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
            intensity: 1.0,
        });

        expect(system.container.visible).toBe(true);

        system.destroy();
    });

    it('updates chromatic particles with offset calculations', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.5, 0.6, 0.7]),
        });

        system.emit({
            position: { x: 100, y: 100 },
            baseColor: 0xffffff,
            chromaticColors: [0xff0000, 0x00ff00, 0x0000ff],
            intensity: 0.8,
        });

        const initialPositions = (system.container.children.filter((child) => child.visible) as Sprite[]).map(
            (s) => ({ x: s.x, y: s.y }),
        );

        system.update(0.016);

        const updatedPositions = (system.container.children.filter((child) => child.visible) as Sprite[]).map(
            (s) => ({ x: s.x, y: s.y }),
        );

        expect(updatedPositions.some((p, i) => p.x !== initialPositions[i].x || p.y !== initialPositions[i].y)).toBe(true);

        system.destroy();
    });

    it('does not update when container is invisible', () => {
        const system = createBrickParticleSystem({
            random: createDeterministicRandom([0.5]),
        });

        system.emit({
            position: { x: 0, y: 0 },
            baseColor: 0xffffff,
        });

        system.update(10);
        expect(system.container.visible).toBe(false);

        system.update(1);
        expect(system.container.visible).toBe(false);

        system.destroy();
    });
});
