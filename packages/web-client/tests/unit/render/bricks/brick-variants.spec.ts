import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Graphics, Texture } from 'pixi.js';
import {
    generateBrickVariants,
    generateCrackTextures,
    type BrickVariantSets,
    type BrickForm,
} from 'render/bricks/brick-variants';

describe('render/bricks/brick-variants', () => {
    const mockTexture = {} as Texture;
    const mockRenderer = {
        generateTexture: vi.fn(() => mockTexture),
    };

    const testWidth = 60;
    const testHeight = 24;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('generateBrickVariants', () => {
        it('returns a complete BrickVariantSets object with all styles', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(variants).toBeDefined();
            expect(variants.neon).toBeDefined();
            expect(variants.mosaic).toBeDefined();
            expect(variants.marble).toBeDefined();
        });

        it('generates neon variants with all form types', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(variants.neon.length).toBeGreaterThan(0);

            const forms = new Set<BrickForm>();
            for (const variant of variants.neon) {
                forms.add(variant.form);
            }

            expect(forms.has('rectangle')).toBe(true);
            expect(forms.has('diamond')).toBe(true);
            expect(forms.has('circle')).toBe(true);
        });

        it('generates mosaic variants with all form types', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(variants.mosaic.length).toBeGreaterThan(0);

            const forms = new Set<BrickForm>();
            for (const variant of variants.mosaic) {
                forms.add(variant.form);
            }

            expect(forms.has('rectangle')).toBe(true);
            expect(forms.has('diamond')).toBe(true);
            expect(forms.has('circle')).toBe(true);
        });

        it('generates marble variants with all form types', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(variants.marble.length).toBeGreaterThan(0);

            const forms = new Set<BrickForm>();
            for (const variant of variants.marble) {
                forms.add(variant.form);
            }

            expect(forms.has('rectangle')).toBe(true);
            expect(forms.has('diamond')).toBe(true);
            expect(forms.has('circle')).toBe(true);
        });

        it('assigns correct style property to each variant', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            for (const variant of variants.neon) {
                expect(variant.style).toBe('neon');
            }
            for (const variant of variants.mosaic) {
                expect(variant.style).toBe('mosaic');
            }
            for (const variant of variants.marble) {
                expect(variant.style).toBe('marble');
            }
        });

        it('assigns texture property to each variant', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            for (const variant of variants.neon) {
                expect(variant.texture).toBe(mockTexture);
            }
            for (const variant of variants.mosaic) {
                expect(variant.texture).toBe(mockTexture);
            }
            for (const variant of variants.marble) {
                expect(variant.texture).toBe(mockTexture);
            }
        });

        it('assigns rarity values to each variant', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            for (const variant of variants.neon) {
                expect(typeof variant.rarity).toBe('number');
                expect(variant.rarity).toBeGreaterThan(0);
                expect(variant.rarity).toBeLessThanOrEqual(1);
            }
            for (const variant of variants.mosaic) {
                expect(typeof variant.rarity).toBe('number');
                expect(variant.rarity).toBeGreaterThan(0);
                expect(variant.rarity).toBeLessThanOrEqual(1);
            }
            for (const variant of variants.marble) {
                expect(typeof variant.rarity).toBe('number');
                expect(variant.rarity).toBeGreaterThan(0);
                expect(variant.rarity).toBeLessThanOrEqual(1);
            }
        });

        it('includes rare variants with lower rarity values', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const allVariants = [...variants.neon, ...variants.mosaic, ...variants.marble];
            const rareVariants = allVariants.filter((v) => v.rarity < 1);

            expect(rareVariants.length).toBeGreaterThan(0);
        });

        it('generates expected number of neon variants (5 colors × 3 forms)', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(variants.neon.length).toBe(15); // 5 colors × 3 forms
        });

        it('generates expected number of mosaic variants (3 types × 3 forms)', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(variants.mosaic.length).toBe(9); // 3 types × 3 forms
        });

        it('generates expected number of marble variants (3 types × 3 forms)', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(variants.marble.length).toBe(9); // 3 types × 3 forms
        });

        it('calls renderer.generateTexture for each variant', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const totalVariants = variants.neon.length + variants.mosaic.length + variants.marble.length;
            expect(mockRenderer.generateTexture).toHaveBeenCalledTimes(totalVariants);
        });

        it('passes Graphics instances to renderer.generateTexture', () => {
            generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(mockRenderer.generateTexture).toHaveBeenCalled();
            // Ensure at least one call received a Graphics instance as the first argument
            expect(mockRenderer.generateTexture).toHaveBeenCalledWith(expect.any(Graphics));
        });

        it('handles small brick dimensions correctly', () => {
            const smallWidth = 20;
            const smallHeight = 10;

            expect(() => {
                generateBrickVariants(mockRenderer, smallWidth, smallHeight);
            }).not.toThrow();
        });

        it('handles large brick dimensions correctly', () => {
            const largeWidth = 200;
            const largeHeight = 80;

            expect(() => {
                generateBrickVariants(mockRenderer, largeWidth, largeHeight);
            }).not.toThrow();
        });

        it('creates unique textures for each variant', () => {
            const textureInstances: Texture[] = [];
            const trackedRenderer = {
                generateTexture: vi.fn(() => {
                    const tex = {} as Texture;
                    textureInstances.push(tex);
                    return tex;
                }),
            };

            const variants = generateBrickVariants(trackedRenderer, testWidth, testHeight);

            const allTextures = [
                ...variants.neon.map((v) => v.texture),
                ...variants.mosaic.map((v) => v.texture),
                ...variants.marble.map((v) => v.texture),
            ];

            expect(new Set(allTextures).size).toBe(allTextures.length);
        });

        it('generates deterministic patterns based on style and form', () => {
            const firstRun = generateBrickVariants(mockRenderer, testWidth, testHeight);
            vi.clearAllMocks();
            const secondRun = generateBrickVariants(mockRenderer, testWidth, testHeight);

            expect(firstRun.neon.length).toBe(secondRun.neon.length);
            expect(firstRun.mosaic.length).toBe(secondRun.mosaic.length);
            expect(firstRun.marble.length).toBe(secondRun.marble.length);

            // Verify same rarity distribution
            for (let i = 0; i < firstRun.neon.length; i++) {
                expect(firstRun.neon[i].rarity).toBe(secondRun.neon[i].rarity);
            }
        });

        it('neon variants include both common and rare rarity levels', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const commonNeon = variants.neon.filter((v) => v.rarity === 1);
            const rareNeon = variants.neon.filter((v) => v.rarity < 1);

            expect(commonNeon.length).toBeGreaterThan(0);
            expect(rareNeon.length).toBeGreaterThan(0);
        });

        it('mosaic variants include both common and rare rarity levels', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const commonMosaic = variants.mosaic.filter((v) => v.rarity === 1);
            const rareMosaic = variants.mosaic.filter((v) => v.rarity < 1);

            expect(commonMosaic.length).toBeGreaterThan(0);
            expect(rareMosaic.length).toBeGreaterThan(0);
        });

        it('marble variants include both common and rare rarity levels', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const commonMarble = variants.marble.filter((v) => v.rarity === 1);
            const rareMarble = variants.marble.filter((v) => v.rarity < 1);

            expect(commonMarble.length).toBeGreaterThan(0);
            expect(rareMarble.length).toBeGreaterThan(0);
        });

        it('neon style has lowest rarity of 0.15 for rare variants', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const rareNeon = variants.neon.filter((v) => v.rarity < 1);
            for (const variant of rareNeon) {
                expect(variant.rarity).toBe(0.15);
            }
        });

        it('mosaic style has lowest rarity of 0.1 for rare variants', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const rareMosaic = variants.mosaic.filter((v) => v.rarity < 1);
            for (const variant of rareMosaic) {
                expect(variant.rarity).toBe(0.1);
            }
        });

        it('marble style has lowest rarity of 0.08 for rare variants', () => {
            const variants = generateBrickVariants(mockRenderer, testWidth, testHeight);

            const rareMarble = variants.marble.filter((v) => v.rarity < 1);
            for (const variant of rareMarble) {
                expect(variant.rarity).toBe(0.08);
            }
        });
    });

    describe('generateCrackTextures', () => {
        it('returns textures for all three damage levels', () => {
            const cracks = generateCrackTextures(mockRenderer, testWidth, testHeight);

            expect(cracks[1]).toBeDefined();
            expect(cracks[2]).toBeDefined();
            expect(cracks[3]).toBeDefined();
        });

        it('returns Texture instances for each level', () => {
            const cracks = generateCrackTextures(mockRenderer, testWidth, testHeight);

            expect(cracks[1]).toBe(mockTexture);
            expect(cracks[2]).toBe(mockTexture);
            expect(cracks[3]).toBe(mockTexture);
        });

        it('calls renderer.generateTexture three times', () => {
            generateCrackTextures(mockRenderer, testWidth, testHeight);

            expect(mockRenderer.generateTexture).toHaveBeenCalledTimes(3);
        });

        it('passes Graphics instances to renderer.generateTexture', () => {
            generateCrackTextures(mockRenderer, testWidth, testHeight);

            const calls = (mockRenderer.generateTexture as unknown as { mock?: { calls?: any[][] } }).mock?.calls ?? [];
            for (const call of calls) {
                expect(call[0]).toBeInstanceOf(Graphics);
            }
        });

        it('handles small brick dimensions correctly', () => {
            const smallWidth = 20;
            const smallHeight = 10;

            expect(() => {
                generateCrackTextures(mockRenderer, smallWidth, smallHeight);
            }).not.toThrow();
        });

        it('handles large brick dimensions correctly', () => {
            const largeWidth = 200;
            const largeHeight = 80;

            expect(() => {
                generateCrackTextures(mockRenderer, largeWidth, largeHeight);
            }).not.toThrow();
        });

        it('creates unique textures for each damage level', () => {
            const textureInstances: Texture[] = [];
            const trackedRenderer = {
                generateTexture: vi.fn(() => {
                    const tex = {} as Texture;
                    textureInstances.push(tex);
                    return tex;
                }),
            };

            generateCrackTextures(trackedRenderer, testWidth, testHeight);

            expect(new Set(textureInstances).size).toBe(3);
        });

        it('generates deterministic crack patterns for same dimensions', () => {
            generateCrackTextures(mockRenderer, testWidth, testHeight);
            const firstCallCount = mockRenderer.generateTexture.mock.calls.length;

            vi.clearAllMocks();

            generateCrackTextures(mockRenderer, testWidth, testHeight);
            const secondCallCount = mockRenderer.generateTexture.mock.calls.length;

            expect(firstCallCount).toBe(secondCallCount);
            expect(secondCallCount).toBe(3);
        });

        it('accepts width and height parameters', () => {
            const customWidth = 80;
            const customHeight = 32;

            expect(() => {
                generateCrackTextures(mockRenderer, customWidth, customHeight);
            }).not.toThrow();

            expect(mockRenderer.generateTexture).toHaveBeenCalledTimes(3);
        });
    });

    describe('Variant properties and consistency', () => {
        let variants: BrickVariantSets;

        beforeEach(() => {
            variants = generateBrickVariants(mockRenderer, testWidth, testHeight);
        });

        it('all neon variants have form property matching one of the allowed forms', () => {
            const allowedForms: BrickForm[] = ['rectangle', 'diamond', 'circle'];

            for (const variant of variants.neon) {
                expect(allowedForms).toContain(variant.form);
            }
        });

        it('all mosaic variants have form property matching one of the allowed forms', () => {
            const allowedForms: BrickForm[] = ['rectangle', 'diamond', 'circle'];

            for (const variant of variants.mosaic) {
                expect(allowedForms).toContain(variant.form);
            }
        });

        it('all marble variants have form property matching one of the allowed forms', () => {
            const allowedForms: BrickForm[] = ['rectangle', 'diamond', 'circle'];

            for (const variant of variants.marble) {
                expect(allowedForms).toContain(variant.form);
            }
        });

        it('variants are distributed evenly across form types for neon', () => {
            const formCounts = { rectangle: 0, diamond: 0, circle: 0 };

            for (const variant of variants.neon) {
                formCounts[variant.form]++;
            }

            expect(formCounts.rectangle).toBe(formCounts.diamond);
            expect(formCounts.diamond).toBe(formCounts.circle);
        });

        it('variants are distributed evenly across form types for mosaic', () => {
            const formCounts = { rectangle: 0, diamond: 0, circle: 0 };

            for (const variant of variants.mosaic) {
                formCounts[variant.form]++;
            }

            expect(formCounts.rectangle).toBe(formCounts.diamond);
            expect(formCounts.diamond).toBe(formCounts.circle);
        });

        it('variants are distributed evenly across form types for marble', () => {
            const formCounts = { rectangle: 0, diamond: 0, circle: 0 };

            for (const variant of variants.marble) {
                formCounts[variant.form]++;
            }

            expect(formCounts.rectangle).toBe(formCounts.diamond);
            expect(formCounts.diamond).toBe(formCounts.circle);
        });
    });

    describe('Texture baking and cleanup', () => {
        it('does not throw errors during texture generation', () => {
            expect(() => {
                generateBrickVariants(mockRenderer, testWidth, testHeight);
            }).not.toThrow();
        });

        it('does not throw errors during crack texture generation', () => {
            expect(() => {
                generateCrackTextures(mockRenderer, testWidth, testHeight);
            }).not.toThrow();
        });

        it('handles renderer that returns different texture instances', () => {
            let counter = 0;
            const uniqueRenderer = {
                generateTexture: vi.fn(() => {
                    return { id: counter++ } as unknown as Texture;
                }),
            };

            const variants = generateBrickVariants(uniqueRenderer, testWidth, testHeight);

            const allTextures = [
                ...variants.neon.map((v) => v.texture),
                ...variants.mosaic.map((v) => v.texture),
                ...variants.marble.map((v) => v.texture),
            ];

            // Each texture should have a unique id
            const ids = allTextures.map((t) => (t as unknown as { id: number }).id);
            expect(new Set(ids).size).toBe(ids.length);
        });
    });
});
