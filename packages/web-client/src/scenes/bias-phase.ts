import { Container, Graphics, Rectangle, Text } from 'pixi.js';
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
    readonly height: number;
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

    let currentHeight = Math.max(dimensions.height, 280);
    let activeState = false;

    const drawBackground = (active: boolean) => {
        background.clear();
        background.roundRect(0, 0, dimensions.width, currentHeight, 20)
            .fill({ color: baseFill, alpha: active ? 0.95 : 0.88 })
            .stroke({ color: borderColor, width: active ? 6 : 4, alignment: 0.5 });
        activeState = active;
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
            fontSize: dimensions.width <= 300 ? 20 : 24,
            align: 'center',
        },
    });
    callout.anchor.set(0.5, 1);
    callout.position.set(dimensions.width / 2, dimensions.height - padding);

    container.addChild(background, riskBadge, riskLabel, title, description, effectsContainer, callout);

    const reflowLayout = () => {
        const effectsBottom = effectsContainer.children.length > 0
            ? effectsContainer.y + effectsContainer.height
            : description.y + description.height;
        const calloutHeight = callout.height;
        const requiredHeight = Math.max(dimensions.height, effectsBottom + calloutHeight + padding + 12);
        if (requiredHeight !== currentHeight) {
            currentHeight = requiredHeight;
        }
        callout.position.set(dimensions.width / 2, currentHeight - padding);
        drawBackground(activeState);
        container.hitArea = new Rectangle(0, 0, dimensions.width, currentHeight);
    };

    reflowLayout();

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

    return { container, setActive, height: currentHeight } satisfies OptionCard;
};

const createScoreboard = (session: BiasPhaseSessionSummary, width: number): Container => {
    const panel = new Container();
    const paddingX = 24;
    const paddingY = 20;
    const effectiveWidth = Math.max(160, width);
    const availableWidth = Math.max(1, effectiveWidth - paddingX * 2);
    const minColumnWidth = 160;
    const columns = Math.min(
        SCOREBOARD_ENTRIES.length,
        Math.max(1, Math.floor(availableWidth / minColumnWidth)),
    );
    const rows = Math.ceil(SCOREBOARD_ENTRIES.length / columns);
    const columnWidth = availableWidth / columns;
    const rowHeight = 70;
    const panelHeight = paddingY * 2 + rows * rowHeight;

    const background = new Graphics();
    background.roundRect(0, 0, effectiveWidth, panelHeight, 18)
        .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.92 })
        .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 4, alignment: 0.5 });
    background.eventMode = 'none';
    panel.addChild(background);

    SCOREBOARD_ENTRIES.forEach((entry, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const baseX = paddingX + columnWidth * column + columnWidth / 2;
        const baseY = paddingY + row * rowHeight;

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
        label.position.set(baseX, baseY - 8);

        const value = new Text({
            text: entry.resolve(session),
            style: {
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.font,
                fontSize: columns >= 5 ? 24 : columns >= 4 ? 26 : 30,
                fontWeight: '800',
            },
        });
        value.anchor.set(0.5, 0);
        value.position.set(baseX, label.y + label.height + 4);

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

            const titleFontSize = width >= 1280 ? 92 : width >= 1024 ? 84 : width >= 840 ? 72 : width >= 680 ? 64 : 56;
            const title = new Text({
                text: 'Bias Phase'.toUpperCase(),
                style: {
                    fill: hexToNumber(GameTheme.accents.combo),
                    fontFamily: GameTheme.font,
                    fontSize: titleFontSize,
                    fontWeight: '900',
                    align: 'center',
                    letterSpacing: 2,
                },
            });
            title.anchor.set(0.5, 0);
            title.position.set(width / 2, 64);
            root.addChild(title);

            const subtitleFontSize = width >= 1024 ? 26 : width >= 840 ? 24 : 22;
            const subtitle = new Text({
                text: 'Stake your trajectory before the next volley',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: subtitleFontSize,
                    align: 'center',
                },
            });
            subtitle.anchor.set(0.5, 0);
            subtitle.position.set(width / 2, title.y + title.height + 12);
            root.addChild(subtitle);

            const widthMargin = Math.max(0, width - 24);
            const maxAllowedWidth = Math.min(width, Math.max(180, widthMargin));
            let scoreboardWidth = Math.min(880, Math.max(360, width * 0.8));
            if (scoreboardWidth > maxAllowedWidth) {
                scoreboardWidth = maxAllowedWidth;
            }
            const minAcceptableWidth = Math.min(320, maxAllowedWidth);
            scoreboardWidth = Math.max(minAcceptableWidth, scoreboardWidth);
            const scoreboard = createScoreboard(payload.session, scoreboardWidth);
            scoreboard.eventMode = 'none';
            scoreboard.interactiveChildren = false;
            scoreboard.position.set((width - scoreboardWidth) / 2, subtitle.y + subtitle.height + 36);
            root.addChild(scoreboard);

            const cardRow = new Container();
            const baseGap = width >= 1280 ? 36 : width >= 1024 ? 32 : width >= 840 ? 28 : width >= 680 ? 24 : 18;
            const horizontalPadding = width < 640 ? 16 : baseGap;
            const maxColumns = Math.min(payload.options.length, 3);
            const minCardWidth = width >= 1080 ? 320 : width >= 900 ? 300 : width >= 720 ? 280 : 240;
            const availableWidth = Math.max(1, width - horizontalPadding * 2);
            let cardColumns = maxColumns;
            let columnGap = cardColumns > 1 ? baseGap : 0;
            let cardWidth = 0;
            for (let columns = maxColumns; columns >= 1; columns -= 1) {
                const gap = columns > 1 ? baseGap : 0;
                const candidate = (availableWidth - gap * (columns - 1)) / columns;
                if (candidate >= Math.min(minCardWidth, 360)) {
                    cardColumns = columns;
                    columnGap = gap;
                    cardWidth = Math.min(420, candidate);
                    break;
                }
            }
            if (cardWidth === 0) {
                cardColumns = 1;
                columnGap = 0;
                cardWidth = Math.min(420, availableWidth);
            }
            const rowGap = baseGap + 12;
            const baseCardHeight = width >= 1080 ? 420 : width >= 900 ? 400 : width >= 720 ? 380 : 340;
            const maxRowWidth = cardColumns * cardWidth + (cardColumns - 1) * columnGap;
            const scoreboardBottom = scoreboard.y + scoreboard.height;
            const footerReserve = payload.onSkip ? 140 : 80;
            const cards: OptionCard[] = payload.options.map((option) => {
                const card = createOptionCard(context, option, { width: cardWidth, height: baseCardHeight }, () => {
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
                cleanupCallbacks.push(() => card.container.removeAllListeners());
                return card;
            });

            const rowCount = Math.ceil(cards.length / cardColumns);
            const rowHeights: number[] = [];
            for (let row = 0; row < rowCount; row += 1) {
                const startIndex = row * cardColumns;
                const rowCards = cards.slice(startIndex, startIndex + cardColumns);
                const rowHeight = rowCards.reduce((maxHeight, card) => Math.max(maxHeight, card.height), 0);
                rowHeights.push(rowHeight);
            }

            const cardsHeight = rowHeights.reduce((total, rowHeight, index) => total + rowHeight + (index > 0 ? rowGap : 0), 0);
            const availableHeight = Math.max(160, height - (scoreboardBottom + 48) - footerReserve);
            const minScale = 0.6;
            const cardScale = cardsHeight > availableHeight ? Math.max(minScale, availableHeight / cardsHeight) : 1;
            const scaledRowWidth = maxRowWidth * cardScale;
            const cardAreaLeft = Math.max(0, (width - scaledRowWidth) / 2);

            let currentRowTop = 0;
            for (let row = 0; row < rowCount; row += 1) {
                const rowHeight = rowHeights[row] ?? baseCardHeight;
                const startIndex = row * cardColumns;
                const cardsInRow = Math.min(cardColumns, cards.length - startIndex);
                const rowWidth = cardsInRow * cardWidth + (cardsInRow - 1) * columnGap;
                const rowOffset = (maxRowWidth - rowWidth) / 2;
                for (let column = 0; column < cardsInRow; column += 1) {
                    const card = cards[startIndex + column];
                    const x = rowOffset + column * (cardWidth + columnGap);
                    card.container.position.set(x, currentRowTop);
                    cardRow.addChild(card.container);
                }
                currentRowTop += rowHeight;
                if (row < rowCount - 1) {
                    currentRowTop += rowGap;
                }
            }

            cardRow.scale.set(cardScale);
            cardRow.position.set(cardAreaLeft, scoreboardBottom + 48);
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
                skipText.position.set(width / 2, cardRow.y + cardsHeight * cardScale + 32);
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
