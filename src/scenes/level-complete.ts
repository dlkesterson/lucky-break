import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { Reward } from 'game/rewards';
import type { UiSceneTransitionAction } from 'app/events';
import { GameTheme } from 'render/theme';

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

const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16);

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

            const overlay = new Graphics();
            overlay.rect(0, 0, width, height);
            overlay.fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.78 });
            overlay.eventMode = 'none';

            const panelWidth = Math.min(width * 0.7, 760);
            const panelHeight = Math.min(height * 0.62, 480);
            const panelX = (width - panelWidth) / 2;
            const panelY = (height - panelHeight) / 2;

            const panel = new Graphics();
            panel.roundRect(panelX, panelY, panelWidth, panelHeight, 28)
                .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.95 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 5, alignment: 0.5 });
            panel.eventMode = 'none';

            const defaultTitle = `Level ${payload.level} Complete`;
            const displayTitle = (options.title ? options.title(payload) : defaultTitle).toUpperCase();

            const title = new Text({
                text: displayTitle,
                style: {
                    fill: hexToNumber(GameTheme.accents.combo),
                    fontFamily: GameTheme.font,
                    fontSize: 84,
                    fontWeight: '900',
                    align: 'center',
                    letterSpacing: 1,
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, panelY + panelHeight * 0.25);

            const score = new Text({
                text: options.scoreLabel ? options.scoreLabel(payload) : `Score: ${payload.score}`,
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 30,
                    align: 'center',
                },
            });
            score.anchor.set(0.5);
            score.position.set(width / 2, panelY + panelHeight * 0.48);

            let rewardText: Text | null = null;
            if (payload.reward) {
                rewardText = new Text({
                    text: `Reward: ${describeReward(payload.reward)}`,
                    style: {
                        fill: hexToNumber(GameTheme.accents.powerUp),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 26,
                        align: 'center',
                    },
                });
                rewardText.anchor.set(0.5);
                rewardText.position.set(width / 2, panelY + panelHeight * 0.6);
            }

            promptLabel = new Text({
                text: (options.prompt ?? DEFAULT_PROMPT).toUpperCase(),
                style: {
                    fill: hexToNumber(GameTheme.accents.combo),
                    fontFamily: GameTheme.font,
                    fontSize: 34,
                    align: 'center',
                    letterSpacing: 1,
                },
            });
            promptLabel.anchor.set(0.5);
            promptLabel.position.set(width / 2, panelY + panelHeight * 0.76);

            const continueHandler = () => {
                const result = payload.onContinue();
                if (result) {
                    void Promise.resolve(result);
                }
            };

            container.on('pointertap', continueHandler);
            context.addToLayer('hud', container);
            container.addChild(overlay, panel, title, score, promptLabel);
            if (rewardText) {
                container.addChild(rewardText);
            }
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
