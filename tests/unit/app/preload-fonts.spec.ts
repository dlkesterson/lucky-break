import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadFonts } from 'app/preload-fonts';

const getFontsDescriptor = (): PropertyDescriptor | undefined => {
    return Object.getOwnPropertyDescriptor(Document.prototype, 'fonts')
        ?? Object.getOwnPropertyDescriptor(document, 'fonts');
};

const restoreFontsDescriptor = (descriptor: PropertyDescriptor | undefined): void => {
    if (descriptor) {
        Object.defineProperty(document, 'fonts', descriptor);
    } else {
        Reflect.deleteProperty(document, 'fonts');
    }
};

describe('preloadFonts', () => {
    let originalDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
        originalDescriptor = getFontsDescriptor();
    });

    afterEach(() => {
        restoreFontsDescriptor(originalDescriptor);
    });

    it('loads fonts sequentially and reports progress updates', async () => {
    const pendingLoads: (() => void)[] = [];
        const load = vi.fn((descriptor: string) => {
            expect(typeof descriptor).toBe('string');
            return new Promise<void>((resolve) => {
                pendingLoads.push(resolve);
            });
        });

        let readyResolve: (() => void) | undefined;
        const ready = new Promise<void>((resolve) => {
            readyResolve = resolve;
        });

        Object.defineProperty(document, 'fonts', {
            configurable: true,
            value: {
                load,
                ready,
            },
        });

        const report = vi.fn();
        const descriptors = ['1rem "Orbitron"', 'bold 900 1rem "Roboto Mono"', 'italic 600 0.9rem "Roboto"'];
        const completion = preloadFonts(descriptors, report);

        expect(report).toHaveBeenCalledTimes(1);
        expect(report).toHaveBeenNthCalledWith(1, { loaded: 0, total: descriptors.length });

        const advance = async () => {
            while (pendingLoads.length === 0) {
                await Promise.resolve();
            }
            const resolve = pendingLoads.shift();
            resolve?.();
            await Promise.resolve();
        };

        await advance();
        await advance();
        await advance();

        readyResolve?.();
        await completion;

        expect(load).toHaveBeenCalledTimes(descriptors.length);
        expect(load.mock.calls.map(([descriptor]) => descriptor)).toEqual(descriptors);
        expect(report.mock.calls.map(([value]) => value)).toEqual([
            { loaded: 0, total: descriptors.length },
            { loaded: 1, total: descriptors.length },
            { loaded: 2, total: descriptors.length },
            { loaded: 3, total: descriptors.length },
            { loaded: 3, total: descriptors.length },
        ]);
    });

    it('completes immediately when the fonts API is unavailable', async () => {
        Reflect.deleteProperty(document, 'fonts');
        const report = vi.fn();

        await preloadFonts(['1rem "Fallback"'], report);

        expect(report).toHaveBeenCalledTimes(2);
        expect(report).toHaveBeenNthCalledWith(1, { loaded: 0, total: 1 });
        expect(report).toHaveBeenNthCalledWith(2, { loaded: 1, total: 1 });
    });
});
