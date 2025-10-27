export interface RuntimeLifecycleOptions {
    readonly windowRef?: Window | null;
}

export interface RuntimeLifecycle {
    register(handler: () => void): () => void;
    install(): void;
    dispose(): void;
}

const defaultWindow = (): Window | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    return window;
};

export const createRuntimeLifecycle = ({ windowRef }: RuntimeLifecycleOptions = {}): RuntimeLifecycle => {
    const targetWindow = windowRef ?? defaultWindow();
    const cleanupHandlers: (() => void)[] = [];
    let disposed = false;

    const runCleanup = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        for (let index = cleanupHandlers.length - 1; index >= 0; index -= 1) {
            const handler = cleanupHandlers[index];
            try {
                handler();
            } catch (error) {
                console.error('Runtime lifecycle cleanup handler failed', error);
            }
        }
        cleanupHandlers.length = 0;
    };

    const beforeUnloadHandler = () => {
        runCleanup();
    };

    const install = () => {
        if (!targetWindow) {
            return;
        }
        targetWindow.addEventListener('beforeunload', beforeUnloadHandler);
    };

    const dispose = () => {
        if (targetWindow) {
            targetWindow.removeEventListener('beforeunload', beforeUnloadHandler);
        }
        runCleanup();
    };

    const register = (handler: () => void) => {
        if (disposed) {
            try {
                handler();
            } catch (error) {
                console.error('Runtime lifecycle handler failed post-disposal', error);
            }
            return () => undefined;
        }
        cleanupHandlers.push(handler);
        return () => {
            const index = cleanupHandlers.indexOf(handler);
            if (index >= 0) {
                cleanupHandlers.splice(index, 1);
            }
        };
    };

    return {
        register,
        install,
        dispose,
    } satisfies RuntimeLifecycle;
};
