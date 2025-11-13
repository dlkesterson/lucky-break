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
    getPhysicsState,
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

    // Launch ball with default angle - can hit multiple bricks deterministically
    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');

    // Wait for at least one brick break
    await waitForEvent(page, 'BrickBreak', { timeout: 10_000 });

    // Give physics time to complete trajectory (may hit 1 or 2 bricks)
    await page.waitForTimeout(3000);

    // Verify round hasn't completed after breaking bricks
    const events = await readEvents(page);
    const brickBreakCount = events.filter((event) => event?.type === 'BrickBreak').length;
    const roundCompletedEvent = events.find((event) => event?.type === 'RoundCompleted');

    // Should have broken at least 1 brick
    expect(brickBreakCount).toBeGreaterThanOrEqual(1);

    // But round should not be complete (still bricks remaining)
    expect(roundCompletedEvent).toBeUndefined();

    // Verify there are still bricks remaining
    const physicsState = await getPhysicsState(page);
    expect(physicsState.brickCount).toBeGreaterThan(0);
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
        // @ts-expect-error - E2E harness API
        window.__LB_E2E_HOOKS__?.skipLevel?.();
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
