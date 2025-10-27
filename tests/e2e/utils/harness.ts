import type { Page } from '@playwright/test';
import type { LifeLostCause, UiSceneTransitionPayload } from '../../../src/app/events';

export interface RecordedEvent {
    readonly type?: unknown;
    readonly payload?: unknown;
    readonly timestamp?: unknown;
}

export interface SceneTransitionEvent extends RecordedEvent {
    readonly payload: UiSceneTransitionPayload;
}

export const isSceneTransitionEvent = (event: RecordedEvent): event is SceneTransitionEvent => {
    if (!event || typeof event !== 'object') {
        return false;
    }
    if ((event as { type?: unknown }).type !== 'UiSceneTransition') {
        return false;
    }
    const payload = (event as { payload?: unknown }).payload;
    if (typeof payload !== 'object' || payload === null) {
        return false;
    }
    const candidate = payload as Partial<UiSceneTransitionPayload>;
    return typeof candidate.scene === 'string' && typeof candidate.action === 'string';
};

export interface HarnessInstallOptions {
    readonly enableDeveloperCheats?: boolean;
}

const harnessStorageKey = 'lucky-break:developer-cheats';

export const installEventHarness = async (page: Page, options: HarnessInstallOptions = {}): Promise<void> => {
    const enableDeveloperCheats = options.enableDeveloperCheats ?? false;
    await page.addInitScript(
        ({ enableDeveloperCheats: shouldEnable }: { enableDeveloperCheats: boolean }) => {
            const globalObject = window as unknown as {
                __LB_E2E_EVENTS__?: RecordedEvent[];
                __LB_E2E_HOOKS__?: Record<string, unknown>;
            };

            const previousHooks: Record<string, unknown> & { onEvent?: unknown } =
                typeof globalObject.__LB_E2E_HOOKS__ === 'object' && globalObject.__LB_E2E_HOOKS__ !== null
                    ? globalObject.__LB_E2E_HOOKS__
                    : {};

            const resolveBuffer = (): RecordedEvent[] => {
                const existing = globalObject.__LB_E2E_EVENTS__;
                if (Array.isArray(existing)) {
                    return existing;
                }
                const created: RecordedEvent[] = [];
                globalObject.__LB_E2E_EVENTS__ = created;
                return created;
            };

            globalObject.__LB_E2E_EVENTS__ = resolveBuffer();
            globalObject.__LB_E2E_HOOKS__ = {
                ...previousHooks,
                onEvent(event: RecordedEvent) {
                    resolveBuffer().push(event);
                    const candidateOriginal = previousHooks.onEvent;
                    if (typeof candidateOriginal === 'function') {
                        try {
                            candidateOriginal(event);
                        } catch {
                            // ignore hook errors in tests
                        }
                    }
                },
            } satisfies Record<string, unknown>;

            if (shouldEnable) {
                try {
                    window.localStorage?.setItem(
                        harnessStorageKey,
                        JSON.stringify({ enabled: true, forcedReward: null }),
                    );
                } catch {
                    // ignore storage availability issues in tests
                }
            }
        },
        { enableDeveloperCheats },
    );
};

export const readEvents = async (page: Page): Promise<RecordedEvent[]> =>
    page.evaluate(() => {
        const globalObject = window as unknown as { __LB_E2E_EVENTS__?: RecordedEvent[] };
        const events = globalObject.__LB_E2E_EVENTS__;
        return Array.isArray(events) ? events.slice() : [];
    });

export const drainEvents = async (page: Page): Promise<RecordedEvent[]> =>
    page.evaluate(() => {
        const globalObject = window as unknown as { __LB_E2E_EVENTS__?: RecordedEvent[] };
        const existingEvents = globalObject.__LB_E2E_EVENTS__;
        const events = Array.isArray(existingEvents) ? existingEvents : [];
        const snapshot = events.slice();
        globalObject.__LB_E2E_EVENTS__ = [];
        return snapshot;
    });

interface WaitForEventOptions<TEvent extends RecordedEvent> {
    readonly predicate?: (event: TEvent) => boolean;
    readonly timeout?: number;
    readonly includeExisting?: boolean;
}

const defaultWaitTimeout = 15_000;

export const waitForEvent = async <TEvent extends RecordedEvent = RecordedEvent>(
    page: Page,
    type: string,
    options: WaitForEventOptions<TEvent> = {},
): Promise<TEvent> => {
    const predicate = options.predicate ?? (() => true);
    const deadline = Date.now() + (options.timeout ?? defaultWaitTimeout);
    const includeExisting = options.includeExisting ?? true;

    let cursor = includeExisting
        ? 0
        : await page.evaluate(() => {
            const globalObject = window as unknown as { __LB_E2E_EVENTS__?: RecordedEvent[] };
            return (globalObject.__LB_E2E_EVENTS__ ?? []).length;
        });

    while (Date.now() <= deadline) {
        const result = await page.evaluate(
            ({ cursor: start }) => {
                const globalObject = window as unknown as { __LB_E2E_EVENTS__?: RecordedEvent[] };
                const events = globalObject.__LB_E2E_EVENTS__ ?? [];
                return {
                    events: events.slice(start),
                    nextCursor: events.length,
                } satisfies { events: RecordedEvent[]; nextCursor: number };
            },
            { cursor },
        );

        for (const event of result.events as TEvent[]) {
            if (!event || typeof event !== 'object') {
                continue;
            }
            if ((event as { type?: unknown }).type !== type) {
                continue;
            }
            if (predicate(event)) {
                return event;
            }
        }

        cursor = result.nextCursor;
        if (Date.now() > deadline) {
            break;
        }
        await page.waitForTimeout(50);
    }

    throw new Error(`Timed out waiting for event "${type}"`);
};

export type WaitForSceneTransitionOptions = WaitForEventOptions<SceneTransitionEvent>;

export const waitForSceneTransition = async (
    page: Page,
    scene: UiSceneTransitionPayload['scene'],
    action: UiSceneTransitionPayload['action'],
    options: WaitForSceneTransitionOptions = {},
): Promise<SceneTransitionEvent> =>
    waitForEvent<SceneTransitionEvent>(page, 'UiSceneTransition', {
        ...options,
        predicate: (event) => {
            if (!event.payload) {
                return false;
            }
            return event.payload.scene === scene && event.payload.action === action && (options.predicate?.(event) ?? true);
        },
    });

const waitForHarnessFunction = (page: Page, method: string): Promise<unknown> =>
    page.waitForFunction(
        (target: string) => {
            const hooks = (window as unknown as { __LB_E2E_HOOKS__?: Record<string, unknown> }).__LB_E2E_HOOKS__;
            if (!hooks) {
                return false;
            }
            return typeof hooks[target] === 'function';
        },
        method,
        { timeout: 5_000 },
    );

const callHarness = async <TReturn>(page: Page, method: string, args: unknown[] = []): Promise<TReturn> => {
    await waitForHarnessFunction(page, method);
    return page.evaluate<TReturn, { method: string; args: unknown[] }>(
        ({ method, args }) => {
            const hooks = (window as unknown as { __LB_E2E_HOOKS__?: Record<string, unknown> }).__LB_E2E_HOOKS__;
            const fn = hooks ? hooks[method] : undefined;
            if (typeof fn !== 'function') {
                throw new Error(`E2E hook "${method}" unavailable`);
            }
            return fn(...args);
        },
        { method, args },
    );
};

export const startGameplay = (page: Page): Promise<void> => callHarness(page, 'startGameplay');

export const skipLevel = (page: Page): Promise<void> => callHarness(page, 'skipLevel');

export const loseLife = (page: Page, cause?: LifeLostCause): Promise<void> =>
    callHarness(page, 'loseLife', [cause]);

export const drainLives = (
    page: Page,
    options: { leaveOne?: boolean } = {},
): Promise<void> => callHarness(page, 'drainLives', [options]);

export const pauseGameplay = (page: Page): Promise<void> => callHarness(page, 'pauseGameplay');

export const resumeGameplay = (page: Page): Promise<void> => callHarness(page, 'resumeGameplay');

export const quitToMenu = (page: Page): Promise<void> => callHarness(page, 'quitToMenu');

export const launchBall = (
    page: Page,
    direction?: { x: number; y: number },
): Promise<void> => callHarness(page, 'launchBall', direction ? [direction] : []);

export interface RuntimeStateSnapshot {
    readonly currentScene: string | null;
    readonly isPaused: boolean;
    readonly loopRunning: boolean;
    readonly livesRemaining: number;
}

export const getRuntimeState = (page: Page): Promise<RuntimeStateSnapshot> => callHarness(page, 'getRuntimeState');
