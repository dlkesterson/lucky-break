import type { PhysicsWorldHandle } from '@physics/world';
import type { StageHandle } from '@render/stage';

let fallbackHandle = 1;
const fallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();

const FALLBACK_REQUEST = (callback: FrameRequestCallback): number => {
    const handle = fallbackHandle++;
    const timer = setTimeout(() => {
        fallbackTimers.delete(handle);
        callback(Date.now());
    }, DEFAULT_STEP_MS);
    fallbackTimers.set(handle, timer);
    return handle;
};

const FALLBACK_CANCEL = (handle: number): void => {
    const timer = fallbackTimers.get(handle);
    if (timer) {
        clearTimeout(timer);
        fallbackTimers.delete(handle);
    }
};

const resolveNow = (): (() => number) => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return () => performance.now();
    }

    return () => Date.now();
};

export const DEFAULT_STEP_MS = 1000 / 120;
const DEFAULT_MAX_STEPS = 5;

export interface LoopHooks {
    readonly beforeStep?: (deltaMs: number) => void;
    readonly afterStep?: (deltaMs: number) => void;
    readonly beforeRender?: (interpolation: number) => void;
    readonly afterRender?: () => void;
}

type PhysicsStepper = Pick<PhysicsWorldHandle, 'step'>;
type StageRenderer = Pick<StageHandle, 'app'>;

export interface GameLoopOptions {
    readonly world: PhysicsStepper;
    readonly stage: StageRenderer;
    readonly hooks?: LoopHooks;
    readonly stepMs?: number;
    readonly maxStepsPerFrame?: number;
    readonly now?: () => number;
    readonly requestFrame?: (callback: FrameRequestCallback) => number;
    readonly cancelFrame?: (handle: number) => void;
}

export interface GameLoopController {
    readonly start: () => void;
    readonly stop: () => void;
    readonly isRunning: () => boolean;
}

export const createGameLoop = (options: GameLoopOptions): GameLoopController => {
    const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
    const maxStepsPerFrame = Math.max(1, options.maxStepsPerFrame ?? DEFAULT_MAX_STEPS);
    const now = options.now ?? resolveNow();
    const requestFrame = options.requestFrame ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : FALLBACK_REQUEST);
    const cancelFrame = options.cancelFrame ?? (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : FALLBACK_CANCEL);

    const hooks = options.hooks ?? {};
    const physics = options.world;
    const stage = options.stage;

    let running = false;
    let accumulator = 0;
    let lastTime = 0;
    let frameHandle: number | undefined;

    const maxDeltaMs = stepMs * maxStepsPerFrame;

    const scheduleNext = () => {
        frameHandle = requestFrame(tick);
    };

    const tick: FrameRequestCallback = () => {
        if (!running) {
            return;
        }

        const currentTime = now();
        let deltaMs = currentTime - lastTime;
        lastTime = currentTime;
        if (deltaMs < 0) {
            deltaMs = 0;
        }
        if (deltaMs > maxDeltaMs) {
            deltaMs = maxDeltaMs;
        }

        accumulator += deltaMs;

        let steps = 0;
        while (accumulator >= stepMs && steps < maxStepsPerFrame) {
            hooks.beforeStep?.(stepMs);
            physics.step(stepMs);
            hooks.afterStep?.(stepMs);
            accumulator -= stepMs;
            steps += 1;
        }

        const interpolation = accumulator / stepMs;
        hooks.beforeRender?.(interpolation);
        stage.app.render();
        hooks.afterRender?.();

        scheduleNext();
    };

    const start = () => {
        if (running) {
            return;
        }

        running = true;
        accumulator = 0;
        lastTime = now();
        scheduleNext();
    };

    const stop = () => {
        if (!running) {
            return;
        }

        running = false;
        if (frameHandle !== undefined) {
            cancelFrame(frameHandle);
            frameHandle = undefined;
        }
    };

    const isRunning = () => running;

    return {
        start,
        stop,
        isRunning,
    };
};
