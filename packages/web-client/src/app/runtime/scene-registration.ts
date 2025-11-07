import type { Container } from 'pixi.js';
import { createBiasPhaseScene } from 'scenes/bias-phase';
import { createFateLedgerScene } from 'scenes/fate-ledger';
import { createGameplayScene } from 'scenes/gameplay';
import { createGameOverScene } from 'scenes/game-over';
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
import type { LegendItem } from 'ui/scenes/PauseView';

export interface SceneRegistrationDeps {
    readonly stage: StageHandle;
    readonly getLoop: () => GameLoop | null;
    readonly renderStageSoon: () => void;
    readonly provideSceneServices: () => GameSceneServices;
    readonly beginNewSession: (options?: { readonly loadout?: Partial<LoadoutSelection> }) => Promise<void>;
    readonly runGameplayUpdate: (deltaSeconds: number) => void;
    readonly runtimeInput: Pick<RuntimeInput, 'resetLaunchTrigger'>;
    readonly gameContainer: Container;
    readonly hudContainer: Pick<Container, 'visible'>;
    readonly getScore: () => number;
    readonly getIsPaused: () => boolean;
    readonly setIsPaused: (value: boolean) => void;
    readonly getActiveLoadoutSelection: () => LoadoutSelection;
    readonly onLoopStarted: () => void;
    readonly onLoopStopped: () => void;
    readonly logger: Logger;
}

export interface SceneRegistrationResult {
    readonly pauseGame: () => void;
    readonly resumeFromPause: () => void;
    readonly quitToMenu: () => Promise<void>;
}

const pauseLegendItems: readonly LegendItem[] = [
    { type: 'paddle-width', text: 'Cyan Paddle Width - Widens your paddle for extra coverage.' },
    { type: 'ball-speed', text: 'Blue Ball Speed - Speeds up the ball and boosts scoring.' },
    { type: 'multi-ball', text: 'Pink Multi Ball - Splits the active ball into additional balls.' },
    { type: 'sticky-paddle', text: 'Teal Sticky Paddle - Catches the ball until you launch again.' },
    { type: 'laser', text: 'Red Laser - Fire devastating beams to destroy bricks.' },
    { text: 'Shift + C toggles high-contrast color mode.' },
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
    onLoopStarted,
    onLoopStopped,
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
        onLoopStopped();
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
            onCommit: async (selection: LoadoutSelection) => {
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

        hudContainer.visible = true;
        setIsPaused(false);
        loop.start();
        onLoopStarted();
        renderStageSoon();
    };

    const pauseGame = (): void => {
        const loop = getLoop();
        if (!loop || getIsPaused() || !loop.isRunning()) {
            return;
        }

        setIsPaused(true);
        loop.stop();
        onLoopStopped();

        hudContainer.visible = false;

        const payload = {
            score: getScore(),
            legendTitle: 'Power-Up Legend',
            legendItems: pauseLegendItems,
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
                onLoopStarted();
                hudContainer.visible = true;
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
