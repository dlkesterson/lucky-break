import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    getReplaySnapshot,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('replay buffer records session seed and events', async ({ page }) => {
    await gotoLuckyBreak(page, 42);
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

    await page.waitForTimeout(2000);

    const replay = await getReplaySnapshot(page);

    expect(replay).toBeDefined();
    expect(replay.seed).toBe(42);
    expect(replay.events).toBeDefined();
    expect(Array.isArray(replay.events)).toBe(true);
    expect(replay.events.length).toBeGreaterThan(0);
});

test('same seed produces identical initial brick layouts', async ({ page }) => {
    const seed = 1337;

    await gotoLuckyBreak(page, seed);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await page.waitForTimeout(1000);

    const firstRunBricks = await page.evaluate(() => {
        const hooks = (window as unknown as { __LB_E2E_HOOKS__?: Record<string, unknown> }).__LB_E2E_HOOKS__;
        const getBricks = hooks?.getBrickPositions as (() => { x: number; y: number }[]) | undefined;
        return getBricks ? getBricks() : [];
    });

    await page.reload();

    await gotoLuckyBreak(page, seed);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await page.waitForTimeout(1000);

    const secondRunBricks = await page.evaluate(() => {
        const hooks = (window as unknown as { __LB_E2E_HOOKS__?: Record<string, unknown> }).__LB_E2E_HOOKS__;
        const getBricks = hooks?.getBrickPositions as (() => { x: number; y: number }[]) | undefined;
        return getBricks ? getBricks() : [];
    });

    expect(firstRunBricks.length).toBe(secondRunBricks.length);
    expect(firstRunBricks.length).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(firstRunBricks.length, secondRunBricks.length); i++) {
        const first = firstRunBricks[i];
        const second = secondRunBricks[i];
        if (first && second) {
            expect(first.x).toBeCloseTo(second.x, 2);
            expect(first.y).toBeCloseTo(second.y, 2);
        }
    }
});

test('replay snapshot captures input events', async ({ page }) => {
    await gotoLuckyBreak(page, 999);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    const canvas = page.locator('canvas').first();

    await canvas.click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(500);

    await launchBall(page, { x: 0, y: -1 });
    await waitForEvent(page, 'BallLaunched');

    await page.waitForTimeout(1000);

    const replay = await getReplaySnapshot(page);

    expect(replay.events.length).toBeGreaterThan(0);

    const hasInputEvent = replay.events.some((event) => {
        const type = (event as { type?: string }).type;
        return type === 'InputMoved' || type === 'InputPressed' || type === 'BallLaunched';
    });

    expect(hasInputEvent).toBe(true);
});

test('replay includes timestamps for temporal ordering', async ({ page }) => {
    await gotoLuckyBreak(page, 2024);
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

    await page.waitForTimeout(2000);

    const replay = await getReplaySnapshot(page);

    expect(replay.events.length).toBeGreaterThan(0);

    let previousTimestamp = -1;
    let hasValidTimestamps = true;

    for (const event of replay.events) {
        const timestamp = (event as { timestamp?: number }).timestamp;
        if (typeof timestamp === 'number') {
            if (previousTimestamp > 0) {
                if (timestamp < previousTimestamp) {
                    hasValidTimestamps = false;
                    break;
                }
            }
            previousTimestamp = timestamp;
        }
    }

    expect(hasValidTimestamps).toBe(true);
});

test('URL seed parameter overrides random seed', async ({ page }) => {
    const urlSeed = 5555;

    await gotoLuckyBreak(page, urlSeed);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await page.waitForTimeout(500);

    const replay = await getReplaySnapshot(page);

    expect(replay.seed).toBe(urlSeed);
});

test('different seeds produce different layouts', async ({ page }) => {
    await gotoLuckyBreak(page, 100);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await page.waitForTimeout(1000);

    const firstSeedBricks = await page.evaluate(() => {
        const hooks = (window as unknown as { __LB_E2E_HOOKS__?: Record<string, unknown> }).__LB_E2E_HOOKS__;
        const getBricks = hooks?.getBrickPositions as (() => { x: number; y: number }[]) | undefined;
        return getBricks ? getBricks() : [];
    });

    await page.reload();

    await gotoLuckyBreak(page, 200);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await page.waitForTimeout(1000);

    const secondSeedBricks = await page.evaluate(() => {
        const hooks = (window as unknown as { __LB_E2E_HOOKS__?: Record<string, unknown> }).__LB_E2E_HOOKS__;
        const getBricks = hooks?.getBrickPositions as (() => { x: number; y: number }[]) | undefined;
        return getBricks ? getBricks() : [];
    });

    expect(firstSeedBricks.length).toBeGreaterThan(0);
    expect(secondSeedBricks.length).toBeGreaterThan(0);

    let foundDifference = false;
    const compareCount = Math.min(firstSeedBricks.length, secondSeedBricks.length, 5);

    for (let i = 0; i < compareCount; i++) {
        const first = firstSeedBricks[i];
        const second = secondSeedBricks[i];
        if (first && second) {
            const xDiff = Math.abs(first.x - second.x);
            const yDiff = Math.abs(first.y - second.y);
            if (xDiff > 1 || yDiff > 1) {
                foundDifference = true;
                break;
            }
        }
    }

    expect(foundDifference).toBe(true);
});

test('replay buffer persists across scene transitions', async ({ page }) => {
    await gotoLuckyBreak(page, 7777);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    const menuReplay = await getReplaySnapshot(page);
    expect(menuReplay.seed).toBe(7777);
    const initialEventCount = menuReplay.events.length;

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await page.waitForTimeout(500);

    const gameplayReplay = await getReplaySnapshot(page);
    expect(gameplayReplay.seed).toBe(7777);
    expect(gameplayReplay.events.length).toBeGreaterThanOrEqual(initialEventCount);
});
