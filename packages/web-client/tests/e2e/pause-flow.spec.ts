import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    pauseGameplay,
    quitToMenu,
    resumeGameplay,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    e2eTimeouts,
    getPhysicsState,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('player can pause, resume, and quit to the main menu', async ({ page }) => {
    test.slow();

    await gotoLuckyBreak(page);

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

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

    // Verify pause state using harness - DOM overlay has known visibility issues in e2e
    const pauseState = await page.evaluate(() => {
        const hooks = (window as unknown as { __LB_E2E_HOOKS__?: Record<string, unknown> }).__LB_E2E_HOOKS__;
        return (hooks?.getPauseState as (() => { visible: boolean; suspended: boolean; snapshot: unknown }) | undefined)?.();
    });
    expect(pauseState).toBeDefined();
    expect(pauseState?.visible).toBe(true);
    expect(pauseState?.suspended).toBe(false);
    expect(pauseState?.snapshot).not.toBeNull();

    const stageBlocked = await page.evaluate(() =>
        document.getElementById('stage-wrap')?.classList.contains('ui-stage-blocked') ?? false,
    );
    expect(stageBlocked).toBe(true);

    // Verify physics is paused
    const physicsState = await getPhysicsState(page);
    expect(physicsState.isPaused).toBe(true);

    await drainEvents(page);
    const pauseExitPromise = waitForSceneTransition(page, 'pause', 'exit', { includeExisting: false });
    const resumePromise = waitForSceneTransition(page, 'gameplay', 'resume', { includeExisting: false });
    await resumeGameplay(page);
    await Promise.all([pauseExitPromise, resumePromise]);

    // Verify game is no longer paused
    const resumedState = await getPhysicsState(page);
    expect(resumedState.isPaused).toBe(false);

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
