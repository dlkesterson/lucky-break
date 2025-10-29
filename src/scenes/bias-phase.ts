import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { BiasOptionRisk } from 'app/runtime/round-machine';
import type { UiSceneTransitionAction } from 'app/events';
import { GameTheme } from 'render/theme';

export interface BiasPhaseSceneOption {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly risk: BiasOptionRisk;
    readonly effectSummary: readonly string[];
}

export interface BiasPhaseSessionSummary {
    readonly nextLevel: number;
    readonly score: number;
    readonly coins: number;
    readonly lives: number;
    readonly highestCombo: number;
}

export interface BiasPhasePayload {
    readonly session: BiasPhaseSessionSummary;
    readonly options: readonly BiasPhaseSceneOption[];
    readonly onSelect: (optionId: string) => void | Promise<void>;
    readonly onSkip?: () => void | Promise<void>;
}

const hexToNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

const formatNumber = (value: number): string => value.toLocaleString();

const RISK_LABEL: Record<BiasOptionRisk, string> = {
    safe: 'Safe',
    bold: 'Bold',
    volatile: 'Volatile',
};

const RISK_COLOR: Record<BiasOptionRisk, string> = {
    safe: GameTheme.accents.combo,
    bold: GameTheme.accents.powerUp,
    volatile: GameTheme.hud.danger,
};

interface OptionCard {
    readonly container: Container;
    readonly setActive: (active: boolean) => void;
}

const SCOREBOARD_ENTRIES: readonly {
    readonly label: string;
    readonly resolve: (session: BiasPhaseSessionSummary) => string;
}[] = [
        { label: 'Next Level', resolve: (session) => `Level ${session.nextLevel}` },
        { label: 'Score', resolve: (session) => formatNumber(session.score) },
        { label: 'Coins', resolve: (session) => formatNumber(session.coins) },
        { label: 'Lives', resolve: (session) => `${session.lives}` },
        { label: 'Highest Combo', resolve: (session) => `x${session.highestCombo}` },
    ];

const createOptionCard = (
    context: SceneContext<GameSceneServices>,
    option: BiasPhaseSceneOption,
    dimensions: { readonly width: number; readonly height: number },
    onSelect: () => void,
): OptionCard => {
    const container = new Container();
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.interactiveChildren = false;

    const background = new Graphics();
    const borderColor = hexToNumber(GameTheme.hud.panelLine);
    const baseFill = hexToNumber(GameTheme.hud.panelFill);

    const drawBackground = (active: boolean) => {
        background.clear();
        background.roundRect(0, 0, dimensions.width, dimensions.height, 20)
            .fill({ color: baseFill, alpha: active ? 0.95 : 0.88 })
            .stroke({ color: borderColor, width: active ? 6 : 4, alignment: 0.5 });
    };

    drawBackground(false);

    const padding = 24;
    const riskBadge = new Graphics();
    const riskColor = hexToNumber(RISK_COLOR[option.risk]);
    const badgeHeight = 36;
    const badgeWidth = 120;

    riskBadge.roundRect(padding, padding, badgeWidth, badgeHeight, 12)
        .fill({ color: riskColor, alpha: 0.9 });
    riskBadge.eventMode = 'none';

    const riskLabel = new Text({
        text: RISK_LABEL[option.risk].toUpperCase(),
        style: {
            fill: 0x000000,
            fontFamily: GameTheme.font,
            fontSize: 20,
            fontWeight: '800',
            align: 'center',
            letterSpacing: 1,
        },
    });
    riskLabel.anchor.set(0.5, 0.5);
    riskLabel.position.set(padding + badgeWidth / 2, padding + badgeHeight / 2);

    const title = new Text({
        text: option.label,
        style: {
            fill: hexToNumber(GameTheme.hud.textPrimary),
            fontFamily: GameTheme.font,
            fontSize: 48,
            fontWeight: '900',
            align: 'left',
            letterSpacing: 1,
        },
    });
    title.anchor.set(0, 0);
    title.position.set(padding, padding + badgeHeight + 16);

    const description = new Text({
        text: option.description,
        style: {
            fill: hexToNumber(GameTheme.hud.textSecondary),
            fontFamily: GameTheme.monoFont,
            fontSize: 22,
            wordWrap: true,
            wordWrapWidth: dimensions.width - padding * 2,
            align: 'left',
        },
    });
    description.anchor.set(0, 0);
    description.position.set(padding, title.y + title.height + 12);

    const effectsContainer = new Container();
    let effectOffset = 0;
    option.effectSummary.forEach((line) => {
        const effectText = new Text({
            text: `- ${line}`,
            style: {
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
                fontSize: 20,
                align: 'left',
            },
        });
        effectText.anchor.set(0, 0);
        effectText.position.set(padding, effectOffset);
        effectsContainer.addChild(effectText);
        effectOffset += effectText.height + 4;
    });
    effectsContainer.position.set(padding, description.y + description.height + 16);

    const callout = new Text({
        text: 'Tap to commit this wager',
        style: {
            fill: hexToNumber(GameTheme.accents.combo),
            fontFamily: GameTheme.font,
            fontSize: 24,
            align: 'center',
        },
    });
    callout.anchor.set(0.5, 1);
    callout.position.set(dimensions.width / 2, dimensions.height - padding);

    container.addChild(background, riskBadge, riskLabel, title, description, effectsContainer, callout);

    const setActive = (active: boolean) => {
        drawBackground(active);
        callout.alpha = active ? 1 : 0.85;
        context.renderStageSoon();
    };

    container.on('pointertap', () => {
        onSelect();
    });
    container.on('pointerover', () => {
        setActive(true);
        container.scale.set(1.02);
    });
    container.on('pointerout', () => {
        setActive(false);
        container.scale.set(1);
    });

    return { container, setActive } satisfies OptionCard;
};

const createScoreboard = (session: BiasPhaseSessionSummary, width: number): Container => {
    const panel = new Container();
    const padding = 24;
    const height = 120;
    const background = new Graphics();
    background.roundRect(0, 0, width, height, 18)
        .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.92 })
        .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 4, alignment: 0.5 });
    background.eventMode = 'none';
    panel.addChild(background);

    const entrySpacing = Math.max(140, Math.floor((width - padding * 2) / SCOREBOARD_ENTRIES.length));
    SCOREBOARD_ENTRIES.forEach((entry, index) => {
        const label = new Text({
            text: entry.label.toUpperCase(),
            style: {
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
                fontSize: 18,
                letterSpacing: 1,
            },
        });
        label.anchor.set(0.5, 0);
        label.position.set(padding + entrySpacing * index + entrySpacing / 2, padding - 8);

        const value = new Text({
            text: entry.resolve(session),
            style: {
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.font,
                fontSize: 30,
                fontWeight: '800',
            },
        });
        value.anchor.set(0.5, 0);
        value.position.set(label.position.x, label.position.y + label.height + 4);

        panel.addChild(label, value);
    });

    return panel;
};

export const createBiasPhaseScene = (
    context: SceneContext<GameSceneServices>,
): Scene<BiasPhasePayload, GameSceneServices> => {
    let container: Container | null = null;
    let cleanupCallbacks: (() => void)[] = [];
    let resolving = false;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'bias-phase',
            action,
        });
    };

    const dispose = () => {
        cleanupCallbacks.forEach((disposeCallback) => {
            try {
                disposeCallback();
            } catch (error) {
                void error;
            }
        });
        cleanupCallbacks = [];

        if (container) {
            container.removeAllListeners();
            container.interactiveChildren = false;
            context.removeFromLayer(container);
            container.destroy({ children: true });
            container = null;
        }
        resolving = false;
        context.renderStageSoon();
    };

    return {
        init(payload) {
            if (!payload) {
                throw new Error('BiasPhaseScene requires payload');
            }

            emitSceneEvent('enter');

            const root = new Container();
            root.eventMode = 'static';
            root.cursor = 'default';

            const { width, height } = context.designSize;
            const overlay = new Graphics();
            overlay.rect(0, 0, width, height)
                .fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.82 });
            overlay.eventMode = 'none';
            root.addChild(overlay);

            const title = new Text({
                text: 'Bias Phase'.toUpperCase(),
                style: {
                    fill: hexToNumber(GameTheme.accents.combo),
                    fontFamily: GameTheme.font,
                    fontSize: 92,
                    fontWeight: '900',
                    align: 'center',
                    letterSpacing: 2,
                },
            });
            title.anchor.set(0.5, 0);
            title.position.set(width / 2, 64);
            root.addChild(title);

            const subtitle = new Text({
                text: 'Stake your trajectory before the next volley',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 26,
                    align: 'center',
                },
            });
            subtitle.anchor.set(0.5, 0);
            subtitle.position.set(width / 2, title.y + title.height + 12);
            root.addChild(subtitle);

            const scoreboardWidth = Math.min(width * 0.8, 880);
            const scoreboard = createScoreboard(payload.session, scoreboardWidth);
            scoreboard.position.set((width - scoreboardWidth) / 2, subtitle.y + subtitle.height + 36);
            root.addChild(scoreboard);

            const cardRow = new Container();
            const spacing = 28;
            const maxCardWidth = Math.min(420, Math.max(320, (width - spacing * 4) / 3));
            const cardHeight = 420;

            payload.options.forEach((option, index) => {
                const card = createOptionCard(context, option, { width: maxCardWidth, height: cardHeight }, () => {
                    if (resolving) {
                        return;
                    }
                    resolving = true;
                    card.setActive(true);
                    const result = payload.onSelect(option.id);
                    if (result) {
                        Promise.resolve(result)
                            .catch(() => {
                                resolving = false;
                                card.setActive(false);
                            });
                    }
                });
                card.container.position.set(index * (maxCardWidth + spacing), 0);
                cardRow.addChild(card.container);
                cleanupCallbacks.push(() => card.container.removeAllListeners());
            });

            const totalWidth = payload.options.length * maxCardWidth + (payload.options.length - 1) * spacing;
            cardRow.position.set((width - totalWidth) / 2, scoreboard.y + scoreboard.height + 48);
            root.addChild(cardRow);

            if (payload.onSkip) {
                const skipText = new Text({
                    text: 'Hold for default path',
                    style: {
                        fill: hexToNumber(GameTheme.hud.textSecondary),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 20,
                        align: 'center',
                    },
                });
                skipText.anchor.set(0.5, 0);
                skipText.position.set(width / 2, cardRow.y + cardHeight + 32);
                skipText.eventMode = 'static';
                skipText.cursor = 'pointer';
                skipText.on('pointertap', () => {
                    if (resolving) {
                        return;
                    }
                    resolving = true;
                    const result = payload.onSkip?.();
                    if (result) {
                        Promise.resolve(result).catch(() => {
                            resolving = false;
                        });
                    }
                });
                cleanupCallbacks.push(() => skipText.removeAllListeners());
                root.addChild(skipText);
            }

            container = root;
            context.addToLayer('hud', root);
            context.renderStageSoon();
        },
        update() {
            /* no-op */
        },
        destroy() {
            emitSceneEvent('exit');
            dispose();
        },
        suspend() {
            emitSceneEvent('suspend');
        },
        resume() {
            emitSceneEvent('resume');
            context.renderStageSoon();
        },
    };
};
