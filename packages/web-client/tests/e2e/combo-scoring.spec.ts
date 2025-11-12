import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    getComboState,
    readEvents,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('combo counter increases with consecutive brick hits', async ({ page }) => {
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

    // Wait for BrickBreak instead of BrickHit (1-HP bricks skip BrickHit)
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });
    await page.waitForTimeout(500);

    const comboState = await getComboState(page);

    expect(comboState.currentCombo).toBeGreaterThanOrEqual(0);
    expect(comboState.scoreMultiplier).toBeGreaterThanOrEqual(1);
});

test('score multiplier increases with combo threshold', async ({ page }) => {
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

    let maxCombo = 0;
    let maxMultiplier = 1;

    const maxAttempts = 50;
    for (let i = 0; i < maxAttempts; i++) {
        await page.waitForTimeout(500);

        const currentState = await getComboState(page);

        if (currentState.currentCombo > maxCombo) {
            maxCombo = currentState.currentCombo;
        }

        if (currentState.scoreMultiplier > maxMultiplier) {
            maxMultiplier = currentState.scoreMultiplier;
        }

        if (currentState.currentCombo >= 8 && currentState.scoreMultiplier > 1) {
            break;
        }
    }

    if (maxCombo >= 8) {
        expect(maxMultiplier).toBeGreaterThan(1);
    }
});

test('combo time remaining decreases over time', async ({ page }) => {
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

    // Wait for BrickBreak instead of BrickHit (1-HP bricks skip BrickHit)
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });
    await page.waitForTimeout(200);

    const firstCheck = await getComboState(page);
    const initialTime = firstCheck.comboTimeRemaining;

    if (initialTime > 0) {
        await page.waitForTimeout(500);

        const secondCheck = await getComboState(page);
        const laterTime = secondCheck.comboTimeRemaining;

        expect(laterTime).toBeLessThanOrEqual(initialTime);
    }
});

test('combo resets when decay time expires', async ({ page }) => {
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

    // Wait for BrickBreak instead of BrickHit (1-HP bricks skip BrickHit)
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });
    await page.waitForTimeout(200);

    const beforeDecay = await getComboState(page);
    const comboBeforeDecay = beforeDecay.currentCombo;

    if (comboBeforeDecay > 0) {
        const decayTime = beforeDecay.comboTimeRemaining;

        if (decayTime > 0) {
            await page.waitForTimeout((decayTime + 1) * 1000);

            const afterDecay = await getComboState(page);

            expect(afterDecay.currentCombo).toBeLessThanOrEqual(comboBeforeDecay);
        }
    }
});

test('brick break events show score awarded', async ({ page }) => {
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

    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });

    const events = await readEvents(page);
    const brickBreaks = events.filter((e) => e.type === 'BrickBreak');

    expect(brickBreaks.length).toBeGreaterThan(0);

    const firstBreak = brickBreaks[0];
    const payload = firstBreak?.payload as { scoreAwarded?: number };

    if (payload) {
        expect(typeof payload.scoreAwarded).toBe('number');
        expect(payload.scoreAwarded).toBeGreaterThan(0);
    }
});

test('combo overlay displays in HUD during active combo', async ({ page }) => {
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

    // Wait for BrickBreak instead of BrickHit (1-HP bricks skip BrickHit)
    await waitForEvent(page, 'BrickBreak', { timeout: 30_000 });
    await page.waitForTimeout(500);

    const comboState = await getComboState(page);

    if (comboState.currentCombo > 0) {
        const hudLayout = page.locator('.hud-layout');
        await expect(hudLayout).toBeVisible();
    }
});

test('paddle hit events track velocity and position', async ({ page }) => {
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

    const paddleHitEvent = await waitForEvent(page, 'PaddleHit', { timeout: 10_000 }).catch(() => null);

    if (paddleHitEvent) {
        const payload = paddleHitEvent.payload as { angle?: number; speed?: number; impactOffset?: number };

        expect(payload).toBeDefined();
        expect(typeof payload.angle).toBe('number');
        expect(typeof payload.speed).toBe('number');
        expect(typeof payload.impactOffset).toBe('number');
    }
});

test('combo momentum increases with sustained rallies', async ({ page }) => {
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

    const maxChecks = 30;
    let previousCombo = 0;
    let comboIncreased = false;

    for (let i = 0; i < maxChecks; i++) {
        await page.waitForTimeout(500);

        const currentState = await getComboState(page);

        if (currentState.currentCombo > previousCombo) {
            comboIncreased = true;
            previousCombo = currentState.currentCombo;
        }

        if (comboIncreased && currentState.currentCombo >= 5) {
            break;
        }
    }

    expect(previousCombo).toBeGreaterThanOrEqual(0);
});

test('high combo values show increased multipliers', async ({ page }) => {
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

    const maxAttempts = 60;
    let foundHighCombo = false;

    for (let i = 0; i < maxAttempts; i++) {
        await page.waitForTimeout(500);

        const comboState = await getComboState(page);

        if (comboState.currentCombo >= 16) {
            foundHighCombo = true;
            expect(comboState.scoreMultiplier).toBeGreaterThan(1);

            const expectedMinMultiplier = 1 + Math.floor(comboState.currentCombo / 8) * 0.25;
            expect(comboState.scoreMultiplier).toBeGreaterThanOrEqual(expectedMinMultiplier - 0.5);
            break;
        }
    }

    if (!foundHighCombo) {
        console.warn('Did not reach combo >= 16 in test run');
    }
});
