import '@testing-library/jest-dom/vitest';
import { JSDOM } from 'jsdom';
import { afterEach, vi } from 'vitest';

// Provide a minimal DOM using jsdom when the chosen test environment lacks window/document.
if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');

    const { window } = dom;
    globalThis.window = window as unknown as typeof globalThis.window;
    globalThis.document = window.document;
    globalThis.navigator = window.navigator;

    // Expose commonly used window properties on the global object for convenience.
    Object.getOwnPropertyNames(window).forEach((property) => {
        if (!(property in globalThis)) {
            Object.defineProperty(globalThis, property, {
                configurable: true,
                get: () => (window as any)[property],
            });
        }
    });
}

afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
});

if (typeof globalThis.requestAnimationFrame === 'undefined') {
    const raf = (callback: FrameRequestCallback): number => {
        return setTimeout(() => {
            callback(performance.now());
        }, 16) as unknown as number;
    };

    vi.stubGlobal('requestAnimationFrame', raf);
}

if (typeof globalThis.cancelAnimationFrame === 'undefined') {
    const cancelRaf = (handle: number): void => {
        clearTimeout(handle);
    };

    vi.stubGlobal('cancelAnimationFrame', cancelRaf);
}

if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext) {
    (HTMLCanvasElement.prototype.getContext as unknown) = vi.fn(() => null);
}

// Mock Touch API for testing
if (typeof globalThis.Touch === 'undefined') {
    globalThis.Touch = class Touch {
        readonly identifier: number;
        readonly target: EventTarget;
        readonly clientX: number;
        readonly clientY: number;
        readonly screenX: number;
        readonly screenY: number;
        readonly pageX: number;
        readonly pageY: number;

        constructor(options: {
            identifier: number;
            target: EventTarget;
            clientX?: number;
            clientY?: number;
            screenX?: number;
            screenY?: number;
            pageX?: number;
            pageY?: number;
        }) {
            this.identifier = options.identifier;
            this.target = options.target;
            this.clientX = options.clientX ?? 0;
            this.clientY = options.clientY ?? 0;
            this.screenX = options.screenX ?? 0;
            this.screenY = options.screenY ?? 0;
            this.pageX = options.pageX ?? 0;
            this.pageY = options.pageY ?? 0;
        }
    } as any;
}
