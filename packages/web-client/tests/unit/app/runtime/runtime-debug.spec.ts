import { describe, expect, it, vi } from 'vitest';
import { createRuntimeDebug, type RuntimeDebugOptions } from 'app/runtime/debug';
import type { DeveloperCheatController, DeveloperCheatListener, DeveloperCheatState } from 'app/developer-cheats';
import type { InputDebugOverlay, PhysicsDebugOverlay, PhysicsDebugOverlayState } from 'render/debug-overlay';
import type { Logger } from 'util/log';
import type { PowerUpType } from 'util/power-ups';
import type { RewardType } from 'game/rewards';

const createLoggerStub = () => {
    const info = vi.fn();
    const debug = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const child = vi.fn();
    const logger: Logger = {
        info,
        debug,
        warn,
        error,
        child: (subsystem: string) => {
            child(subsystem);
            return logger;
        },
    };
    return { logger, info, debug, warn, error, child } as const;
};

const createDeveloperCheatsStub = () => {
    let state: DeveloperCheatState = { enabled: false, forcedReward: null };
    const listeners = new Set<DeveloperCheatListener>();

    const snapshot = (): DeveloperCheatState => ({ ...state });
    const updateState = (next: DeveloperCheatState): DeveloperCheatState => {
        state = { ...next };
        const current = snapshot();
        listeners.forEach((listener) => listener(current));
        return current;
    };

    const setEnabled = vi.fn((enabled: boolean) => updateState({ ...state, enabled }));
    const setForcedReward = vi.fn((reward: RewardType | null) => updateState({ ...state, forcedReward: reward }));
    const toggleEnabled = vi.fn(() => setEnabled(!state.enabled));
    const clearForcedReward = vi.fn(() => setForcedReward(null));
    const cycleForcedReward = vi.fn((direction: 1 | -1 = 1) => {
        const forcedReward: RewardType = direction === -1 ? 'double-points' : 'sticky-paddle';
        return setForcedReward(forcedReward);
    });
    const getState = vi.fn(() => snapshot());
    const isEnabled = vi.fn(() => state.enabled);
    const subscribe = vi.fn((listener: DeveloperCheatListener) => {
        listeners.add(listener);
        listener(snapshot());
        return () => listeners.delete(listener);
    });
    const resetForTests = vi.fn(() => {
        updateState({ enabled: false, forcedReward: null });
    });

    const controller: DeveloperCheatController = {
        getState,
        isEnabled,
        setEnabled,
        toggleEnabled,
        setForcedReward,
        clearForcedReward,
        cycleForcedReward,
        subscribe,
        resetForTests,
    };

    return {
        controller,
        getState,
        isEnabled,
        setEnabled,
        toggleEnabled,
        setForcedReward,
        clearForcedReward,
        cycleForcedReward,
        subscribe,
        resetForTests,
    } as const;
};

const createDocumentStub = () => {
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    const addEventListener = vi.fn((type: string, handler: EventListenerOrEventListenerObject) => {
        if (typeof handler === 'function') {
            listeners.set(type, handler as (event: KeyboardEvent) => void);
        }
    });
    const removeEventListener = vi.fn((type: string, handler: EventListenerOrEventListenerObject) => {
        const existing = listeners.get(type);
        if (typeof handler === 'function' && existing === handler) {
            listeners.delete(type);
        }
    });
    const dispatch = (type: string, event: KeyboardEvent) => {
        listeners.get(type)?.(event);
    };
    return {
        addEventListener,
        removeEventListener,
        dispatch,
    } as const;
};

type TestKeyboardEvent = KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };

const createKeyEvent = (
    code: string,
    options: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): TestKeyboardEvent => {
    return {
        code,
        ctrlKey: options.ctrlKey ?? false,
        shiftKey: options.shiftKey ?? false,
        altKey: options.altKey ?? false,
        preventDefault: vi.fn(),
    } as unknown as TestKeyboardEvent;
};

const createRuntimeDebugHarness = () => {
    const documentStub = createDocumentStub();
    const logger = createLoggerStub();
    const developerCheats = createDeveloperCheatsStub();
    const renderStageSoon = vi.fn();
    const toggleTheme = vi.fn();
    const pauseGame = vi.fn();
    const resumeGame = vi.fn();
    const quitToMenu = vi.fn(() => Promise.resolve());
    const skipLevel = vi.fn(() => Promise.resolve());
    const spawnCheatPowerUp = vi.fn();
    const applyCheatReward = vi.fn();
    const cheatPowerUpBindings: RuntimeDebugOptions['cheatPowerUpBindings'] = [
        { code: 'KeyG', type: 'laser' satisfies PowerUpType },
    ];

    let paused = false;
    let loopRunning = true;
    let physicsState: PhysicsDebugOverlayState | null = {} as PhysicsDebugOverlayState;

    const isPaused = vi.fn(() => paused);
    const isLoopRunning = vi.fn(() => loopRunning);
    const getPhysicsDebugState = vi.fn(() => physicsState);

    const runtimeDebug = createRuntimeDebug({
        documentRef: documentStub as unknown as Document,
        logger: logger.logger,
        developerCheats: developerCheats.controller,
        cheatPowerUpBindings,
        toggleTheme,
        pauseGame: () => {
            paused = true;
            pauseGame();
        },
        resumeGame: () => {
            paused = false;
            resumeGame();
        },
        quitToMenu,
        spawnCheatPowerUp,
        applyCheatReward,
        skipLevel,
        renderStageSoon,
        isPaused,
        isLoopRunning,
        getPhysicsDebugState,
    });

    const inputOverlay = {
        setVisible: vi.fn(),
        update: vi.fn(),
    } as unknown as InputDebugOverlay;
    const physicsOverlay = {
        setVisible: vi.fn(),
        update: vi.fn(),
    } as unknown as PhysicsDebugOverlay;

    return {
        runtimeDebug,
        documentStub,
        logger,
        developerCheats: developerCheats.controller,
        developerCheatMocks: developerCheats,
        renderStageSoon,
        toggleTheme,
        pauseGame,
        resumeGame,
        quitToMenu,
        skipLevel,
        spawnCheatPowerUp,
        applyCheatReward,
        setPaused: (value: boolean) => {
            paused = value;
        },
        setLoopRunning: (value: boolean) => {
            loopRunning = value;
        },
        setPhysicsState: (state: PhysicsDebugOverlayState | null) => {
            physicsState = state;
        },
        inputOverlay,
        physicsOverlay,
        isPaused,
        isLoopRunning,
        getPhysicsDebugState,
    } as const;
};

describe('createRuntimeDebug', () => {
    it('handles developer cheat key combinations and bindings', async () => {
        const harness = createRuntimeDebugHarness();
        const { runtimeDebug, documentStub, developerCheats, logger, applyCheatReward, spawnCheatPowerUp, skipLevel } = harness;

        runtimeDebug.install();
        const handler = documentStub.addEventListener.mock.calls[0][1] as (event: KeyboardEvent) => void;

        const disabledSkip = createKeyEvent('KeyN', { ctrlKey: true, shiftKey: true });
        handler(disabledSkip);
        expect(skipLevel).not.toHaveBeenCalled();

        const toggleEvent = createKeyEvent('F10', { ctrlKey: true, shiftKey: true });
        handler(toggleEvent);
        expect(toggleEvent.preventDefault).toHaveBeenCalled();
        expect(developerCheats.toggleEnabled).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(
            'Developer cheats toggled',
            expect.objectContaining({ enabled: true }),
        );

        const skipEvent = createKeyEvent('KeyN', { ctrlKey: true, shiftKey: true });
        handler(skipEvent);
        await skipLevel.mock.results[0]?.value;
        expect(skipEvent.preventDefault).toHaveBeenCalled();
        expect(skipLevel).toHaveBeenCalled();

        const cycleForward = createKeyEvent('KeyR', { ctrlKey: true, shiftKey: true });
        handler(cycleForward);
        expect(developerCheats.cycleForcedReward).toHaveBeenCalledWith(1);
        expect(logger.info).toHaveBeenCalledWith(
            'Developer forced reward updated',
            expect.objectContaining({ forcedReward: 'sticky-paddle' }),
        );

        const cycleBackward = createKeyEvent('KeyR', { ctrlKey: true, shiftKey: true, altKey: true });
        handler(cycleBackward);
        expect(developerCheats.cycleForcedReward).toHaveBeenCalledWith(-1);

        const applyRewardEvent = createKeyEvent('KeyF', { ctrlKey: true, shiftKey: true });
        handler(applyRewardEvent);
        expect(applyCheatReward).toHaveBeenCalledWith('double-points');

        const clearRewardEvent = createKeyEvent('Digit0', { ctrlKey: true, shiftKey: true });
        handler(clearRewardEvent);
        expect(developerCheats.clearForcedReward).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(
            'Developer forced reward cleared',
            expect.objectContaining({ forcedReward: null }),
        );

        const noRewardEvent = createKeyEvent('KeyF', { ctrlKey: true, shiftKey: true });
        handler(noRewardEvent);
        expect(logger.info).toHaveBeenCalledWith('Developer cheat ignored: no forced reward selected');

        const bindingEvent = createKeyEvent('KeyG', { ctrlKey: true, shiftKey: true });
        handler(bindingEvent);
        expect(spawnCheatPowerUp).toHaveBeenCalledWith('laser');
    });

    it('toggles overlays with keyboard shortcuts and refreshes visibility', () => {
        const harness = createRuntimeDebugHarness();
        const { runtimeDebug, documentStub, inputOverlay, physicsOverlay, renderStageSoon, setPhysicsState } = harness;

        runtimeDebug.updateOverlays({ input: inputOverlay, physics: physicsOverlay });
        runtimeDebug.install();
        const handler = documentStub.addEventListener.mock.calls[0][1] as (event: KeyboardEvent) => void;

        const inputOn = createKeyEvent('F2');
        handler(inputOn);
        expect(inputOn.preventDefault).toHaveBeenCalled();
        expect(inputOverlay.setVisible).toHaveBeenLastCalledWith(true);
        expect(inputOverlay.update).toHaveBeenCalledTimes(1);
        expect(renderStageSoon).toHaveBeenCalledTimes(1);

        const inputOff = createKeyEvent('F2');
        handler(inputOff);
        expect(inputOverlay.setVisible).toHaveBeenLastCalledWith(false);
        expect(renderStageSoon).toHaveBeenCalledTimes(2);

        setPhysicsState(null);
        const physicsOnWithoutState = createKeyEvent('F3');
        handler(physicsOnWithoutState);
        expect(physicsOverlay.setVisible).toHaveBeenLastCalledWith(true);
        expect(physicsOverlay.update).not.toHaveBeenCalled();
        expect(renderStageSoon).toHaveBeenCalledTimes(3);

        setPhysicsState({} as PhysicsDebugOverlayState);
        const physicsOff = createKeyEvent('F3');
        handler(physicsOff);
        expect(physicsOverlay.setVisible).toHaveBeenLastCalledWith(false);
        expect(renderStageSoon).toHaveBeenCalledTimes(4);

        const physicsOn = createKeyEvent('F3');
        handler(physicsOn);
        expect(physicsOverlay.setVisible).toHaveBeenLastCalledWith(true);
        expect(physicsOverlay.update).toHaveBeenCalledTimes(1);
        expect(renderStageSoon).toHaveBeenCalledTimes(5);

        runtimeDebug.resetVisibility();
        expect(inputOverlay.setVisible).toHaveBeenLastCalledWith(false);
        expect(physicsOverlay.setVisible).toHaveBeenLastCalledWith(false);
    });

    it('handles pause, resume, quit, and theme shortcuts', async () => {
        const harness = createRuntimeDebugHarness();
        const { runtimeDebug, documentStub, setPaused, setLoopRunning, pauseGame, resumeGame, quitToMenu, toggleTheme } = harness;

        runtimeDebug.install();
        const handler = documentStub.addEventListener.mock.calls[0][1] as (event: KeyboardEvent) => void;

        setPaused(false);
        setLoopRunning(true);
        const pauseEvent = createKeyEvent('KeyP');
        handler(pauseEvent);
        expect(pauseEvent.preventDefault).toHaveBeenCalled();
        expect(pauseGame).toHaveBeenCalledTimes(1);

        const resumeEvent = createKeyEvent('KeyP');
        handler(resumeEvent);
        expect(resumeEvent.preventDefault).toHaveBeenCalled();
        expect(resumeGame).toHaveBeenCalledTimes(1);

        setPaused(true);
        const quitEvent = createKeyEvent('KeyQ');
        handler(quitEvent);
        await quitToMenu.mock.results[0]?.value;
        expect(quitEvent.preventDefault).toHaveBeenCalled();
        expect(quitToMenu).toHaveBeenCalledTimes(1);

        const themeEvent = createKeyEvent('KeyC', { shiftKey: true });
        handler(themeEvent);
        expect(themeEvent.preventDefault).toHaveBeenCalled();
        expect(toggleTheme).toHaveBeenCalledTimes(1);
    });

    it('installs and disposes listeners even when no document is available', () => {
        const harness = createRuntimeDebugHarness();
        const noDocumentRuntime = createRuntimeDebug({
            documentRef: null,
            logger: harness.logger.logger,
            developerCheats: harness.developerCheatMocks.controller,
            cheatPowerUpBindings: [],
            toggleTheme: harness.toggleTheme,
            pauseGame: harness.pauseGame,
            resumeGame: harness.resumeGame,
            quitToMenu: harness.quitToMenu,
            spawnCheatPowerUp: harness.spawnCheatPowerUp,
            applyCheatReward: harness.applyCheatReward,
            skipLevel: harness.skipLevel,
            renderStageSoon: harness.renderStageSoon,
            isPaused: harness.isPaused,
            isLoopRunning: harness.isLoopRunning,
            getPhysicsDebugState: harness.getPhysicsDebugState,
        });

        expect(() => {
            noDocumentRuntime.install();
            noDocumentRuntime.dispose();
        }).not.toThrow();
    });

    it('cleans up overlays and listeners on dispose', () => {
        const harness = createRuntimeDebugHarness();
        const { runtimeDebug, documentStub, inputOverlay, physicsOverlay } = harness;

        runtimeDebug.updateOverlays({ input: inputOverlay, physics: physicsOverlay });
        runtimeDebug.install();
        runtimeDebug.dispose();

        expect(documentStub.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
        expect(inputOverlay.setVisible).toHaveBeenLastCalledWith(false);
        expect(physicsOverlay.setVisible).toHaveBeenLastCalledWith(false);
    });
});
