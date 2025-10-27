import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    installEventHarness,
    isSceneTransitionEvent,
    readEvents,
    startGameplay,
    waitForSceneTransition,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('loads the main menu and transitions into gameplay', async ({ page }) => {
    await gotoLuckyBreak(page);

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await canvas.click();

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    const sceneEvents = await readEvents(page);
    const sceneNames = sceneEvents
        .filter(isSceneTransitionEvent)
        .map(({ payload }) => {
            const scene = typeof payload?.scene === 'string' ? payload.scene : '';
            const action = typeof payload?.action === 'string' ? payload.action : '';
            return `${scene}:${action}`;
        });

    expect(sceneNames).toContain('main-menu:enter');
    expect(sceneNames).toContain('gameplay:enter');
});
