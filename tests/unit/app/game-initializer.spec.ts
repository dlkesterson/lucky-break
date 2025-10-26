import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicDirector } from 'audio/music-director';

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
    lookAheadSeconds: number;
    schedule: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    context: { currentTime: number };
    now: ReturnType<typeof vi.fn>;
    predictAt: ReturnType<typeof vi.fn>;
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
const createComboFillEngineMock = vi.hoisted(() => vi.fn());
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

vi.mock('audio/combo-fill', () => ({
    createComboFillEngine: createComboFillEngineMock,
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
    Transport: transportStub,
    getTransport: () => transportStub,
    getContext: () => ({ rawContext: toneContextStub }),
    start: vi.fn(() => Promise.resolve()),
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
    let musicDirectorStub: MusicDirector;
    let comboFillEngineStub: { trigger: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
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
        const now = vi.fn().mockReturnValue(0);
        const predictAt = vi.fn().mockImplementation((offsetMs?: number) => {
            const offset = typeof offsetMs === 'number' ? offsetMs : 0;
            return 0.12 + offset / 1000;
        });
        return {
            lookAheadMs: 120,
            lookAheadSeconds: 0.12,
            schedule,
            cancel: vi.fn(),
            dispose: vi.fn(),
            context: { currentTime: 0 },
            now,
            predictAt,
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

        comboFillEngineStub = {
            trigger: vi.fn(),
            dispose: vi.fn(),
        };
        createComboFillEngineMock.mockReturnValue(comboFillEngineStub);

        musicDirectorStub = {
            setState: vi.fn(),
            dispose: vi.fn(),
            setEnabled: vi.fn(),
            getState: vi.fn().mockReturnValue({ lives: 3, combo: 0 }),
            setBeatCallback: vi.fn(),
            setMeasureCallback: vi.fn(),
            triggerComboAccent: vi.fn(),
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
        expect(createStageMock).toHaveBeenCalledWith(
            expect.objectContaining({ parent: container, width: 800, height: 600 }),
        );
        expect(createStageMock.mock.calls[0]?.[0]?.theme).toBe(GameTheme);

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

        expect(requireSoundbankEntryMock).not.toHaveBeenCalled();

        const routerArgs = createSfxRouterMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
        expect(routerArgs?.scheduler).toBe(schedulerStub);
        expect(routerArgs?.bus).toBeDefined();
        expect(routerArgs?.brickSampleIds).toBeUndefined();
        expect(routerArgs?.trigger).toBeUndefined();

        const onFill = capturedReactiveOptions?.onFill as
            | ((event: { type: string; payload: { combo?: number; powerUpType?: string }; scheduledTime: number }) => void)
            | undefined;
        expect(onFill).toBeTypeOf('function');

        onFill?.({ type: 'combo', payload: { combo: 24 }, scheduledTime: 1.25 });
        expect(boostComboMock).toHaveBeenCalledWith({ ring: 0.45, ball: 0.5 });
        expect(comboFillEngineStub.trigger).toHaveBeenCalledWith({ intensity: 1, time: 1.25 });
        expect(musicDirectorStub.triggerComboAccent).toHaveBeenCalledWith(
            expect.objectContaining({ depth: 0.48, holdSeconds: 0.9 })
        );

        onFill?.({ type: 'power-up', payload: { powerUpType: 'multi-ball' }, scheduledTime: 2 });
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

        expect(addSpy).not.toHaveBeenCalledWith('resize', expect.any(Function));
        expect(addSpy).not.toHaveBeenCalledWith('orientationchange', expect.any(Function));
        expect(resizeObserverInstances).toHaveLength(1);
        const observerInstance = resizeObserverInstances[0];
        expect(observerInstance.observe).toHaveBeenCalledWith(container);

        result.dispose();

        expect(routerStub.dispose).toHaveBeenCalled();
        expect(schedulerStub.dispose).toHaveBeenCalled();
        expect(reactiveLayerStub.dispose).toHaveBeenCalled();
        expect(comboFillEngineStub.dispose).toHaveBeenCalled();
        expect(subjectStub.complete).toHaveBeenCalled();
        expect(musicDirectorStub.dispose).toHaveBeenCalled();

        expect(removeSpy).not.toHaveBeenCalledWith('resize', expect.any(Function));
        expect(removeSpy).not.toHaveBeenCalledWith('orientationchange', expect.any(Function));
        expect(observerInstance.disconnect).toHaveBeenCalled();

        addSpy.mockRestore();
        removeSpy.mockRestore();
    });
});
