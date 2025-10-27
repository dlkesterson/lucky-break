import { expect, test } from '@playwright/test';
import {
    drainEvents,
    installEventHarness,
    launchBall,
    pauseGameplay,
    quitToMenu,
    resumeGameplay,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('player can pause, resume, and quit to the main menu', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await canvas.click();

    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');

    await drainEvents(page);
    let pauseEnterPromise = waitForSceneTransition(page, 'pause', 'enter', { includeExisting: false });
    let suspendPromise = waitForSceneTransition(page, 'gameplay', 'suspend', { includeExisting: false });
    await pauseGameplay(page);
    await Promise.all([pauseEnterPromise, suspendPromise]);

    await drainEvents(page);
    const pauseExitPromise = waitForSceneTransition(page, 'pause', 'exit', { includeExisting: false });
    const resumePromise = waitForSceneTransition(page, 'gameplay', 'resume', { includeExisting: false });
    await resumeGameplay(page);
    await Promise.all([pauseExitPromise, resumePromise]);

    await drainEvents(page);
    pauseEnterPromise = waitForSceneTransition(page, 'pause', 'enter', { includeExisting: false });
    suspendPromise = waitForSceneTransition(page, 'gameplay', 'suspend', { includeExisting: false });
    await pauseGameplay(page);
    await Promise.all([pauseEnterPromise, suspendPromise]);

    await drainEvents(page);
    const quitExitPromise = waitForSceneTransition(page, 'pause', 'exit', { includeExisting: false });
    const gameplayExitPromise = waitForSceneTransition(page, 'gameplay', 'exit', { includeExisting: false });
    const menuEnterPromise = waitForSceneTransition(page, 'main-menu', 'enter', { includeExisting: false });
    await quitToMenu(page);
    await Promise.all([quitExitPromise, gameplayExitPromise, menuEnterPromise]);
});
