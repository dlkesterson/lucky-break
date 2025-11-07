import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    readEvents,
    skipLevel,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('skipping a level shows the recap in casino hub and allows continuing', async ({ page }) => {
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

    const roundCompletedPromise = waitForEvent(page, 'RoundCompleted', { includeExisting: false });
    const biasPhaseEnterPromise = waitForSceneTransition(page, 'bias-phase', 'enter', {
        includeExisting: false,
    });

    await skipLevel(page);

    const roundCompleted = await roundCompletedPromise;
    await biasPhaseEnterPromise;

    const events = await readEvents(page);
    const suspendEvent = events.find(
        (event) =>
            event?.type === 'UiSceneTransition' &&
            (event as { payload?: { scene?: string; action?: string } }).payload?.scene === 'gameplay' &&
            (event as { payload?: { scene?: string; action?: string } }).payload?.action === 'suspend',
    );
    expect(suspendEvent).toBeDefined();

    expect(roundCompleted?.payload && typeof (roundCompleted.payload as { round?: number }).round === 'number').toBe(true);
    const scoreAwarded = (roundCompleted?.payload as { scoreAwarded?: number })?.scoreAwarded;
    expect(typeof scoreAwarded === 'number' && Number.isFinite(scoreAwarded)).toBe(true);

    // Verify level complete recap is displayed in casino hub
    const levelCompletePanel = page.getByText(/Level \d+ Complete!/i);
    await expect(levelCompletePanel).toBeVisible({ timeout: e2eTimeouts.sceneVisibility });

    await drainEvents(page);

    // Click the continue button in casino hub
    const continueButton = page.getByRole('button', { name: /Continue to Next Round/i });
    await continueButton.click();

    await Promise.all([
        waitForSceneTransition(page, 'bias-phase', 'exit'),
        waitForSceneTransition(page, 'gameplay', 'resume'),
    ]);
});
