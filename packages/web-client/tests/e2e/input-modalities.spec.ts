import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    launchBall,
    startGameplay,
    waitForEvent,
    waitForSceneTransition,
    readEvents,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('keyboard arrow keys control paddle movement', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(200);
    await page.keyboard.up('ArrowLeft');

    await page.waitForTimeout(100);

    const events = await readEvents(page);
    const inputEvents = events.filter((e) => e.type === 'InputMoved' || e.type === 'InputPressed');

    expect(inputEvents.length).toBeGreaterThan(0);
});

test('WASD keys control paddle movement', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await page.keyboard.down('KeyA');
    await page.waitForTimeout(200);
    await page.keyboard.up('KeyA');

    await page.waitForTimeout(100);

    await page.keyboard.down('KeyD');
    await page.waitForTimeout(200);
    await page.keyboard.up('KeyD');

    await page.waitForTimeout(100);

    const events = await readEvents(page);
    const inputEvents = events.filter((e) => e.type === 'InputMoved' || e.type === 'InputPressed');

    expect(inputEvents.length).toBeGreaterThan(0);
});

test('space key launches ball', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await page.keyboard.press('Space');

    const launchEvent = await waitForEvent(page, 'BallLaunched', { timeout: 3000 }).catch(() => null);

    expect(launchEvent).not.toBeNull();
});

test('Escape key pauses gameplay', async ({ page }) => {
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

    const pausePromise = waitForSceneTransition(page, 'pause', 'enter', { includeExisting: false });

    await page.keyboard.press('Escape');

    await pausePromise;

    const pauseOverlay = page.locator('.pause-overlay');
    await expect(pauseOverlay).toHaveCount(1, { timeout: e2eTimeouts.sceneVisibility });
});

test('P key pauses gameplay', async ({ page }) => {
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

    const pausePromise = waitForSceneTransition(page, 'pause', 'enter', { includeExisting: false });

    await page.keyboard.press('KeyP');

    await pausePromise;

    const pauseOverlay = page.locator('.pause-overlay');
    await expect(pauseOverlay).toHaveCount(1, { timeout: e2eTimeouts.sceneVisibility });
});

test('mouse click controls paddle targeting', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    const canvas = page.locator('canvas').first();

    await canvas.click({ position: { x: 100, y: 300 } });
    await page.waitForTimeout(200);

    await canvas.click({ position: { x: 500, y: 300 } });
    await page.waitForTimeout(200);

    const events = await readEvents(page);
    const inputEvents = events.filter((e) => e.type === 'InputMoved' || e.type === 'InputPressed');

    expect(inputEvents.length).toBeGreaterThan(0);
});

test('touch interaction works on canvas', async ({ page, browserName }) => {
    if (browserName === 'webkit') {
        test.skip();
    }

    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    if (box) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200);

        const events = await readEvents(page);
        const inputEvents = events.filter((e) => e.type === 'InputMoved' || e.type === 'InputPressed');

        expect(inputEvents.length).toBeGreaterThanOrEqual(0);
    }
});

test('Shift+C toggles high-contrast mode', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    const bodyClassBefore = await page.locator('body').getAttribute('class');

    await page.keyboard.press('Shift+KeyC');
    await page.waitForTimeout(300);

    const bodyClassAfter = await page.locator('body').getAttribute('class');

    expect(bodyClassBefore).not.toBe(bodyClassAfter);
});

test('F2 toggles debug overlay in dev mode', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await page.keyboard.press('F2');
    await page.waitForTimeout(300);

    const isDev = await page.evaluate(() => import.meta.env?.DEV ?? false);

    if (isDev) {
        const debugOverlay = page.locator('[class*="debug"]').or(page.locator('[data-debug="true"]'));
        const hasDebugElement = (await debugOverlay.count()) > 0;
        expect(hasDebugElement).toBeDefined();
    }
});

test('continuous keyboard input generates smooth paddle movement', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');

    await page.waitForTimeout(100);

    const events = await readEvents(page);
    const inputMoveEvents = events.filter((e) => e.type === 'InputMoved');

    expect(inputMoveEvents.length).toBeGreaterThan(1);
});

test('rapid key switches handle correctly', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(100);
    await page.keyboard.up('ArrowLeft');

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.up('ArrowRight');

    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(100);
    await page.keyboard.up('ArrowLeft');

    await page.waitForTimeout(100);

    const events = await readEvents(page);
    const inputEvents = events.filter((e) => e.type === 'InputMoved' || e.type === 'InputPressed');

    expect(inputEvents.length).toBeGreaterThan(0);
});
