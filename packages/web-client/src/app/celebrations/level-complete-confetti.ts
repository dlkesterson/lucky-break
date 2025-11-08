import confetti, { type CreateTypes } from 'canvas-confetti';

export interface LevelConfettiOptions {
    readonly durationMs?: number;
    readonly colors?: readonly string[];
}

const DEFAULT_DURATION_MS = 1400;
const DEFAULT_COLORS = ['#ffd45c', '#ff7b33', '#58d3ff', '#f6f0ff', '#a088ff'] as const;

let activeCelebration: Promise<void> | null = null;
let confettiCanvas: HTMLCanvasElement | null = null;
let confettiInstance: CreateTypes | null = null;

const prefersReducedMotion = (): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const ensureConfettiInstance = (): CreateTypes | null => {
    if (confettiInstance && confettiCanvas) {
        return confettiInstance;
    }

    if (typeof document === 'undefined') {
        return null;
    }

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'lb-confetti-layer';
    Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '9999',
        opacity: '0',
        transition: 'opacity 200ms ease',
    } satisfies Partial<CSSStyleDeclaration>);

    document.body.appendChild(canvas);
    requestAnimationFrame(() => {
        canvas.style.opacity = '1';
    });

    confettiCanvas = canvas;
    confettiInstance = confetti.create(canvas, {
        resize: true,
        useWorker: true,
    });

    return confettiInstance;
};

const teardownConfetti = () => {
    if (confettiCanvas) {
        confettiCanvas.style.opacity = '0';
        const canvasToRemove = confettiCanvas;
        window.setTimeout(() => {
            if (canvasToRemove.parentNode) {
                canvasToRemove.parentNode.removeChild(canvasToRemove);
            }
        }, 220);
    }

    if (confettiInstance) {
        confettiInstance.reset();
    }

    confettiCanvas = null;
    confettiInstance = null;
};

const runConfettiBursts = (
    instance: CreateTypes,
    options: LevelConfettiOptions | undefined,
): Promise<void> => {
    const durationMs = Math.max(400, options?.durationMs ?? DEFAULT_DURATION_MS);
    const colors = options?.colors?.length ? [...options.colors] : [...DEFAULT_COLORS];
    const scalar = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.85 : 1;
    const endAt = performance.now() + durationMs;

    return new Promise((resolve) => {
        const launch = () => {
            const remaining = endAt - performance.now();
            if (remaining <= 0) {
                teardownConfetti();
                resolve();
                return;
            }

            const particleCount = Math.max(32, Math.round(70 * scalar));
            const shared = {
                particleCount,
                spread: 75,
                startVelocity: 36,
                ticks: 260,
                gravity: 0.9,
                decay: 0.92,
                scalar,
                colors,
            } satisfies Parameters<CreateTypes>[0];

            void instance({
                ...shared,
                origin: { x: 0.28, y: 0.35 },
            });

            void instance({
                ...shared,
                origin: { x: 0.72, y: 0.35 },
            });

            window.setTimeout(launch, 160);
        };

        launch();
    });
};

export const celebrateLevelClear = (options?: LevelConfettiOptions): Promise<void> => {
    if (typeof window === 'undefined' || prefersReducedMotion()) {
        return Promise.resolve();
    }

    if (activeCelebration) {
        return activeCelebration;
    }

    const instance = ensureConfettiInstance();
    if (!instance) {
        return Promise.resolve();
    }

    activeCelebration = runConfettiBursts(instance, options).finally(() => {
        activeCelebration = null;
    });

    return activeCelebration;
};
