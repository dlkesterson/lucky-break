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
import { createSubject, type Subject } from 'util/observable';
import { computeViewportFit } from 'render/viewport';
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

    const stage = await createStage({ parent: container, theme: GameTheme });
    stage.layers.playfield.sortableChildren = true;
    stage.layers.effects.sortableChildren = true;

    const canvas = stage.canvas;
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
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
    const musicDirector = createMusicDirector({ transport: Transport });
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

    const brickSampleUrls = {
        'brick-hit-low': new URL('../../assets/bass-poweron.wav', import.meta.url).href,
        'brick-hit-mid': new URL('../../assets/double-acoustic-bassnote.wav', import.meta.url).href,
        'brick-hit-high': new URL('../../assets/eurobas.wav', import.meta.url).href,
    } as const;

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
        brickSampleIds: Object.keys(brickSampleUrls),
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

    const handleResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        stage.resize({ width, height });

        const fit = computeViewportFit({
            containerWidth: width,
            containerHeight: height,
            contentWidth: playfieldSize.width,
            contentHeight: playfieldSize.height,
        });

        stage.layers.root.scale.set(fit.scale, fit.scale);
        stage.layers.root.position.set(Math.round(fit.offsetX), Math.round(fit.offsetY));
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const dispose = () => {
        router.dispose();
        scheduler.dispose();
        reactiveAudioLayer.dispose();
        audioState$.complete();
        musicDirector.dispose();
        cleanupAudioUnlock();
        window.removeEventListener('resize', handleResize);
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
