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
    readonly rewardWheel?: LevelCompleteRewardWheelPayload;
}

export interface LevelCompleteSceneOptions {
    readonly title?: (payload: LevelCompletePayload) => string;
    readonly scoreLabel?: (payload: LevelCompletePayload) => string;
    readonly prompt?: string;
}

export interface RewardWheelOddsEntry {
    readonly reward: Reward;
    readonly chance: number;
    readonly weight: number;
}

export interface RewardWheelState {
    readonly reward: Reward | null;
    readonly locked: boolean;
    readonly entropyStored: number;
    readonly coins: number;
    readonly rerollCost: number;
    readonly lockCost: number;
    readonly canReroll: boolean;
    readonly canLock: boolean;
}

export interface RewardWheelUpdateResult {
    readonly success: boolean;
    readonly message?: string;
    readonly state: RewardWheelState;
}

export interface RewardWheelActions {
    readonly reroll?: () => Promise<RewardWheelUpdateResult>;
    readonly lock?: () => Promise<RewardWheelUpdateResult>;
}

export interface LevelCompleteRewardWheelPayload {
    readonly odds: readonly RewardWheelOddsEntry[];
    readonly state: RewardWheelState;
    readonly actions: RewardWheelActions;
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
        case 'laser-paddle':
            return `Laser Paddle ${reward.duration.toFixed(0)}s`;
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

            const wheelPayload = payload.rewardWheel ?? null;
            let wheelState: RewardWheelState | null = wheelPayload?.state ?? null;
            const wheelActions = wheelPayload?.actions ?? {};
            let wheelResourceLabel: Text | null = null;
            let wheelStatusLabel: Text | null = null;
            interface WheelButtonHandle {
                readonly root: Container;
                readonly label: Text;
                readonly background: Graphics;
            }
            const wheelButtons: { reroll: WheelButtonHandle | null; lock: WheelButtonHandle | null } = {
                reroll: null,
                lock: null,
            };
            let wheelBusy = false;

            const formatRewardLabel = (reward: Reward | null, locked: boolean): string => {
                if (!reward) {
                    return locked ? 'No Reward (Locked)' : 'Pending Reward';
                }
                const descriptor = describeReward(reward);
                return locked ? `${descriptor} (Locked)` : descriptor;
            };

            let rewardText: Text | null = null;
            const initialReward = payload.reward ?? wheelState?.reward ?? null;
            const initialLocked = wheelState?.locked ?? false;
            if (initialReward || wheelPayload) {
                rewardText = new Text({
                    text: `Reward: ${formatRewardLabel(initialReward, initialLocked)}`,
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

            const updateRewardDisplay = (state: RewardWheelState | null) => {
                if (!rewardText) {
                    return;
                }
                const reward = state?.reward ?? initialReward ?? null;
                const locked = state?.locked ?? false;
                rewardText.text = `Reward: ${formatRewardLabel(reward, locked)}`;
            };

            const setWheelStatus = (message: string | null, severity: 'neutral' | 'success' | 'error' = 'neutral') => {
                if (!wheelStatusLabel) {
                    return;
                }
                const fill = severity === 'success'
                    ? hexToNumber(GameTheme.accents.combo)
                    : severity === 'error'
                        ? hexToNumber(GameTheme.accents.powerUp)
                        : hexToNumber(GameTheme.hud.textSecondary);
                wheelStatusLabel.style.fill = fill;
                wheelStatusLabel.text = message ?? '';
                wheelStatusLabel.alpha = message ? 1 : 0;
            };

            const setButtonEnabled = (handle: WheelButtonHandle | null, enabled: boolean) => {
                if (!handle) {
                    return;
                }
                handle.root.eventMode = enabled ? 'static' : 'none';
                handle.root.cursor = enabled ? 'pointer' : 'default';
                handle.root.alpha = enabled ? 1 : 0.45;
            };

            const updateResourceLabel = (state: RewardWheelState | null) => {
                if (!wheelResourceLabel) {
                    return;
                }
                if (!state) {
                    wheelResourceLabel.text = '';
                    wheelResourceLabel.alpha = 0;
                    return;
                }
                wheelResourceLabel.alpha = 1;
                const segments = [
                    `Entropy ${state.entropyStored} (Cost ${state.rerollCost})`,
                    state.lockCost > 0
                        ? `Coins ${state.coins} (Cost ${state.lockCost})`
                        : `Coins ${state.coins}`,
                ];
                wheelResourceLabel.text = segments.join(' · ');
            };

            const refreshButtons = (state: RewardWheelState | null) => {
                if (!state) {
                    setButtonEnabled(wheelButtons.reroll, false);
                    setButtonEnabled(wheelButtons.lock, false);
                    return;
                }
                if (wheelButtons.reroll) {
                    wheelButtons.reroll.label.text = state.locked
                        ? 'Reroll (Locked)'
                        : `Reroll (-${state.rerollCost} Entropy)`;
                }
                if (wheelButtons.lock) {
                    wheelButtons.lock.label.text = state.locked
                        ? 'Locked In'
                        : `Lock (-${state.lockCost} Coins)`;
                }
                setButtonEnabled(wheelButtons.reroll, !wheelBusy && state.canReroll && !state.locked);
                setButtonEnabled(wheelButtons.lock, !wheelBusy && !state.locked && state.canLock);
            };

            const applyWheelState = (
                state: RewardWheelState,
                message?: { readonly text?: string; readonly severity?: 'neutral' | 'success' | 'error' },
            ) => {
                wheelState = state;
                updateRewardDisplay(state);
                updateResourceLabel(state);
                refreshButtons(state);
                if (message?.text !== undefined) {
                    setWheelStatus(message.text, message.severity ?? 'neutral');
                } else {
                    setWheelStatus(null);
                }
                context.renderStageSoon();
            };

            const createWheelButton = (name: string, label: string, onTap: () => void): WheelButtonHandle => {
                const availableWidth = contentRight - contentLeft;
                const width = Math.min(240, Math.max(180, availableWidth * 0.42));
                const height = 56;

                const root = new Container();
                root.name = name;
                root.eventMode = 'static';
                root.cursor = 'pointer';

                const background = new Graphics();
                background.roundRect(0, 0, width, height, 16)
                    .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.92 })
                    .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 3, alignment: 0.5 });

                const text = new Text({
                    text: label,
                    style: {
                        fill: hexToNumber(GameTheme.hud.textPrimary),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 20,
                        align: 'center',
                    },
                });
                text.anchor.set(0.5);
                text.position.set(width / 2, height / 2);

                root.on('pointertap', () => {
                    onTap();
                });

                root.addChild(background, text);

                return { root, label: text, background };
            };

            const runWheelAction = async (action: 'reroll' | 'lock') => {
                if (!wheelPayload) {
                    return;
                }
                const handler = wheelActions[action];
                if (!handler) {
                    setWheelStatus('Action unavailable', 'error');
                    return;
                }
                if (!wheelState) {
                    setWheelStatus('No reward to adjust', 'error');
                    return;
                }

                if ((action === 'reroll' && (!wheelState.canReroll || wheelState.locked)) || (action === 'lock' && (wheelState.locked || !wheelState.canLock))) {
                    setWheelStatus('Requirements not met', 'error');
                    return;
                }

                wheelBusy = true;
                refreshButtons(wheelState);
                setWheelStatus(action === 'reroll' ? 'Rerolling…' : 'Locking…', 'neutral');

                try {
                    const result = await handler();
                    const defaultMessage = action === 'reroll'
                        ? result.success
                            ? 'Reward rerolled'
                            : 'Reroll failed'
                        : result.success
                            ? 'Reward locked'
                            : 'Lock failed';
                    applyWheelState(result.state, {
                        text: result.message ?? defaultMessage,
                        severity: result.success ? 'success' : 'error',
                    });
                } catch {
                    setWheelStatus('Action failed', 'error');
                } finally {
                    wheelBusy = false;
                    refreshButtons(wheelState);
                }
            };

            const host = container;
            if (!host) {
                throw new Error('LevelCompleteScene container not initialized');
            }

            updateRewardDisplay(wheelState);

            let wheelSectionBottom = rewardText?.y ?? score.y;
            if (wheelPayload) {
                const wheelHost = new Container();
                const wheelTop = (rewardText?.y ?? score.y) + 52;
                wheelHost.position.set(contentLeft, wheelTop);

                const oddsHeading = new Text({
                    text: 'Reward Wheel Odds',
                    style: {
                        fill: hexToNumber(GameTheme.accents.combo),
                        fontFamily: GameTheme.font,
                        fontSize: 34,
                        fontWeight: '700',
                        align: 'left',
                        letterSpacing: 1,
                    },
                });
                oddsHeading.anchor.set(0, 0.5);
                oddsHeading.position.set(0, 0);
                wheelHost.addChild(oddsHeading);

                let wheelCursorY = oddsHeading.y + 36;
                const oddsStyle = {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 22,
                    align: 'left',
                } as const;

                wheelPayload.odds.forEach((entry) => {
                    const oddsText = new Text({
                        text: `${describeReward(entry.reward)} — ${formatPercentage(entry.chance)}`,
                        style: oddsStyle,
                    });
                    oddsText.anchor.set(0, 0.5);
                    oddsText.position.set(0, wheelCursorY);
                    wheelHost.addChild(oddsText);
                    wheelCursorY += 28;
                });

                wheelCursorY += 16;

                const buttonsRow = new Container();
                const rerollHandle = createWheelButton('reward-wheel-reroll', 'Reroll', () => {
                    void runWheelAction('reroll');
                });
                wheelButtons.reroll = rerollHandle;
                rerollHandle.root.position.set(0, 0);
                buttonsRow.addChild(rerollHandle.root);

                const lockHandle = createWheelButton('reward-wheel-lock', 'Lock', () => {
                    void runWheelAction('lock');
                });
                wheelButtons.lock = lockHandle;
                const rerollWidth = rerollHandle.background.width;
                const spacing = Math.max(16, Math.min(48, (contentRight - contentLeft) * 0.08));
                lockHandle.root.position.set(rerollWidth + spacing, 0);
                buttonsRow.addChild(lockHandle.root);

                buttonsRow.position.set(0, wheelCursorY);
                wheelHost.addChild(buttonsRow);
                const buttonHeight = rerollHandle.background.height;
                wheelCursorY += buttonHeight + 14;

                wheelResourceLabel = new Text({
                    text: '',
                    style: {
                        fill: hexToNumber(GameTheme.hud.textSecondary),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 20,
                        align: 'left',
                    },
                });
                wheelResourceLabel.anchor.set(0, 0.5);
                wheelResourceLabel.position.set(0, wheelCursorY);
                wheelHost.addChild(wheelResourceLabel);
                wheelCursorY += 26;

                wheelStatusLabel = new Text({
                    text: '',
                    style: {
                        fill: hexToNumber(GameTheme.hud.textSecondary),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 20,
                        align: 'left',
                    },
                });
                wheelStatusLabel.anchor.set(0, 0.5);
                wheelStatusLabel.position.set(0, wheelCursorY);
                wheelStatusLabel.alpha = 0;
                wheelHost.addChild(wheelStatusLabel);
                wheelCursorY += 24;

                host.addChild(wheelHost);

                updateResourceLabel(wheelState);
                refreshButtons(wheelState);
                setWheelStatus(null);

                wheelSectionBottom = wheelTop + wheelCursorY;
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

            const statStartY = wheelSectionBottom + 60;
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
