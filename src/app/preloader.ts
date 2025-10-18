export type PreloaderStatus = 'idle' | 'loading' | 'awaiting-interaction' | 'completed' | 'failed';

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

export const createPreloader = (options: PreloaderOptions): PreloaderHandle => {
    const container = options.container;
    const documentRef = options.document ?? container.ownerDocument ?? document;
    const loadAssets = options.loadAssets ?? defaultLoader;
    const promptText = options.promptText ?? DEFAULT_PROMPT_TEXT;
    const startEvents = options.startEvents ?? DEFAULT_EVENTS;

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
    };

    const removePrompt = () => {
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

    const ensurePrompt = () => {
        if (disposed || promptButton) {
            updateState('awaiting-interaction');
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
