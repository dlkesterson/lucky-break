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
    getBrickPositions,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('round stays active after the first brick break', async ({ page }) => {
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

    const canvasSize = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);

    await canvas.click();
    await launchBall(page);

    await waitForEvent(page, 'BallLaunched');

    // Add diagnostic logging for physics state and brick positions
    const initialPhysics = await getPhysicsState(page);
    const brickPositions = await getBrickPositions(page);
    console.log('Initial physics after launch:', initialPhysics);
    console.log('Brick positions (first 5):', brickPositions.slice(0, 5));
    console.log(`Total bricks: ${brickPositions.length}`);

    // Wait a short time for ball to start moving
    await page.waitForTimeout(500);
    const physicsAfter500ms = await getPhysicsState(page);
    console.log('Physics after 500ms:', physicsAfter500ms);

    // Check what events we have so far
    const eventsSoFar = await readEvents(page);
    console.log(`Events captured so far: ${eventsSoFar.length}`);
    console.log('Event types:', eventsSoFar.map(e => e?.type).join(', '));

    // For single-HP bricks, we get BrickBreak directly without BrickHit
    // So just verify we have at least one BrickBreak event
    const brickBreakEvents = eventsSoFar.filter(e => e?.type === 'BrickBreak');
    expect(brickBreakEvents.length).toBeGreaterThan(0);

    // Wait a bit longer for more events
    await page.waitForTimeout(1000);

    const events = await readEvents(page);
    const firstBrickBreakIndex = events.findIndex((event) => event?.type === 'BrickBreak');
    const roundCompleteIndex = events.findIndex((event) => event?.type === 'RoundCompleted');
    const totalBrickBreaks = events.filter((event) => event?.type === 'BrickBreak').length;

    expect(firstBrickBreakIndex).toBeGreaterThanOrEqual(0);
    expect(totalBrickBreaks).toBeGreaterThan(0);
    expect(roundCompleteIndex).toBe(-1);
});
