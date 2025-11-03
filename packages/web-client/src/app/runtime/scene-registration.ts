import type { Container } from 'pixi.js';
import { createBiasPhaseScene } from 'scenes/bias-phase';
import { createFateLedgerScene } from 'scenes/fate-ledger';
import { createGameplayScene } from 'scenes/gameplay';
import { createGameOverScene } from 'scenes/game-over';
import { createLevelCompleteScene } from 'scenes/level-complete';
import { createLoadoutSelectionScene, type LoadoutSelectionPayload } from 'scenes/loadout-selection';
import { createMainMenuScene } from 'scenes/main-menu';
import { createPauseScene } from 'scenes/pause';
import type { StageHandle } from 'render/stage';
import { getHighScores } from 'util/high-scores';
import type { Logger } from 'util/log';
import type { GameLoop } from '../loop';
import type { GameSceneServices } from '../scene-services';
import type { RuntimeInput } from './input';
import type { LoadoutSelection } from 'config/loadouts';

export interface SceneRegistrationDeps {
    readonly stage: StageHandle;
    readonly getLoop: () => GameLoop | null;
    readonly renderStageSoon: () => void;
    readonly provideSceneServices: () => GameSceneServices;
    readonly beginNewSession: (options?: { readonly loadout?: Partial<LoadoutSelection> }) => Promise<void>;
    readonly runGameplayUpdate: (deltaSeconds: number) => void;
    readonly runtimeInput: Pick<RuntimeInput, 'resetLaunchTrigger'>;
    readonly gameContainer: Container;
    readonly hudContainer: Container;
    readonly getScore: () => number;
    readonly getIsPaused: () => boolean;
    readonly setIsPaused: (value: boolean) => void;
    readonly getActiveLoadoutSelection: () => LoadoutSelection;
    readonly logger: Logger;
}

export interface SceneRegistrationResult {
    readonly pauseGame: () => void;
    readonly resumeFromPause: () => void;
    readonly quitToMenu: () => Promise<void>;
}

const pauseLegendLines = [
    'Cyan Paddle Width - Widens your paddle for extra coverage.',
    'Orange Ball Speed - Speeds up the ball and boosts scoring.',
    'Pink Multi Ball - Splits the active ball into additional balls.',
    'Green Sticky Paddle - Catches the ball until you launch again.',
    'Shift + C toggles high-contrast color mode.',
] as const;

const quitLabel = 'Tap here or press Q to quit to menu';

export const registerRuntimeScenes = async ({
    stage,
    getLoop,
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
    logger,
    getActiveLoadoutSelection,
}: SceneRegistrationDeps): Promise<SceneRegistrationResult> => {
    const quitToMenu = async (): Promise<void> => {
        const loop = getLoop();
        if (!loop) {
            return;
        }

        while (true) {
            const top = stage.getCurrentScene();
            if (!top || top === 'gameplay' || top === 'main-menu') {
                break;
            }
            stage.pop();
        }

        setIsPaused(false);
        loop.stop();
        gameContainer.visible = false;
        hudContainer.visible = false;

        try {
            await stage.transitionTo('main-menu', undefined, { immediate: true });
        } catch (error) {
            logger.error('Failed to transition to main menu', { error });
        }

        renderStageSoon();
    };

    const presentLoadoutSelection = (): void => {
        const payload: LoadoutSelectionPayload = {
            initialSelection: getActiveLoadoutSelection(),
            onCommit: async (selection) => {
                try {
                    await beginNewSession({ loadout: selection });
                } catch (error) {
                    logger.error('Failed to begin session after loadout commit', { error });
                    throw error;
                }
            },
        };

        void stage
            .push('loadout-selection', payload)
            .then(() => {
                renderStageSoon();
            })
            .catch((error) => {
                logger.error('Failed to push loadout selection scene', { error });
            });
    };

    const resumeFromPause = (): void => {
        const loop = getLoop();
        if (!loop || !getIsPaused()) {
            return;
        }

        if (stage.getCurrentScene() === 'pause') {
            stage.pop();
        }

        setIsPaused(false);
        loop.start();
        renderStageSoon();
    };

    const pauseGame = (): void => {
        const loop = getLoop();
        if (!loop || getIsPaused() || !loop.isRunning()) {
            return;
        }

        setIsPaused(true);
        loop.stop();

        const payload = {
            score: getScore(),
            legendTitle: 'Power-Up Legend',
            legendLines: pauseLegendLines,
            onResume: () => {
                resumeFromPause();
            },
            onQuit: () => {
                void quitToMenu();
            },
        } as const;

        void stage.push('pause', payload)
            .then(() => {
                renderStageSoon();
            })
            .catch((error) => {
                setIsPaused(false);
                loop.start();
                logger.error('Failed to push pause overlay', { error });
            });
    };

    stage.register('main-menu', (context) =>
        createMainMenuScene(context, {
            helpText: [
                'Drag or use arrow keys to aim the paddle',
                'Tap, space, or click to launch the ball',
                'Stack power-ups for massive combos',
            ],
            onStart: () => {
                presentLoadoutSelection();
            },
            highScoresProvider: getHighScores,
        }),
        { provideContext: provideSceneServices },
    );

    stage.register('fate-ledger', (context) => createFateLedgerScene(context), {
        provideContext: provideSceneServices,
    });

    stage.register('gameplay', (context) =>
        createGameplayScene(context, {
            onUpdate: runGameplayUpdate,
            onSuspend: () => {
                runtimeInput.resetLaunchTrigger();
            },
            onResume: () => {
                runtimeInput.resetLaunchTrigger();
            },
        }),
        { provideContext: provideSceneServices },
    );

    stage.register('pause', (context) =>
        createPauseScene(context, {
            resumeLabel: 'Tap to resume',
            quitLabel,
        }),
        { provideContext: provideSceneServices },
    );

    stage.register('level-complete', (context) =>
        createLevelCompleteScene(context, {
            prompt: 'Tap to continue',
        }),
        { provideContext: provideSceneServices },
    );

    stage.register('bias-phase', (context) => createBiasPhaseScene(context), {
        provideContext: provideSceneServices,
    });

    stage.register('loadout-selection', (context) => createLoadoutSelectionScene(context), {
        provideContext: provideSceneServices,
    });

    stage.register('game-over', (context) =>
        createGameOverScene(context, {
            prompt: 'Tap to return to menu',
            onRestart: () => {
                void quitToMenu();
            },
        }),
        { provideContext: provideSceneServices },
    );

    await stage.transitionTo('main-menu', undefined, { immediate: true });
    renderStageSoon();
    gameContainer.visible = false;
    hudContainer.visible = false;

    return {
        pauseGame,
        resumeFromPause,
        quitToMenu,
    } satisfies SceneRegistrationResult;
};
