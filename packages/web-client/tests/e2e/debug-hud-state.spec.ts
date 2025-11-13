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

test.skip('Debug: Check HUD state updates after brick break', async ({ page }) => {
    // Capture console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

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

    // Check Zustand store state before launch
    const storeBefore = await page.evaluate(() => {
        // @ts-expect-error - accessing E2E hooks
        const hooks = window.__LB_E2E_HOOKS__;
        if (hooks && typeof hooks.getHudState === 'function') {
            return hooks.getHudState();
        }
        return 'no store found';
    });
    console.log('Store state before launch:', JSON.stringify(storeBefore, null, 2));

    await canvas.click();
    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');

    console.log('Ball launched, waiting for BrickBreak...');
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });
    console.log('BrickBreak event received!');

    // Wait a bit for state updates
    await page.waitForTimeout(2000);

    // Check Zustand store state after brick break
    const storeAfter = await page.evaluate(() => {
        // @ts-expect-error - accessing E2E hooks
        const hooks = window.__LB_E2E_HOOKS__;
        if (hooks && typeof hooks.getHudState === 'function') {
            return hooks.getHudState();
        }
        return 'no store found';
    });
    console.log('Store state after brick break:', JSON.stringify(storeAfter, null, 2));

    // Dump all console logs
    console.log('\n=== Browser Console Logs ===');
    consoleLogs.forEach((log) => console.log(log));
    console.log('=== End Console Logs ===\n');

    // Check DOM
    const hudScoreText = await page.locator('.hud-score').textContent();
    console.log('HUD score DOM text:', hudScoreText);

    // Fail the test so we can see the output
    expect(false, 'Stopping test to see debug output').toBe(true);
});
