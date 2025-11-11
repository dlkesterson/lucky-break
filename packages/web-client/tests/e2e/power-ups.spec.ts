import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    startGameplay,
    waitForSceneTransition,
    getPowerUpState,
    activateReward,
    forceReward,
    e2eTimeouts,
} from './utils/harness';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('sticky-paddle reward activates and shows in HUD', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await activateReward(page, 'sticky-paddle');
    await page.waitForTimeout(500);

    const powerUpState = await getPowerUpState(page);
    expect(powerUpState.activeReward).not.toBeNull();
    expect(powerUpState.activeReward?.type).toBe('sticky-paddle');
    expect(powerUpState.activeReward?.duration).toBeGreaterThan(0);

    const stickyPowerUp = powerUpState.activePowerUps.find((p) => p.type === 'sticky-paddle');
    expect(stickyPowerUp).toBeDefined();
    expect(stickyPowerUp?.remainingTime).toBeGreaterThan(0);
});

test('wide-paddle reward increases paddle width scale', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    const baselineState = await getPowerUpState(page);
    const baselinePaddleWidth = baselineState.paddleWidthScale;
    expect(baselinePaddleWidth).toBeCloseTo(1.0, 1);

    await activateReward(page, 'wide-paddle');
    await page.waitForTimeout(500);

    const afterActivation = await getPowerUpState(page);
    expect(afterActivation.activeReward?.type).toBe('wide-paddle');
    expect(afterActivation.paddleWidthScale).toBeGreaterThan(baselinePaddleWidth);

    if (afterActivation.activeReward?.type === 'wide-paddle') {
        const widthMultiplier = (afterActivation.activeReward as { widthMultiplier?: number }).widthMultiplier;
        expect(widthMultiplier).toBeGreaterThan(1);
    }

    const widePaddlePowerUp = afterActivation.activePowerUps.find((p) => p.type === 'paddle-width');
    expect(widePaddlePowerUp).toBeDefined();
    expect(widePaddlePowerUp?.remainingTime).toBeGreaterThan(0);
});

test('double-points reward increases score multiplier', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    const baselineState = await getPowerUpState(page);
    expect(baselineState.doublePointsMultiplier).toBeCloseTo(1.0, 1);

    await activateReward(page, 'double-points');
    await page.waitForTimeout(500);

    const afterActivation = await getPowerUpState(page);
    expect(afterActivation.activeReward?.type).toBe('double-points');
    expect(afterActivation.doublePointsMultiplier).toBeGreaterThan(1);

    if (afterActivation.activeReward?.type === 'double-points') {
        const multiplier = (afterActivation.activeReward as { multiplier?: number }).multiplier;
        expect(multiplier).toBeGreaterThanOrEqual(2);
    }
});

test('multi-ball reward spawns extra balls', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await activateReward(page, 'multi-ball');
    await page.waitForTimeout(500);

    const powerUpState = await getPowerUpState(page);
    expect(powerUpState.activeReward?.type).toBe('multi-ball');

    if (powerUpState.activeReward?.type === 'multi-ball') {
        const extraBalls = (powerUpState.activeReward as { extraBalls?: number }).extraBalls;
        expect(extraBalls).toBeGreaterThanOrEqual(1);
    }
});

test('slow-time reward decreases time scale', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    const baselineState = await getPowerUpState(page);
    expect(baselineState.slowTimeScale).toBeCloseTo(1.0, 1);

    await activateReward(page, 'slow-time');
    await page.waitForTimeout(500);

    const afterActivation = await getPowerUpState(page);
    expect(afterActivation.activeReward?.type).toBe('slow-time');
    expect(afterActivation.slowTimeScale).toBeLessThan(1.0);
    expect(afterActivation.slowTimeScale).toBeGreaterThan(0);

    if (afterActivation.activeReward?.type === 'slow-time') {
        const timeScale = (afterActivation.activeReward as { timeScale?: number }).timeScale;
        expect(timeScale).toBeLessThanOrEqual(1.0);
        expect(timeScale).toBeGreaterThan(0);
    }
});

test('ghost-brick reward activates successfully', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await activateReward(page, 'ghost-brick');
    await page.waitForTimeout(500);

    const powerUpState = await getPowerUpState(page);
    expect(powerUpState.activeReward?.type).toBe('ghost-brick');

    if (powerUpState.activeReward?.type === 'ghost-brick') {
        const ghostCount = (powerUpState.activeReward as { ghostCount?: number }).ghostCount;
        expect(ghostCount).toBeGreaterThanOrEqual(1);
    }
});

test('laser-paddle reward activates successfully', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await activateReward(page, 'laser-paddle');
    await page.waitForTimeout(500);

    const powerUpState = await getPowerUpState(page);
    expect(powerUpState.activeReward?.type).toBe('laser-paddle');

    if (powerUpState.activeReward?.type === 'laser-paddle') {
        const reward = powerUpState.activeReward as { cooldown?: number; beamVelocity?: number; pierceCount?: number };
        expect(reward.cooldown).toBeGreaterThan(0);
        expect(reward.beamVelocity).toBeGreaterThan(0);
        expect(reward.pierceCount).toBeGreaterThanOrEqual(1);
    }
});

test('power-up effects expire after duration', async ({ page }) => {
    test.slow();

    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await activateReward(page, 'sticky-paddle');
    await page.waitForTimeout(500);

    const initialState = await getPowerUpState(page);
    expect(initialState.activeReward?.type).toBe('sticky-paddle');
    const initialDuration = initialState.activeReward?.duration ?? 0;
    expect(initialDuration).toBeGreaterThan(0);

    await page.waitForTimeout((initialDuration + 2) * 1000);

    const expiredState = await getPowerUpState(page);
    const stickyPowerUp = expiredState.activePowerUps.find((p) => p.type === 'sticky-paddle');

    if (stickyPowerUp) {
        expect(stickyPowerUp.remainingTime).toBeLessThanOrEqual(0);
    }
});

test('force reward sets next reward drop', async ({ page }) => {
    await gotoLuckyBreak(page);
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
    await drainEvents(page);

    await forceReward(page, 'laser-paddle');

    const verifyForced = await page.evaluate(() => {
        const config = (window as unknown as { __LB_E2E_CONFIG__?: { forcedReward?: string | null } }).__LB_E2E_CONFIG__;
        return config?.forcedReward;
    });

    expect(verifyForced).toBe('laser-paddle');

    await forceReward(page, null);

    const verifyCleared = await page.evaluate(() => {
        const config = (window as unknown as { __LB_E2E_CONFIG__?: { forcedReward?: string | null } }).__LB_E2E_CONFIG__;
        return config?.forcedReward;
    });

    expect(verifyCleared).toBeNull();
});
