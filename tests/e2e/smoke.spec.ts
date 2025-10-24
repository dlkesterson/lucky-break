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
            __LB_E2E_HOOKS__?: {
                onEvent?: (event: SceneEvent) => void;
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

test('loads the main menu and transitions into gameplay', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);

    await page.waitForFunction(() => {
        const globalObject = window as unknown as { __LB_E2E_EVENTS__?: SceneEvent[] };
        const events = globalObject.__LB_E2E_EVENTS__ ?? [];
        return events.some((event) => {
            if (!event || typeof event !== 'object') {
                return false;
            }

            if (event.type !== 'UiSceneTransition') {
                return false;
            }

            const payload = (event as SceneTransitionEvent).payload;
            return payload?.scene === 'main-menu' && payload?.action === 'enter';
        });
    });

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await canvas.click();

    await page.evaluate(() => {
        const hooks = (window as unknown as {
            __LB_E2E_HOOKS__?: { startGameplay?: () => Promise<void> | void };
        }).__LB_E2E_HOOKS__;
        return hooks?.startGameplay?.();
    });

    await page.waitForFunction(() => {
        const globalObject = window as unknown as { __LB_E2E_EVENTS__?: SceneEvent[] };
        const events = globalObject.__LB_E2E_EVENTS__ ?? [];
        return events.some((event) => {
            if (!event || typeof event !== 'object') {
                return false;
            }

            if (event.type !== 'UiSceneTransition') {
                return false;
            }

            const payload = (event as SceneTransitionEvent).payload;
            return payload?.scene === 'gameplay' && payload?.action === 'enter';
        });
    });

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
