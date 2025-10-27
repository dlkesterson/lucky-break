import type { RewardType } from 'game/rewards';
import type { InputDebugOverlay, PhysicsDebugOverlay, PhysicsDebugOverlayState } from 'render/debug-overlay';
import type { DeveloperCheatController } from '../developer-cheats';
import type { Logger } from 'util/log';
import type { PowerUpType } from 'util/power-ups';

export interface RuntimeDebugOptions {
    readonly documentRef?: Document | null;
    readonly logger: Logger;
    readonly developerCheats: DeveloperCheatController;
    readonly cheatPowerUpBindings: readonly { code: KeyboardEvent['code']; type: PowerUpType }[];
    readonly toggleTheme: () => void;
    readonly pauseGame: () => void;
    readonly resumeGame: () => void;
    readonly quitToMenu: () => void | Promise<void>;
    readonly spawnCheatPowerUp: (type: PowerUpType) => void;
    readonly applyCheatReward: (reward: RewardType) => void;
    readonly skipLevel: () => void | Promise<void>;
    readonly renderStageSoon: () => void;
    readonly isPaused: () => boolean;
    readonly isLoopRunning: () => boolean;
    readonly getPhysicsDebugState: () => PhysicsDebugOverlayState | null;
}

export interface RuntimeDebugOverlays {
    readonly input: InputDebugOverlay | null;
    readonly physics: PhysicsDebugOverlay | null;
}

export interface RuntimeDebug {
    install(): void;
    dispose(): void;
    updateOverlays(overlays: RuntimeDebugOverlays): void;
    resetVisibility(): void;
}

const defaultDocument = (): Document | null => {
    if (typeof document === 'undefined') {
        return null;
    }
    return document;
};

export const createRuntimeDebug = ({
    documentRef,
    logger,
    developerCheats,
    cheatPowerUpBindings,
    toggleTheme,
    pauseGame,
    resumeGame,
    quitToMenu,
    spawnCheatPowerUp,
    applyCheatReward,
    skipLevel,
    renderStageSoon,
    isPaused,
    isLoopRunning,
    getPhysicsDebugState,
}: RuntimeDebugOptions): RuntimeDebug => {
    const targetDocument = documentRef ?? defaultDocument();
    let inputOverlay: InputDebugOverlay | null = null;
    let physicsOverlay: PhysicsDebugOverlay | null = null;

    const overlayVisibility: Record<'input' | 'physics', boolean> = {
        input: false,
        physics: false,
    };

    const applyOverlayVisibility = () => {
        if (inputOverlay) {
            inputOverlay.setVisible(overlayVisibility.input);
            if (overlayVisibility.input) {
                inputOverlay.update();
            }
        }
        if (physicsOverlay) {
            physicsOverlay.setVisible(overlayVisibility.physics);
            if (overlayVisibility.physics) {
                const state = getPhysicsDebugState();
                if (state) {
                    physicsOverlay.update(state);
                }
            }
        }
    };

    const setOverlays = (overlays: RuntimeDebugOverlays) => {
        inputOverlay = overlays.input;
        physicsOverlay = overlays.physics;
        applyOverlayVisibility();
    };

    const toggleInputOverlay = () => {
        overlayVisibility.input = !overlayVisibility.input;
        applyOverlayVisibility();
        renderStageSoon();
    };

    const togglePhysicsOverlay = () => {
        overlayVisibility.physics = !overlayVisibility.physics;
        applyOverlayVisibility();
        renderStageSoon();
    };

    const handleCheatKeyDown = (event: KeyboardEvent): boolean => {
        if (event.code === 'F10' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const nextState = developerCheats.toggleEnabled();
            logger.info('Developer cheats toggled', {
                enabled: nextState.enabled,
                forcedReward: nextState.forcedReward,
            });
            return true;
        }

        if (!developerCheats.isEnabled()) {
            return false;
        }

        if (event.code === 'KeyN' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            void skipLevel();
            return true;
        }

        if (event.code === 'KeyR' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const direction: 1 | -1 = event.altKey ? -1 : 1;
            const nextState = developerCheats.cycleForcedReward(direction);
            logger.info('Developer forced reward updated', { forcedReward: nextState.forcedReward });
            return true;
        }

        if (event.code === 'Digit0' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const nextState = developerCheats.clearForcedReward();
            logger.info('Developer forced reward cleared', { forcedReward: nextState.forcedReward });
            return true;
        }

        if (event.code === 'KeyF' && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            const forcedReward = developerCheats.getState().forcedReward;
            if (forcedReward) {
                applyCheatReward(forcedReward);
            } else {
                logger.info('Developer cheat ignored: no forced reward selected');
            }
            return true;
        }

        const binding = cheatPowerUpBindings.find((entry) => entry.code === event.code);
        if (binding && event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            spawnCheatPowerUp(binding.type);
            return true;
        }

        return false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (handleCheatKeyDown(event)) {
            return;
        }

        if (event.code === 'KeyP' || event.code === 'Escape') {
            if (isPaused()) {
                event.preventDefault();
                resumeGame();
            } else if (isLoopRunning()) {
                event.preventDefault();
                pauseGame();
            }
            return;
        }

        if (event.code === 'KeyQ' && isPaused()) {
            event.preventDefault();
            void quitToMenu();
            return;
        }

        if (event.code === 'KeyC' && event.shiftKey) {
            event.preventDefault();
            toggleTheme();
            return;
        }

        if (event.code === 'F2') {
            event.preventDefault();
            toggleInputOverlay();
            return;
        }

        if (event.code === 'F3') {
            event.preventDefault();
            togglePhysicsOverlay();
        }
    };

    const install = () => {
        if (!targetDocument) {
            return;
        }
        targetDocument.addEventListener('keydown', handleKeyDown);
    };

    const dispose = () => {
        if (!targetDocument) {
            return;
        }
        targetDocument.removeEventListener('keydown', handleKeyDown);
        inputOverlay = null;
        physicsOverlay = null;
        overlayVisibility.input = false;
        overlayVisibility.physics = false;
    };

    const resetVisibility = () => {
        overlayVisibility.input = false;
        overlayVisibility.physics = false;
        applyOverlayVisibility();
    };

    return {
        install,
        dispose,
        updateOverlays: setOverlays,
        resetVisibility,
    } satisfies RuntimeDebug;
};
