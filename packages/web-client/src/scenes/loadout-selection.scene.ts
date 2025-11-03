import { Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import type { TickerCallback } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import { GameTheme } from 'render/theme';
import {
    buildLoadoutFormPresets,
    normalizeLoadoutSelection,
    type LoadoutFormPreset,
} from 'app/runtime/loadouts';
import type { LoadoutSelection, LoadoutFormId } from 'config/loadouts';
import type { UiSceneTransitionAction } from 'app/events';

export interface LoadoutSelectionPayload {
    readonly formPresets?: readonly LoadoutFormPreset[];
    readonly lockedForms?: readonly LoadoutFormId[];
    readonly initialSelection?: Partial<LoadoutSelection>;
    readonly onCommit: (selection: LoadoutSelection) => MaybePromise<void>;
}

type MaybePromise<T> = T | Promise<T>;

type Cleanup = () => void;

interface FormCardHandle {
    readonly preset: LoadoutFormPreset;
    readonly container: Container;
    readonly setSelected: (selected: boolean) => void;
    readonly setLockedState: (locked: boolean) => void;
}

interface BallPreviewHandle {
    readonly container: Container;
    readonly animate: (delta: number) => void;
    readonly updateColors: (baseColor: number, accentColor: number) => void;
}

const hexToNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

const createBallPreview = (radius: number): BallPreviewHandle => {
    const container = new Container();
    container.eventMode = 'none';

    const baseCircle = new Graphics();
    const accentOverlay = new Graphics();
    const rim = new Graphics();
    const pulse = new Graphics();
    const swirl = new Graphics();

    container.addChild(baseCircle, accentOverlay, pulse, swirl, rim);

    let pulsePhase = 0;

    const draw = (baseColor: number, accentColor: number) => {
        baseCircle.clear();
        baseCircle.circle(0, 0, radius).fill({ color: baseColor, alpha: 0.95 });

        accentOverlay.clear();
        accentOverlay.circle(0, 0, radius * 0.78).fill({ color: accentColor, alpha: 0.45 });
        accentOverlay.blendMode = 'add';

        pulse.clear();
        pulse.circle(0, 0, radius * 0.48).fill({ color: accentColor, alpha: 0.35 });
        pulse.blendMode = 'add';

        rim.clear();
        rim.circle(0, 0, radius).stroke({ color: accentColor, width: 6, alignment: 0.5, alpha: 0.9 });

        swirl.clear();
        swirl.moveTo(-radius * 0.75, -radius * 0.3);
        swirl.quadraticCurveTo(0, radius * 0.7, radius * 0.75, -radius * 0.25);
        swirl.stroke({ color: accentColor, width: 5, alpha: 0.85, alignment: 0.5 });
    };

    const animate = (delta: number) => {
        pulsePhase += 0.02 * delta;
        const scale = 1 + 0.1 * Math.sin(pulsePhase);
        pulse.scale.set(scale);
    };

    const updateColors = (baseColor: number, accentColor: number) => {
        draw(baseColor, accentColor);
    };

    draw(0xffffff, 0xffffff);

    return {
        container,
        animate,
        updateColors,
    } satisfies BallPreviewHandle;
};

const createFormCard = (
    preset: LoadoutFormPreset,
    dimensions: { readonly width: number; readonly height: number },
    locked: boolean,
    onSelect: (preset: LoadoutFormPreset) => void,
): FormCardHandle => {
    const container = new Container();
    container.eventMode = 'static';

    const frame = new Graphics();
    const hover = new Graphics();
    const lockOverlay = new Graphics();
    const padding = 16;
    let isSelected = false;
    let isHovering = false;
    let isLocked = locked;

    const baseFill = hexToNumber(GameTheme.hud.panelFill);
    const borderColor = hexToNumber(GameTheme.hud.panelLine);

    const redraw = () => {
        const activeFill = isSelected ? preset.preview.baseColor : baseFill;
        const alpha = isLocked ? 0.35 : isSelected ? 0.92 : isHovering ? 0.86 : 0.78;

        frame.clear();
        frame.roundRect(0, 0, dimensions.width, dimensions.height, 18)
            .fill({ color: activeFill, alpha })
            .stroke({ color: borderColor, width: 3, alignment: 0.5, alpha: 0.9 });

        hover.clear();
        if (!isLocked && (isHovering || isSelected)) {
            hover.roundRect(0, 0, dimensions.width, dimensions.height, 18)
                .stroke({ color: preset.preview.accentColor, width: 4, alignment: 0.5, alpha: isSelected ? 0.95 : 0.6 });
        }

        lockOverlay.clear();
        if (isLocked) {
            lockOverlay.roundRect(0, 0, dimensions.width, dimensions.height, 18)
                .fill({ color: 0x000000, alpha: 0.55 });
        }
    };

    const title = new Text({
        text: preset.name,
        style: {
            fill: hexToNumber(GameTheme.hud.textPrimary),
            fontFamily: GameTheme.font,
            fontSize: 24,
            fontWeight: '800',
            wordWrap: true,
            wordWrapWidth: dimensions.width - padding * 2,
        },
    });
    title.anchor.set(0, 0);
    title.position.set(padding, padding);

    const description = new Text({
        text: preset.description,
        style: {
            fill: hexToNumber(GameTheme.hud.textSecondary),
            fontFamily: GameTheme.monoFont,
            fontSize: 16,
            wordWrap: true,
            wordWrapWidth: dimensions.width - padding * 2,
        },
    });
    description.anchor.set(0, 0);
    description.position.set(padding, title.y + title.height + 8);

    const summaryContainer = new Container();
    summaryContainer.position.set(padding, description.y + description.height + 10);
    let summaryOffset = 0;
    preset.cardSummary.slice(0, 3).forEach((line) => {
        const entry = new Text({
            text: `• ${line}`,
            style: {
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
                fontSize: 15,
                wordWrap: true,
                wordWrapWidth: dimensions.width - padding * 2,
            },
        });
        entry.anchor.set(0, 0);
        entry.position.set(0, summaryOffset);
        summaryContainer.addChild(entry);
        summaryOffset += entry.height + 2;
    });

    container.addChild(frame, hover, title, description, summaryContainer, lockOverlay);

    const setSelected = (selected: boolean) => {
        isSelected = selected;
        redraw();
        container.cursor = selected ? 'pointer' : isLocked ? 'not-allowed' : 'pointer';
    };

    const setLockedState = (lockedState: boolean) => {
        isLocked = lockedState;
        container.cursor = isLocked ? 'not-allowed' : 'pointer';
        redraw();
    };

    container.on('pointerover', () => {
        if (isLocked) {
            return;
        }
        isHovering = true;
        redraw();
    });

    container.on('pointerout', () => {
        isHovering = false;
        redraw();
    });

    container.on('pointertap', () => {
        if (isLocked) {
            return;
        }
        onSelect(preset);
    });

    redraw();
    setLockedState(locked);

    return {
        preset,
        container,
        setSelected,
        setLockedState,
    } satisfies FormCardHandle;
};

const summarizePreset = (preset: LoadoutFormPreset): readonly string[] => preset.combinedSummary.slice(0, 8);

const formatLinkedLabel = (label: string, option: { readonly name: string }): string => `${label}: ${option.name}`;

const callMaybePromise = async <T>(callback: () => MaybePromise<T>): Promise<T> => {
    const result = callback();
    return result instanceof Promise ? await result : result;
};

export const createLoadoutSelectionScene = (
    context: SceneContext<GameSceneServices>,
): Scene<LoadoutSelectionPayload, GameSceneServices> => {
    let root: Container | null = null;
    let activeTicker: TickerCallback<void> | null = null;
    let resolving = false;
    let cleanupCallbacks: Cleanup[] = [];

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

            const presets = payload.formPresets && payload.formPresets.length > 0
                ? payload.formPresets
                : buildLoadoutFormPresets();

            if (presets.length === 0) {
                throw new Error('No loadout presets are available');
            }

            const lockedSet = new Set<LoadoutFormId>(payload.lockedForms ?? []);
            const normalized = normalizeLoadoutSelection(payload.initialSelection);

            let selectedPreset = presets.find((preset) => preset.id === normalized.form && !lockedSet.has(preset.id)) ?? null;
            selectedPreset ??= presets.find((preset) => !lockedSet.has(preset.id)) ?? presets[0];

            const stageSize = context.designSize;
            const safeMargin = Math.max(32, stageSize.width * 0.05);

            const rootContainer = new Container();
            rootContainer.eventMode = 'static';
            rootContainer.cursor = 'default';

            const overlay = new Graphics();
            overlay.rect(0, 0, stageSize.width, stageSize.height)
                .fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.92 });
            overlay.eventMode = 'none';
            rootContainer.addChild(overlay);

            const title = new Text({
                text: 'Awaken Mayhaps',
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.font,
                    fontSize: stageSize.width >= 1280 ? 82 : stageSize.width >= 960 ? 68 : 56,
                    fontWeight: '900',
                    align: 'center',
                },
            });
            title.anchor.set(0.5, 0);
            title.position.set(stageSize.width / 2, 42);
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
            subtitle.position.set(stageSize.width / 2, title.y + title.height + 6);
            rootContainer.addChild(subtitle);

            const previewWidth = stageSize.width - safeMargin * 2;
            const previewHeight = Math.max(stageSize.height * 0.45, 320);
            const previewTop = subtitle.y + subtitle.height + 28;

            const previewContainer = new Container();
            previewContainer.position.set(safeMargin, previewTop);
            rootContainer.addChild(previewContainer);

            const previewPanel = new Graphics();
            previewPanel.roundRect(0, 0, previewWidth, previewHeight, 28)
                .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.88 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 3, alignment: 0.5 });
            previewPanel.eventMode = 'none';
            previewContainer.addChild(previewPanel);

            const ballRadius = Math.min(previewHeight * 0.3, previewWidth * 0.18);
            const ballHandle = createBallPreview(ballRadius);
            ballHandle.container.position.set(previewWidth * 0.26, previewHeight * 0.52);
            previewContainer.addChild(ballHandle.container);

            const detailColumn = new Container();
            detailColumn.position.set(previewWidth * 0.46, 28);
            previewContainer.addChild(detailColumn);

            const formName = new Text({
                text: '',
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.font,
                    fontSize: 48,
                    fontWeight: '900',
                    wordWrap: true,
                    wordWrapWidth: previewWidth * 0.48,
                },
            });
            formName.anchor.set(0, 0);
            detailColumn.addChild(formName);

            const formDescription = new Text({
                text: '',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 20,
                    wordWrap: true,
                    wordWrapWidth: previewWidth * 0.48,
                },
            });
            formDescription.anchor.set(0, 0);
            formDescription.position.set(0, formName.height + 10);
            detailColumn.addChild(formDescription);

            const linkedLabels = {
                trait: new Text({
                    text: '',
                    style: {
                        fill: hexToNumber(GameTheme.hud.textPrimary),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 18,
                        wordWrap: true,
                        wordWrapWidth: previewWidth * 0.48,
                    },
                }),
                sigil: new Text({
                    text: '',
                    style: {
                        fill: hexToNumber(GameTheme.hud.textPrimary),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 18,
                        wordWrap: true,
                        wordWrapWidth: previewWidth * 0.48,
                    },
                }),
                voice: new Text({
                    text: '',
                    style: {
                        fill: hexToNumber(GameTheme.hud.textPrimary),
                        fontFamily: GameTheme.monoFont,
                        fontSize: 18,
                        wordWrap: true,
                        wordWrapWidth: previewWidth * 0.48,
                    },
                }),
            } as const;

            linkedLabels.trait.anchor.set(0, 0);
            linkedLabels.trait.position.set(0, formDescription.y + formDescription.height + 14);
            detailColumn.addChild(linkedLabels.trait);

            linkedLabels.sigil.anchor.set(0, 0);
            linkedLabels.sigil.position.set(0, linkedLabels.trait.y + linkedLabels.trait.height + 8);
            detailColumn.addChild(linkedLabels.sigil);

            linkedLabels.voice.anchor.set(0, 0);
            linkedLabels.voice.position.set(0, linkedLabels.sigil.y + linkedLabels.sigil.height + 8);
            detailColumn.addChild(linkedLabels.voice);

            const summaryTitle = new Text({
                text: 'Combined Effects',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.font,
                    fontSize: 22,
                    fontWeight: '800',
                },
            });
            summaryTitle.anchor.set(0, 0);
            summaryTitle.position.set(0, linkedLabels.voice.y + linkedLabels.voice.height + 12);
            detailColumn.addChild(summaryTitle);

            const summaryList = new Container();
            summaryList.position.set(0, summaryTitle.y + summaryTitle.height + 8);
            detailColumn.addChild(summaryList);

            const startButton = new Graphics();
            const startRadius = Math.min(90, previewHeight * 0.14);
            startButton.circle(0, 0, startRadius)
                .fill({ color: hexToNumber(GameTheme.accents.combo), alpha: 0.96 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 4, alignment: 0.5 });
            startButton.position.set(previewWidth - startRadius - 48, previewHeight - startRadius - 48);
            startButton.eventMode = 'static';
            startButton.cursor = 'pointer';
            previewContainer.addChild(startButton);

            const startLabel = new Text({
                text: 'Start',
                style: {
                    fill: 0x000000,
                    fontFamily: GameTheme.font,
                    fontSize: Math.round(startRadius * 0.6),
                    fontWeight: '900',
                    align: 'center',
                },
            });
            startLabel.anchor.set(0.5, 0.5);
            startLabel.position.set(startButton.x, startButton.y);
            previewContainer.addChild(startLabel);

            const viewportTop = previewTop + previewHeight + 28;
            const viewportHeight = Math.max(220, stageSize.height - viewportTop - safeMargin);
            const viewportWidth = stageSize.width - safeMargin * 2;

            const gridViewport = new Container();
            gridViewport.position.set(safeMargin, viewportTop);
            gridViewport.eventMode = 'static';
            gridViewport.cursor = 'grab';
            rootContainer.addChild(gridViewport);

            const gridMask = new Graphics();
            gridMask.rect(0, 0, viewportWidth, viewportHeight)
                .fill({ color: 0xffffff, alpha: 1 });
            gridMask.position.set(gridViewport.x, gridViewport.y);
            gridMask.eventMode = 'none';
            rootContainer.addChild(gridMask);
            gridViewport.mask = gridMask;

            const gridContent = new Container();
            gridViewport.addChild(gridContent);

            const scrollHint = new Text({
                text: '',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 16,
                },
            });
            scrollHint.anchor.set(1, 0);
            scrollHint.position.set(stageSize.width - safeMargin, gridViewport.y - 24);
            rootContainer.addChild(scrollHint);

            const cards: FormCardHandle[] = [];

            const columns = stageSize.width >= 1320 ? 3 : stageSize.width >= 960 ? 2 : 1;
            const cardGap = 20;
            const totalGap = cardGap * Math.max(0, columns - 1);
            const normalizedCardWidth = Math.max(280, (viewportWidth - totalGap) / columns);
            const cardHeight = 220;
            const totalWidth = normalizedCardWidth * columns + totalGap;
            const horizontalOffset = Math.max(0, (viewportWidth - totalWidth) / 2);

            let layoutColumn = 0;
            let layoutRow = 0;

            presets.forEach((preset) => {
                const card = createFormCard(
                    preset,
                    { width: normalizedCardWidth, height: cardHeight },
                    lockedSet.has(preset.id),
                    (next) => selectPreset(next),
                );

                const cardX = horizontalOffset + layoutColumn * (normalizedCardWidth + cardGap);
                const cardY = layoutRow * (cardHeight + cardGap);
                card.container.position.set(cardX, cardY);
                gridContent.addChild(card.container);
                cards.push(card);

                layoutColumn += 1;
                if (layoutColumn >= columns) {
                    layoutColumn = 0;
                    layoutRow += 1;
                }
            });

            const contentHeight = layoutRow * (cardHeight + cardGap) + (layoutColumn > 0 ? cardHeight + cardGap : 0);

            let scrollOffset = 0;
            const minOffset = Math.min(0, viewportHeight - contentHeight - 12);

            const setScroll = (next: number) => {
                const clamped = Math.max(minOffset, Math.min(0, next));
                if (clamped === scrollOffset) {
                    return;
                }
                scrollOffset = clamped;
                gridContent.y = scrollOffset;
                context.renderStageSoon();
            };

            if (contentHeight > viewportHeight) {
                scrollHint.text = 'Scroll or drag to browse forms';
                const handleWheel = (event: WheelEvent) => {
                    event.preventDefault?.();
                    setScroll(scrollOffset - event.deltaY * 0.7);
                };
                gridViewport.on('wheel', handleWheel);
                cleanupCallbacks.push(() => gridViewport.off('wheel', handleWheel));

                let dragging = false;
                let dragStartY = 0;
                let dragStartOffset = 0;

                const pointerDown = (event: FederatedPointerEvent) => {
                    dragging = true;
                    dragStartY = event.global.y;
                    dragStartOffset = scrollOffset;
                    gridViewport.cursor = 'grabbing';
                };

                const pointerMove = (event: FederatedPointerEvent) => {
                    if (!dragging) {
                        return;
                    }
                    const delta = event.global.y - dragStartY;
                    setScroll(dragStartOffset + delta);
                };

                const endDrag = () => {
                    if (!dragging) {
                        return;
                    }
                    dragging = false;
                    gridViewport.cursor = 'grab';
                };

                gridViewport.on('pointerdown', pointerDown);
                gridViewport.on('pointermove', pointerMove);
                gridViewport.on('pointerup', endDrag);
                gridViewport.on('pointerupoutside', endDrag);
                gridViewport.on('pointercancel', endDrag);

                cleanupCallbacks.push(() => {
                    gridViewport.off('pointerdown', pointerDown);
                    gridViewport.off('pointermove', pointerMove);
                    gridViewport.off('pointerup', endDrag);
                    gridViewport.off('pointerupoutside', endDrag);
                    gridViewport.off('pointercancel', endDrag);
                });
            } else {
                scrollHint.text = '';
            }

            const updateSummary = (preset: LoadoutFormPreset) => {
                summaryList.removeChildren();
                const lines = summarizePreset(preset);
                if (lines.length === 0) {
                    const placeholder = new Text({
                        text: 'Select a form to view combined effects.',
                        style: {
                            fill: hexToNumber(GameTheme.hud.textSecondary),
                            fontFamily: GameTheme.monoFont,
                            fontSize: 18,
                            wordWrap: true,
                            wordWrapWidth: previewWidth * 0.48,
                        },
                    });
                    placeholder.anchor.set(0, 0);
                    summaryList.addChild(placeholder);
                    return;
                }

                let offset = 0;
                lines.forEach((line) => {
                    const entry = new Text({
                        text: `• ${line}`,
                        style: {
                            fill: hexToNumber(GameTheme.hud.textPrimary),
                            fontFamily: GameTheme.monoFont,
                            fontSize: 18,
                            wordWrap: true,
                            wordWrapWidth: previewWidth * 0.48,
                        },
                    });
                    entry.anchor.set(0, 0);
                    entry.position.set(0, offset);
                    summaryList.addChild(entry);
                    offset += entry.height + 4;
                });
            };

            const updateDetail = (preset: LoadoutFormPreset) => {
                formName.text = preset.name;
                formDescription.text = preset.description;
                linkedLabels.trait.text = formatLinkedLabel('Trait', preset.trait);
                linkedLabels.sigil.text = formatLinkedLabel('Sigil', preset.sigil);
                linkedLabels.voice.text = formatLinkedLabel('Voice', preset.voice);
                updateSummary(preset);
                ballHandle.updateColors(preset.preview.baseColor, preset.preview.accentColor);
                context.renderStageSoon();
            };

            const applyLockedState = () => {
                cards.forEach((card) => {
                    const lockedState = lockedSet.has(card.preset.id);
                    card.setLockedState(lockedState);
                });
            };

            const selectPreset = (preset: LoadoutFormPreset) => {
                if (lockedSet.has(preset.id)) {
                    return;
                }
                selectedPreset = preset;
                cards.forEach((card) => {
                    card.setSelected(card.preset.id === preset.id);
                });
                updateDetail(preset);
            };

            applyLockedState();
            if (selectedPreset) {
                selectPreset(selectedPreset);
            }

            const tickerCallback: TickerCallback<void> = (ticker) => {
                ballHandle.animate(ticker.deltaTime);
            };
            context.app.ticker.add(tickerCallback);
            activeTicker = tickerCallback;
            cleanupCallbacks.push(() => {
                if (activeTicker) {
                    context.app.ticker.remove(activeTicker);
                    activeTicker = null;
                }
            });

            const handleStart = async () => {
                if (!selectedPreset || lockedSet.has(selectedPreset.id) || resolving) {
                    return;
                }

                resolving = true;
                startButton.alpha = 0.65;
                startLabel.alpha = 0.75;
                startLabel.text = 'Starting…';
                context.renderStageSoon();

                try {
                    await callMaybePromise(() => payload.onCommit(selectedPreset!.selection));
                    context.popScene();
                } catch (error) {
                    void error;
                } finally {
                    resolving = false;
                    startButton.alpha = 1;
                    startLabel.alpha = 1;
                    startLabel.text = 'Start';
                    context.renderStageSoon();
                }
            };

            startButton.on('pointertap', () => {
                void handleStart();
            });
            cleanupCallbacks.push(() => startButton.removeAllListeners());

            cleanupCallbacks.push(() => {
                gridViewport.mask = null;
                rootContainer.removeChild(gridMask);
                gridMask.destroy();
            });

            root = rootContainer;
            context.addToLayer('hud', rootContainer);
            context.renderStageSoon();

            emitSceneEvent('enter');
        },
        update() {
            /* no-op */
        },
        destroy() {
            emitSceneEvent('exit');

            cleanupCallbacks.forEach((dispose) => {
                try {
                    dispose();
                } catch (error) {
                    void error;
                }
            });
            cleanupCallbacks = [];

            if (activeTicker) {
                context.app.ticker.remove(activeTicker);
                activeTicker = null;
            }

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
