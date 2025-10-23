import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface StageStub {
    readonly layers: {
        playfield: { sortableChildren: boolean };
        effects: { sortableChildren: boolean };
        hud: Record<string, unknown>;
    };
    readonly canvas: HTMLCanvasElement;
    readonly app: { render: ReturnType<typeof vi.fn> };
    readonly update: ReturnType<typeof vi.fn>;
    readonly resize: ReturnType<typeof vi.fn>;
}

interface SchedulerStub {
    lookAheadMs: number;
    schedule: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    context: { currentTime: number };
}

interface SubjectStub {
    complete: ReturnType<typeof vi.fn>;
    next: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
}

const createStageMock = vi.hoisted(() => vi.fn());
const createToneSchedulerMock = vi.hoisted(() => vi.fn());
const createReactiveAudioLayerMock = vi.hoisted(() => vi.fn());
const createSfxRouterMock = vi.hoisted(() => vi.fn());
const createMusicDirectorMock = vi.hoisted(() => vi.fn());
const loadSoundbankMock = vi.hoisted(() => vi.fn());
const requireSoundbankEntryMock = vi.hoisted(() => vi.fn());
const createSubjectMock = vi.hoisted(() => vi.fn());
const resolveViewportSizeMock = vi.hoisted(() => vi.fn());

const toneContextResume = vi.hoisted(() => vi.fn());
const toneContextStub = vi.hoisted(
    () =>
        ({
            state: 'running' as AudioContextState,
            resume: toneContextResume,
            suspend: vi.fn(),
            close: vi.fn(),
            createBuffer: vi.fn(),
            decodeAudioData: vi.fn(),
        }) as unknown as AudioContext & { state: AudioContextState },
);

const audioStubFactory = vi.hoisted(() => {
    interface PlayerStub {
        playbackRate: number;
        volume: { value: number };
        start: ReturnType<typeof vi.fn>;
    }

    const createPlayerStub = (): PlayerStub => ({
        playbackRate: 1,
        volume: { value: 0 },
        start: vi.fn(),
    });

    const playersInstances: PlayersStub[] = [];

    class PlayersStub {
        public readonly connect = vi.fn();

        public readonly dispose = vi.fn(() => {
            /* noop */
        });

        private readonly players = new Map<string, PlayerStub>();

        public constructor(urls: Record<string, string>, onload?: () => void) {
            playersInstances.push(this);
            Object.keys(urls).forEach((id) => {
                this.players.set(id, createPlayerStub());
            });
            if (onload) {
                void Promise.resolve().then(() => {
                    onload();
                });
            }
        }

        public player(id: string): PlayerStub | null {
            return this.players.get(id) ?? null;
        }
    }

    const volumeInstances: VolumeStub[] = [];

    class VolumeStub {
        public readonly connect = vi.fn();

        public readonly dispose = vi.fn(() => {
            /* noop */
        });

        public constructor(public readonly value: number) {
            volumeInstances.push(this);
        }
    }

    const pannerInstances: PannerStub[] = [];

    class PannerStub {
        public readonly connect = vi.fn();

        public readonly toDestination = vi.fn();

        public readonly dispose = vi.fn(() => {
            /* noop */
        });

        public readonly pan = {
            setValueAtTime: vi.fn(),
        } as const;

        public constructor(public readonly value: number) {
            pannerInstances.push(this);
        }
    }

    return {
        playersInstances,
        PlayersStub,
        volumeInstances,
        VolumeStub,
        pannerInstances,
        PannerStub,
    };
});

const { playersInstances, volumeInstances, pannerInstances } = audioStubFactory;

const transportStub = vi.hoisted(() => {
    const stub = {
        state: 'started' as 'started' | 'stopped',
        start: vi.fn(async () => {
            stub.state = 'started';
        }),
        scheduleOnce: vi.fn(),
        clear: vi.fn(),
        cancel: vi.fn(),
        nextSubdivision: vi.fn(),
    };
    return stub;
});

vi.mock('render/stage', () => ({
    createStage: createStageMock,
}));

vi.mock('audio/scheduler', () => ({
    createToneScheduler: createToneSchedulerMock,
    createReactiveAudioLayer: createReactiveAudioLayerMock,
}));

vi.mock('audio/sfx', () => ({
    createSfxRouter: createSfxRouterMock,
}));

vi.mock('audio/music-director', () => ({
    createMusicDirector: createMusicDirectorMock,
}));

vi.mock('audio/soundbank', () => ({
    loadSoundbank: loadSoundbankMock,
    requireSoundbankEntry: requireSoundbankEntryMock,
}));

vi.mock('util/observable', () => ({
    createSubject: createSubjectMock,
}));

vi.mock('render/viewport', () => ({
    resolveViewportSize: resolveViewportSizeMock,
}));

vi.mock('tone', () => ({
    Players: audioStubFactory.PlayersStub,
    Panner: audioStubFactory.PannerStub,
    Volume: audioStubFactory.VolumeStub,
    Transport: transportStub,
    getTransport: () => transportStub,
    getContext: () => ({ rawContext: toneContextStub }),
}));

const resizeObserverInstances: ResizeObserverMock[] = [];

class ResizeObserverMock implements ResizeObserver {
    public readonly observe = vi.fn();

    public readonly unobserve = vi.fn();

    public readonly disconnect = vi.fn();

    public readonly takeRecords = vi.fn(() => []);

    public constructor(public readonly callback: ResizeObserverCallback) {
        resizeObserverInstances.push(this);
    }
}

(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

import { GameTheme } from 'render/theme';
import { createGameInitializer, type PulseControls } from 'app/game-initializer';

describe('createGameInitializer', () => {
    let container: HTMLDivElement;
    let stageStub: StageStub;
    let schedulerStub: SchedulerStub;
    let reactiveLayerStub: { dispose: ReturnType<typeof vi.fn> };
    let routerStub: { dispose: ReturnType<typeof vi.fn> };
    let musicDirectorStub: { setState: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
    let subjectStub: SubjectStub;
    let pulseControls: PulseControls;
    let boostComboMock: ReturnType<typeof vi.fn>;
    let boostPowerUpMock: ReturnType<typeof vi.fn>;
    let capturedReactiveOptions: Record<string, unknown> | undefined;
    let capturedSubjectOptions: unknown;

    const soundbankEntries = {
        calm: { id: 'calm', url: 'calm.wav', category: 'music', gain: 0.45 },
        intense: { id: 'intense', url: 'intense.wav', category: 'music', gain: 0.9 },
        melody: { id: 'melody', url: 'melody.wav', category: 'music', gain: 0.8 },
        'brick-hit-low': { id: 'brick-hit-low', url: 'low.wav', category: 'sfx' },
        'brick-hit-mid': { id: 'brick-hit-mid', url: 'mid.wav', category: 'sfx' },
        'brick-hit-high': { id: 'brick-hit-high', url: 'high.wav', category: 'sfx' },
    } as const;

    const createStageStub = (): StageStub => ({
        layers: {
            playfield: { sortableChildren: false },
            effects: { sortableChildren: false },
            hud: {},
        },
        canvas: document.createElement('canvas'),
        app: { render: vi.fn() },
        update: vi.fn(),
        resize: vi.fn(),
    });

    const createSchedulerStub = (): SchedulerStub => {
        const schedule = vi.fn();
        schedule.mockReturnValue({ id: 1, time: 0 });
        return {
            lookAheadMs: 120,
            schedule,
            cancel: vi.fn(),
            dispose: vi.fn(),
            context: { currentTime: 0 },
        } satisfies SchedulerStub;
    };

    const createSubjectStub = (): SubjectStub => ({
        complete: vi.fn(),
        next: vi.fn(),
        subscribe: vi.fn(),
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);

        stageStub = createStageStub();
        createStageMock.mockResolvedValue(stageStub);

        schedulerStub = createSchedulerStub();
        createToneSchedulerMock.mockReturnValue(schedulerStub);

        reactiveLayerStub = { dispose: vi.fn() };
        capturedReactiveOptions = undefined;
        createReactiveAudioLayerMock.mockImplementation((state$, transport, options = {}) => {
            void state$;
            void transport;
            capturedReactiveOptions = options ? { ...(options as Record<string, unknown>) } : {};
            return reactiveLayerStub;
        });

        routerStub = { dispose: vi.fn() };
        createSfxRouterMock.mockReturnValue(routerStub);

        musicDirectorStub = {
            setState: vi.fn(),
            dispose: vi.fn(),
        };
        createMusicDirectorMock.mockReturnValue(musicDirectorStub);

        subjectStub = createSubjectStub();
        capturedSubjectOptions = undefined;
        createSubjectMock.mockImplementation((options?: unknown) => {
            capturedSubjectOptions = options;
            return subjectStub;
        });

        loadSoundbankMock.mockResolvedValue({});
        requireSoundbankEntryMock.mockImplementation((_, id: string) => {
            const entry = soundbankEntries[id as keyof typeof soundbankEntries];
            if (!entry) {
                throw new Error(`missing soundbank entry for ${id}`);
            }
            return entry;
        });

        resolveViewportSizeMock.mockReturnValue({ width: 1600, height: 900 });

        boostComboMock = vi.fn();
        boostPowerUpMock = vi.fn();
        pulseControls = {
            boostCombo: boostComboMock,
            boostPowerUp: boostPowerUpMock,
        } satisfies PulseControls;

        playersInstances.length = 0;
        volumeInstances.length = 0;
        pannerInstances.length = 0;
        resizeObserverInstances.length = 0;

        toneContextStub.state = 'running';
        toneContextResume.mockReset();
        toneContextResume.mockResolvedValue(undefined);

        transportStub.state = 'started';
        transportStub.start.mockReset();
        transportStub.start.mockImplementation(async () => {
            transportStub.state = 'started';
        });
        transportStub.scheduleOnce.mockReset();
        transportStub.clear.mockReset();
        transportStub.cancel.mockReset();
        transportStub.nextSubdivision.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initializes stage, audio wiring, and rendering helpers', async () => {
        const result = await createGameInitializer({
            container,
            playfieldSize: { width: 800, height: 600 },
            pulseControls,
        });

        expect(createStageMock).toHaveBeenCalledTimes(1);
        expect(createStageMock).toHaveBeenCalledWith({ parent: container, theme: GameTheme });

        expect(createSubjectMock).toHaveBeenCalledWith(
            expect.objectContaining({
                debug: expect.objectContaining({
                    label: 'audio-state',
                    logOnNext: 'distinct',
                }),
            }),
        );

        const subjectOptions = capturedSubjectOptions as { debug?: { serialize?: unknown } } | undefined;
        expect(subjectOptions?.debug?.serialize).toBeTypeOf('function');

        expect(stageStub.layers.playfield.sortableChildren).toBe(true);
        expect(stageStub.layers.effects.sortableChildren).toBe(true);
        expect(stageStub.canvas.style.touchAction).toBe('none');
        expect(stageStub.canvas.style.userSelect).toBe('none');

        expect(resolveViewportSizeMock).toHaveBeenCalledWith(expect.objectContaining({ container }));
        expect(stageStub.resize).toHaveBeenCalledWith({ width: 1600, height: 900 });

        expect(createToneSchedulerMock).toHaveBeenCalledWith({ lookAheadMs: 120 });
        expect(createReactiveAudioLayerMock).toHaveBeenCalledWith(subjectStub, transportStub, expect.objectContaining({ lookAheadMs: schedulerStub.lookAheadMs }));

        expect(requireSoundbankEntryMock).toHaveBeenCalledWith(expect.anything(), 'calm');
        expect(requireSoundbankEntryMock).toHaveBeenCalledWith(expect.anything(), 'intense');
        expect(requireSoundbankEntryMock).toHaveBeenCalledWith(expect.anything(), 'melody');
        expect(musicDirectorStub.setState).toHaveBeenCalledWith({ lives: 3, combo: 0 });

        expect(playersInstances).toHaveLength(1);
        expect(volumeInstances).toHaveLength(1);
        expect(pannerInstances).toHaveLength(1);

        expect(capturedReactiveOptions).toBeDefined();
        const onFill = capturedReactiveOptions?.onFill as ((event: { type: string }) => void) | undefined;
        expect(onFill).toBeTypeOf('function');

        onFill?.({ type: 'combo' });
        expect(boostComboMock).toHaveBeenCalledWith({ ring: 0.45, ball: 0.5 });

        onFill?.({ type: 'power-up' });
        expect(boostPowerUpMock).toHaveBeenCalledWith({ paddle: 0.6 });

        result.renderStageOnce();
        expect(stageStub.update).toHaveBeenCalledWith(0);
        expect(stageStub.app.render).toHaveBeenCalledTimes(1);

        stageStub.update.mockClear();
        stageStub.app.render.mockClear();
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        result.renderStageSoon();
        expect(stageStub.update).toHaveBeenCalledTimes(2);
        expect(stageStub.app.render).toHaveBeenCalledTimes(2);
        rafSpy.mockRestore();
    });

    it('notifies audio-blocked observer and schedules unlock listeners', async () => {
        const notAllowed = new Error('blocked');
        notAllowed.name = 'NotAllowedError';
        toneContextStub.state = 'suspended';
        toneContextResume.mockReset();
        toneContextResume.mockRejectedValue(notAllowed);
        transportStub.state = 'stopped';

        const onAudioBlocked = vi.fn();
        const addSpy = vi.spyOn(document, 'addEventListener');
        const removeSpy = vi.spyOn(document, 'removeEventListener');

        const result = await createGameInitializer({
            container,
            playfieldSize: { width: 1024, height: 768 },
            pulseControls,
            onAudioBlocked,
        });

        await Promise.resolve();

        expect(onAudioBlocked.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
        expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

        const pointerHandler = addSpy.mock.calls.find(([event]) => event === 'pointerdown')?.[1] as EventListener;
        const keyHandler = addSpy.mock.calls.find(([event]) => event === 'keydown')?.[1] as EventListener;

        result.cleanupAudioUnlock();

        if (pointerHandler) {
            expect(removeSpy).toHaveBeenCalledWith('pointerdown', pointerHandler);
        }
        if (keyHandler) {
            expect(removeSpy).toHaveBeenCalledWith('keydown', keyHandler);
        }

        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    it('disposes resources and detaches observers', async () => {
        const addSpy = vi.spyOn(window, 'addEventListener');
        const removeSpy = vi.spyOn(window, 'removeEventListener');

        const result = await createGameInitializer({
            container,
            playfieldSize: { width: 640, height: 360 },
            pulseControls,
        });

        await Promise.resolve();

        expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));
        expect(addSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function));
        expect(resizeObserverInstances).toHaveLength(1);
        expect(resizeObserverInstances[0]?.observe).toHaveBeenCalledWith(container);

        result.dispose();

        expect(routerStub.dispose).toHaveBeenCalled();
        expect(schedulerStub.dispose).toHaveBeenCalled();
        expect(reactiveLayerStub.dispose).toHaveBeenCalled();
        expect(subjectStub.complete).toHaveBeenCalled();
        expect(musicDirectorStub.dispose).toHaveBeenCalled();

        expect(volumeInstances[0]?.dispose).toHaveBeenCalled();
        expect(pannerInstances[0]?.dispose).toHaveBeenCalled();
        expect(playersInstances[0]?.dispose).toHaveBeenCalled();

        expect(resizeObserverInstances[0]?.disconnect).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function));

        addSpy.mockRestore();
        removeSpy.mockRestore();
    });
});
