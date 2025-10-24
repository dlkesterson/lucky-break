import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { AchievementUnlock } from 'app/achievements';
import type { Reward } from 'game/rewards';
import type { UiSceneTransitionAction } from 'app/events';
import { GameTheme } from 'render/theme';

export interface RoundRecapMetrics {
    readonly roundScore: number;
    readonly totalScore: number;
    readonly bricksBroken: number;
    readonly brickTotal: number;
    readonly bestCombo: number;
    readonly volleyLength: number;
    readonly speedPressure: number;
    readonly coinsCollected: number;
    readonly durationMs: number;
}

export interface LevelCompletePayload {
    readonly level: number;
    readonly score: number;
    readonly onContinue: () => void | Promise<void>;
    readonly reward?: Reward;
    readonly achievements?: readonly AchievementUnlock[];
    readonly recap: RoundRecapMetrics;
    readonly milestones?: readonly string[];
}

export interface LevelCompleteSceneOptions {
    readonly title?: (payload: LevelCompletePayload) => string;
    readonly scoreLabel?: (payload: LevelCompletePayload) => string;
    readonly prompt?: string;
}

const DEFAULT_PROMPT = 'Tap to continue';

const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16);

const formatScore = (value: number): string => value.toLocaleString();

const formatDuration = (milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
        return '0:00';
    }

    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatPercentage = (value: number): string => {
    if (!Number.isFinite(value)) {
        return '0%';
    }

    const clamped = Math.max(0, Math.min(1, value));
    return `${Math.round(clamped * 100)}%`;
};

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
            const panelHeight = Math.min(height * 0.66, 520);
            const panelX = (width - panelWidth) / 2;
            const panelY = (height - panelHeight) / 2;

            const panel = new Graphics();
            panel.roundRect(panelX, panelY, panelWidth, panelHeight, 28)
                .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.95 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 5, alignment: 0.5 });
            panel.eventMode = 'none';

            const defaultTitle = `Level ${payload.level} Complete`;
            const displayTitle = (options.title ? options.title(payload) : defaultTitle).toUpperCase();

            const contentPadding = 44;
            const contentLeft = panelX + contentPadding;
            const contentRight = panelX + panelWidth - contentPadding;
            const contentCenterX = panelX + panelWidth / 2;

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
            title.position.set(contentCenterX, panelY + 120);

            const score = new Text({
                text: options.scoreLabel ? options.scoreLabel(payload) : `Total Score: ${formatScore(payload.score)}`,
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 36,
                    align: 'center',
                },
            });
            score.anchor.set(0.5);
            score.position.set(contentCenterX, title.y + 68);

            let rewardText: Text | null = null;
            if (payload.reward) {
                rewardText = new Text({
                    text: `Reward: ${describeReward(payload.reward)}`,
                    style: {
                        fill: hexToNumber(GameTheme.accents.powerUp),
                        fontFamily: GameTheme.font,
                        fontSize: 32,
                        fontWeight: '700',
                        align: 'center',
                    },
                });
                rewardText.anchor.set(0.5);
                rewardText.position.set(contentCenterX, score.y + 52);
            }

            const host = container;
            if (!host) {
                throw new Error('LevelCompleteScene container not initialized');
            }

            const recap = payload.recap;
            const statLabels = [
                {
                    label: 'Round Score',
                    value: `+${formatScore(recap.roundScore)}`,
                },
                {
                    label: 'Bricks Cleared',
                    value: `${recap.bricksBroken}/${recap.brickTotal}`,
                },
                {
                    label: 'Best Combo',
                    value: `x${recap.bestCombo}`,
                },
                {
                    label: 'Volley Length',
                    value: `${recap.volleyLength}`,
                },
                {
                    label: 'Speed Pressure Peak',
                    value: `${formatPercentage(recap.speedPressure)}`,
                },
                {
                    label: 'Coins Collected',
                    value: `${formatScore(recap.coinsCollected)}`,
                },
                {
                    label: 'Duration',
                    value: `${formatDuration(recap.durationMs)}`,
                },
            ];

            const statStartY = (rewardText?.y ?? score.y) + 60;
            const statSpacing = 40;

            const divider = new Graphics();
            divider.moveTo(contentLeft, statStartY - 36)
                .lineTo(contentRight, statStartY - 36)
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 3, alpha: 0.55 });

            const labelStyle = {
                fontFamily: GameTheme.monoFont,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontSize: 24,
            } as const;

            const valueStyle = {
                fontFamily: GameTheme.monoFont,
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontSize: 26,
            } as const;

            statLabels.forEach(({ label, value }, index) => {
                const statY = statStartY + index * statSpacing;

                const labelText = new Text({
                    text: label.toUpperCase(),
                    style: { ...labelStyle, letterSpacing: 1 },
                });
                labelText.anchor.set(0, 0.5);
                labelText.position.set(contentLeft, statY);

                const valueText = new Text({
                    text: value,
                    style: valueStyle,
                });
                valueText.anchor.set(1, 0.5);
                valueText.position.set(contentRight, statY);

                host.addChild(labelText, valueText);
            });

            const extrasLayer = new Container();
            host.addChild(extrasLayer);

            const extrasBaseY = statStartY + (statLabels.length - 1) * statSpacing + 60;
            let extrasOffset = 0;
            const achievements = payload.achievements ?? [];

            const milestones = payload.milestones ?? [];
            if (milestones.length > 0) {
                const milestoneHeading = new Text({
                    text: 'Milestones',
                    style: {
                        fill: hexToNumber(GameTheme.accents.combo),
                        fontFamily: GameTheme.font,
                        fontSize: 40,
                        fontWeight: '700',
                        align: 'left',
                        letterSpacing: 1,
                    },
                });
                milestoneHeading.anchor.set(0, 0.5);
                milestoneHeading.position.set(contentLeft, extrasBaseY + extrasOffset);
                extrasLayer.addChild(milestoneHeading);
                extrasOffset += 34;

                milestones.forEach((label) => {
                    const detail = new Text({
                        text: label,
                        style: {
                            fill: hexToNumber(GameTheme.hud.textSecondary),
                            fontFamily: GameTheme.monoFont,
                            fontSize: 24,
                            align: 'left',
                        },
                    });
                    detail.anchor.set(0, 0.5);
                    detail.position.set(contentLeft, extrasBaseY + extrasOffset);
                    extrasLayer.addChild(detail);
                    extrasOffset += 28;
                });

                extrasOffset += 12;
            }

            if (achievements.length > 0) {
                const heading = new Text({
                    text: 'Achievements Unlocked',
                    style: {
                        fill: hexToNumber(GameTheme.accents.combo),
                        fontFamily: GameTheme.font,
                        fontSize: 40,
                        fontWeight: '700',
                        align: 'left',
                        letterSpacing: 1,
                    },
                });
                heading.anchor.set(0, 0.5);
                heading.position.set(contentLeft, extrasBaseY + extrasOffset);
                extrasLayer.addChild(heading);
                extrasOffset += 38;

                achievements.forEach((achievement) => {
                    const detail = new Text({
                        text: `${achievement.title} — ${achievement.description}`,
                        style: {
                            fill: hexToNumber(GameTheme.hud.textSecondary),
                            fontFamily: GameTheme.monoFont,
                            fontSize: 24,
                            align: 'left',
                        },
                    });
                    detail.anchor.set(0, 0.5);
                    detail.position.set(contentLeft, extrasBaseY + extrasOffset);
                    extrasLayer.addChild(detail);
                    extrasOffset += 28;
                });
            }

            let contentY = extrasBaseY + extrasOffset;
            const promptBaseline = panelY + panelHeight - 70;
            const overflow = contentY + 56 - promptBaseline;
            if (overflow > 0 && extrasOffset > 0) {
                const maxShift = Math.max(0, extrasBaseY - (statStartY + statSpacing * 0.5));
                const shift = Math.min(overflow, maxShift);
                if (shift > 0) {
                    extrasLayer.y -= shift;
                    contentY -= shift;
                }
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
            promptLabel.position.set(contentCenterX, Math.min(promptBaseline, contentY + 56));

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
                host.addChild(rewardText);
            }
            host.addChild(divider);
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
