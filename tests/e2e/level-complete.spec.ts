import { expect, test } from '@playwright/test';
import {
    drainEvents,
    installEventHarness,
    readEvents,
    skipLevel,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('skipping a level shows the recap and resumes gameplay', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await drainEvents(page);

    const roundCompletedPromise = waitForEvent(page, 'RoundCompleted', { includeExisting: false });
    const levelCompleteEnterPromise = waitForSceneTransition(page, 'level-complete', 'enter', {
        includeExisting: false,
    });

    await skipLevel(page);

    const roundCompleted = await roundCompletedPromise;
    await levelCompleteEnterPromise;

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

    await drainEvents(page);
    await canvas.click();
    await Promise.all([
        waitForSceneTransition(page, 'level-complete', 'exit'),
        waitForSceneTransition(page, 'gameplay', 'resume'),
    ]);
});
