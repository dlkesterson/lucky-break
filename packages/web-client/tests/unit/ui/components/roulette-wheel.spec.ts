import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { RouletteWheel } from '../../../../src/ui/scenes/casino-hub/RouletteWheel';

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe('RouletteWheel', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latestCallback: FrameRequestCallback | null;
    let frameId: number;
    let requestAnimationFrameSpy: Mock<[FrameRequestCallback], number>;
    let cancelAnimationFrameSpy: Mock<[number], void>;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    beforeEach(() => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        latestCallback = null;
        frameId = 0;
        requestAnimationFrameSpy = vi.fn<[FrameRequestCallback], number>((callback) => {
            latestCallback = callback;
            frameId += 1;
            return frameId;
        });
        cancelAnimationFrameSpy = vi.fn<[number], void>();
        globalThis.requestAnimationFrame =
            requestAnimationFrameSpy as unknown as typeof globalThis.requestAnimationFrame;
        globalThis.cancelAnimationFrame =
            cancelAnimationFrameSpy as unknown as typeof globalThis.cancelAnimationFrame;
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        globalThis.requestAnimationFrame = originalRequestAnimationFrame;
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
        vi.restoreAllMocks();
    });

    it('rotates at a consistent rate based on frame deltas', () => {
        act(() => {
            root.render(createElement(RouletteWheel, { accentColor: '#ff00ff' }));
        });

        expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
        expect(typeof latestCallback).toBe('function');

        const disk = container.querySelector('[data-testid="roulette-disk"]') ?? container.querySelector('[style*=conic-gradient]');
        expect(disk).not.toBeNull();

        const invokeFrame = (timestamp: number) => {
            act(() => {
                latestCallback?.(timestamp);
            });
        };

        invokeFrame(0);
        const angleAfterFirstFrame = extractAngle(disk as HTMLElement);
        expect(angleAfterFirstFrame).toBeCloseTo(0);

        invokeFrame(1000);
        const angleAfterSecondFrame = extractAngle(disk as HTMLElement);
        expect(angleAfterSecondFrame).toBeCloseTo(0.12, 5);

        invokeFrame(1016);
        const angleAfterThirdFrame = extractAngle(disk as HTMLElement);
        expect(angleAfterThirdFrame).toBeCloseTo(0.12192, 5);
    });

    it('cancels the pending animation frame on unmount', () => {
        act(() => {
            root.render(createElement(RouletteWheel, { accentColor: '#ffaa00' }));
        });

        expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
        const scheduledFrame = frameId;

        act(() => {
            latestCallback?.(16);
        });

        const nextScheduledFrame = frameId;

        act(() => {
            root.unmount();
        });

        expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(nextScheduledFrame);
        expect(cancelAnimationFrameSpy).not.toHaveBeenCalledWith(scheduledFrame);
    });
});

function extractAngle(element: HTMLElement): number {
    const match = element.style.transform.match(/rotate\(([-\d.]+)deg\)/);
    return match ? parseFloat(match[1]) : Number.NaN;
}
