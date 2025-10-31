import type { Logger } from 'util/log';
import type { PowerUpType } from 'util/power-ups';
import type { RewardType } from 'game/rewards';
import type { PhysicsDebugOverlayState } from 'render/debug-overlay';
import type { DeveloperCheatController } from '../developer-cheats';
import { developerCheats as defaultDeveloperCheatController } from '../developer-cheats';
import type { DeveloperCheatDeps } from './developer-cheats';
import { createDeveloperCheats } from './developer-cheats';
import type { RegisterE2EHarnessDeps } from './e2e-harness';
import { registerE2EHarnessControls } from './e2e-harness';
import type { RuntimeDebug, RuntimeDebugOverlays } from './debug';
import { createRuntimeDebug } from './debug';

export interface CheatPowerUpBinding {
    readonly code: KeyboardEvent['code'];
    readonly type: PowerUpType;
}

export interface DebugHarnessSetupDeps {
    readonly logger: Logger;
    readonly cheatPowerUpBindings: readonly CheatPowerUpBinding[];
    readonly toggleTheme: () => void;
    readonly pauseGame: () => void;
    readonly resumeGame: () => void | Promise<void>;
    readonly quitToMenu: () => void | Promise<void>;
    readonly renderStageSoon: () => void;
    readonly isPaused: () => boolean;
    readonly isLoopRunning: () => boolean;
    readonly getPhysicsDebugState: () => PhysicsDebugOverlayState | null;
    readonly developerCheatDeps: DeveloperCheatDeps;
    readonly harnessDeps: Omit<RegisterE2EHarnessDeps, 'skipToNextLevel'>;
    readonly overlays: RuntimeDebugOverlays;
    readonly documentRef?: Document | null;
    readonly developerCheatController?: DeveloperCheatController;
}

export interface DebugHarnessSetupResult {
    readonly runtimeDebug: RuntimeDebug;
}

export const setupDebugHarnessIntegrations = ({
    logger,
    cheatPowerUpBindings,
    toggleTheme,
    pauseGame,
    resumeGame,
    quitToMenu,
    renderStageSoon,
    isPaused,
    isLoopRunning,
    getPhysicsDebugState,
    developerCheatDeps,
    harnessDeps,
    overlays,
    documentRef,
    developerCheatController = defaultDeveloperCheatController,
}: DebugHarnessSetupDeps): DebugHarnessSetupResult => {
    const cheats = createDeveloperCheats(developerCheatDeps);

    registerE2EHarnessControls({
        ...harnessDeps,
        skipToNextLevel: () => {
            cheats.skipToNextLevelCheat();
        },
    });

    const runtimeDebug = createRuntimeDebug({
        documentRef,
        logger,
        developerCheats: developerCheatController,
        cheatPowerUpBindings,
        toggleTheme,
        pauseGame,
        resumeGame: () => {
            void resumeGame();
        },
        quitToMenu,
        spawnCheatPowerUp: (type: PowerUpType) => {
            cheats.spawnPowerUpCheat(type);
        },
        applyCheatReward: (reward: RewardType) => {
            cheats.applyRewardCheat(reward);
        },
        skipLevel: () => {
            cheats.skipToNextLevelCheat();
        },
        renderStageSoon,
        isPaused,
        isLoopRunning,
        getPhysicsDebugState,
    });

    runtimeDebug.install();
    runtimeDebug.updateOverlays(overlays);

    return {
        runtimeDebug,
    } satisfies DebugHarnessSetupResult;
};
