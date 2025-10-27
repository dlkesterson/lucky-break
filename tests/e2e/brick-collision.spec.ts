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
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('round stays active after the first brick break', async ({ page }) => {
    await gotoLuckyBreak(page);

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await drainEvents(page);

    const canvasSize = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);

    await canvas.click();
    await launchBall(page);

    await waitForEvent(page, 'BallLaunched');
    await waitForEvent(page, 'BrickHit', { timeout: 30_000 });
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });

    await page.waitForTimeout(1000);

    const events = await readEvents(page);
    const firstBrickHitIndex = events.findIndex((event) => event?.type === 'BrickHit');
    const firstBrickBreakIndex = events.findIndex((event) => event?.type === 'BrickBreak');
    const roundCompleteIndex = events.findIndex((event) => event?.type === 'RoundCompleted');
    const totalBrickHits = events.filter((event) => event?.type === 'BrickHit').length;
    const totalBrickBreaks = events.filter((event) => event?.type === 'BrickBreak').length;

    expect(firstBrickHitIndex).toBeGreaterThanOrEqual(0);
    expect(totalBrickHits).toBeGreaterThan(0);
    expect(firstBrickBreakIndex).toBeGreaterThanOrEqual(0);
    expect(totalBrickBreaks).toBeGreaterThan(0);
    expect(roundCompleteIndex).toBe(-1);
});
