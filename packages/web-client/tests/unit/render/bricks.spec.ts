import { describe, it, expect, beforeAll } from 'vitest';
import { Application, Sprite } from 'pixi.js';
import {
    generateBrickVariants,
    generateCrackTextures,
    placeBricks,
    type BrickVariantSets,
} from '../../../src/render/bricks';

// Note: These tests require WebGL/Canvas support which is not available in Node/Vitest
// Run these tests in E2E or browser environments instead
describe.skip('Brick Generation System', () => {
    let app: Application;
    // PixiJS v8 renderer with generateTexture (not in types)
    let renderer: any;

    beforeAll(async () => {
        app = new Application();
        await app.init({ width: 800, height: 600, backgroundAlpha: 0 });
        renderer = app.renderer; // Has generateTexture at runtime
    });

    describe('generateBrickVariants', () => {
        it('should generate all three brick style sets', () => {
            const sets = generateBrickVariants(renderer, 100, 40);

            expect(sets).toHaveProperty('neon');
            expect(sets).toHaveProperty('mosaic');
            expect(sets).toHaveProperty('marble');
            expect(Array.isArray(sets.neon)).toBe(true);
            expect(Array.isArray(sets.mosaic)).toBe(true);
            expect(Array.isArray(sets.marble)).toBe(true);
        });

        it('should generate variants for all three forms', () => {
            const sets = generateBrickVariants(renderer, 100, 40);

            // Each style should have 6 variants (2 per form × 3 forms)
            expect(sets.neon).toHaveLength(6);
            expect(sets.mosaic).toHaveLength(6);
            expect(sets.marble).toHaveLength(6);

            // Check that all forms are present
            const neonForms = sets.neon.map(v => v.form);
            expect(neonForms).toContain('rectangle');
            expect(neonForms).toContain('diamond');
            expect(neonForms).toContain('circle');
        });

        it('should create RenderTexture instances with correct dimensions', () => {
            const sets = generateBrickVariants(renderer, 100, 40);

            for (const variant of sets.neon) {
                expect(variant.texture).toBeDefined();
                expect(variant.texture.width).toBe(100);
                expect(variant.texture.height).toBe(40);
            }
        });

        it('should assign correct style and form metadata', () => {
            const sets = generateBrickVariants(renderer, 100, 40);

            expect(sets.neon[0].style).toBe('neon');
            expect(sets.mosaic[0].style).toBe('mosaic');
            expect(sets.marble[0].style).toBe('marble');

            // Each variant should have a form
            for (const variant of sets.neon) {
                expect(['rectangle', 'diamond', 'circle']).toContain(variant.form);
            }
        });

        it('should mark some variants as rare', () => {
            const sets = generateBrickVariants(renderer, 100, 40);

            // Should have some rare variants (rarity 0.05)
            const rareNeon = sets.neon.filter(v => v.rarity === 0.05);
            const rareMarble = sets.marble.filter(v => v.rarity === 0.05);

            expect(rareNeon.length).toBeGreaterThan(0);
            expect(rareMarble.length).toBeGreaterThan(0);

            // Should have common variants (rarity 1)
            const commonNeon = sets.neon.filter(v => v.rarity === 1);
            expect(commonNeon.length).toBeGreaterThan(0);
        });

        it('should support custom brick dimensions', () => {
            const sets = generateBrickVariants(renderer, 120, 50);

            expect(sets.neon[0].texture.width).toBe(120);
            expect(sets.neon[0].texture.height).toBe(50);
        });
    });

    describe.skip('generateCrackTextures', () => {
        // Note: These tests require a real WebGL renderer which isn't available in Node/Vitest
        // Run integration or E2E tests for full texture generation testing
        it('should generate three severity levels', () => {
            const cracks = generateCrackTextures(renderer, 100, 40);

            expect(cracks).toHaveProperty('1');
            expect(cracks).toHaveProperty('2');
            expect(cracks).toHaveProperty('3');
        });

        it('should create textures with correct dimensions', () => {
            const cracks = generateCrackTextures(renderer, 100, 40);

            expect(cracks[1].width).toBe(100);
            expect(cracks[1].height).toBe(40);
            expect(cracks[2].width).toBe(100);
            expect(cracks[3].width).toBe(100);
        });
    });

    describe('placeBricks', () => {
        let sets: BrickVariantSets;

        beforeAll(() => {
            sets = generateBrickVariants(renderer, 100, 40);
        });

        it('should create a container with correct number of bricks', () => {
            const wall = placeBricks(10, 5, 64, sets);

            expect(wall.children).toHaveLength(50); // 10 * 5
        });

        it('should position bricks in a grid', () => {
            const wall = placeBricks(3, 2, 64, sets);

            const brick1 = wall.children[0] as Sprite;
            const brick2 = wall.children[1] as Sprite;
            const brick4 = wall.children[3] as Sprite;

            expect(brick1.x).toBe(0);
            expect(brick1.y).toBe(0);
            expect(brick2.x).toBe(64);
            expect(brick2.y).toBe(0);
            expect(brick4.x).toBe(0);
            expect(brick4.y).toBe(64);
        });

        it('should apply correct brick dimensions', () => {
            const wall = placeBricks(2, 2, 64, sets);
            const brick = wall.children[0] as Sprite;

            expect(brick.width).toBe(64);
            expect(brick.height).toBe(64);
        });

        it('should use textures from variant sets', () => {
            const wall = placeBricks(2, 2, 64, sets);
            const brick = wall.children[0] as Sprite;

            // Verify texture exists and is from one of the sets
            expect(brick.texture).toBeDefined();

            const allTextures = [
                ...sets.neon.map((v) => v.texture),
                ...sets.mosaic.map((v) => v.texture),
                ...sets.marble.map((v) => v.texture),
            ];

            expect(allTextures).toContain(brick.texture);
        });

        it('should distribute styles according to pattern', () => {
            const wall = placeBricks(6, 6, 64, sets);

            // Row 0 (y=0, y%3===0) should be neon
            // Row 3 (y=3, y%3===0) should be neon
            const row0Bricks = wall.children.slice(0, 6);
            const row3Bricks = wall.children.slice(18, 24);

            for (const brick of [...row0Bricks, ...row3Bricks]) {
                const sprite = brick as Sprite;
                const isNeon = sets.neon.some((v) => v.texture === sprite.texture);
                expect(isNeon).toBe(true);
            }
        });

        it('should attach child elements for FX', () => {
            const wall = placeBricks(2, 2, 64, sets);
            const brick = wall.children[0] as Sprite;

            // Brick should have FX overlays attached
            expect(brick.children.length).toBeGreaterThan(0);
        });
    });
});
