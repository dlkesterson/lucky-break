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
