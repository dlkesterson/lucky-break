import { Transport } from 'tone';
import {
    createToneScheduler,
    createReactiveAudioLayer,
    type ReactiveAudioGameState,
    type ReactiveAudioLayer,
    type ReactiveAudioLayerOptions,
    type ToneScheduler,
    type ToneSchedulerOptions,
} from './scheduler';
import { createSubject, type Subject } from 'util/observable';

type TransportLike = Parameters<typeof createReactiveAudioLayer>[1];

export interface AudioBootstrapOptions {
    readonly enableMusic?: boolean;
    readonly enableSfx?: boolean;
    readonly lookAheadMs?: number;
    readonly state$?: Subject<ReactiveAudioGameState>;
    readonly schedulerFactory?: (options: ToneSchedulerOptions) => ToneScheduler;
    readonly reactiveLayerFactory?: (
        state$: Subject<ReactiveAudioGameState>,
        transport: TransportLike,
        options: ReactiveAudioLayerOptions,
    ) => ReactiveAudioLayer;
    readonly transport?: TransportLike & {
        start?: (time?: number | string) => unknown;
        stop?: (time?: number | string) => unknown;
    };
}

export interface AudioSubsystem {
    readonly scheduler: ToneScheduler;
    readonly state$: Subject<ReactiveAudioGameState>;
    readonly reactiveLayer: ReactiveAudioLayer | null;
    readonly shutdown: () => void;
}

export function bootstrapAudio(options: AudioBootstrapOptions = {}): AudioSubsystem {
    const {
        enableMusic = true,
        enableSfx = true,
        lookAheadMs,
        schedulerFactory = createToneScheduler,
        reactiveLayerFactory = createReactiveAudioLayer,
        transport = Transport as TransportLike & {
            start?: (time?: number | string) => unknown;
            stop?: (time?: number | string) => unknown;
        },
    } = options;

    const state$ = options.state$ ?? createSubject<ReactiveAudioGameState>();

    const schedulerOptions: ToneSchedulerOptions = typeof lookAheadMs === 'number'
        ? { lookAheadMs }
        : {};

    const scheduler = schedulerFactory(schedulerOptions);

    if (enableMusic && typeof transport.start === 'function') {
        void transport.start();
    }

    const reactiveLayer = enableSfx
        ? reactiveLayerFactory(state$, transport, { lookAheadMs: scheduler.lookAheadMs })
        : null;

    const shutdown = () => {
        reactiveLayer?.dispose();
        scheduler.dispose();
        if (typeof transport.cancel === 'function') {
            transport.cancel();
        }
        if (enableMusic && typeof transport.stop === 'function') {
            transport.stop();
        }
        state$.complete();
    };

    return {
        scheduler,
        state$,
        reactiveLayer,
        shutdown,
    };
}
