import { loadSoundbank, prefetchSoundbankAssets, countSoundbankAssets } from 'audio/soundbank';
import { listAllStaticAssets, verifyAssetManifest } from 'config/assets';
import { GameTheme } from 'render/theme';
import { createRandomManager } from 'util/random';

import { createGameRuntime, type GameRuntimeHandle } from './game-runtime';
import { createPreloader } from './preloader';
import { createReplayBuffer, type ReplayRecording } from './replay-buffer';

export interface LuckyBreakOptions {
    readonly container?: HTMLElement;
    readonly seed?: number;
}

export interface LuckyBreakHandle {
    readonly getReplay: () => ReplayRecording;
    readonly withSeed: (seed: number) => void;
    readonly getSeed: () => number;
}

const parsePrimaryFontFamily = (value: string): string => {
    const primary = value.split(',')[0]?.trim() ?? value;
    return primary.replace(/["']/g, '');
};

const configureContainer = (container: HTMLElement): void => {
    container.style.position = 'relative';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = '#000000';
};

const loadFonts = async (descriptors: readonly string[], report: (loaded: number) => void): Promise<void> => {
    const { preloadFonts } = await import('./preload-fonts');
    await preloadFonts([...descriptors], (progress) => report(progress.loaded));
};

const IS_TEST_ENV = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

export function bootstrapLuckyBreak(options: LuckyBreakOptions = {}): LuckyBreakHandle {
    const container = options.container ?? document.body;
    configureContainer(container);

    const random = createRandomManager(typeof options.seed === 'number' ? options.seed : null);
    const replayBuffer = createReplayBuffer();
    replayBuffer.begin(random.seed());

    const resolveInitialLayout = () => {
        if (typeof window === 'undefined') {
            return {
                orientation: 'landscape' as const,
                dimensions: { width: 1280, height: 720 },
                isMobile: false,
            };
        }

        const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
        const prefersPortrait = window.innerHeight > window.innerWidth;
        const usePortraitLayout = isMobile || prefersPortrait;

        return usePortraitLayout
            ? {
                orientation: 'portrait' as const,
                dimensions: { width: 720, height: 1280 },
                isMobile,
            }
            : {
                orientation: 'landscape' as const,
                dimensions: { width: 1280, height: 720 },
                isMobile,
            };
    };

    const initialLayout = resolveInitialLayout();

    let runtime: GameRuntimeHandle | null = null;

    const primaryFont = parsePrimaryFontFamily(GameTheme.font);
    const monoFont = parsePrimaryFontFamily(GameTheme.monoFont ?? GameTheme.font);
    const fontDescriptors: string[] = [
        `400 32px "${primaryFont}"`,
        `600 56px "${primaryFont}"`,
        `700 64px "${primaryFont}"`,
    ];

    if (monoFont && monoFont !== primaryFont) {
        fontDescriptors.push(`400 28px "${monoFont}"`, `600 32px "${monoFont}"`);
    }

    const preloader = createPreloader({
        container,
        autoStart: true,
        loadAssets: async (reportProgress) => {
            const soundbank = await loadSoundbank();
            const audioAssetCount = countSoundbankAssets(soundbank);
            const manifestReport = verifyAssetManifest();
            if (manifestReport.missing.length > 0) {
                throw new Error(`Missing static assets: ${manifestReport.missing.join(', ')}`);
            }
            const staticAssets = listAllStaticAssets();
            const totalSteps = fontDescriptors.length + audioAssetCount + staticAssets.length;

            let completed = 0;
            const pushProgress = () => reportProgress({ loaded: completed, total: totalSteps });
            pushProgress();

            const advance = (delta: number) => {
                if (delta <= 0) {
                    return;
                }
                completed += delta;
                pushProgress();
            };

            let fontLoaded = 0;
            await loadFonts(fontDescriptors, (loadedCount) => {
                const clamped = Math.min(fontDescriptors.length, Math.max(0, loadedCount));
                const delta = clamped - fontLoaded;
                if (delta > 0) {
                    fontLoaded += delta;
                    advance(delta);
                }
            });

            let audioLoaded = 0;
            await prefetchSoundbankAssets(soundbank, ({ loaded }) => {
                const delta = loaded - audioLoaded;
                if (delta > 0) {
                    audioLoaded += delta;
                    advance(delta);
                }
            });

            for (const asset of staticAssets) {
                await fetch(asset.url, { cache: 'force-cache' });
                advance(1);
            }

            if (import.meta.env.DEV) {
                console.info('[assets] verified static asset manifest', {
                    total: manifestReport.total,
                });
            }

        },
        onStart: async () => {
            runtime = await createGameRuntime({
                container,
                playfieldDimensions: initialLayout.dimensions,
                layoutOrientation: initialLayout.orientation,
                uiProfile: initialLayout.isMobile ? 'mobile' : 'desktop',
                random,
                replayBuffer,
                onAudioBlocked: (error) => {
                    if (!IS_TEST_ENV) {
                        console.warn('Audio context suspended; will retry after the first user interaction.', error);
                    }
                },
            });
        },
        onError: (error) => {
            if (!IS_TEST_ENV) {
                console.error('Failed to bootstrap Lucky Break.', error);
            }
        },
    });

    const handlePrepareError = (error: unknown) => {
        if (!IS_TEST_ENV) {
            console.error(error);
        }
    };

    preloader.prepare().catch(handlePrepareError);

    const getElapsed = () => runtime?.getSessionElapsedSeconds() ?? 0;

    const getReplay = (): ReplayRecording => {
        replayBuffer.markTime(getElapsed());
        return replayBuffer.snapshot();
    };

    const withSeed = (seed: number): void => {
        const normalized = random.setSeed(seed);
        replayBuffer.recordSeed(normalized, getElapsed());
    };

    const getSeed = (): number => random.seed();

    return {
        getReplay,
        withSeed,
        getSeed,
    } satisfies LuckyBreakHandle;
}

const appContainer = document.getElementById('app');
if (appContainer) {
    bootstrapLuckyBreak({ container: appContainer });
}
