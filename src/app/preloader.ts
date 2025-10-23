export type PreloaderStatus = 'idle' | 'loading' | 'awaiting-interaction' | 'completed' | 'failed';

const PRELOADER_STYLE_ID = 'lb-preloader-styles';

const ensurePreloaderStyles = (documentRef: Document): void => {
    if (documentRef.getElementById(PRELOADER_STYLE_ID)) {
        return;
    }

    const style = documentRef.createElement('style');
    style.id = PRELOADER_STYLE_ID;
    style.textContent = `
        .lb-preloader {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background:
                radial-gradient(140% 140% at 50% 15%, rgba(255, 211, 115, 0.22), rgba(22, 11, 39, 0.95)),
                linear-gradient(180deg, #120720 0%, #261043 100%);
            color: #ffe9c6;
            font-family: 'Luckiest Guy', 'Overpass', sans-serif;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            overflow: hidden;
        }

        .lb-preloader::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(45% 60% at 50% 50%, rgba(255, 255, 255, 0.12), transparent 70%);
            pointer-events: none;
        }

        .lb-preloader__progress {
            position: relative;
            font-size: clamp(2.5rem, 6vw, 5rem);
            text-align: center;
            line-height: 1;
            text-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
            transition: opacity 200ms ease-out;
        }

        .lb-preloader[data-state='loading'] .lb-preloader__progress,
        .lb-preloader[data-state='awaiting-interaction'] .lb-preloader__progress {
            opacity: 1;
        }

        .lb-preloader__prompt {
            margin-top: 1.75rem;
            padding: 0.85rem 2.4rem;
            border-radius: 999px;
            border: 2px solid rgba(255, 223, 136, 0.85);
            background: rgba(16, 6, 30, 0.78);
            color: #ffe9c6;
            font-family: 'Luckiest Guy', 'Overpass', sans-serif;
            font-size: clamp(1rem, 2.4vw, 1.5rem);
            letter-spacing: 0.08em;
            text-transform: uppercase;
            cursor: pointer;
            transition: transform 140ms ease-out, box-shadow 180ms ease-out;
            backdrop-filter: blur(6px);
        }

        .lb-preloader__prompt:hover,
        .lb-preloader__prompt:focus-visible {
            transform: translateY(-2px);
            box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
        }

        .lb-preloader__prompt:active {
            transform: translateY(1px);
            box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
        }
    `;

    (documentRef.head ?? documentRef.documentElement).appendChild(style);
};

export interface PreloaderProgress {
    readonly loaded: number;
    readonly total: number;
}

export type ProgressReporter = (progress: PreloaderProgress) => void;
export type AssetLoader = (report: ProgressReporter) => Promise<void>;
export type StartCallback = () => void | Promise<void>;
export type ErrorCallback = (error: unknown) => void;

export interface PreloaderOptions {
    readonly container: HTMLElement;
    readonly promptText?: string;
    readonly loadAssets?: AssetLoader;
    readonly onStart?: StartCallback;
    readonly onError?: ErrorCallback;
    readonly document?: Document;
    readonly startEvents?: readonly ('click' | 'keydown' | 'pointerdown')[];
    readonly autoStart?: boolean;
}

export interface PreloaderHandle {
    readonly prepare: () => Promise<void>;
    readonly status: () => PreloaderStatus;
    readonly progress: () => PreloaderProgress;
    readonly destroy: () => void;
}

const DEFAULT_PROMPT_TEXT = 'Tap to start';
const DEFAULT_EVENTS: readonly ('click' | 'keydown' | 'pointerdown')[] = ['click', 'keydown'];

const clampProgress = (value: number): number => (Number.isFinite(value) && value >= 0 ? value : 0);

const defaultLoader: AssetLoader = (report) => {
    report({ loaded: 1, total: 1 });
    return Promise.resolve();
};

const isInteractionRequiredError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    if (error.name === 'BootstrapInteractionRequiredError') {
        return true;
    }

    const code = (error as { code?: string }).code;
    if (code && code.toLowerCase() === 'bootstrap.interaction-required') {
        return true;
    }

    const message = error.message ?? '';
    return message.toLowerCase().includes('interaction required');
};

export const createPreloader = (options: PreloaderOptions): PreloaderHandle => {
    const container = options.container;
    const documentRef = options.document ?? container.ownerDocument ?? document;
    const loadAssets = options.loadAssets ?? defaultLoader;
    const promptText = options.promptText ?? DEFAULT_PROMPT_TEXT;
    const startEvents = options.startEvents ?? DEFAULT_EVENTS;
    const autoStart = options.autoStart ?? false;
    let autoStartEnabled = autoStart;

    ensurePreloaderStyles(documentRef);

    const root = documentRef.createElement('div');
    root.className = 'lb-preloader';
    root.dataset.state = 'idle';

    const progressBar = documentRef.createElement('div');
    progressBar.className = 'lb-preloader__progress';
    progressBar.dataset.role = 'progress';
    progressBar.dataset.progress = '0.00';
    progressBar.textContent = '0%';
    root.appendChild(progressBar);
    container.appendChild(root);

    let status: PreloaderStatus = 'idle';
    let progress: PreloaderProgress = { loaded: 0, total: 0 };
    let promptButton: HTMLButtonElement | null = null;
    const promptListeners: { type: string; handler: EventListener }[] = [];
    const fallbackInteractions: { target: EventTarget; type: string; handler: EventListener }[] = [];
    let preparePromise: Promise<void> | undefined;
    let disposed = false;
    let starting = false;

    const updateState = (next: PreloaderStatus) => {
        status = next;
        root.dataset.state = next;
    };

    const updateProgress = (next: PreloaderProgress) => {
        const loaded = clampProgress(next.loaded);
        const total = Math.max(clampProgress(next.total), 0);
        progress = { loaded, total };

        const ratio = total > 0 ? Math.max(0, Math.min(1, loaded / total)) : 0;
        progressBar.dataset.progress = ratio.toFixed(2);
        progressBar.style.setProperty('--progress', ratio.toString());
        progressBar.textContent = `${Math.round(ratio * 100)}%`;

        if (typeof progressBar.animate === 'function') {
            try {
                progressBar.animate(
                    [
                        { transform: 'translateY(0) scale(1)' },
                        { transform: 'translateY(-6px) scale(1.06)' },
                        { transform: 'translateY(0) scale(1)' },
                    ],
                    { duration: 260, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
                );
            } catch {
                /* ignore animation fallback */
            }
        }
    };

    const removePrompt = () => {
        fallbackInteractions.forEach(({ target, type, handler }) => {
            target.removeEventListener(type, handler);
        });
        fallbackInteractions.length = 0;

        if (!promptButton) {
            return;
        }

        promptListeners.forEach(({ type, handler }) => {
            promptButton?.removeEventListener(type, handler);
        });
        promptListeners.length = 0;
        promptButton.remove();
        promptButton = null;
    };

    const fail = (error: unknown): never => {
        updateState('failed');
        removePrompt();
        options.onError?.(error);
        throw error instanceof Error ? error : new Error(String(error));
    };

    const triggerStart = async (): Promise<void> => {
        if (status !== 'awaiting-interaction' || starting) {
            return;
        }

        starting = true;
        try {
            await options.onStart?.();
            updateState('completed');
            removePrompt();
            if (root.parentElement === container) {
                root.remove();
            }
        } catch (error) {
            if (isInteractionRequiredError(error)) {
                autoStartEnabled = false;
                options.onError?.(error);
                ensurePrompt();
                return;
            }
            fail(error);
        } finally {
            starting = false;
        }
    };

    const handleEvent = (event: Event): void => {
        if (!promptButton) {
            return;
        }

        if (event.type === 'keydown') {
            const key = (event as KeyboardEvent).key;
            if (key !== 'Enter' && key !== ' ') {
                return;
            }
        }

        event.preventDefault();
        void triggerStart().catch(() => {
            /* error already reported via onError */
        });
    };

    const ensureFallbackInteractions = () => {
        if (fallbackInteractions.length > 0) {
            return;
        }

        const pointerHandler: EventListener = (event) => {
            if (status !== 'awaiting-interaction' || starting) {
                return;
            }
            event.preventDefault();
            void triggerStart().catch(() => {
                /* error already reported via onError */
            });
        };

        const keyHandler: EventListener = (event) => {
            if (status !== 'awaiting-interaction' || starting) {
                return;
            }
            const key = (event as KeyboardEvent).key;
            if (key !== 'Enter' && key !== ' ') {
                return;
            }
            event.preventDefault();
            void triggerStart().catch(() => {
                /* error already reported via onError */
            });
        };

        root.addEventListener('pointerdown', pointerHandler);
        fallbackInteractions.push({ target: root, type: 'pointerdown', handler: pointerHandler });

        container.addEventListener('pointerdown', pointerHandler);
        fallbackInteractions.push({ target: container, type: 'pointerdown', handler: pointerHandler });

        documentRef.addEventListener('keydown', keyHandler);
        fallbackInteractions.push({ target: documentRef, type: 'keydown', handler: keyHandler });
    };

    const ensurePrompt = () => {
        if (disposed) {
            return;
        }

        if (autoStartEnabled) {
            updateState('awaiting-interaction');
            void triggerStart().catch(() => {
                /* errors surfaced via fail */
            });
            return;
        }

        if (promptButton) {
            updateState('awaiting-interaction');
            ensureFallbackInteractions();
            return;
        }

        promptButton = documentRef.createElement('button');
        promptButton.type = 'button';
        promptButton.className = 'lb-preloader__prompt';
        promptButton.dataset.role = 'start-prompt';
        promptButton.textContent = promptText;

        startEvents.forEach((type) => {
            const handler = handleEvent as EventListener;
            promptButton?.addEventListener(type, handler);
            promptListeners.push({ type, handler });
        });

        root.appendChild(promptButton);
        updateState('awaiting-interaction');
        ensureFallbackInteractions();
    };

    const prepare = () => {
        if (preparePromise) {
            return preparePromise;
        }

        if (disposed) {
            return Promise.resolve();
        }

        const run = (async () => {
            updateState('loading');

            try {
                await loadAssets((event) => {
                    if (disposed) {
                        return;
                    }
                    updateProgress(event);
                });

                if (progress.total === 0) {
                    updateProgress({ loaded: 1, total: 1 });
                }

                ensurePrompt();
            } catch (error) {
                fail(error);
            }
        })();

        preparePromise = run.catch((error) => {
            preparePromise = undefined;
            throw error;
        });

        return preparePromise;
    };

    const destroy = () => {
        if (disposed) {
            return;
        }

        disposed = true;
        removePrompt();
        if (root.parentElement === container) {
            root.remove();
        }
    };

    return {
        prepare,
        status: () => status,
        progress: () => ({ ...progress }),
        destroy,
    };
};
