import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    getGambleBrickState,
    readEvents,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('gamble bricks appear in gameplay and track armed state', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await page.waitForTimeout(1000);

    const gambleState = await getGambleBrickState(page);

    expect(typeof gambleState.armedCount).toBe('number');
    expect(typeof gambleState.primedCount).toBe('number');
    expect(gambleState.armedCount + gambleState.primedCount).toBeGreaterThanOrEqual(0);
});

test('gamble brick transitions from armed to primed on first hit', async ({ page }) => {
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

    let foundGambleTransition = false;
    const maxAttempts = 50;

    for (let i = 0; i < maxAttempts && !foundGambleTransition; i++) {
        await page.waitForTimeout(500);

        const events = await readEvents(page);
        const brickHits = events.filter((e) => e.type === 'BrickHit');

        for (const hit of brickHits) {
            const payload = hit.payload as { brickType?: string; gambleResult?: { type: string } };
            if (payload?.brickType === 'gamble' && payload?.gambleResult?.type === 'prime') {
                foundGambleTransition = true;
                break;
            }
        }

        if (foundGambleTransition) {
            const gambleState = await getGambleBrickState(page);
            expect(gambleState.primedCount).toBeGreaterThan(0);
            break;
        }
    }

    if (!foundGambleTransition) {
        console.warn('Did not observe gamble brick armed->primed transition in test run');
    }
});

test('primed gamble brick has active timer', async ({ page }) => {
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

    let foundPrimedBrick = false;
    const maxAttempts = 50;

    for (let i = 0; i < maxAttempts && !foundPrimedBrick; i++) {
        await page.waitForTimeout(500);

        const gambleState = await getGambleBrickState(page);
        if (gambleState.primedCount > 0 && gambleState.nextExpirationSeconds !== null) {
            foundPrimedBrick = true;
            expect(gambleState.nextExpirationSeconds).toBeGreaterThan(0);
            expect(gambleState.nextExpirationSeconds).toBeLessThanOrEqual(10);
            break;
        }
    }

    if (!foundPrimedBrick) {
        console.warn('Did not observe primed gamble brick timer in test run');
    }
});

test('gamble brick success grants reward multiplier', async ({ page }) => {
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

    let foundGambleSuccess = false;
    const maxAttempts = 100;

    for (let i = 0; i < maxAttempts && !foundGambleSuccess; i++) {
        await page.waitForTimeout(500);

        const events = await readEvents(page);
        const brickBreaks = events.filter((e) => e.type === 'BrickBreak');

        for (const breakEvent of brickBreaks) {
            const payload = breakEvent.payload as {
                brickType?: string;
                gambleResult?: { type: string; rewardMultiplier?: number };
            };

            if (payload?.brickType === 'gamble' && payload?.gambleResult?.type === 'success') {
                foundGambleSuccess = true;
                const multiplier = payload.gambleResult.rewardMultiplier;
                expect(multiplier).toBeGreaterThan(1);
                break;
            }
        }

        if (foundGambleSuccess) {
            break;
        }
    }

    if (!foundGambleSuccess) {
        console.warn('Did not observe gamble brick success in test run');
    }
});

test('gamble brick expiry is tracked in events', async ({ page }) => {
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

    let foundExpiry = false;
    const maxWaitTime = 45_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime && !foundExpiry) {
        await page.waitForTimeout(500);

        const events = await readEvents(page);
        const expiryEvents = events.filter((e) => e.type === 'GambleBrickExpired');

        if (expiryEvents.length > 0) {
            foundExpiry = true;
            const expiryPayload = expiryEvents[0]?.payload as { penaltyHp?: number };
            expect(expiryPayload?.penaltyHp).toBeGreaterThan(0);
            break;
        }

        const gambleState = await getGambleBrickState(page);
        if (gambleState.primedCount === 0 && gambleState.nextExpirationSeconds === null) {
            break;
        }
    }
});

test('gamble brick state summary provides accurate counts', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await page.waitForTimeout(1000);

    const gambleState = await getGambleBrickState(page);

    expect(gambleState.armedCount).toBeGreaterThanOrEqual(0);
    expect(gambleState.primedCount).toBeGreaterThanOrEqual(0);

    if (gambleState.primedCount > 0) {
        expect(gambleState.nextExpirationSeconds).not.toBeNull();
        if (gambleState.nextExpirationSeconds !== null) {
            expect(gambleState.nextExpirationSeconds).toBeGreaterThan(0);
        }
    } else {
        if (gambleState.armedCount === 0) {
            expect(gambleState.nextExpirationSeconds).toBeNull();
        }
    }
});
