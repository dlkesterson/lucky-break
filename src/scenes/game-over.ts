import { Container, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';

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
    context: SceneContext<GameSceneServices>,
    options: GameOverSceneOptions,
): Scene<GameOverPayload, GameSceneServices> => {
    let container: Container | null = null;
    let promptLabel: Text | null = null;
    let scoreLabel: Text | null = null;
    let elapsed = 0;

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
        context.renderStageSoon();
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
            context.renderStageSoon();
            pushIdleAudioState();
            emitSceneEvent('enter');
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
            pushIdleAudioState();
            emitSceneEvent('exit');
            context.renderStageSoon();
        },
        suspend() {
            setInteraction(false);
            pushIdleAudioState();
            emitSceneEvent('suspend');
        },
        resume() {
            setInteraction(true);
            pushIdleAudioState();
            emitSceneEvent('resume');
        },
    };
};
