import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    quickStartGameplay,
    waitForEvent,
    executeRLAction,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('HUD state updates after brick break (AI-assisted)', async ({ page }) => {
    // Capture console logs for debugging
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await quickStartGameplay(page, 1337);
    await drainEvents(page);

    // Check HUD state before any action
    const storeBefore = await page.evaluate(() => {
        const hooks = (window as { __LB_E2E_HOOKS__?: { getHudState?: () => unknown } }).__LB_E2E_HOOKS__;
        if (hooks && typeof hooks.getHudState === 'function') {
            return hooks.getHudState();
        }
        return null;
    });
    console.log('HUD state before launch:', JSON.stringify(storeBefore, null, 2));

    // Use AI-agent proven strategy: move paddle and launch at effective angle
    const canvas = page.locator('canvas').first();
    await canvas.click({ position: { x: 420, y: 650 } }); // Move paddle to effective position
    await page.waitForTimeout(100);

    // Launch ball (action 3 = LAUNCH)
    await executeRLAction(page, 3, 420);
    console.log('Ball launched with AI-assisted angle');

    await waitForEvent(page, 'BallLaunched');

    // Wait for brick break with extended timeout
    console.log('Waiting for BrickBreak event...');
    await waitForEvent(page, 'BrickBreak', { timeout: e2eTimeouts.event });
    console.log('BrickBreak event received!');

    // Wait for state updates to propagate through Zustand stores
    await page.waitForTimeout(1000);

    // Check HUD state after brick break
    const storeAfter = await page.evaluate(() => {
        const hooks = (window as { __LB_E2E_HOOKS__?: { getHudState?: () => unknown } }).__LB_E2E_HOOKS__;
        if (hooks && typeof hooks.getHudState === 'function') {
            return hooks.getHudState();
        }
        return null;
    });
    console.log('HUD state after brick break:', JSON.stringify(storeAfter, null, 2));

    // Check DOM updates
    const hudScoreText = await page.locator('.hud-score').textContent();
    console.log('HUD score DOM text:', hudScoreText);

    // Log all console output for debugging
    if (consoleLogs.length > 0) {
        console.log('\n=== Browser Console Logs ===');
        consoleLogs.forEach((log) => console.log(log));
        console.log('=== End Console Logs ===\n');
    }

    // Verify state updated
    expect(storeAfter).not.toBeNull();
    expect(hudScoreText).not.toBeNull();
    expect(hudScoreText).not.toBe('0');
});
