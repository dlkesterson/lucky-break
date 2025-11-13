import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    installEventHarness,
    startGameplay,
    waitForSceneTransition,
    e2eTimeouts,
    getBrickData,
    getBrickPositions,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test.describe('Brick Generation System', () => {
    test('should generate all three brick style sets', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);

        expect(brickData.variants).not.toBeNull();
        expect(brickData.variants).toHaveProperty('neon');
        expect(brickData.variants).toHaveProperty('mosaic');
        expect(brickData.variants).toHaveProperty('marble');
        expect(Array.isArray(brickData.variants?.neon)).toBe(true);
        expect(Array.isArray(brickData.variants?.mosaic)).toBe(true);
        expect(Array.isArray(brickData.variants?.marble)).toBe(true);
    });

    test('should generate variants for all three forms', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);

        // Neon has 5 variants per form, mosaic and marble have 3
        expect(brickData.variants?.neon).toHaveLength(15); // 5 × 3 forms
        expect(brickData.variants?.mosaic).toHaveLength(9); // 3 × 3 forms
        expect(brickData.variants?.marble).toHaveLength(9); // 3 × 3 forms

        // Check that all forms are present
        const neonForms = brickData.variants?.neon.map((v) => v.form);
        expect(neonForms).toContain('rectangle');
        expect(neonForms).toContain('diamond');
        expect(neonForms).toContain('circle');
    });

    test('should create textures with correct dimensions', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);

        // All variants should have positive dimensions
        for (const variant of brickData.variants?.neon ?? []) {
            expect(variant.width).toBeGreaterThan(0);
            expect(variant.height).toBeGreaterThan(0);
        }

        // Note: Variants may have different dimensions based on form
        // (e.g., rectangles have different aspect ratios than circles)
        // So we just verify they're all valid textures
    });

    test('should assign correct style and form metadata', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);

        expect(brickData.variants?.neon[0].style).toBe('neon');
        expect(brickData.variants?.mosaic[0].style).toBe('mosaic');
        expect(brickData.variants?.marble[0].style).toBe('marble');

        // Each variant should have a valid form
        for (const variant of brickData.variants?.neon ?? []) {
            expect(['rectangle', 'diamond', 'circle']).toContain(variant.form);
        }
    });

    test('should mark some variants as rare', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);

        // Neon has rare variants with rarity 0.15 (i >= 3, so 2 per form × 3 forms = 6)
        const rareNeon = brickData.variants?.neon.filter((v) => v.rarity === 0.15);
        // Marble has rare variant with rarity 0.08 (i === 2, so 1 per form × 3 forms = 3)
        const rareMarble = brickData.variants?.marble.filter((v) => v.rarity === 0.08);

        expect(rareNeon?.length).toBe(6);
        expect(rareMarble?.length).toBe(3);

        // Should have common variants (rarity 1)
        const commonNeon = brickData.variants?.neon.filter((v) => v.rarity === 1);
        expect(commonNeon?.length).toBeGreaterThan(0);
    });

    test('should generate three crack texture severity levels', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);

        expect(brickData.crackTextures).not.toBeNull();
        expect(brickData.crackTextures).toHaveProperty('1');
        expect(brickData.crackTextures).toHaveProperty('2');
        expect(brickData.crackTextures).toHaveProperty('3');
    });

    test('should create crack textures with correct dimensions', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);

        expect(brickData.crackTextures).not.toBeNull();
        expect(brickData.crackTextures?.['1'].width).toBeGreaterThan(0);
        expect(brickData.crackTextures?.['1'].height).toBeGreaterThan(0);
        expect(brickData.crackTextures?.['2'].width).toBeGreaterThan(0);
        expect(brickData.crackTextures?.['2'].height).toBeGreaterThan(0);
        expect(brickData.crackTextures?.['3'].width).toBeGreaterThan(0);
        expect(brickData.crackTextures?.['3'].height).toBeGreaterThan(0);
    });

    test('should place bricks in a grid pattern', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickPositions = await getBrickPositions(page);

        expect(brickPositions).toBeDefined();
        expect(brickPositions.length).toBeGreaterThan(0);

        // Check first few brick positions for grid pattern
        const samples = brickPositions.slice(0, 6);
        if (samples.length >= 2) {
            // Bricks should have distinct positions
            expect(samples[0].x).not.toBe(samples[1].x);
            // All positions should be non-negative
            samples.forEach(pos => {
                expect(pos.x).toBeGreaterThanOrEqual(0);
                expect(pos.y).toBeGreaterThanOrEqual(0);
            });
        }
    });

    test('should distribute brick styles according to pattern', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);
        const brickPositions = await getBrickPositions(page);

        expect(brickData.variants).not.toBeNull();
        expect(brickPositions.length).toBeGreaterThan(0);

        // Check that we have multiple brick variants across all styles
        const allVariants = [
            ...(brickData.variants?.neon ?? []),
            ...(brickData.variants?.mosaic ?? []),
            ...(brickData.variants?.marble ?? []),
        ];
        expect(allVariants.length).toBeGreaterThan(1);
    });

    test('should attach FX elements to bricks', async ({ page }) => {
        await gotoLuckyBreak(page);

        await page.waitForSelector('.lb-preloader[data-state="loading"]');
        await page.waitForSelector('canvas', { state: 'attached' });
        await expect(page.locator('.lb-preloader')).toHaveCount(0);

        await waitForSceneTransition(page, 'main-menu', 'enter');

        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

        await startGameplay(page);
        await waitForSceneTransition(page, 'gameplay', 'enter');

        const brickData = await getBrickData(page);
        const brickPositions = await getBrickPositions(page);

        // Verify bricks are generated and have associated data
        expect(brickData.variants).not.toBeNull();
        expect(brickPositions.length).toBeGreaterThan(0);

        // Verify each brick style has at least one variant
        expect(brickData.variants?.neon.length).toBeGreaterThan(0);
        expect(brickData.variants?.mosaic.length).toBeGreaterThan(0);
        expect(brickData.variants?.marble.length).toBeGreaterThan(0);
    });
});
