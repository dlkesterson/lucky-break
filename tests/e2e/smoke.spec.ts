import { expect, test } from '@playwright/test';

interface SceneEvent {
    readonly type?: unknown;
    readonly payload?: unknown;
}

interface SceneTransitionEvent extends SceneEvent {
    readonly payload?: {
        readonly scene?: string;
        readonly action?: string;
    };
}

const isSceneTransitionEvent = (event: SceneEvent): event is SceneTransitionEvent => {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (event.type !== 'UiSceneTransition') {
        return false;
    }

    if (!('payload' in event)) {
        return false;
    }

    const payload = (event as { payload?: unknown }).payload;
    return typeof payload === 'object' && payload !== null;
};

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const globalObject = window as unknown as {
            __LB_E2E_EVENTS__?: SceneEvent[];
            __LB_E2E_HOOKS__?: { onEvent?: (event: SceneEvent) => void };
        };

        globalObject.__LB_E2E_EVENTS__ = [];
        globalObject.__LB_E2E_HOOKS__ = {
            onEvent(event) {
                globalObject.__LB_E2E_EVENTS__?.push(event);
            },
        };
    });
});

test('loads the main menu and transitions into gameplay', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThan(0);

    await page.mouse.move(640, 360);
    await page.mouse.click(640, 360);

    await page.waitForTimeout(500);

    const sceneEvents = await page.evaluate(() => {
        const globalObject = window as unknown as { __LB_E2E_EVENTS__?: SceneEvent[] };
        return globalObject.__LB_E2E_EVENTS__ ?? [];
    });

    const sceneNames = sceneEvents
        .filter(isSceneTransitionEvent)
        .map(({ payload }) => {
            const scene = typeof payload?.scene === 'string' ? payload.scene : '';
            const action = typeof payload?.action === 'string' ? payload.action : '';
            return `${scene}:${action}`;
        });

    expect(sceneNames).toContain('main-menu:enter');
    expect(sceneNames).toContain('gameplay:enter');
});
