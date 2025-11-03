import { Container, Graphics, Text, Rectangle } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import { GameTheme } from 'render/theme';
import type { LoadoutSelection, LoadoutCategoryId } from 'config/loadouts';
import { normalizeLoadoutSelection, buildLoadoutSceneCategories, type LoadoutSceneCategory } from 'app/runtime/loadouts';
import type { UiSceneTransitionAction } from 'app/events';

export interface LoadoutSelectionPayload {
    readonly categories?: readonly LoadoutSceneCategory[];
    readonly initialSelection?: Partial<LoadoutSelection>;
    readonly onPreview?: (category: LoadoutCategoryId, optionId: string) => void;
    readonly onCommit: (selection: LoadoutSelection) => void | Promise<void>;
}

interface OptionButton {
    readonly optionId: string;
    readonly container: Container;
    readonly setSelected: (selected: boolean) => void;
}

type MutableLoadoutSelection = {
    form: LoadoutSelection['form'];
    trait: LoadoutSelection['trait'];
    sigil: LoadoutSelection['sigil'];
    voice: LoadoutSelection['voice'];
};

const hexToNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

const createOptionButton = (
    option: LoadoutSceneCategory['options'][number],
    dimensions: { readonly width: number; readonly minHeight: number },
    onSelect: () => void,
): OptionButton => {
    const container = new Container();
    container.eventMode = 'static';
    container.interactiveChildren = false;
    container.cursor = 'pointer';

    const baseFill = hexToNumber(GameTheme.hud.panelFill);
    const borderColor = hexToNumber(GameTheme.hud.panelLine);
    const activeColor = hexToNumber(GameTheme.accents.combo);

    const background = new Graphics();
    const padding = 16;
    let isSelected = false;
    let isHovering = false;
    let currentHeight = Math.max(dimensions.minHeight, 120);

    const drawBackground = () => {
        const fillColor = isSelected ? activeColor : baseFill;
        background.clear();
        background.roundRect(0, 0, dimensions.width, currentHeight, 18)
            .fill({ color: fillColor, alpha: isSelected ? 0.92 : isHovering ? 0.88 : 0.82 })
            .stroke({ color: borderColor, width: 3, alignment: 0.5 });
    };

    drawBackground();

    const title = new Text({
        text: option.name,
        style: {
            fill: hexToNumber(GameTheme.hud.textPrimary),
            fontFamily: GameTheme.font,
            fontSize: 24,
            fontWeight: '800',
            align: 'left',
        },
    });
    title.anchor.set(0, 0);
    title.position.set(padding, padding);

    const description = new Text({
        text: option.description,
        style: {
            fill: hexToNumber(GameTheme.hud.textSecondary),
            fontFamily: GameTheme.monoFont,
            fontSize: 18,
            wordWrap: true,
            wordWrapWidth: dimensions.width - padding * 2,
        },
    });
    description.anchor.set(0, 0);
    description.position.set(padding, title.y + title.height + 6);

    const summary = new Container();
    summary.position.set(padding, description.y + description.height + 8);
    let offset = 0;
    option.effectSummary.forEach((line) => {
        const bullet = new Text({
            text: `• ${line}`,
            style: {
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
                fontSize: 16,
            },
        });
        bullet.anchor.set(0, 0);
        bullet.position.set(0, offset);
        summary.addChild(bullet);
        offset += bullet.height + 2;
    });

    container.addChild(background, title, description, summary);

    const reflow = () => {
        const summaryBottom = summary.children.length > 0 ? summary.y + summary.height : description.y + description.height;
        const required = Math.max(dimensions.minHeight, summaryBottom + padding + 10);
        if (required !== currentHeight) {
            currentHeight = required;
            drawBackground();
            container.hitArea = new Rectangle(0, 0, dimensions.width, currentHeight);
        }
    };

    reflow();

    container.on('pointertap', () => {
        onSelect();
    });
    container.on('pointerover', () => {
        isHovering = true;
        drawBackground();
    });
    container.on('pointerout', () => {
        isHovering = false;
        drawBackground();
    });

    const setSelected = (selected: boolean) => {
        isSelected = selected;
        drawBackground();
    };

    return {
        optionId: option.id,
        container,
        setSelected,
    } satisfies OptionButton;
};

const createCategoryColumn = (
    context: SceneContext<GameSceneServices>,
    category: LoadoutSceneCategory,
    dimensions: { readonly width: number; readonly height: number },
    onOptionSelected: (categoryId: LoadoutCategoryId, optionId: string) => void,
    initialSelection: string | null,
): { readonly container: Container; readonly updateSelection: (optionId: string | null) => void } => {
    const container = new Container();
    container.eventMode = 'static';

    const header = new Text({
        text: category.label.toUpperCase(),
        style: {
            fill: hexToNumber(GameTheme.hud.textPrimary),
            fontFamily: GameTheme.font,
            fontSize: 28,
            fontWeight: '900',
        },
    });
    header.anchor.set(0, 0);
    container.addChild(header);

    const prompt = new Text({
        text: category.prompt,
        style: {
            fill: hexToNumber(GameTheme.hud.textSecondary),
            fontFamily: GameTheme.monoFont,
            fontSize: 18,
            wordWrap: true,
            wordWrapWidth: dimensions.width,
        },
    });
    prompt.anchor.set(0, 0);
    prompt.position.set(0, header.y + header.height + 6);
    container.addChild(prompt);

    const list = new Container();
    list.position.set(0, prompt.y + prompt.height + 12);
    container.addChild(list);

    const optionButtons: OptionButton[] = [];
    const optionSpacing = 14;
    let cursorY = 0;
    category.options.forEach((option) => {
        const button = createOptionButton(option, { width: dimensions.width, minHeight: 120 }, () => {
            onOptionSelected(category.id, option.id);
        });
        button.container.position.set(0, cursorY);
        list.addChild(button.container);
        optionButtons.push(button);
        cursorY += button.container.height + optionSpacing;
    });

    let selectedId: string | null = initialSelection;
    optionButtons.forEach((button) => {
        button.setSelected(button.optionId === selectedId);
    });

    const updateSelection = (optionId: string | null) => {
        selectedId = optionId;
        optionButtons.forEach((button) => {
            button.setSelected(button.optionId === selectedId);
        });
        context.renderStageSoon();
    };

    return {
        container,
        updateSelection,
    };
};

const summarizeSelection = (
    categories: readonly LoadoutSceneCategory[],
    selection: LoadoutSelection,
): readonly string[] => {
    const summary: string[] = [];
    const registry = new Map<LoadoutCategoryId, string[]>();
    categories.forEach((category) => {
        const option = category.options.find((entry) => {
            if (category.id === 'form') {
                return entry.id === selection.form;
            }
            if (category.id === 'trait') {
                return entry.id === selection.trait;
            }
            if (category.id === 'sigil') {
                return entry.id === selection.sigil;
            }
            if (category.id === 'voice') {
                return entry.id === selection.voice;
            }
            return false;
        });
        if (option) {
            registry.set(category.id, option.effectSummary as string[]);
        }
    });

    for (const entries of registry.values()) {
        summary.push(...entries);
    }

    return summary;
};

export const createLoadoutSelectionScene = (
    context: SceneContext<GameSceneServices>,
): Scene<LoadoutSelectionPayload, GameSceneServices> => {
    let root: Container | null = null;
    let resolving = false;
    let cleanupCallbacks: (() => void)[] = [];

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'loadout-selection',
            action,
        });
    };

    return {
        init(payload) {
            if (!payload) {
                throw new Error('LoadoutSelectionScene requires payload');
            }

            const categories = (payload.categories && payload.categories.length > 0)
                ? payload.categories
                : buildLoadoutSceneCategories();
            const normalized = normalizeLoadoutSelection(payload.initialSelection);
            const selection: MutableLoadoutSelection = {
                form: normalized.form,
                trait: normalized.trait,
                sigil: normalized.sigil,
                voice: normalized.voice,
            };

            const stageSize = context.designSize;
            const rootContainer = new Container();
            rootContainer.eventMode = 'static';
            rootContainer.cursor = 'default';

            emitSceneEvent('enter');

            const overlay = new Graphics();
            overlay.rect(0, 0, stageSize.width, stageSize.height)
                .fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.84 });
            overlay.eventMode = 'none';
            rootContainer.addChild(overlay);

            const title = new Text({
                text: 'Awaken Mayhaps'.toUpperCase(),
                style: {
                    fill: hexToNumber(GameTheme.accents.combo),
                    fontFamily: GameTheme.font,
                    fontSize: stageSize.width >= 1280 ? 86 : stageSize.width >= 1024 ? 72 : 60,
                    fontWeight: '900',
                    align: 'center',
                },
            });
            title.anchor.set(0.5, 0);
            title.position.set(stageSize.width / 2, 48);
            rootContainer.addChild(title);

            const subtitle = new Text({
                text: 'Shape Mayhaps before the first coin toss',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 24,
                    align: 'center',
                },
            });
            subtitle.anchor.set(0.5, 0);
            subtitle.position.set(stageSize.width / 2, title.y + title.height + 8);
            rootContainer.addChild(subtitle);

            const columnsContainer = new Container();
            const safeMargin = Math.max(32, stageSize.width * 0.05);
            const summaryWidth = Math.max(260, stageSize.width * 0.22);
            const availableWidth = Math.max(320, stageSize.width - safeMargin * 2 - summaryWidth - 40);
            const columnWidth = availableWidth / categories.length - 16;
            const columnHeight = Math.max(380, stageSize.height - subtitle.y - subtitle.height - 180);
            columnsContainer.position.set(safeMargin, subtitle.y + subtitle.height + 32);
            rootContainer.addChild(columnsContainer);

            const updaterByCategory = new Map<LoadoutCategoryId, (optionId: string | null) => void>();

            categories.forEach((category, index) => {
                const initialId = category.id === 'form'
                    ? selection.form
                    : category.id === 'trait'
                        ? selection.trait
                        : category.id === 'sigil'
                            ? selection.sigil
                            : selection.voice;
                const column = createCategoryColumn(context, category, { width: columnWidth, height: columnHeight }, (categoryId, optionId) => {
                    if (resolving) {
                        return;
                    }
                    if (categoryId === 'form') {
                        selection.form = optionId as LoadoutSelection['form'];
                    } else if (categoryId === 'trait') {
                        selection.trait = optionId as LoadoutSelection['trait'];
                    } else if (categoryId === 'sigil') {
                        selection.sigil = optionId as LoadoutSelection['sigil'];
                    } else if (categoryId === 'voice') {
                        selection.voice = optionId as LoadoutSelection['voice'];
                    }
                    payload.onPreview?.(categoryId, optionId);
                    updaterByCategory.get(categoryId)?.(optionId);
                    updateSummary();
                }, initialId);
                column.container.position.set(index * (columnWidth + 16), 0);
                columnsContainer.addChild(column.container);
                updaterByCategory.set(category.id, column.updateSelection);
            });

            const summaryPanel = new Graphics();
            summaryPanel.roundRect(0, 0, summaryWidth, columnHeight, 24)
                .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.9 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 3, alignment: 0.5 });
            summaryPanel.position.set(columnsContainer.x + availableWidth + 24, columnsContainer.y);
            rootContainer.addChild(summaryPanel);

            const summaryTitle = new Text({
                text: 'Selected Traits',
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.font,
                    fontSize: 26,
                    fontWeight: '800',
                },
            });
            summaryTitle.anchor.set(0, 0);
            summaryTitle.position.set(summaryPanel.x + 20, summaryPanel.y + 18);
            rootContainer.addChild(summaryTitle);

            const summaryList = new Container();
            summaryList.position.set(summaryPanel.x + 20, summaryTitle.y + summaryTitle.height + 12);
            rootContainer.addChild(summaryList);

            const updateSummary = () => {
                summaryList.removeChildren();
                const currentSelection: LoadoutSelection = {
                    form: selection.form,
                    trait: selection.trait,
                    sigil: selection.sigil,
                    voice: selection.voice,
                };
                const lines = summarizeSelection(categories, currentSelection);
                let offsetY = 0;
                if (lines.length === 0) {
                    const placeholder = new Text({
                        text: 'Select a card from each orbit to continue.',
                        style: {
                            fill: hexToNumber(GameTheme.hud.textSecondary),
                            fontFamily: GameTheme.monoFont,
                            fontSize: 18,
                            wordWrap: true,
                            wordWrapWidth: summaryWidth - 40,
                        },
                    });
                    placeholder.anchor.set(0, 0);
                    placeholder.position.set(0, 0);
                    summaryList.addChild(placeholder);
                    offsetY = placeholder.height + 12;
                } else {
                    lines.forEach((line) => {
                        const entry = new Text({
                            text: `• ${line}`,
                            style: {
                                fill: hexToNumber(GameTheme.hud.textPrimary),
                                fontFamily: GameTheme.monoFont,
                                fontSize: 18,
                                wordWrap: true,
                                wordWrapWidth: summaryWidth - 40,
                            },
                        });
                        entry.anchor.set(0, 0);
                        entry.position.set(0, offsetY);
                        summaryList.addChild(entry);
                        offsetY += entry.height + 6;
                    });
                }
                context.renderStageSoon();
            };

            updateSummary();

            const commitButton = new Graphics();
            const commitWidth = Math.max(260, stageSize.width * 0.22);
            const commitHeight = 66;
            commitButton.roundRect(0, 0, commitWidth, commitHeight, 22)
                .fill({ color: hexToNumber(GameTheme.accents.combo), alpha: 0.92 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 2, alignment: 0.5 });
            commitButton.position.set(summaryPanel.x, summaryPanel.y + summaryPanel.height + 24);
            commitButton.eventMode = 'static';
            commitButton.cursor = 'pointer';
            rootContainer.addChild(commitButton);

            const commitLabel = new Text({
                text: 'Commune with Mayhaps',
                style: {
                    fill: 0x000000,
                    fontFamily: GameTheme.font,
                    fontSize: 24,
                    fontWeight: '800',
                },
            });
            commitLabel.anchor.set(0.5, 0.5);
            commitLabel.position.set(commitButton.x + commitWidth / 2, commitButton.y + commitHeight / 2);
            rootContainer.addChild(commitLabel);

            commitButton.on('pointertap', () => {
                if (resolving) {
                    return;
                }
                resolving = true;
                const submittedSelection: LoadoutSelection = {
                    form: selection.form,
                    trait: selection.trait,
                    sigil: selection.sigil,
                    voice: selection.voice,
                };
                const result = payload.onCommit(submittedSelection);
                if (result) {
                    Promise.resolve(result)
                        .then(() => {
                            resolving = false;
                            context.renderStageSoon();
                        })
                        .catch(() => {
                            resolving = false;
                            context.renderStageSoon();
                        });
                } else {
                    resolving = false;
                    context.renderStageSoon();
                }
            });
            cleanupCallbacks.push(() => commitButton.removeAllListeners());

            root = rootContainer;
            context.addToLayer('hud', rootContainer);
            context.renderStageSoon();
        },
        update(_deltaSeconds: number) {
            /* no-op */
        },
        destroy() {
            emitSceneEvent('exit');
            cleanupCallbacks.forEach((disposeCallback) => {
                try {
                    disposeCallback();
                } catch (error) {
                    void error;
                }
            });
            cleanupCallbacks = [];

            if (root) {
                root.removeAllListeners();
                root.interactiveChildren = false;
                context.removeFromLayer(root);
                root.destroy({ children: true });
                root = null;
            }
            resolving = false;
        },
        suspend() {
            emitSceneEvent('suspend');
        },
        resume() {
            emitSceneEvent('resume');
            context.renderStageSoon();
        },
    } satisfies Scene<LoadoutSelectionPayload, GameSceneServices>;
};
