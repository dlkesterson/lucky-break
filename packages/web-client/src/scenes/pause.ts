import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import { pauseUiBridge } from 'ui/state/pause-bridge';
import type { LegendItem } from 'ui/scenes/PauseView';

export interface PauseScenePayload {
    readonly score: number;
    readonly legendTitle?: string;
    readonly legendItems?: readonly LegendItem[];
    readonly onResume: () => void | Promise<void>;
    readonly onQuit?: () => void | Promise<void>;
}

export interface PauseSceneOptions {
    readonly title?: string;
    readonly resumeLabel?: string;
    readonly quitLabel?: string;
}

const DEFAULT_TITLE = 'Paused';
const DEFAULT_RESUME_LABEL = 'Tap to resume';
const DEFAULT_QUIT_LABEL = 'Hold Q to quit to menu';

export const createPauseScene = (
    context: SceneContext<GameSceneServices>,
    options: PauseSceneOptions = {},
): Scene<PauseScenePayload, GameSceneServices> => {
    let destroyed = false;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'pause',
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
            if (!payload) {
                throw new Error('PauseScene requires a payload');
            }

            destroyed = false;

            const resume = async () => {
                if (destroyed) {
                    return;
                }
                await Promise.resolve(payload.onResume());
            };

            const quit = payload.onQuit
                ? async () => {
                    if (destroyed) {
                        return;
                    }
                    await Promise.resolve(payload.onQuit?.());
                }
                : null;

            pauseUiBridge.enter({
                title: options.title ?? DEFAULT_TITLE,
                score: payload.score,
                legendTitle: payload.legendTitle ?? null,
                legendItems: payload.legendItems ?? [],
                resumeLabel: options.resumeLabel ?? DEFAULT_RESUME_LABEL,
                quitLabel: payload.onQuit ? options.quitLabel ?? DEFAULT_QUIT_LABEL : null,
                onResume: resume,
                onQuit: quit,
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
            pauseUiBridge.exit();
            pushIdleAudioState();
            emitSceneEvent('exit');
            context.renderStageSoon();
        },
        suspend() {
            pushIdleAudioState();
            emitSceneEvent('suspend');
            pauseUiBridge.suspend();
        },
        resume() {
            pushIdleAudioState();
            emitSceneEvent('resume');
            pauseUiBridge.resume();
            context.renderStageSoon();
        },
    };
};
