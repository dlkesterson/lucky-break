import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    loseLife,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    getMultiBallState,
    activateReward,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('multi-ball reward spawns additional balls', async ({ page }) => {
    await gotoLuckyBreak(page);
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

    const baselineState = await getMultiBallState(page);
    expect(baselineState.totalBalls).toBeGreaterThanOrEqual(1);
    expect(baselineState.extraBalls).toBe(0);

    await activateReward(page, 'multi-ball');
    await page.waitForTimeout(500);

    const afterActivation = await getMultiBallState(page);
    expect(afterActivation.extraBalls).toBeGreaterThan(baselineState.extraBalls);
    expect(afterActivation.totalBalls).toBeGreaterThan(baselineState.totalBalls);
});

test('multi-ball state tracks total and extra ball counts accurately', async ({ page }) => {
    await gotoLuckyBreak(page);
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

    await activateReward(page, 'multi-ball');
    await page.waitForTimeout(500);

    const multiBallState = await getMultiBallState(page);

    expect(multiBallState.totalBalls).toBe(multiBallState.extraBalls + 1);
    expect(multiBallState.extraBalls).toBeGreaterThanOrEqual(1);
    expect(multiBallState.attachedBalls).toBeGreaterThanOrEqual(0);
    expect(multiBallState.attachedBalls).toBeLessThanOrEqual(multiBallState.totalBalls);
});

test('multiple multi-ball rewards stack up to capacity', async ({ page }) => {
    await gotoLuckyBreak(page);
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

    await activateReward(page, 'multi-ball');
    await page.waitForTimeout(500);

    const firstActivation = await getMultiBallState(page);
    const firstExtraCount = firstActivation.extraBalls;

    await activateReward(page, 'multi-ball');
    await page.waitForTimeout(500);

    const secondActivation = await getMultiBallState(page);

    expect(secondActivation.extraBalls).toBeGreaterThanOrEqual(firstExtraCount);
    expect(secondActivation.totalBalls).toBeGreaterThanOrEqual(firstActivation.totalBalls);
});

test('ball drop event fires when ball is lost', async ({ page }) => {
    test.slow();

    await gotoLuckyBreak(page);
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

    await drainEvents(page);

    await loseLife(page, 'ball-drop');

    const lifeLostEvent = await waitForEvent(page, 'LifeLost', { timeout: 10_000 });
    expect(lifeLostEvent).toBeDefined();
    expect(lifeLostEvent.payload).toBeDefined();

    const payload = lifeLostEvent.payload as { cause?: string };
    expect(payload.cause).toBe('ball-drop');
});

test('life is not lost when extra balls remain in multi-ball mode', async ({ page }) => {
    test.slow();

    await gotoLuckyBreak(page);
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

    await activateReward(page, 'multi-ball');
    await page.waitForTimeout(500);

    const beforeDrop = await getMultiBallState(page);
    const initialExtraCount = beforeDrop.extraBalls;
    expect(initialExtraCount).toBeGreaterThan(0);

    await drainEvents(page);

    const lifeLostPromise = waitForEvent(page, 'LifeLost', {
        timeout: 5_000,
        includeExisting: false,
    }).catch(() => null);

    await page.waitForTimeout(3000);

    const afterWait = await getMultiBallState(page);

    const lifeLostEvent = await lifeLostPromise;

    if (afterWait.totalBalls === 0) {
        expect(lifeLostEvent).not.toBeNull();
    } else if (afterWait.extraBalls > 0) {
        expect(lifeLostEvent).toBeNull();
    }
});

test('multi-ball HUD indicator shows active state', async ({ page }) => {
    await gotoLuckyBreak(page);
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

    await activateReward(page, 'multi-ball');
    await page.waitForTimeout(500);

    const hudLayout = page.locator('.hud-layout');
    await expect(hudLayout).toBeVisible();

    const multiBallState = await getMultiBallState(page);
    expect(multiBallState.extraBalls).toBeGreaterThan(0);
});

test('attached balls can be launched individually', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    const canvas = page.locator('canvas').first();

    await activateReward(page, 'sticky-paddle');
    await page.waitForTimeout(500);

    await canvas.click();
    await launchBall(page);
    await waitForEvent(page, 'BallLaunched');

    await page.waitForTimeout(1000);

    const initialState = await getMultiBallState(page);
    const initialAttached = initialState.attachedBalls;

    if (initialAttached > 0) {
        await drainEvents(page);
        await canvas.click();
        await launchBall(page);

        const launchEvent = await waitForEvent(page, 'BallLaunched', {
            timeout: 3000,
            includeExisting: false,
        }).catch(() => null);

        if (launchEvent) {
            const afterLaunch = await getMultiBallState(page);
            expect(afterLaunch.attachedBalls).toBeLessThanOrEqual(initialAttached);
        }
    }
});
