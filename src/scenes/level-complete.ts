import { Container, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';

export interface LevelCompletePayload {
    readonly level: number;
    readonly score: number;
    readonly onContinue: () => void | Promise<void>;
}

export interface LevelCompleteSceneOptions {
    readonly title?: (payload: LevelCompletePayload) => string;
    readonly scoreLabel?: (payload: LevelCompletePayload) => string;
    readonly prompt?: string;
}

const DEFAULT_PROMPT = 'Tap to continue';

export const createLevelCompleteScene = (
    context: SceneContext,
    options: LevelCompleteSceneOptions = {},
): Scene<LevelCompletePayload> => {
    let container: Container | null = null;
    let promptLabel: Text | null = null;
    let elapsed = 0;

    const teardown = () => {
        if (container) {
            container.removeAllListeners();
            context.removeFromLayer(container);
            container.destroy({ children: true });
        }
        container = null;
        promptLabel = null;
        elapsed = 0;
    };

    return {
        async init(payload) {
            if (!payload) {
                throw new Error('LevelCompleteScene requires payload');
            }

            container = new Container();
            container.eventMode = 'static';
            container.cursor = 'pointer';

            const { width, height } = context.designSize;

            const title = new Text({
                text: options.title ? options.title(payload) : `Level ${payload.level} Complete`,
                style: {
                    fill: 0x66ff99,
                    fontFamily: 'Overpass, Arial, sans-serif',
                    fontSize: 56,
                    fontWeight: 'bold',
                    align: 'center',
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, height / 2 - 80);

            const score = new Text({
                text: options.scoreLabel ? options.scoreLabel(payload) : `Score: ${payload.score}`,
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Arial',
                    fontSize: 32,
                    align: 'center',
                },
            });
            score.anchor.set(0.5);
            score.position.set(width / 2, height / 2 - 10);

            promptLabel = new Text({
                text: options.prompt ?? DEFAULT_PROMPT,
                style: {
                    fill: 0xffe066,
                    fontFamily: 'Arial',
                    fontSize: 28,
                    align: 'center',
                },
            });
            promptLabel.anchor.set(0.5);
            promptLabel.position.set(width / 2, height / 2 + 60);

            const continueHandler = async () => {
                await Promise.resolve(payload.onContinue());
            };

            container.on('pointertap', continueHandler);
            context.addToLayer('hud', container);
            container.addChild(title, score, promptLabel);
        },
        update(deltaSeconds) {
            if (!promptLabel) {
                return;
            }
            elapsed += deltaSeconds;
            const pulse = (Math.sin(elapsed * 3) + 1) / 2;
            promptLabel.alpha = 0.4 + pulse * 0.6;
        },
        destroy() {
            teardown();
        },
    };
};
