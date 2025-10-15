import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

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
