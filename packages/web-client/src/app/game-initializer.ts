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
import {
    createMusicDirector,
    type MusicDirector,
    type MusicLayerFactory,
} from 'audio/music-director';
import { createComboFillEngine } from 'audio/combo-fill';
import { createSubject, type Subject } from 'util/observable';
import { resolveViewportSize } from 'render/viewport';
import { Transport } from 'tone';
import {
    ensureToneAudio,
    getToneAudioContext,
    isAutoplayBlockedError,
} from './runtime/audio';

const IS_TEST_ENV = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

const clampUnit = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
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
    const toneWarn = (message: string, details?: { error: unknown }) => {
        if (IS_TEST_ENV) {
            return;
        }
        if (details?.error !== undefined) {
            console.warn(message, details.error);
            return;
        }
        if (details !== undefined) {
            console.warn(message, details);
            return;
        }
        console.warn(message);
    };

    const ensureToneAudioWithLogging = () => ensureToneAudio({ warn: toneWarn });

    await ensureToneAudioWithLogging().catch((error) => {
        if (isAutoplayBlockedError(error)) {
            onAudioBlocked?.(error);
            return;
        }
        throw error;
    });

    const stage = await createStage({
        parent: container,
        theme: GameTheme,
        width: playfieldSize.width,
        height: playfieldSize.height,
    });
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
    const summarizeAudioState = (state: ReactiveAudioGameState) => ({
        combo: state.combo,
        powerUps: state.activePowerUps.map((entry) => entry.type),
        lookAheadMs: state.lookAheadMs,
    });

    const audioState$ = createSubject<ReactiveAudioGameState>({
        debug: {
            label: 'audio-state',
            serialize: summarizeAudioState,
            logOnNext: 'distinct',
        },
    });
    const silentMusicLayerFactory: MusicLayerFactory = (definition) => ({
        id: definition.id,
        ensureStarted: () => undefined,
        setImmediate: () => undefined,
        rampTo: () => undefined,
        getLevel: () => 0,
        setPlaybackRate: () => undefined,
        dispose: () => undefined,
    });

    const musicDirector = createMusicDirector({
        transport: Transport,
        layerFactory: silentMusicLayerFactory,
    });
    musicDirector.setEnabled(false);
    musicDirector.setState({ lives: 3, combo: 0 });
    const comboFillEngine = createComboFillEngine();

    const reactiveAudioLayer = createReactiveAudioLayer(audioState$, Transport, {
        lookAheadMs: scheduler.lookAheadMs,
        onFill: (event) => {
            if (event.type === 'combo') {
                pulseControls.boostCombo({ ring: 0.45, ball: 0.5 });
                const intensity = clampUnit((event.payload.combo ?? 0) / 24);
                comboFillEngine.trigger({
                    intensity,
                    time: event.scheduledTime,
                });
                musicDirector.triggerComboAccent({
                    depth: 0.48,
                    attackSeconds: 0.1,
                    holdSeconds: 0.9,
                    releaseSeconds: 0.6,
                });
            } else if (event.type === 'power-up') {
                pulseControls.boostPowerUp({ paddle: 0.6 });
            }
        },
    });

    const toneAudioContext = getToneAudioContext();
    const isToneAudioReady = () => toneAudioContext.state === 'running' && Transport.state === 'started';

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

            void ensureToneAudioWithLogging()
                .then(() => {
                    const currentMusicState = musicDirector.getState() ?? { lives: 3, combo: 0 };
                    musicDirector.setState(currentMusicState);
                })
                .catch((unlockError) => {
                    if (!IS_TEST_ENV) {
                        console.warn('Audio unlock attempt deferred until interaction', unlockError);
                    }
                    onAudioBlocked?.(unlockError);
                })
                .finally(() => {
                    if (isToneAudioReady()) {
                        cleanupAudioUnlock();
                    }
                });
        };

        docRef.addEventListener('pointerdown', audioUnlockHandler);
        docRef.addEventListener('keydown', audioUnlockHandler);
    };

    if (!isToneAudioReady()) {
        void ensureToneAudioWithLogging().catch((audioInitError) => {
            if (!IS_TEST_ENV) {
                console.warn('Audio context suspended; will retry after the first user interaction.', audioInitError);
            }
            onAudioBlocked?.(audioInitError);
        });
    }
    scheduleAudioUnlock();
    const router = createSfxRouter({ bus, scheduler });

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
        const fallbackHeight = typeof window !== 'undefined'
            ? window.visualViewport?.height ?? window.innerHeight
            : playfieldSize.height;
        return resolveViewportSize({
            container,
            fallbackWidth,
            fallbackHeight,
        });
    };

    const applyInitialViewport = () => {
        const size = resolveViewportDimensions();
        stage.resize(size);
    };

    const handleContainerResize = () => {
        const size = resolveViewportDimensions();
        stage.resize(size);
        renderStageSoon();
    };

    let resizeObserver: ResizeObserver | null = null;
    let detachViewportListeners: (() => void) | null = null;

    applyInitialViewport();

    if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
            handleContainerResize();
        });
        resizeObserver.observe(container);
    } else if (typeof window !== 'undefined') {
        const onViewportChange = () => {
            handleContainerResize();
        };

        window.addEventListener('resize', onViewportChange);
        window.addEventListener('orientationchange', onViewportChange);
        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', onViewportChange);
        viewport?.addEventListener('scroll', onViewportChange);

        detachViewportListeners = () => {
            window.removeEventListener('resize', onViewportChange);
            window.removeEventListener('orientationchange', onViewportChange);
            viewport?.removeEventListener('resize', onViewportChange);
            viewport?.removeEventListener('scroll', onViewportChange);
        };
    }

    const dispose = () => {
        router.dispose();
        scheduler.dispose();
        reactiveAudioLayer.dispose();
        comboFillEngine.dispose();
        audioState$.complete();
        musicDirector.dispose();
        cleanupAudioUnlock();
        resizeObserver?.disconnect();
        resizeObserver = null;
        detachViewportListeners?.();
        detachViewportListeners = null;
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
