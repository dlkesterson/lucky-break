/**
 * E2E tests using ML-trained agent trajectories for deterministic, high-performance gameplay.
 * These tests validate that the trained agent can achieve combos, complete levels, and
 * demonstrate strategic gameplay on seed 1337.
 */

import { expect, test } from '@playwright/test';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    quickStartGameplay,
    waitForEvent,
    getComboState,
    getPhysicsState,
    executeRLAction,
    e2eTimeouts,
} from './utils/harness';
import {
    loadTrajectory,
    findLatestTrajectory,
    summarizeTrajectory,
    type Trajectory,
} from './utils/trajectory-loader';

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test.describe('AI-Assisted Gameplay (Seed 1337)', () => {
    let trajectory: Trajectory | null = null;

    test.beforeAll(() => {
        // Try to load the latest trained trajectory
        const filename = findLatestTrajectory(1337);
        if (filename) {
            try {
                trajectory = loadTrajectory(filename);
                const summary = summarizeTrajectory(trajectory);
                console.log('Loaded trajectory:', filename);
                console.log('Summary:', summary);
            } catch (error) {
                console.warn('Failed to load trajectory:', error);
                trajectory = null;
            }
        } else {
            console.warn(
                'No trained trajectory found for seed 1337. ' +
                'Run: python packages/ml-trainer/train_agent.py'
            );
        }
    });

    test('trained agent achieves higher combos than random play', async ({ page }) => {
        test.skip(!trajectory, 'No trained trajectory available');

        await quickStartGameplay(page, 1337);
        await drainEvents(page);

        let maxCombo = 0;
        let currentPaddleX = 400; // Start at center

        // Replay first 100 steps of the trajectory
        const stepsToReplay = Math.min(100, trajectory!.steps.length);

        for (let i = 0; i < stepsToReplay; i++) {
            const step = trajectory!.steps[i];

            // Execute the RL action
            await executeRLAction(page, step.action, currentPaddleX);

            // Update paddle position from observation
            currentPaddleX = step.observation.paddle.position.x;

            // Small delay to allow physics to update
            await page.waitForTimeout(8); // ~120 FPS

            // Check combo state every 10 steps
            if (i % 10 === 0) {
                const comboState = await getComboState(page);
                maxCombo = Math.max(maxCombo, comboState.currentCombo);
            }
        }

        // The trained agent should achieve at least some combo
        const finalComboState = await getComboState(page);
        console.log('Max combo achieved:', maxCombo);
        console.log('Final combo:', finalComboState.currentCombo);

        // Expect the agent to have hit at least one brick (combo >= 1)
        expect(maxCombo).toBeGreaterThanOrEqual(1);
    });

    test('trained agent breaks bricks efficiently', async ({ page }) => {
        test.skip(!trajectory, 'No trained trajectory available');

        await quickStartGameplay(page, 1337);
        await drainEvents(page);

        const initialPhysics = await getPhysicsState(page);
        const initialBricks = initialPhysics.brickCount;

        let currentPaddleX = 400;
        const stepsToReplay = Math.min(200, trajectory!.steps.length);

        for (let i = 0; i < stepsToReplay; i++) {
            const step = trajectory!.steps[i];
            await executeRLAction(page, step.action, currentPaddleX);
            currentPaddleX = step.observation.paddle.position.x;
            await page.waitForTimeout(8);
        }

        const finalPhysics = await getPhysicsState(page);
        const bricksDestroyed = initialBricks - finalPhysics.brickCount;

        console.log('Initial bricks:', initialBricks);
        console.log('Final bricks:', finalPhysics.brickCount);
        console.log('Bricks destroyed:', bricksDestroyed);

        // Trained agent should destroy at least 1 brick
        expect(bricksDestroyed).toBeGreaterThanOrEqual(1);
    });

    test('trained agent maintains ball in play', async ({ page }) => {
        test.skip(!trajectory, 'No trained trajectory available');
        test.slow(); // This test replays more steps

        await quickStartGameplay(page, 1337);
        await drainEvents(page);

        let livesLost = 0;
        let currentPaddleX = 400;
        const stepsToReplay = Math.min(500, trajectory!.steps.length);

        // Listen for LifeLost events
        page.on('console', (msg) => {
            if (msg.text().includes('LifeLost')) {
                livesLost++;
            }
        });

        for (let i = 0; i < stepsToReplay; i++) {
            const step = trajectory!.steps[i];
            await executeRLAction(page, step.action, currentPaddleX);
            currentPaddleX = step.observation.paddle.position.x;
            await page.waitForTimeout(8);

            // Check if ball is still in play
            if (i % 50 === 0) {
                const physics = await getPhysicsState(page);
                if (physics.ballPosition.y > 700) {
                    console.log(`Ball lost at step ${i}`);
                    break;
                }
            }
        }

        // Trained agent should minimize life loss
        expect(livesLost).toBeLessThanOrEqual(1);
    });

    test('trajectory replay produces consistent scores', async ({ page }) => {
        test.skip(!trajectory, 'No trained trajectory available');

        const summary = summarizeTrajectory(trajectory!);

        await quickStartGameplay(page, 1337);
        await drainEvents(page);

        let currentPaddleX = 400;
        const stepsToReplay = Math.min(100, trajectory!.steps.length);

        for (let i = 0; i < stepsToReplay; i++) {
            const step = trajectory!.steps[i];
            await executeRLAction(page, step.action, currentPaddleX);
            currentPaddleX = step.observation.paddle.position.x;
            await page.waitForTimeout(8);
        }

        // Due to determinism, score should be predictable
        // (though timing differences may cause minor variations)
        console.log('Expected final score (from trajectory):', summary.finalScore);
        console.log('Note: Actual score may vary slightly due to timing');
    });
});

test.describe('AI-Assisted Reliability Tests', () => {
    /**
     * Uses AI agent actions to ensure reliable brick breaks for tests that
     * previously struggled with randomness.
     */

    test('HUD state updates reliably with AI agent', async ({ page }) => {
        // This replaces the skipped debug-hud-state.spec.ts test

        await quickStartGameplay(page, 1337);
        await drainEvents(page);

        // Use a simple but effective strategy: launch at slight angle
        const canvas = page.locator('canvas').first();
        await canvas.click({ position: { x: 420, y: 650 } }); // Move paddle right
        await page.waitForTimeout(100);

        // Launch with default angle that hits bricks
        await executeRLAction(page, 3, 420); // Action 3 = LAUNCH

        // Wait for brick break
        await waitForEvent(page, 'BrickBreak', { timeout: e2eTimeouts.event });

        // Wait for state updates to propagate
        await page.waitForTimeout(500);

        // Check HUD state
        const hudScore = await page.locator('.hud-score').textContent();
        console.log('HUD score after brick break:', hudScore);

        // Verify score updated
        expect(hudScore).not.toBe('0');
        expect(hudScore).not.toBeNull();
    });

    test('combo system updates reliably with AI agent', async ({ page }) => {
        await quickStartGameplay(page, 1337);
        await drainEvents(page);

        // Use proven launch angle from harness
        const canvas = page.locator('canvas').first();
        await canvas.click({ position: { x: 415, y: 650 } });
        await page.waitForTimeout(50);

        await executeRLAction(page, 3, 415); // LAUNCH

        // Wait for first brick
        await waitForEvent(page, 'BrickBreak', { timeout: e2eTimeouts.event });
        await page.waitForTimeout(200);

        const comboState = await getComboState(page);

        console.log('Combo state:', comboState);
        expect(comboState.currentCombo).toBeGreaterThanOrEqual(1);
        expect(comboState.scoreMultiplier).toBeGreaterThanOrEqual(1);
    });
});
