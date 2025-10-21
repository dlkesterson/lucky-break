import { Container, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { Reward } from 'game/rewards';
import type { UiSceneTransitionAction } from 'app/events';

export interface LevelCompletePayload {
    readonly level: number;
    readonly score: number;
    readonly onContinue: () => void | Promise<void>;
    readonly reward?: Reward;
}

export interface LevelCompleteSceneOptions {
    readonly title?: (payload: LevelCompletePayload) => string;
    readonly scoreLabel?: (payload: LevelCompletePayload) => string;
    readonly prompt?: string;
}

const DEFAULT_PROMPT = 'Tap to continue';

const describeReward = (reward: Reward): string => {
    switch (reward.type) {
        case 'double-points':
            return `Double Points x${reward.multiplier}`;
        case 'ghost-brick':
            return `Ghost ${reward.ghostCount} Bricks`;
        case 'sticky-paddle':
            return 'Sticky Paddle Boost';
        case 'multi-ball':
            return `Multi Ball +${reward.extraBalls}`;
        case 'slow-time':
            return `Slow Time ${Math.round((1 - reward.timeScale) * 100)}%`; // approx slowdown
        case 'wide-paddle':
            return `Wide Paddle ×${reward.widthMultiplier.toFixed(2)}`;
        default:
            return 'Mystery Reward';
    }
};

export const createLevelCompleteScene = (
    context: SceneContext<GameSceneServices>,
    options: LevelCompleteSceneOptions = {},
): Scene<LevelCompletePayload, GameSceneServices> => {
    let container: Container | null = null;
    let promptLabel: Text | null = null;
    let elapsed = 0;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'level-complete',
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

    const setInteraction = (enabled: boolean) => {
        if (!container) {
            return;
        }

        container.eventMode = enabled ? 'static' : 'none';
        container.interactiveChildren = enabled;
        container.cursor = enabled ? 'pointer' : 'default';
        context.renderStageSoon();
    };

    const teardown = () => {
        if (container) {
            container.removeAllListeners();
            setInteraction(false);
            context.removeFromLayer(container);
            container.destroy({ children: true });
        }
        container = null;
        promptLabel = null;
        elapsed = 0;
        context.renderStageSoon();
    };

    return {
        init(payload) {
            if (!payload) {
                throw new Error('LevelCompleteScene requires payload');
            }

            container = new Container();
            setInteraction(true);

            const { width, height } = context.designSize;

            const title = new Text({
                text: options.title ? options.title(payload) : `Level ${payload.level} Complete`,
                style: {
                    fill: 0x66ff99,
                    fontFamily: 'Overpass, "Overpass Mono", sans-serif',
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
                    fontFamily: 'Overpass Mono',
                    fontSize: 32,
                    align: 'center',
                },
            });
            score.anchor.set(0.5);
            score.position.set(width / 2, height / 2 - 10);

            if (payload.reward) {
                const rewardText = new Text({
                    text: `Reward: ${describeReward(payload.reward)}`,
                    style: {
                        fill: 0xffb347,
                        fontFamily: 'Overpass Mono',
                        fontSize: 26,
                        align: 'center',
                    },
                });
                rewardText.anchor.set(0.5);
                rewardText.position.set(width / 2, height / 2 + 35);
                container.addChild(rewardText);
            }

            promptLabel = new Text({
                text: options.prompt ?? DEFAULT_PROMPT,
                style: {
                    fill: 0xffe066,
                    fontFamily: 'Overpass Mono',
                    fontSize: 28,
                    align: 'center',
                },
            });
            promptLabel.anchor.set(0.5);
            promptLabel.position.set(width / 2, height / 2 + 60);

            const continueHandler = () => {
                const result = payload.onContinue();
                if (result) {
                    void Promise.resolve(result);
                }
            };

            container.on('pointertap', continueHandler);
            context.addToLayer('hud', container);
            container.addChild(title, score, promptLabel);
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
            teardown();
            pushIdleAudioState();
            emitSceneEvent('exit');
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
