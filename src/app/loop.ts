const fallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();
let fallbackHandle = 1;

export const DEFAULT_FIXED_DELTA = 1 / 120;
export const DEFAULT_STEP_MS = DEFAULT_FIXED_DELTA * 1000;
const DEFAULT_MAX_STEPS_PER_FRAME = 5;
const DEFAULT_MAX_FRAME_DELTA_MS = 100;

const FALLBACK_FRAME_MS = DEFAULT_STEP_MS;

const FALLBACK_REQUEST = (callback: FrameRequestCallback): number => {
    const handle = fallbackHandle++;
    const timer = setTimeout(() => {
        fallbackTimers.delete(handle);
        callback(typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
    }, FALLBACK_FRAME_MS);
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

const resolveRaf = (
    options: LoopOptions,
): ((callback: FrameRequestCallback) => number) => {
    if (options.raf) {
        return options.raf;
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return (callback) => window.requestAnimationFrame(callback);
    }

    return FALLBACK_REQUEST;
};

const resolveCancelRaf = (
    options: LoopOptions,
): ((handle: number) => void) => {
    if (options.cancelRaf) {
        return options.cancelRaf;
    }

    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        return (handle) => window.cancelAnimationFrame(handle);
    }

    return FALLBACK_CANCEL;
};

const resolveNow = (): (() => number) => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return () => performance.now();
    }

    return () => Date.now();
};

export interface LoopOptions {
    readonly fixedDelta?: number;
    readonly maxStepsPerFrame?: number;
    readonly maxFrameDeltaMs?: number;
    readonly now?: () => number;
    readonly raf?: (callback: FrameRequestCallback) => number;
    readonly cancelRaf?: (handle: number) => void;
}

export interface GameLoop {
    start(): void;
    stop(): void;
    isRunning(): boolean;
}

export type UpdateCallback = (deltaSeconds: number) => void;
export type RenderCallback = (alpha: number) => void;

export class FixedStepLoop implements GameLoop {
    private readonly fixedDelta: number;

    private readonly stepMs: number;

    private readonly maxStepsPerFrame: number;

    private readonly maxFrameDeltaMs: number;

    private readonly now: () => number;

    private readonly raf: (callback: FrameRequestCallback) => number;

    private readonly cancelRaf: (handle: number) => void;

    private accumulatorMs = 0;

    private lastTime = 0;

    private frameHandle: number | undefined;

    private running = false;

    constructor(
        private readonly update: UpdateCallback,
        private readonly render: RenderCallback,
        options: LoopOptions = {},
    ) {
        const configuredDelta = options.fixedDelta ?? DEFAULT_FIXED_DELTA;
        this.fixedDelta = configuredDelta > 0 ? configuredDelta : DEFAULT_FIXED_DELTA;
        this.stepMs = this.fixedDelta * 1000;
        const maxSteps = options.maxStepsPerFrame ?? DEFAULT_MAX_STEPS_PER_FRAME;
        this.maxStepsPerFrame = Math.max(1, Math.floor(maxSteps));
        const frameClamp = options.maxFrameDeltaMs ?? DEFAULT_MAX_FRAME_DELTA_MS;
        // Ensure frame clamp cannot fall below a single step.
        this.maxFrameDeltaMs = Math.max(this.stepMs, frameClamp);
        this.now = options.now ?? resolveNow();
        this.raf = resolveRaf(options);
        this.cancelRaf = resolveCancelRaf(options);
    }

    start(): void {
        if (this.running) {
            return;
        }

        this.running = true;
        this.accumulatorMs = 0;
        this.lastTime = this.now();
        this.scheduleNext();
    }

    stop(): void {
        if (!this.running) {
            return;
        }

        this.running = false;
        if (this.frameHandle !== undefined) {
            this.cancelRaf(this.frameHandle);
            this.frameHandle = undefined;
        }
    }

    isRunning(): boolean {
        return this.running;
    }

    private scheduleNext(): void {
        this.frameHandle = this.raf(this.tick);
    }

    private readonly tick: FrameRequestCallback = () => {
        if (!this.running) {
            return;
        }

        const currentTime = this.now();
        let frameDeltaMs = currentTime - this.lastTime;
        this.lastTime = currentTime;

        if (frameDeltaMs < 0) {
            frameDeltaMs = 0;
        }

        if (frameDeltaMs > this.maxFrameDeltaMs) {
            frameDeltaMs = this.maxFrameDeltaMs;
        }

        this.accumulatorMs += frameDeltaMs;

        let steps = 0;
        while (this.accumulatorMs >= this.stepMs && steps < this.maxStepsPerFrame) {
            this.update(this.fixedDelta);
            this.accumulatorMs -= this.stepMs;
            steps += 1;
        }

        if (steps === this.maxStepsPerFrame && this.accumulatorMs > this.stepMs) {
            // Prevent runaway accumulation when hitting the step cap.
            this.accumulatorMs = this.stepMs;
        }

        const interpolation = Math.min(1, this.accumulatorMs / this.stepMs);
        this.render(interpolation);

        this.scheduleNext();
    };
}

export const createGameLoop = (
    update: UpdateCallback,
    render: RenderCallback,
    options?: LoopOptions,
): GameLoop => new FixedStepLoop(update, render, options);
