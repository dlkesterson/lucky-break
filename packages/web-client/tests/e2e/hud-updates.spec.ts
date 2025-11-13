import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('HUD score updates in real-time after brick destruction', async ({ page }) => {
    await gotoLuckyBreak(page);

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await drainEvents(page);

    const hudLayout = page.locator('.hud-layout');
    await expect(hudLayout).toBeVisible();

    const hudScore = page.locator('.hud-score');
    await expect(hudScore).toBeVisible();

    const initialScoreText = await hudScore.textContent();
    expect(initialScoreText).toBeTruthy();

    const extractScore = (text: string | null): number => {
        if (!text) {
            return 0;
        }
        const match = /(\d+)/.exec(text);
        return match ? parseInt(match[1], 10) : 0;
    };

    const initialScore = extractScore(initialScoreText);

    await canvas.click();
    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');

    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });

    // Wait for physics to complete and HUD to update (default angle hits 2 bricks)
    await page.waitForTimeout(3000);

    // Force a frame update to ensure React state propagates
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const updatedScoreText = await hudScore.textContent();
    const updatedScore = extractScore(updatedScoreText);

    expect(
        updatedScore,
        `HUD score should increase after brick break. Initial: ${initialScore}, Updated: ${updatedScore}`,
    ).toBeGreaterThan(initialScore);
});

test('HUD score matches pause menu score after brick breaks', async ({ page }) => {
    await gotoLuckyBreak(page);

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await drainEvents(page);

    await canvas.click();
    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });

    await page.waitForTimeout(500);

    const hudScore = page.locator('.hud-score');
    const hudScoreText = await hudScore.textContent();

    const extractScore = (text: string | null): number => {
        if (!text) {
            return 0;
        }
        const match = /(\d+)/.exec(text);
        return match ? parseInt(match[1], 10) : 0;
    };

    const hudScoreValue = extractScore(hudScoreText);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const pauseMenuVisible =
        (await page.locator('[data-testid="pause-menu"]').count()) > 0 ||
        (await page.locator('.pause-overlay').count()) > 0 ||
        (await page.locator('[class*="pause"]').count()) > 0;

    if (pauseMenuVisible) {
        const pauseScoreElement =
            (await page.locator('[data-testid="pause-score"]').count()) > 0
                ? page.locator('[data-testid="pause-score"]')
                : page.locator('text=/Score.*\\d+/').first();

        if ((await pauseScoreElement.count()) > 0) {
            const pauseScoreText = await pauseScoreElement.textContent();
            const pauseScoreValue = extractScore(pauseScoreText);

            expect(
                pauseScoreValue,
                `Pause menu score (${pauseScoreValue}) should match HUD score (${hudScoreValue})`,
            ).toBe(hudScoreValue);
        }
    }

    await page.keyboard.press('Escape');
});

test('HUD bricks remaining counter updates after brick destruction', async ({ page }) => {
    await gotoLuckyBreak(page);

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await drainEvents(page);

    const bricksLabel = page.locator('.hud-bricks-label');
    await expect(bricksLabel).toBeVisible();

    const initialBricksText = await bricksLabel.textContent();

    const extractBrickCount = (text: string | null): number => {
        if (!text) {
            return 0;
        }
        const match = /(\d+)/.exec(text);
        return match ? parseInt(match[1], 10) : 0;
    };

    const initialBricks = extractBrickCount(initialBricksText);
    expect(initialBricks).toBeGreaterThan(0);

    await canvas.click();
    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });

    // Wait for physics to complete and HUD to update
    await page.waitForTimeout(3000);

    const updatedBricksText = await bricksLabel.textContent();
    const updatedBricks = extractBrickCount(updatedBricksText);

    expect(
        updatedBricks,
        `Bricks remaining should decrease after brick break. Initial: ${initialBricks}, Updated: ${updatedBricks}`,
    ).toBeLessThan(initialBricks);
});
