import { Container, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';

export interface MainMenuSceneOptions {
    readonly title?: string;
    readonly prompt?: string;
    readonly helpText?: readonly string[];
    readonly onStart: () => void | Promise<void>;
}

const DEFAULT_TITLE = 'Lucky Break';
const DEFAULT_PROMPT = 'Tap anywhere to begin';

export const createMainMenuScene = (
    context: SceneContext,
    options: MainMenuSceneOptions,
): Scene => {
    let container: Container | null = null;
    let promptLabel: Text | null = null;
    let helpLabel: Text | null = null;
    let elapsed = 0;

    const handleStart = async () => {
        await Promise.resolve(options.onStart());
    };

    return {
        async init() {
            container = new Container();
            container.eventMode = 'static';
            container.cursor = 'pointer';
            container.on('pointertap', handleStart);

            const { width, height } = context.designSize;

            const title = new Text({
                text: options.title ?? DEFAULT_TITLE,
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Overpass, Arial, sans-serif',
                    fontSize: 64,
                    fontWeight: 'bold',
                    align: 'center',
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, height / 2 - 60);

            promptLabel = new Text({
                text: options.prompt ?? DEFAULT_PROMPT,
                style: {
                    fill: 0xffe066,
                    fontFamily: 'Arial',
                    fontSize: 32,
                    align: 'center',
                },
            });
            promptLabel.anchor.set(0.5);
            promptLabel.position.set(width / 2, height / 2 + 40);

            const helpLines = options.helpText ?? [
                'Left/right drag or arrow keys to move the paddle',
                'Tap or press space to launch the ball',
                'Catch power-ups to stack modifiers',
            ];

            helpLabel = new Text({
                text: helpLines.join('\n'),
                style: {
                    fill: 0xa0a0a0,
                    fontFamily: 'Arial',
                    fontSize: 20,
                    align: 'center',
                },
            });
            helpLabel.anchor.set(0.5, 0);
            helpLabel.position.set(width / 2, height / 2 + 100);

            container.addChild(title, promptLabel, helpLabel);
            context.addToLayer('hud', container);
        },
        update(deltaSeconds) {
            if (!promptLabel) {
                return;
            }

            elapsed += deltaSeconds;
            const pulse = (Math.sin(elapsed * 2.5) + 1) / 2;
            promptLabel.alpha = 0.5 + pulse * 0.5;
        },
        destroy() {
            if (container) {
                container.off('pointertap', handleStart);
                context.removeFromLayer(container);
                container.destroy({ children: true });
            }
            container = null;
            promptLabel = null;
            helpLabel = null;
        },
    };
};
