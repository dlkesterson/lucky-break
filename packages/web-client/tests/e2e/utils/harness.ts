import type { Page } from '@playwright/test';
import type { LifeLostCause, UiSceneTransitionPayload } from 'app/events';
import type { BiasPhaseState } from 'app/runtime/round-machine';
import type { RuntimeModifierSnapshot as ImportedRuntimeModifierSnapshot } from 'app/runtime/modifiers';
import type { ReplayRecording } from 'app/replay-buffer';

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
const defaultSeed = 1337;

export const gotoLuckyBreak = async (page: Page, seed: number = defaultSeed): Promise<void> => {
    const resolvedSeed = Number.isFinite(seed) ? Math.trunc(seed) : defaultSeed;
    await page.goto(`/?seed=${encodeURIComponent(String(resolvedSeed))}`);
};

export const installEventHarness = async (page: Page, options: HarnessInstallOptions = {}): Promise<void> => {
    const enableDeveloperCheats = options.enableDeveloperCheats ?? false;
    await page.addInitScript(
        ({ enableDeveloperCheats: shouldEnable }: { enableDeveloperCheats: boolean }) => {
            const globalObject = window as unknown as {
                __LB_E2E_EVENTS__?: RecordedEvent[];
                __LB_E2E_HOOKS__?: Record<string, unknown>;
                __LB_E2E_CONFIG__?: { rafIntervalMs?: number };
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

            const existingConfig = globalObject.__LB_E2E_CONFIG__;
            const config =
                typeof existingConfig === 'object' && existingConfig !== null
                    ? existingConfig
                    : ({} as { rafIntervalMs?: number });
            // Disable custom RAF for now - use native browser RAF
            // if (!Number.isFinite(config.rafIntervalMs ?? NaN) || (config.rafIntervalMs ?? 0) <= 0) {
            //     config.rafIntervalMs = 16; // ~60 FPS for smoother physics
            // }
            globalObject.__LB_E2E_CONFIG__ = config;

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
const harnessFunctionTimeout = 5_000;
const sceneVisibilityTimeout = 10_000;

export const e2eTimeouts = {
    event: defaultWaitTimeout,
    harnessFunction: harnessFunctionTimeout,
    sceneVisibility: sceneVisibilityTimeout,
} as const;

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
        { timeout: harnessFunctionTimeout },
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

/**
 * Preset launch angles optimized for different test scenarios.
 * 
 * **Physics is deterministic** - with seed 1337 (default), these produce consistent trajectories:
 * 
 * - `default` (0.15, -1): Hits 2 bricks, continues bouncing - BEST for multi-brick tests
 * - `steep` (0.3, -1): Hits 1 brick only
 * - `verySteep` (0.5, -1): Hits 1 brick only  
 * - `nearVertical` (0.05, -1): Hits 1 brick + paddle bounce
 * - `leftSteep` (-0.3, -1): Hits 1 brick + wall bounce
 * 
 * Use different seeds via `gotoLuckyBreak(page, seed)` for different brick layouts.
 */
export const launchAngles = {
    /** Default angle (tested: 2 brick breaks with seed 1337) */
    default: { x: 0.15, y: -1 },
    /** Steep angle (tested: 1 brick break with seed 1337) */
    steep: { x: 0.3, y: -1 },
    /** Very steep (tested: 1 brick break with seed 1337) */
    verySteep: { x: 0.5, y: -1 },
    /** Nearly vertical (tested: 1 brick + paddle bounce with seed 1337) */
    nearVertical: { x: 0.05, y: -1 },
    /** Left angle (tested: 1 brick + wall hit with seed 1337) */
    leftSteep: { x: -0.3, y: -1 },
} as const;

export interface E2EBrickVariant {
    readonly style: string;
    readonly form: string;
    readonly rarity: number;
    readonly width: number;
    readonly height: number;
}

export interface E2EBrickData {
    readonly variants: {
        readonly neon: readonly E2EBrickVariant[];
        readonly mosaic: readonly E2EBrickVariant[];
        readonly marble: readonly E2EBrickVariant[];
    } | null;
    readonly crackTextures: {
        readonly '1': { width: number; height: number };
        readonly '2': { width: number; height: number };
        readonly '3': { width: number; height: number };
    } | null;
}

export interface RuntimeStateSnapshot {
    readonly currentScene: string | null;
    readonly isPaused: boolean;
    readonly loopRunning: boolean;
    readonly livesRemaining: number;
}

export interface RoundMachineSnapshot {
    readonly levelIndex: number;
    readonly difficultyMultiplier: number;
    readonly powerUpChanceMultiplier: number;
}

export const getRuntimeState = (page: Page): Promise<RuntimeStateSnapshot> => callHarness(page, 'getRuntimeState');

export const getBiasPhaseState = (page: Page): Promise<BiasPhaseState> => callHarness(page, 'getBiasPhaseState');

export const commitBiasSelection = (page: Page, optionId: string): Promise<boolean> =>
    callHarness(page, 'commitBiasSelection', [optionId]);

export const skipBiasPhase = (page: Page): Promise<boolean> => callHarness(page, 'skipBiasPhase');

export const getRoundMachineSnapshot = (page: Page): Promise<RoundMachineSnapshot> =>
    callHarness(page, 'getRoundMachineSnapshot');

export const getRuntimeModifiers = (page: Page): Promise<ImportedRuntimeModifierSnapshot> =>
    callHarness(page, 'getRuntimeModifiers');

export const getBrickData = (page: Page): Promise<E2EBrickData> => callHarness(page, 'getBrickData');

export const getReplaySnapshot = (page: Page): Promise<ReplayRecording> => callHarness(page, 'getReplaySnapshot');

export const getBrickPositions = (page: Page): Promise<Array<{ x: number; y: number }>> =>
    callHarness(page, 'getBrickPositions');

export interface PowerUpState {
    readonly type: string;
    readonly remainingTime: number;
    readonly duration: number;
}

export interface ActiveReward {
    readonly type: string;
    readonly duration: number;
    readonly [key: string]: unknown;
}

export interface PowerUpSnapshot {
    readonly activePowerUps: readonly PowerUpState[];
    readonly activeReward: ActiveReward | null;
    readonly doublePointsMultiplier: number;
    readonly slowTimeScale: number;
    readonly paddleWidthScale: number;
}

export const activatePowerUp = (page: Page, type: string): Promise<void> =>
    callHarness(page, 'activatePowerUp', [type]);

export const activateReward = (page: Page, rewardType: string): Promise<void> =>
    callHarness(page, 'activateReward', [rewardType]);

export const getPowerUpState = (page: Page): Promise<PowerUpSnapshot> =>
    callHarness(page, 'getPowerUpState');

export const forceReward = (page: Page, rewardType: string | null): Promise<void> =>
    callHarness(page, 'forceReward', [rewardType]);

export interface GambleBrickSnapshot {
    readonly armedCount: number;
    readonly primedCount: number;
    readonly nextExpirationSeconds: number | null;
}

export const getGambleBrickState = (page: Page): Promise<GambleBrickSnapshot> =>
    callHarness(page, 'getGambleBrickState');

export interface MultiBallSnapshot {
    readonly totalBalls: number;
    readonly extraBalls: number;
    readonly attachedBalls: number;
}

export const getMultiBallState = (page: Page): Promise<MultiBallSnapshot> =>
    callHarness(page, 'getMultiBallState');

export interface ComboSnapshot {
    readonly currentCombo: number;
    readonly scoreMultiplier: number;
    readonly comboTimeRemaining: number;
}

export const getComboState = (page: Page): Promise<ComboSnapshot> =>
    callHarness(page, 'getComboState');

export interface PhysicsState {
    readonly ballPosition: { x: number; y: number };
    readonly ballVelocity: { x: number; y: number };
    readonly ballSpeed: number;
    readonly ballAttached: boolean;
    readonly paddlePosition: { x: number; y: number };
    readonly brickCount: number;
    readonly timeScale: number;
    readonly loopRunning: boolean;
    readonly isPaused: boolean;
}

export const getPhysicsState = (page: Page): Promise<PhysicsState> =>
    callHarness(page, 'getPhysicsState');

/**
 * Fast startup helper that combines common initialization steps.
 * This replaces the verbose pattern of:
 * - gotoLuckyBreak
 * - waitForSelector('.lb-preloader[data-state="loading"]')
 * - waitForSelector('canvas', { state: 'attached' })
 * - expect(.lb-preloader).toHaveCount(0)
 * - waitForSceneTransition('main-menu', 'enter')
 * - startGameplay
 * - waitForSceneTransition('gameplay', 'enter')
 */
export const quickStartGameplay = async (page: Page, seed: number = 1337): Promise<void> => {
    await gotoLuckyBreak(page, seed);

    // Wait for canvas to be ready (combined preloader + canvas check)
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForSelector('.lb-preloader', { state: 'detached', timeout: 10_000 });

    // Wait for main menu scene
    await waitForSceneTransition(page, 'main-menu', 'enter');

    // Start gameplay and wait for transition
    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');
};

/**
 * Move paddle to a specific X coordinate.
 * @param page - Playwright page
 * @param targetX - Target X coordinate for paddle
 */
export const movePaddleTo = async (page: Page, targetX: number): Promise<void> => {
    await callHarness(page, 'movePaddleTo', [targetX]);
};

/**
 * Replay a single step from an ML trajectory.
 * Moves paddle and launches ball based on the agent's action.
 * 
 * @param page - Playwright page
 * @param action - RL action to execute (0-5)
 * @param paddleX - Current paddle X position
 * @param movementSpeed - How much to move paddle (default: 50)
 * @returns Whether a launch was triggered
 */
export const executeRLAction = async (
    page: Page,
    action: number,
    paddleX: number,
    movementSpeed: number = 50,
): Promise<boolean> => {
    const playAreaWidth = 800; // Standard play area width
    let targetX = paddleX;
    let shouldLaunch = false;

    // RL action space: 0=noop, 1=left, 2=right, 3=launch, 4=left+launch, 5=right+launch
    switch (action) {
        case 1: // MOVE_LEFT
            targetX = Math.max(0, paddleX - movementSpeed);
            break;
        case 2: // MOVE_RIGHT
            targetX = Math.min(playAreaWidth, paddleX + movementSpeed);
            break;
        case 3: // LAUNCH
            shouldLaunch = true;
            break;
        case 4: // LEFT_LAUNCH
            targetX = Math.max(0, paddleX - movementSpeed);
            shouldLaunch = true;
            break;
        case 5: // RIGHT_LAUNCH
            targetX = Math.min(playAreaWidth, paddleX + movementSpeed);
            shouldLaunch = true;
            break;
        case 0: // NOOP
        default:
            // Keep current position
            break;
    }

    // Move paddle if target changed
    if (targetX !== paddleX) {
        const canvas = page.locator('canvas').first();
        await canvas.click({ position: { x: targetX, y: 650 } });
    }

    // Launch if action requires it
    if (shouldLaunch) {
        await launchBall(page);
    }

    return shouldLaunch;
};
