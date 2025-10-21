import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';

export interface GameplaySceneOptions {
    readonly onEnter?: (context: SceneContext<GameSceneServices>) => void | Promise<void>;
    readonly onUpdate: (deltaSeconds: number) => void;
    readonly onExit?: () => void | Promise<void>;
    readonly onSuspend?: () => void | Promise<void>;
    readonly onResume?: () => void | Promise<void>;
}

export const createGameplayScene = (
    context: SceneContext<GameSceneServices>,
    options: GameplaySceneOptions,
): Scene<unknown, GameSceneServices> => {
    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'gameplay',
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
        init() {
            if (options.onEnter) {
                const result = options.onEnter(context);
                if (result) {
                    void Promise.resolve(result);
                }
            }
            context.renderStageSoon();
            pushIdleAudioState();
            emitSceneEvent('enter');
        },
        update(deltaSeconds) {
            options.onUpdate(deltaSeconds);
        },
        destroy() {
            if (options.onExit) {
                void Promise.resolve(options.onExit());
            }
            context.renderStageSoon();
            emitSceneEvent('exit');
            pushIdleAudioState();
        },
        suspend() {
            if (options.onSuspend) {
                void Promise.resolve(options.onSuspend());
            }
            context.renderStageSoon();
            emitSceneEvent('suspend');
            pushIdleAudioState();
        },
        resume() {
            if (options.onResume) {
                void Promise.resolve(options.onResume());
            }
            context.renderStageSoon();
            emitSceneEvent('resume');
            pushIdleAudioState();
        },
    };
};
