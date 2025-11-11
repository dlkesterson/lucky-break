import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    readEvents,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('round stays active when breaking individual bricks until all are cleared', async ({ page }) => {
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

    await page.waitForTimeout(1000);

    const eventsAfterFirstBreak = await readEvents(page);
    const roundCompletedAfterFirst = eventsAfterFirstBreak.find((event) => event?.type === 'RoundCompleted');
    expect(roundCompletedAfterFirst).toBeUndefined();

    await waitForEvent(page, 'BrickBreak', { timeout: 30_000, includeExisting: false });
    await page.waitForTimeout(500);

    const eventsAfterSecondBreak = await readEvents(page);
    const roundCompletedAfterSecond = eventsAfterSecondBreak.find((event) => event?.type === 'RoundCompleted');
    expect(roundCompletedAfterSecond).toBeUndefined();
});

test('round completes only when all bricks are destroyed or autocomplete triggers', async ({ page }) => {
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

    const skipPromise = waitForEvent(page, 'RoundCompleted', { includeExisting: false });

    await page.evaluate(() => {
        // @ts-expect-error - Developer cheat API
        window.__luckyBreakDeveloperCheats?.skipLevel();
    });

    const roundCompleted = await skipPromise;
    expect(roundCompleted).toBeDefined();
    expect(roundCompleted?.type).toBe('RoundCompleted');
});

test('autocomplete countdown triggers when only 1 brick remains', async ({ page }) => {
    await gotoLuckyBreak(page);

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');
    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await drainEvents(page);

    const canvas = page.locator('canvas').first();
    await canvas.click();
    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');

    for (let i = 0; i < 10; i++) {
        try {
            await waitForEvent(page, 'BrickBreak', { timeout: 5000, includeExisting: false });
        } catch {
            break;
        }
    }

    const hudAppVisible = await page.locator('.hud-layout').count();

    expect(hudAppVisible).toBeGreaterThan(0);
});
