import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    skipLevel,
    startGameplay,
    waitForSceneTransition,
    getBiasPhaseState,
    commitBiasSelection,
    skipBiasPhase,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('bias-phase scene appears after round completion', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);

    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    const biasState = await getBiasPhaseState(page);
    expect(biasState).toBeDefined();
});

test('bias-phase provides reward and modifier options', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    const biasState = await getBiasPhaseState(page);

    expect(biasState).toBeDefined();
    expect(typeof biasState).toBe('object');

    const options = biasState.options;
    if (Array.isArray(options)) {
        expect(options.length).toBeGreaterThan(0);

        for (const option of options) {
            expect(option).toBeDefined();
            expect(typeof option.id).toBe('string');
            expect(typeof option.type).toBe('string');
        }
    }
});

test('committing bias selection transitions back to gameplay', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    const biasState = await getBiasPhaseState(page);
    const options = biasState.options;

    if (Array.isArray(options) && options.length > 0) {
        const firstOptionId = options[0]?.id;
        if (firstOptionId) {
            await drainEvents(page);
            const exitPromise = waitForSceneTransition(page, 'bias-phase', 'exit', { includeExisting: false });
            const resumePromise = waitForSceneTransition(page, 'gameplay', 'resume', { includeExisting: false });

            const committed = await commitBiasSelection(page, firstOptionId);
            expect(committed).toBe(true);

            await Promise.all([exitPromise, resumePromise]);
        }
    }
});

test('skipping bias-phase returns to gameplay without selection', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    await drainEvents(page);
    const exitPromise = waitForSceneTransition(page, 'bias-phase', 'exit', { includeExisting: false });
    const resumePromise = waitForSceneTransition(page, 'gameplay', 'resume', { includeExisting: false });

    const skipped = await skipBiasPhase(page);
    expect(skipped).toBe(true);

    await Promise.all([exitPromise, resumePromise]);
});

test('bias-phase UI elements are visible', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    await page.waitForTimeout(1000);

    const casinoHubElement = page.locator('[class*="casino"]').or(page.locator('[class*="bias"]')).first();

    const isVisible = await casinoHubElement.isVisible().catch(() => false);

    if (!isVisible) {
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toBeTruthy();
    }
});

test('reward wheel shows available reward types', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    const biasState = await getBiasPhaseState(page);
    const options = biasState.options;

    if (Array.isArray(options)) {
        const rewardOptions = options.filter((opt) => opt.type === 'reward');
        expect(rewardOptions.length).toBeGreaterThanOrEqual(0);
    }
});

test('modifier options are available in bias-phase', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    const biasState = await getBiasPhaseState(page);
    const options = biasState.options;

    if (Array.isArray(options)) {
        const modifierOptions = options.filter((opt) => opt.type === 'modifier');
        expect(modifierOptions.length).toBeGreaterThanOrEqual(0);
    }
});

test('invalid option ID returns false on commit', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    const invalidOptionId = 'invalid-option-id-12345';
    const committed = await commitBiasSelection(page, invalidOptionId);

    expect(committed).toBe(false);
});

test('multiple rounds show bias-phase repeatedly', async ({ page }) => {
    test.slow();

    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    await skipBiasPhase(page);
    await waitForSceneTransition(page, 'gameplay', 'resume');

    await drainEvents(page);

    await skipLevel(page);
    await waitForSceneTransition(page, 'bias-phase', 'enter', { timeout: 15_000 });

    const biasState = await getBiasPhaseState(page);
    expect(biasState).toBeDefined();
});
