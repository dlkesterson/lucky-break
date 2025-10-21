import { createStage, type StageHandle } from 'render/stage';
import { GameTheme } from 'render/theme';
import { createEventBus, type LuckyBreakEventBus } from 'app/events';
import {
    createToneScheduler,
    createReactiveAudioLayer,
    type ReactiveAudioGameState,
    type ToneScheduler,
    type ReactiveAudioLayer,
} from 'audio/scheduler';
import { createSfxRouter, type SfxRouter } from 'audio/sfx';
import { createMusicDirector, type MusicDirector } from 'audio/music-director';
import { loadSoundbank, requireSoundbankEntry } from 'audio/soundbank';
import { createSubject, type Subject } from 'util/observable';
import { resolveViewportSize } from 'render/viewport';
import { Players, Panner, Volume, Transport, getContext } from 'tone';

const AUDIO_RESUME_TIMEOUT_MS = 250;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
    if (value === null || value === undefined) {
        return false;
    }
    const candidate = value as { then?: unknown };
    return typeof candidate.then === 'function';
};

const waitForPromise = async (
    promiseLike: PromiseLike<unknown>,
    timeoutMs: number,
): Promise<void> => {
    let settled = false;
    const guarded = Promise.resolve(promiseLike).finally(() => {
        settled = true;
    });

    try {
        await Promise.race([guarded, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
    } catch (error) {
        throw error;
    } finally {
        if (!settled) {
            void guarded.catch(() => undefined);
        }
    }
};

const isAutoplayBlockedError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    if (error.name === 'NotAllowedError') {
        return true;
    }

    const message = error.message ?? '';
    return message.includes('was not allowed to start');
};

const getToneAudioContext = (): AudioContext => getContext().rawContext as AudioContext;

const ensureToneAudio = async (): Promise<void> => {
    const context = getToneAudioContext();
    if (context.state === 'suspended') {
        const result = context.resume();
        if (isPromiseLike(result)) {
            await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
        }
    }

    if (Transport.state !== 'started') {
        const result = Transport.start();
        if (isPromiseLike(result)) {
            await waitForPromise(result, AUDIO_RESUME_TIMEOUT_MS);
        }
    }
};

export interface PulseControls {
    boostCombo(payload: { ring: number; ball: number }): void;
    boostPowerUp(payload: { paddle: number }): void;
}

export interface GameInitializerOptions {
    readonly container: HTMLElement;
    readonly playfieldSize: {
        readonly width: number;
        readonly height: number;
    };
    readonly pulseControls: PulseControls;
    readonly onAudioBlocked?: (error: unknown) => void;
}

export interface GameInitializerResult {
    readonly stage: StageHandle;
    readonly bus: LuckyBreakEventBus;
    readonly scheduler: ToneScheduler;
    readonly audioState$: Subject<ReactiveAudioGameState>;
    readonly reactiveAudioLayer: ReactiveAudioLayer;
    readonly router: SfxRouter;
    readonly musicDirector: MusicDirector;
    readonly renderStageOnce: () => void;
    readonly renderStageSoon: () => void;
    readonly cleanupAudioUnlock: () => void;
    readonly dispose: () => void;
}

export const createGameInitializer = async ({
    container,
    playfieldSize,
    pulseControls,
    onAudioBlocked,
}: GameInitializerOptions): Promise<GameInitializerResult> => {
    await ensureToneAudio().catch((error) => {
        if (isAutoplayBlockedError(error)) {
            onAudioBlocked?.(error);
            return;
        }
        throw error;
    });

    const soundbank = await loadSoundbank();

    const stage = await createStage({ parent: container, theme: GameTheme });
    stage.layers.playfield.sortableChildren = true;
    stage.layers.effects.sortableChildren = true;

    const canvas = stage.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.display = 'block';
    canvas.style.backgroundColor = '#000000';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';

    const bus = createEventBus();
    const scheduler = createToneScheduler({ lookAheadMs: 120 });
    const audioState$ = createSubject<ReactiveAudioGameState>();
    const reactiveAudioLayer = createReactiveAudioLayer(audioState$, Transport, {
        lookAheadMs: scheduler.lookAheadMs,
        onFill: (event) => {
            if (event.type === 'combo') {
                pulseControls.boostCombo({ ring: 0.45, ball: 0.5 });
            } else if (event.type === 'power-up') {
                pulseControls.boostPowerUp({ paddle: 0.6 });
            }
        },
    });
    const calmLoop = requireSoundbankEntry(soundbank, 'calm');
    const intenseLoop = requireSoundbankEntry(soundbank, 'intense');
    const melodyLoop = requireSoundbankEntry(soundbank, 'melody');
    const musicDirector = createMusicDirector({
        transport: Transport,
        layers: {
            calm: {
                url: calmLoop.url,
                baseLevel: calmLoop.gain ?? 0.68,
            },
            intense: {
                url: intenseLoop.url,
                baseLevel: intenseLoop.gain ?? 0.9,
            },
            melody: {
                url: melodyLoop.url,
                baseLevel: melodyLoop.gain ?? 0.8,
            },
        },
    });
    musicDirector.setState({ lives: 3, combo: 0 });

    const toDecibels = (gain: number): number => {
        if (gain <= 0) {
            return -60;
        }
        return Math.max(-30, Math.min(0, 20 * Math.log10(gain)));
    };

    const toPlaybackRate = (detuneCents: number): number => {
        const rate = 2 ** (detuneCents / 1200);
        return Math.max(0.5, Math.min(2, rate));
    };

    const brickSampleIds = ['brick-hit-low', 'brick-hit-mid', 'brick-hit-high'] as const;
    const brickSampleUrls = brickSampleIds.reduce<Record<string, string>>((acc, id) => {
        const entry = requireSoundbankEntry(soundbank, id);
        acc[id] = entry.url;
        return acc;
    }, {});

    const volume = new Volume(-6);
    const panner = new Panner(0);
    volume.connect(panner);
    panner.toDestination();

    let brickPlayers: Players | null = null;
    let brickPlayersPromise: Promise<Players> | null = null;

    const loadBrickPlayers = async (): Promise<Players> => {
        if (brickPlayers) {
            return brickPlayers;
        }

        brickPlayersPromise ??= new Promise<Players>((resolve, reject) => {
            try {
                const players = new Players(brickSampleUrls, () => resolve(players));
                players.connect(volume);
            } catch (error) {
                const reason = error instanceof Error ? error : new Error(String(error));
                reject(reason);
            }
        })
            .then((players) => {
                brickPlayers = players;
                return players;
            })
            .finally(() => {
                brickPlayersPromise = null;
            });

        return brickPlayersPromise;
    };

    const toneAudioContext = getToneAudioContext();
    const isToneAudioReady = () => toneAudioContext.state === 'running' && Transport.state === 'started';

    const handleAudioBootstrapError = (error: unknown) => {
        if (isAutoplayBlockedError(error)) {
            onAudioBlocked?.(error);
            scheduleAudioUnlock();
            return;
        }
        console.error('Failed to initialize brick hit audio buffers.', error);
    };

    const primeBrickPlayers = () => {
        void loadBrickPlayers().catch(handleAudioBootstrapError);
    };

    let audioUnlockDocument: Document | null = null;
    let audioUnlockHandler: ((event: Event) => void) | null = null;

    const cleanupAudioUnlock = () => {
        if (!audioUnlockHandler || !audioUnlockDocument) {
            return;
        }

        audioUnlockDocument.removeEventListener('pointerdown', audioUnlockHandler);
        audioUnlockDocument.removeEventListener('keydown', audioUnlockHandler);
        audioUnlockHandler = null;
        audioUnlockDocument = null;
    };

    const scheduleAudioUnlock = () => {
        if (audioUnlockHandler) {
            return;
        }

        if (isToneAudioReady()) {
            return;
        }

        const docRef = container.ownerDocument ?? document;
        audioUnlockDocument = docRef;

        audioUnlockHandler = () => {
            if (isToneAudioReady()) {
                cleanupAudioUnlock();
                return;
            }

            void ensureToneAudio()
                .catch((unlockError) => {
                    console.warn('Audio unlock attempt deferred until interaction', unlockError);
                    onAudioBlocked?.(unlockError);
                })
                .finally(() => {
                    if (isToneAudioReady()) {
                        cleanupAudioUnlock();
                    }
                });
            primeBrickPlayers();
        };

        docRef.addEventListener('pointerdown', audioUnlockHandler);
        docRef.addEventListener('keydown', audioUnlockHandler);
    };

    if (!isToneAudioReady()) {
        void ensureToneAudio().catch((audioInitError) => {
            console.warn('Audio context suspended; will retry after the first user interaction.', audioInitError);
            onAudioBlocked?.(audioInitError);
        });
    }
    scheduleAudioUnlock();
    primeBrickPlayers();

    const lastPlayerStart = new Map<string, number>();

    const router = createSfxRouter({
        bus,
        scheduler,
        brickSampleIds,
        trigger: (descriptor) => {
            void ensureToneAudio().catch(console.warn);
            const players = brickPlayers;
            if (!players) {
                primeBrickPlayers();
                return;
            }

            const player = players.player(descriptor.id);
            if (!player) {
                return;
            }

            const nowTime = scheduler.context.currentTime;
            const lastStart = lastPlayerStart.get(descriptor.id) ?? -Infinity;
            const minTime = Math.max(nowTime + 0.01, lastStart + 0.01);
            const targetTime = Math.max(descriptor.time, minTime);

            player.playbackRate = toPlaybackRate(descriptor.detune);
            player.volume.value = toDecibels(descriptor.gain);
            panner.pan.setValueAtTime(descriptor.pan, targetTime);
            player.start(targetTime);
            lastPlayerStart.set(descriptor.id, targetTime);
        },
    });

    const renderStageOnce = () => {
        stage.update(0);
        stage.app.render();
    };

    const renderStageSoon = () => {
        renderStageOnce();
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => {
                renderStageOnce();
            });
        }
    };

    const resolveViewportDimensions = () => {
        const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : playfieldSize.width;
        const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : playfieldSize.height;
        return resolveViewportSize({
            container,
            fallbackWidth,
            fallbackHeight,
        });
    };

    const handleResize = () => {
        const size = resolveViewportDimensions();
        stage.resize(size);
    };

    let resizeObserver: ResizeObserver | null = null;
    const windowResizeHandler = () => {
        handleResize();
    };

    if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(container);
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('resize', windowResizeHandler);
        window.addEventListener('orientationchange', windowResizeHandler);
    }

    handleResize();

    const dispose = () => {
        router.dispose();
        scheduler.dispose();
        reactiveAudioLayer.dispose();
        audioState$.complete();
        musicDirector.dispose();
        cleanupAudioUnlock();
        resizeObserver?.disconnect();
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', windowResizeHandler);
            window.removeEventListener('orientationchange', windowResizeHandler);
        }
        brickPlayers?.dispose();
        brickPlayers = null;
        brickPlayersPromise = null;
        volume.dispose();
        panner.dispose();
    };

    return {
        stage,
        bus,
        scheduler,
        audioState$,
        reactiveAudioLayer,
        router,
        musicDirector,
        renderStageOnce,
        renderStageSoon,
        cleanupAudioUnlock,
        dispose,
    };
};
