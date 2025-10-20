import type { Scene, SceneContext } from 'render/scene-manager';

export interface GameplaySceneOptions {
    readonly onEnter?: (context: SceneContext) => void | Promise<void>;
    readonly onUpdate: (deltaSeconds: number) => void;
    readonly onExit?: () => void | Promise<void>;
    readonly onSuspend?: () => void | Promise<void>;
    readonly onResume?: () => void | Promise<void>;
}

export const createGameplayScene = (
    context: SceneContext,
    options: GameplaySceneOptions,
): Scene => ({
    init() {
        if (options.onEnter) {
            const result = options.onEnter(context);
            if (result) {
                void Promise.resolve(result);
            }
        }
    },
    update(deltaSeconds) {
        options.onUpdate(deltaSeconds);
    },
    destroy() {
        if (options.onExit) {
            void Promise.resolve(options.onExit());
        }
    },
    suspend() {
        if (options.onSuspend) {
            void Promise.resolve(options.onSuspend());
        }
    },
    resume() {
        if (options.onResume) {
            void Promise.resolve(options.onResume());
        }
    },
});
