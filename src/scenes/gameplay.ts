import type { Scene, SceneContext } from 'render/scene-manager';

export interface GameplaySceneOptions {
    readonly onEnter?: (context: SceneContext) => void | Promise<void>;
    readonly onUpdate: (deltaSeconds: number) => void;
    readonly onExit?: () => void | Promise<void>;
}

export const createGameplayScene = (
    context: SceneContext,
    options: GameplaySceneOptions,
): Scene => ({
    async init() {
        if (options.onEnter) {
            await Promise.resolve(options.onEnter(context));
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
});
