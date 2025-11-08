import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { AchievementUnlock } from 'app/achievements';
import type { UiSceneTransitionAction } from 'app/events';
import { gameOverUiBridge } from 'ui/state/game-over-bridge';

export interface GameOverPayload {
    readonly score: number;
    readonly achievements?: readonly AchievementUnlock[];
    readonly dustAwarded?: number;
}

export interface GameOverSceneOptions {
    readonly title?: (payload: GameOverPayload) => string;
    readonly scoreLabel?: (payload: GameOverPayload) => string;
    readonly prompt?: string;
    readonly onRestart: () => void | Promise<void>;
}

const DEFAULT_TITLE = 'Game Over';
const DEFAULT_PROMPT = 'Main Menu';

export const createGameOverScene = (
    context: SceneContext<GameSceneServices>,
    options: GameOverSceneOptions,
): Scene<GameOverPayload, GameSceneServices> => {
    let destroyed = false;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'game-over',
            action,
        });
    };

    const pushIdleAudioState = () => {
        context.audioState$.next({
            combo: 0,
            activePowerUps: [],
            lookAheadMs: context.scheduler.lookAheadMs,
        });
    };

    return {
        init(payload) {
            destroyed = false;
            const effectivePayload = payload ?? { score: 0 } satisfies GameOverPayload;

            const handleRestart = async () => {
                if (destroyed) {
                    return;
                }
                await Promise.resolve(options.onRestart());
            };

            gameOverUiBridge.enter({
                score: effectivePayload.score,
                title: options.title ? options.title(effectivePayload) : DEFAULT_TITLE,
                prompt: options.prompt ?? DEFAULT_PROMPT,
                scoreLabel: options.scoreLabel
                    ? options.scoreLabel(effectivePayload)
                    : `Final Score: ${effectivePayload.score}`,
                achievements: effectivePayload.achievements ?? [],
                dustAwarded:
                    typeof effectivePayload.dustAwarded === 'number'
                        ? Math.max(0, Math.trunc(effectivePayload.dustAwarded))
                        : null,
                onRestart: handleRestart,
            });

            pushIdleAudioState();
            emitSceneEvent('enter');
            context.renderStageSoon();
        },
        update(deltaSeconds) {
            void deltaSeconds;
        },
        destroy() {
            destroyed = true;
            gameOverUiBridge.exit();
            pushIdleAudioState();
            emitSceneEvent('exit');
            context.renderStageSoon();
        },
        suspend() {
            pushIdleAudioState();
            emitSceneEvent('suspend');
            gameOverUiBridge.suspend();
        },
        resume() {
            pushIdleAudioState();
            emitSceneEvent('resume');
            gameOverUiBridge.resume();
            context.renderStageSoon();
        },
    };
};
