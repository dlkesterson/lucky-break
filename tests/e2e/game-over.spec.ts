import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    drainLives,
    installEventHarness,
    isSceneTransitionEvent,
    getRuntimeState,
    quitToMenu,
    startGameplay,
    waitForSceneTransition,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('draining lives transitions to game over and returns to menu', async ({ page }) => {
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
    await drainLives(page);
    await expect.poll(async () => (await getRuntimeState(page)).currentScene, {
        message: 'expected runtime to transition to game-over scene',
        timeout: 30_000,
    }).toBe('game-over');

    const events = await drainEvents(page);
    const lifeLostEvents = events.filter((event) => event?.type === 'LifeLost');
    expect(lifeLostEvents.length).toBeGreaterThanOrEqual(3);
    const sawGameOverEnter = events.some(
        (event) => isSceneTransitionEvent(event) && event.payload.scene === 'game-over' && event.payload.action === 'enter',
    );
    expect(sawGameOverEnter).toBe(true);

    await drainEvents(page);
    await quitToMenu(page);
    await expect.poll(async () => (await getRuntimeState(page)).currentScene, {
        message: 'expected runtime to return to main-menu scene',
        timeout: 30_000,
    }).toBe('main-menu');

    const postQuitEvents = await drainEvents(page);
    const sawGameOverExit = postQuitEvents.some(
        (event) => isSceneTransitionEvent(event) && event.payload.scene === 'game-over' && event.payload.action === 'exit',
    );
    const sawMainMenuEnter = postQuitEvents.some(
        (event) => isSceneTransitionEvent(event) && event.payload.scene === 'main-menu' && event.payload.action === 'enter',
    );
    expect(sawGameOverExit).toBe(true);
    expect(sawMainMenuEnter).toBe(true);
});
