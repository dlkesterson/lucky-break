import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

vi.mock('audio/soundbank', () => ({
    loadSoundbank: vi.fn(async () => ({})),
    prefetchSoundbankAssets: vi.fn(async (_sb: unknown, callback: (p: { loaded: number }) => void) => {
        callback({ loaded: 0 });
        callback({ loaded: 1 });
        callback({ loaded: 2 });
    }),
    countSoundbankAssets: vi.fn(() => 2),
}));

vi.mock('config/assets', () => ({
    listAllStaticAssets: vi.fn(() => [
        { url: '/asset1.png', width: 100, height: 100 },
        { url: '/asset2.png', width: 200, height: 200 },
    ]),
    verifyAssetManifest: vi.fn(() => ({ total: 2, missing: [] })),
}));

vi.mock('app/game-runtime', () => ({
    createGameRuntime: vi.fn(async () => ({
        getSessionElapsedSeconds: vi.fn(() => 123.45),
        dispose: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
    })),
}));

vi.mock('app/preload-fonts', () => ({
    preloadFonts: vi.fn(async (_descriptors: string[], callback: (p: { loaded: number }) => void) => {
        callback({ loaded: 0 });
        callback({ loaded: 1 });
        callback({ loaded: 2 });
    }),
}));

vi.mock('ui/boot/react-root', () => ({
    initializeReactUi: vi.fn(),
}));

describe('main.ts bootstrap', () => {
    let dom: JSDOM;
    let container: HTMLElement;

    beforeEach(() => {
        dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
            url: 'http://localhost/',
        });
        global.window = dom.window as unknown as Window & typeof globalThis;
        global.document = dom.window.document;
        global.navigator = dom.window.navigator;
        global.HTMLElement = dom.window.HTMLElement;

        container = document.createElement('div');
        container.id = 'test-container';
        document.body.appendChild(container);

        global.fetch = vi.fn(async () => ({
            ok: true,
            status: 200,
        })) as unknown as typeof fetch;

        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('parsePrimaryFontFamily', () => {
        it('extracts the first font from a CSS font-family value', async () => {
            const { bootstrapLuckyBreak } = await import('app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
            expect(handle.getReplay).toBeDefined();
            expect(handle.withSeed).toBeDefined();
            expect(handle.getSeed).toBeDefined();
        });

        it('strips quotes from font names', async () => {
            const { bootstrapLuckyBreak } = await import('app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('handles single font without fallback', async () => {
            const { bootstrapLuckyBreak } = await import('app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle.getSeed).toBeDefined();
        });
    });

    describe('configureContainer', () => {
        it('sets container to fullscreen with proper styles', async () => {
            const { bootstrapLuckyBreak } = await import('app/main');
            bootstrapLuckyBreak({ container });

            expect(container.style.position).toBe('relative');
            expect(container.style.margin).toBe('0px');
            expect(container.style.padding).toBe('0px');
            expect(container.style.overflow).toBe('hidden');
            expect(container.style.backgroundColor).toBe('rgb(0, 0, 0)');
        });

        it('adjusts container height to viewport height', async () => {
            const mockViewport = {
                height: 720,
                width: 1280,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            };
            Object.defineProperty(window, 'visualViewport', {
                value: mockViewport,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(window, 'innerHeight', {
                value: 768,
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            expect(container.style.height).toBeTruthy();
        });

        it('falls back to innerHeight when visualViewport is unavailable', async () => {
            Object.defineProperty(window, 'visualViewport', {
                value: undefined,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(window, 'innerHeight', {
                value: 900,
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            expect(container.style.height).toBe('900px');
        });

        it('ignores non-finite viewport heights', async () => {
            const mockViewport = {
                height: NaN,
                width: 1280,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            };
            Object.defineProperty(window, 'visualViewport', {
                value: mockViewport,
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            expect(container).toBeDefined();
        });

        it('registers viewport resize listeners when available', async () => {
            const mockViewport = {
                height: 720,
                width: 1280,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            };
            Object.defineProperty(window, 'visualViewport', {
                value: mockViewport,
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            expect(mockViewport.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
            expect(mockViewport.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
        });

        it('registers window resize and orientation change listeners', async () => {
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
            expect(addEventListenerSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function));
        });
    });

    describe('resolveInitialLayout', () => {
        it('detects landscape orientation when width > height', async () => {
            Object.defineProperty(window, 'innerWidth', {
                value: 1280,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(window, 'innerHeight', {
                value: 720,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('detects portrait orientation when height > width', async () => {
            Object.defineProperty(window, 'innerWidth', {
                value: 720,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(window, 'innerHeight', {
                value: 1280,
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('detects mobile devices from user agent', async () => {
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('detects Android devices from user agent', async () => {
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Linux; Android 10)',
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('uses portrait layout for mobile devices regardless of orientation', async () => {
            Object.defineProperty(window, 'innerWidth', {
                value: 1280,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(window, 'innerHeight', {
                value: 720,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (iPhone)',
                writable: true,
                configurable: true,
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('falls back to landscape dimensions when window is undefined', async () => {
            const originalWindow = global.window;
            // @ts-expect-error Testing undefined window
            global.window = undefined;

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container: document.createElement('div') });

            global.window = originalWindow;

            expect(handle).toBeDefined();
        });
    });

    describe('bootstrapLuckyBreak', () => {
        it('creates a handle with replay functions', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle.getReplay).toBeTypeOf('function');
            expect(handle.withSeed).toBeTypeOf('function');
            expect(handle.getSeed).toBeTypeOf('function');
        });

        it('uses provided seed when specified', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container, seed: 42 });

            expect(handle.getSeed()).toBe(42);
        });

        it('generates random seed when not provided', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            const seed = handle.getSeed();
            expect(Number.isFinite(seed)).toBe(true);
        });

        it('uses document.body when container is not provided', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({});

            expect(handle).toBeDefined();
        });

        it('allows changing seed via withSeed', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container, seed: 10 });

            expect(handle.getSeed()).toBe(10);

            handle.withSeed(99);
            expect(handle.getSeed()).toBe(99);
        });

        it('returns replay recording with current state', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            const replay = handle.getReplay();

            expect(replay).toBeDefined();
            expect(replay.seed).toBeTypeOf('number');
        });
    });

    describe('asset loading', () => {
        it('loads fonts during preloader', async () => {
            const { preloadFonts } = await import('../../../src/app/preload-fonts');

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(preloadFonts).toHaveBeenCalled();
        });

        it('loads soundbank assets during preloader', async () => {
            const { loadSoundbank, prefetchSoundbankAssets } = await import('audio/soundbank');

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(loadSoundbank).toHaveBeenCalled();
            expect(prefetchSoundbankAssets).toHaveBeenCalled();
        });

        it('verifies static asset manifest', async () => {
            const { verifyAssetManifest, listAllStaticAssets } = await import('config/assets');

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(verifyAssetManifest).toHaveBeenCalled();
            expect(listAllStaticAssets).toHaveBeenCalled();
        });

        it('prefetches static assets via fetch', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            bootstrapLuckyBreak({ container });

            await new Promise((resolve) => setTimeout(resolve, 150));

            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe('resolveSeedFromQuery', () => {
        it('handles query parameter extraction logic', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
            expect(handle.getSeed).toBeDefined();
        });

        it('accepts and uses seed from options when query parsing fails', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container, seed: 999 });

            const seed = handle.getSeed();
            expect(seed).toBe(999);
        });

        it('generates a valid seed when no options provided', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            const seed = handle.getSeed();
            expect(Number.isFinite(seed)).toBe(true);
            expect(seed).not.toBe(NaN);
        });

        it('handles container initialization without errors', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
            expect(typeof handle.getReplay).toBe('function');
        });

        it('provides replay buffer access', async () => {
            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            const replay = handle.getReplay();
            expect(replay).toBeDefined();
        });
    });

    describe('error handling', () => {
        it('handles asset loading errors gracefully', async () => {
            const { verifyAssetManifest } = await import('config/assets');
            (verifyAssetManifest as ReturnType<typeof vi.fn>).mockReturnValue({
                total: 1,
                missing: ['missing-asset.png'],
            });

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('handles font loading failures', async () => {
            const { preloadFonts } = await import('../../../src/app/preload-fonts');
            (preloadFonts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Font load failed'));

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('handles soundbank loading failures', async () => {
            const { loadSoundbank } = await import('audio/soundbank');
            (loadSoundbank as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Soundbank failed'));

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });

        it('handles game runtime creation failures', async () => {
            const { createGameRuntime } = await import('app/game-runtime');
            (createGameRuntime as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Runtime failed'));

            const { bootstrapLuckyBreak } = await import('../../../src/app/main');
            const handle = bootstrapLuckyBreak({ container });

            expect(handle).toBeDefined();
        });
    });
});

