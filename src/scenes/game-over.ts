import { Container, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';

export interface GameOverPayload {
    readonly score: number;
}

export interface GameOverSceneOptions {
    readonly title?: (payload: GameOverPayload) => string;
    readonly scoreLabel?: (payload: GameOverPayload) => string;
    readonly prompt?: string;
    readonly onRestart: () => void | Promise<void>;
}

const DEFAULT_TITLE = 'Game Over';
const DEFAULT_PROMPT = 'Tap to try again';

export const createGameOverScene = (
    context: SceneContext,
    options: GameOverSceneOptions,
): Scene<GameOverPayload> => {
    let container: Container | null = null;
    let promptLabel: Text | null = null;
    let scoreLabel: Text | null = null;
    let elapsed = 0;

    const restart = () => {
        const result = options.onRestart();
        if (result) {
            void Promise.resolve(result);
        }
    };

    const setInteraction = (enabled: boolean) => {
        if (!container) {
            return;
        }

        container.eventMode = enabled ? 'static' : 'none';
        container.interactiveChildren = enabled;
        container.cursor = enabled ? 'pointer' : 'default';
    };

    return {
        init(payload) {
            container = new Container();
            setInteraction(true);
            container.on('pointertap', restart);

            const { width, height } = context.designSize;
            const effectivePayload = payload ?? { score: 0 };

            const title = new Text({
                text: options.title ? options.title(effectivePayload) : DEFAULT_TITLE,
                style: {
                    fill: 0xff6666,
                    fontFamily: 'Overpass, "Overpass Mono", sans-serif',
                    fontSize: 56,
                    fontWeight: 'bold',
                    align: 'center',
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, height / 2 - 80);

            scoreLabel = new Text({
                text: options.scoreLabel
                    ? options.scoreLabel(effectivePayload)
                    : `Final Score: ${effectivePayload.score}`,
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Overpass Mono',
                    fontSize: 32,
                    align: 'center',
                },
            });
            scoreLabel.anchor.set(0.5);
            scoreLabel.position.set(width / 2, height / 2 - 10);

            promptLabel = new Text({
                text: options.prompt ?? DEFAULT_PROMPT,
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Overpass Mono',
                    fontSize: 28,
                    align: 'center',
                },
            });
            promptLabel.anchor.set(0.5);
            promptLabel.position.set(width / 2, height / 2 + 60);

            container.addChild(title, scoreLabel, promptLabel);
            context.addToLayer('hud', container);
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
            if (container) {
                container.off('pointertap', restart);
                setInteraction(false);
                context.removeFromLayer(container);
                container.destroy({ children: true });
            }
            container = null;
            promptLabel = null;
            scoreLabel = null;
        },
        suspend() {
            setInteraction(false);
        },
        resume() {
            setInteraction(true);
        },
    };
};
