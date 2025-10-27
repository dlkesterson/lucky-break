import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface RecordedEvent {
    readonly type?: unknown;
    readonly payload?: unknown;
}

interface SceneTransitionPayload {
    readonly scene?: string;
    readonly action?: string;
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const globalObject = window as unknown as {
            __LB_E2E_EVENTS__?: RecordedEvent[];
            __LB_E2E_HOOKS__?: {
                onEvent?: (event: RecordedEvent) => void;
                startGameplay?: () => Promise<void> | void;
            };
        };

        globalObject.__LB_E2E_EVENTS__ = [];
        globalObject.__LB_E2E_HOOKS__ = {
            onEvent(event) {
                globalObject.__LB_E2E_EVENTS__?.push(event);
            },
        };
    });
});

const waitForEvent = async (page: Page, eventType: string) => {
    await page.waitForFunction(
        (target: string) => {
            const events = (window as unknown as { __LB_E2E_EVENTS__?: RecordedEvent[] }).__LB_E2E_EVENTS__ ?? [];
            return events.some((event) => event?.type === target);
        },
        eventType,
        { timeout: 15000 },
    );
};

const waitForSceneTransition = async (page: Page, scene: string, action: string) => {
    await page.waitForFunction(
        ({ expectedScene, expectedAction }: { expectedScene: string; expectedAction: string }) => {
            const events = (window as unknown as { __LB_E2E_EVENTS__?: RecordedEvent[] }).__LB_E2E_EVENTS__ ?? [];
            return events.some((event) => {
                if (event?.type !== 'UiSceneTransition') {
                    return false;
                }
                const payload = event.payload as SceneTransitionPayload | undefined;
                return payload?.scene === expectedScene && payload?.action === expectedAction;
            });
        },
        { expectedScene: scene, expectedAction: action },
        { timeout: 15000 },
    );
};

test('round stays active after the first brick break', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await waitForSceneTransition(page, 'main-menu', 'enter');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await page.evaluate(() => {
        const hooks = (window as unknown as {
            __LB_E2E_HOOKS__?: { startGameplay?: () => Promise<void> | void };
        }).__LB_E2E_HOOKS__;
        return hooks?.startGameplay?.();
    });

    await waitForSceneTransition(page, 'gameplay', 'enter');

    const canvasSize = await canvas.evaluate((element: HTMLCanvasElement) => ({ width: element.width, height: element.height }));
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);

    const launchPoint = {
        x: canvasSize.width / 2,
        y: canvasSize.height - Math.min(80, canvasSize.height * 0.2),
    };
    await canvas.click({ position: launchPoint });

    await waitForEvent(page, 'BrickHit');

    await page.waitForTimeout(1000);

    const eventSummary = await page.evaluate(() => {
        const events = (window as unknown as { __LB_E2E_EVENTS__?: RecordedEvent[] }).__LB_E2E_EVENTS__ ?? [];
        const firstBrickHitIndex = events.findIndex((event) => event?.type === 'BrickHit');
        const firstBrickBreakIndex = events.findIndex((event) => event?.type === 'BrickBreak');
        const roundCompleteIndex = events.findIndex((event) => event?.type === 'RoundCompleted');
        const totalBrickHits = events.filter((event) => event?.type === 'BrickHit').length;
        const totalBrickBreaks = events.filter((event) => event?.type === 'BrickBreak').length;
        return { firstBrickHitIndex, firstBrickBreakIndex, roundCompleteIndex, totalBrickHits, totalBrickBreaks };
    });

    expect(eventSummary.firstBrickHitIndex).toBeGreaterThanOrEqual(0);
    expect(eventSummary.totalBrickHits).toBeGreaterThan(0);
    expect(eventSummary.roundCompleteIndex).toBe(-1);
    if (eventSummary.totalBrickBreaks > 0) {
        expect(eventSummary.firstBrickBreakIndex).toBeGreaterThan(eventSummary.firstBrickHitIndex ?? -1);
    }
});
