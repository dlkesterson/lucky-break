import { describe, expect, it, vi } from 'vitest';
import { createRuntimeLifecycle } from 'app/runtime/lifecycle';

const createWindowStub = () => {
    const listeners = new Map<string, Set<() => void>>();
    const addEventListener = vi.fn((event: string, handler: () => void) => {
        let registry = listeners.get(event);
        if (!registry) {
            registry = new Set();
            listeners.set(event, registry);
        }
        registry.add(handler);
    });
    const removeEventListener = vi.fn((event: string, handler: () => void) => {
        listeners.get(event)?.delete(handler);
    });
    const emit = (event: string) => {
        const registry = listeners.get(event);
        if (!registry) {
            return;
        }
        registry.forEach((handler) => {
            handler();
        });
    };
    return {
        addEventListener,
        removeEventListener,
        emit,
    } as const;
};

describe('createRuntimeLifecycle', () => {
    it('attaches the beforeunload listener and runs cleanup handlers in reverse order', () => {
        const windowStub = createWindowStub();
        const lifecycle = createRuntimeLifecycle({ windowRef: windowStub as unknown as Window });
        const calls: string[] = [];

        lifecycle.register(() => {
            calls.push('first');
        });
        lifecycle.register(() => {
            calls.push('second');
        });

        lifecycle.install();
        expect(windowStub.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

        windowStub.emit('beforeunload');

        expect(calls).toEqual(['second', 'first']);
        lifecycle.dispose();
        expect(windowStub.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
        expect(calls).toEqual(['second', 'first']);
    });

    it('allows registered cleanup handlers to unregister before disposal', () => {
        const windowStub = createWindowStub();
        const lifecycle = createRuntimeLifecycle({ windowRef: windowStub as unknown as Window });
        const calls: string[] = [];

        const unregisterFirst = lifecycle.register(() => {
            calls.push('first');
        });
        lifecycle.register(() => {
            calls.push('second');
        });

        unregisterFirst();
        lifecycle.dispose();

        expect(calls).toEqual(['second']);
    });

    it('runs handlers immediately when registering after disposal and guards against errors', () => {
        const windowStub = createWindowStub();
        const lifecycle = createRuntimeLifecycle({ windowRef: windowStub as unknown as Window });
        lifecycle.dispose();

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const handler = vi.fn(() => {
            throw new Error('late failure');
        });

        const unregister = lifecycle.register(handler);

        expect(handler).toHaveBeenCalledTimes(1);
        unregister();
        expect(errorSpy).toHaveBeenCalledWith(
            'Runtime lifecycle handler failed post-disposal',
            expect.any(Error),
        );
        errorSpy.mockRestore();
    });

    it('logs cleanup handler failures while still disposing remaining handlers', () => {
        const windowStub = createWindowStub();
        const lifecycle = createRuntimeLifecycle({ windowRef: windowStub as unknown as Window });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const calls: string[] = [];

        lifecycle.register(() => {
            calls.push('safe');
        });
        lifecycle.register(() => {
            calls.push('before-error');
            throw new Error('cleanup failure');
        });
        lifecycle.register(() => {
            calls.push('after-error');
        });

        lifecycle.dispose();

        expect(calls).toEqual(['after-error', 'before-error', 'safe']);
        expect(errorSpy).toHaveBeenCalledWith(
            'Runtime lifecycle cleanup handler failed',
            expect.any(Error),
        );
        errorSpy.mockRestore();
    });

    it('safely installs without a window reference', () => {
        const lifecycle = createRuntimeLifecycle({ windowRef: null });
        lifecycle.install();
        lifecycle.dispose();
        expect(true).toBe(true);
    });
});
