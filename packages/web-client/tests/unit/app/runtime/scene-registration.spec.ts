import { describe, expect, it, vi } from 'vitest';
import { registerRuntimeScenes, type SceneRegistrationDeps } from 'app/runtime/scene-registration';
import type { StageHandle } from 'render/stage';
import type { RuntimeInput } from 'app/runtime/input';
import type { Logger } from 'util/log';
import type { GameLoop } from 'app/loop';
import type { Container } from 'pixi.js';
import { defaultLoadoutSelection, type LoadoutSelection } from 'config/loadouts';

const flushPromises = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
};

const createLoopStub = (running = true) => {
    let state = running;
    const startMock = vi.fn(() => {
        state = true;
    });
    const stopMock = vi.fn(() => {
        state = false;
    });
    const isRunningMock = vi.fn(() => state);
    const loop: GameLoop = {
        start: startMock,
        stop: stopMock,
        isRunning: isRunningMock,
    };
    return { loop, getState: () => state, startMock, stopMock, isRunningMock } as const;
};

interface StageStub {
    readonly handle: StageHandle;
    readonly registerSpy: ReturnType<typeof vi.fn>;
    readonly pushSpy: ReturnType<typeof vi.fn>;
    readonly popSpy: ReturnType<typeof vi.fn>;
    readonly getCurrentSceneSpy: ReturnType<typeof vi.fn>;
    readonly transitionToSpy: ReturnType<typeof vi.fn>;
    setPushBehavior(next: () => Promise<void>): void;
    setTransitionBehavior(next: () => Promise<void>): void;
    setStack(next: string[]): void;
    getStack(): string[];
    getLastPushPayload<TPayload>(): TPayload | undefined;
}

const createStageStub = (): StageStub => {
    const stack: string[] = [];
    let pushBehavior: () => Promise<void> = () => Promise.resolve();
    let transitionBehavior: () => Promise<void> = () => Promise.resolve();
    let lastPushPayload: unknown;

    const registerSpy = vi.fn();
    const pushSpy = vi.fn();
    const popSpy = vi.fn();
    const getCurrentSceneSpy = vi.fn();
    const transitionToSpy = vi.fn();

    const handle = {
        register: (name: string, factory: unknown, options?: unknown) => {
            registerSpy(name, factory, options);
        },
        push: (name: string, payload?: unknown) => {
            pushSpy(name, payload);
            stack.push(name);
            lastPushPayload = payload;
            return pushBehavior();
        },
        pop: () => {
            popSpy();
            stack.pop();
        },
        getCurrentScene: () => {
            getCurrentSceneSpy();
            return stack.at(-1) ?? null;
        },
        transitionTo: (name: string) => {
            transitionToSpy(name);
            stack.length = 0;
            stack.push(name);
            return transitionBehavior();
        },
    } as unknown as StageHandle;

    return {
        handle,
        registerSpy,
        pushSpy,
        popSpy,
        getCurrentSceneSpy,
        transitionToSpy,
        setPushBehavior: (next) => {
            pushBehavior = next;
        },
        setTransitionBehavior: (next) => {
            transitionBehavior = next;
        },
        setStack: (next) => {
            stack.length = 0;
            stack.push(...next);
        },
        getStack: () => [...stack],
        getLastPushPayload: <TPayload>() => lastPushPayload as TPayload | undefined,
    };
};

const createLoggerStub = () => {
    const debugMock = vi.fn();
    const infoMock = vi.fn();
    const warnMock = vi.fn();
    const errorMock = vi.fn();
    const childMock = vi.fn();
    const logger: Logger = {
        debug: debugMock,
        info: infoMock,
        warn: warnMock,
        error: errorMock,
        child: (subsystem: string) => {
            childMock(subsystem);
            return logger;
        },
    };
    return { logger, debugMock, infoMock, warnMock, errorMock, childMock } as const;
};

const createRuntimeInputStub = (): Pick<RuntimeInput, 'resetLaunchTrigger'> => ({
    resetLaunchTrigger: vi.fn(),
});

const createContainer = (): Container => ({ visible: true } as unknown as Container);

const bootstrapDeps = () => {
    const stage = createStageStub();
    const { loop, getState, startMock, stopMock, isRunningMock } = createLoopStub();
    let loopRef: GameLoop | null = loop;
    let paused = false;

    const runtimeInput = createRuntimeInputStub();
    const renderStageSoon = vi.fn();
    const getActiveLoadoutSelection = vi.fn<[], LoadoutSelection>(() => ({ ...defaultLoadoutSelection }));
    const provideSceneServices = vi.fn();
    const beginNewSession = vi.fn<[], Promise<void>>(() => Promise.resolve());
    const runGameplayUpdate = vi.fn<[number], void>(() => undefined);
    const getScore = vi.fn(() => 314);
    const getIsPaused = vi.fn(() => paused);
    const setIsPaused = vi.fn((value: boolean) => {
        paused = value;
    });
    const onLoopStarted = vi.fn();
    const onLoopStopped = vi.fn();
    const loggerMocks = createLoggerStub();
    const gameContainer = createContainer();
    const hudContainer = createContainer();

    const deps: SceneRegistrationDeps = {
        stage: stage.handle,
        getLoop: () => loopRef,
        renderStageSoon,
        provideSceneServices,
        beginNewSession,
        runGameplayUpdate,
        runtimeInput,
        gameContainer,
        hudContainer,
        getScore,
        getIsPaused,
        setIsPaused,
        getActiveLoadoutSelection,
        onLoopStarted,
        onLoopStopped,
        logger: loggerMocks.logger,
    } as SceneRegistrationDeps;

    return {
        stage,
        loop,
        startMock,
        stopMock,
        isRunningMock,
        getLoopState: getState,
        setLoop: (next: GameLoop | null) => {
            loopRef = next;
        },
        deps,
        runtimeInput,
        renderStageSoon,
        provideSceneServices,
        beginNewSession,
        runGameplayUpdate,
        getScore,
        getIsPaused,
        setIsPaused,
        getActiveLoadoutSelection,
        logger: loggerMocks.logger,
        loggerMocks,
        gameContainer,
        hudContainer,
        getPausedState: () => paused,
        onLoopStarted,
        onLoopStopped,
    } as const;
};

describe('registerRuntimeScenes', () => {
    it('pauses the game and resumes through payload callbacks', async () => {
        const context = bootstrapDeps();
        context.stage.setPushBehavior(() => Promise.resolve());
        context.stage.setTransitionBehavior(() => Promise.resolve());

        const result = await registerRuntimeScenes(context.deps);

        context.renderStageSoon.mockClear();
        context.stage.pushSpy.mockClear();
        context.stage.popSpy.mockClear();
        context.setIsPaused.mockClear();
        context.startMock.mockClear();
        context.stopMock.mockClear();
        context.onLoopStarted.mockClear();
        context.onLoopStopped.mockClear();

        context.stage.setStack(['main-menu', 'gameplay']);
        context.gameContainer.visible = true;
        context.hudContainer.visible = true;

        result.pauseGame();

        expect(context.setIsPaused).toHaveBeenCalledWith(true);
        expect(context.stopMock).toHaveBeenCalledTimes(1);
        expect(context.onLoopStopped).toHaveBeenCalledTimes(1);
        expect(context.stage.pushSpy).toHaveBeenCalledWith(
            'pause',
            expect.objectContaining({
                score: 314,
            }),
        );

        await flushPromises();

        expect(context.renderStageSoon).toHaveBeenCalledTimes(1);

        const payload = context.stage.getLastPushPayload<{
            legendItems: readonly { readonly type?: string; readonly text: string }[];
            onResume: () => void;
            onQuit: () => void;
        }>();

        expect(payload).toBeDefined();
        expect(payload?.legendItems).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'paddle-width' }),
            ]),
        );

        payload?.onResume();

        expect(context.stage.popSpy).toHaveBeenCalledTimes(1);
        expect(context.setIsPaused).toHaveBeenLastCalledWith(false);
        expect(context.startMock).toHaveBeenCalledTimes(1);
        expect(context.onLoopStarted).toHaveBeenCalledTimes(1);
        expect(context.renderStageSoon).toHaveBeenCalledTimes(2);

        context.stage.setStack(['main-menu', 'gameplay', 'bonus-overlay', 'pause']);
        payload?.onQuit();

        await flushPromises();

        expect(context.stopMock).toHaveBeenCalledTimes(2);
        expect(context.onLoopStopped).toHaveBeenCalledTimes(2);
        expect(context.gameContainer.visible).toBe(false);
        expect(context.hudContainer.visible).toBe(false);
        expect(context.renderStageSoon).toHaveBeenCalledTimes(3);
        expect(context.loggerMocks.errorMock).not.toHaveBeenCalled();
    });

    it('logs and recovers when the pause overlay fails to load', async () => {
        const context = bootstrapDeps();
        const pushError = new Error('pause push failed');
        context.stage.setPushBehavior(() => Promise.reject(pushError));
        context.stage.setTransitionBehavior(() => Promise.resolve());

        const result = await registerRuntimeScenes(context.deps);

        context.renderStageSoon.mockClear();
        context.setIsPaused.mockClear();
        context.startMock.mockClear();
        context.stopMock.mockClear();
        context.loggerMocks.errorMock.mockClear();
        context.onLoopStarted.mockClear();
        context.onLoopStopped.mockClear();

        context.stage.setStack(['main-menu', 'gameplay']);
        result.pauseGame();

        await flushPromises();

        expect(context.setIsPaused).toHaveBeenNthCalledWith(1, true);
        expect(context.setIsPaused).toHaveBeenLastCalledWith(false);
        expect(context.stopMock).toHaveBeenCalledTimes(1);
        expect(context.startMock).toHaveBeenCalledTimes(1);
        expect(context.onLoopStopped).toHaveBeenCalledTimes(1);
        expect(context.onLoopStarted).toHaveBeenCalledTimes(1);
        expect(context.loggerMocks.errorMock).toHaveBeenCalledWith(
            'Failed to push pause overlay',
            { error: pushError },
        );
    });

    it('clears overlays when quitting to the main menu even if transition fails', async () => {
        const context = bootstrapDeps();
        const transitionError = new Error('transition failed');
        context.stage.setTransitionBehavior(() => Promise.resolve());

        const result = await registerRuntimeScenes(context.deps);

        context.stage.setTransitionBehavior(() => Promise.reject(transitionError));
        context.stage.setStack(['main-menu', 'gameplay', 'pause', 'overlay']);

        context.renderStageSoon.mockClear();
        context.loggerMocks.errorMock.mockClear();
        context.stage.popSpy.mockClear();
        context.stopMock.mockClear();
        context.setIsPaused.mockClear();
        context.onLoopStarted.mockClear();
        context.onLoopStopped.mockClear();

        await result.quitToMenu();

        expect(context.stage.popSpy).toHaveBeenCalledTimes(2);
        expect(context.setIsPaused).toHaveBeenCalledWith(false);
        expect(context.stopMock).toHaveBeenCalledTimes(1);
        expect(context.onLoopStopped).toHaveBeenCalledTimes(1);
        expect(context.loggerMocks.errorMock).toHaveBeenCalledWith(
            'Failed to transition to main menu',
            { error: transitionError },
        );
        expect(context.renderStageSoon).toHaveBeenCalledTimes(1);
    });
});
