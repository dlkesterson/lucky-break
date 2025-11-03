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
    readonly onCommit: (selection: LoadoutSelection) => void | Promise<void>;
}

type Cleanup = () => void;

type MaybePromise<T> = T | Promise<T>;

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
    const spinGroup = new Container();
    const swirl = new Graphics();
    const spark = new Graphics();

    container.addChild(baseCircle, accentOverlay, pulse, spinGroup, rim);
    spinGroup.addChild(swirl, spark);

    swirl.alpha = 0.85;
    spark.alpha = 0.7;
    pulse.alpha = 0.5;

    let pulsePhase = 0;

    const drawBall = (baseColor: number, accentColor: number) => {
        baseCircle.clear();
        baseCircle.circle(0, 0, radius).fill({ color: baseColor, alpha: 0.95 });

        accentOverlay.clear();
        accentOverlay.circle(0, 0, radius * 0.78).fill({ color: accentColor, alpha: 0.4 });
        accentOverlay.blendMode = 'add';

        pulse.clear();
        pulse.circle(0, 0, radius * 0.45).fill({ color: accentColor, alpha: 0.35 });
        pulse.blendMode = 'add';

        rim.clear();
        rim.circle(0, 0, radius)
            .stroke({ color: accentColor, width: 6, alignment: 0.5, alpha: 0.85 });

        swirl.clear();
        swirl.moveTo(-radius * 0.8, -radius * 0.3);
        swirl.quadraticCurveTo(0, radius * 0.7, radius * 0.8, -radius * 0.2);
        swirl.stroke({ color: accentColor, width: 6, alpha: 0.9, alignment: 0.5 });
        swirl.moveTo(-radius * 0.5, radius * 0.2);
        swirl.quadraticCurveTo(0, -radius * 0.6, radius * 0.4, radius * 0.4);
        swirl.stroke({ color: baseColor, width: 4, alpha: 0.6, alignment: 0.5 });

        spark.clear();
        spark.circle(0, -radius * 0.6, radius * 0.12).fill({ color: accentColor, alpha: 0.8 });
        spark.blendMode = 'add';
    };

    const animate = (delta: number) => {
        spinGroup.rotation += 0.01 * delta;
        pulsePhase += 0.015 * delta;
        const scale = 1 + 0.08 * Math.sin(pulsePhase);
        pulse.scale.set(scale);
    };

    const updateColors = (baseColor: number, accentColor: number) => {
        drawBall(baseColor, accentColor);
    };

    drawBall(0xffffff, 0xffffff);

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
    container.cursor = locked ? 'not-allowed' : 'pointer';

    const baseFill = hexToNumber(GameTheme.hud.panelFill);
    const borderColor = hexToNumber(GameTheme.hud.panelLine);

    const background = new Graphics();
    const hoverOverlay = new Graphics();
    const lockOverlay = new Graphics();
    const padding = 14;
    let isSelected = false;
    let isHovering = false;
    let isLocked = locked;

    const drawBackground = () => {
        const fillColor = isSelected ? preset.preview.baseColor : baseFill;
        const alpha = isLocked ? 0.35 : isSelected ? 0.94 : isHovering ? 0.88 : 0.82;
        background.clear();
        background.roundRect(0, 0, dimensions.width, dimensions.height, 18)
            .fill({ color: fillColor, alpha })
            .stroke({ color: borderColor, width: 3, alignment: 0.5, alpha: 0.9 });

        hoverOverlay.clear();
        if (!isLocked && (isHovering || isSelected)) {
            hoverOverlay.roundRect(0, 0, dimensions.width, dimensions.height, 18)
                .stroke({
                    color: preset.preview.accentColor,
                    width: 4,
                    alignment: 0.5,
                    alpha: isSelected ? 0.95 : 0.6,
                });
        }

        lockOverlay.clear();
        if (isLocked) {
            lockOverlay.roundRect(0, 0, dimensions.width, dimensions.height, 18)
                .fill({ color: 0x000000, alpha: 0.55 });
        }
    };

    drawBackground();

    const title = new Text({
        text: preset.name,
        style: {
            fill: hexToNumber(GameTheme.hud.textPrimary),
            fontFamily: GameTheme.font,
            fontSize: 24,
            fontWeight: '800',
            align: 'left',
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
    description.position.set(padding, title.y + title.height + 6);

    const summary = new Container();
    summary.position.set(padding, description.y + description.height + 8);
    let offset = 0;
    preset.cardSummary.slice(0, 3).forEach((line) => {
        const bullet = new Text({
            text: `• ${line}`,
            style: {
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
                fontSize: 15,
                wordWrap: true,
                wordWrapWidth: dimensions.width - padding * 2,
            },
        });
        bullet.anchor.set(0, 0);
        bullet.position.set(0, offset);
        summary.addChild(bullet);
        offset += bullet.height + 2;
    });

    container.addChild(background, hoverOverlay, title, description, summary, lockOverlay);

    container.on('pointertap', () => {
        if (isLocked) {
            return;
        }
        onSelect(preset);
    });

    container.on('pointerover', () => {
        if (isLocked) {
            return;
        }
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

    const setLockedState = (lockedState: boolean) => {
        isLocked = lockedState;
        container.cursor = isLocked ? 'not-allowed' : 'pointer';
        drawBackground();
    };

    return {
        preset,
        container,
        setSelected,
        setLockedState,
    } satisfies FormCardHandle;
};

const summarizePreset = (preset: LoadoutFormPreset): readonly string[] => {
    const summary: string[] = [];
    summary.push(...preset.combinedSummary.slice(0, 8));
    return summary;
};

const formatLinkedLabel = (label: string, option: { readonly name: string }): string => `${label}: ${option.name}`;

const callMaybePromise = async <T>(callback: () => MaybePromise<T>): Promise<T> => {
    const result = callback();
    return result instanceof Promise ? await result : result;
};

export const createLoadoutSelectionScene = (
    context: SceneContext<GameSceneServices>,
): Scene<LoadoutSelectionPayload, GameSceneServices> => {
    let root: Container | null = null;
    let resolving = false;
    let cleanupCallbacks: Cleanup[] = [];
    let activeTicker: TickerCallback<void> | null = null;

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

            const presets = (payload.formPresets && payload.formPresets.length > 0)
                ? payload.formPresets
                : buildLoadoutFormPresets();
            if (presets.length === 0) {
                throw new Error('No loadout forms available');
            }

            const lockedSet = new Set<LoadoutFormId>(payload.lockedForms ?? []);
            const normalized = normalizeLoadoutSelection(payload.initialSelection);
            let selectedPreset = presets.find((preset) => preset.id === normalized.form && !lockedSet.has(preset.id)) ?? null;
            selectedPreset ??= presets.find((preset) => !lockedSet.has(preset.id)) ?? presets[0];

            const stageSize = context.designSize;
            const rootContainer = new Container();
            rootContainer.eventMode = 'static';
            rootContainer.cursor = 'default';

            emitSceneEvent('enter');

            const overlay = new Graphics();
            overlay.rect(0, 0, stageSize.width, stageSize.height)
                .fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.9 });
            overlay.eventMode = 'none';
            rootContainer.addChild(overlay);

            const title = new Text({
                text: 'Awaken Mayhaps'.toUpperCase(),
                style: {
                    fill: hexToNumber(GameTheme.accents.combo),
                    fontFamily: GameTheme.font,
                    fontSize: stageSize.width >= 1280 ? 86 : stageSize.width >= 1024 ? 72 : 58,
                    fontWeight: '900',
                    align: 'center',
                },
            });
            title.anchor.set(0.5, 0);
            title.position.set(stageSize.width / 2, 32);
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

            const safeMargin = Math.max(32, stageSize.width * 0.05);
            const previewWidth = stageSize.width - safeMargin * 2;
            const previewHeight = Math.max(stageSize.height * 0.45, 320);
            const previewContainer = new Container();
            previewContainer.position.set(safeMargin, subtitle.y + subtitle.height + 28);
            rootContainer.addChild(previewContainer);

            const previewPanel = new Graphics();
            previewPanel.roundRect(0, 0, previewWidth, previewHeight, 28)
                .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.88 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 3, alignment: 0.5 });
            previewPanel.eventMode = 'none';
            previewContainer.addChild(previewPanel);

            const previewBallRadius = Math.min(previewHeight * 0.35, previewWidth * 0.18);
            const ballHandle = createBallPreview(previewBallRadius);
            ballHandle.container.position.set(previewPanel.x + previewWidth * 0.26, previewPanel.y + previewHeight * 0.52);
            previewContainer.addChild(ballHandle.container);

            const detailColumn = new Container();
            const detailOffsetX = previewPanel.x + previewWidth * 0.48;
            detailColumn.position.set(detailOffsetX, previewPanel.y + 32);
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
                    fontSize: 20,
                    fontWeight: '800',
                },
            });
            summaryTitle.anchor.set(0, 0);
            summaryTitle.position.set(0, linkedLabels.voice.y + linkedLabels.voice.height + 14);
            detailColumn.addChild(summaryTitle);

            const summaryList = new Container();
            summaryList.position.set(0, summaryTitle.y + summaryTitle.height + 8);
            detailColumn.addChild(summaryList);

            const startButton = new Graphics();
            const startRadius = Math.min(96, previewHeight * 0.15);
            startButton.circle(0, 0, startRadius)
                .fill({ color: hexToNumber(GameTheme.accents.combo), alpha: 0.96 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 4, alignment: 0.5 });
            startButton.position.set(previewPanel.x + previewWidth - startRadius - 48, previewPanel.y + previewHeight - startRadius - 48);
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
                },
            });
            startLabel.anchor.set(0.5, 0.5);
            startLabel.position.set(startButton.x, startButton.y);
            previewContainer.addChild(startLabel);

            const viewportTop = previewContainer.y + previewHeight + 32;
            const viewportHeight = Math.max(220, stageSize.height - viewportTop - 32);
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
            rootContainer.addChild(gridMask);
            gridViewport.mask = gridMask;

            const gridContent = new Container();
            gridViewport.addChild(gridContent);

            const columns = stageSize.width >= 1280 ? 3 : stageSize.width >= 960 ? 2 : 1;
            const cardGap = 20;
            const cardWidth = (viewportWidth - cardGap * (columns - 1));
            const normalizedCardWidth = cardWidth / columns;
            const cardHeight = 220;

            const cards: FormCardHandle[] = [];
            let row = 0;
            let column = 0;
            const totalWidth = columns * normalizedCardWidth + (columns - 1) * cardGap;
            const horizontalOffset = Math.max(0, (viewportWidth - totalWidth) / 2);

            const selectPreset = (next: LoadoutFormPreset) => {
                if (lockedSet.has(next.id)) {
                    return;
                }
                selectedPreset = next;
                cards.forEach((card) => {
                    card.setSelected(card.preset.id === selectedPreset?.id);
                });

                formName.text = next.name;
                formDescription.text = next.description;
                linkedLabels.trait.text = formatLinkedLabel('Trait', next.trait);
                linkedLabels.sigil.text = formatLinkedLabel('Sigil', next.sigil);
                linkedLabels.voice.text = formatLinkedLabel('Voice', next.voice);

                const summary = summarizePreset(next);
                summaryList.removeChildren();
                let offsetY = 0;
                summary.forEach((line) => {
                    const bullet = new Text({
                        text: `• ${line}`,
                        style: {
                            fill: hexToNumber(GameTheme.hud.textPrimary),
                            fontFamily: GameTheme.monoFont,
                            fontSize: 18,
                            wordWrap: true,
                            wordWrapWidth: previewWidth * 0.45,
                        },
                    });
                    bullet.anchor.set(0, 0);
                    bullet.position.set(0, offsetY);
                    summaryList.addChild(bullet);
                    offsetY += bullet.height + 4;
                });

                ballHandle.updateColors(next.preview.baseColor, next.preview.accentColor);
                startButton.alpha = 1;
                startButton.cursor = 'pointer';
                startLabel.alpha = 1;

                context.renderStageSoon();
            };

            presets.forEach((preset) => {
                const card = createFormCard(
                    preset,
                    { width: normalizedCardWidth, height: cardHeight },
                    lockedSet.has(preset.id),
                    selectPreset,
                );

                const cardX = horizontalOffset + column * (normalizedCardWidth + cardGap);
                const cardY = row * (cardHeight + cardGap);
                card.container.position.set(cardX, cardY);
                gridContent.addChild(card.container);
                cards.push(card);

                column += 1;
                if (column >= columns) {
                    column = 0;
                    row += 1;
                }
            });

            const contentHeight = row * (cardHeight + cardGap) + (column > 0 ? cardHeight + cardGap : 0);

            let scrollOffset = 0;
            const minOffset = Math.min(0, viewportHeight - contentHeight - cardGap);

            const setScroll = (next: number) => {
                const clamped = Math.max(minOffset, Math.min(0, next));
                if (clamped === scrollOffset) {
                    return;
                }
                scrollOffset = clamped;
                gridContent.y = scrollOffset;
                context.renderStageSoon();
            };

            gridContent.y = scrollOffset;

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
                if (contentHeight <= viewportHeight) {
                    return;
                }
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

            const scrollHint = new Text({
                text: contentHeight > viewportHeight ? 'Scroll or drag to view all forms' : '',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 16,
                },
            });
            scrollHint.anchor.set(1, 0);
            scrollHint.position.set(stageSize.width - safeMargin, gridViewport.y - 24);
            rootContainer.addChild(scrollHint);

            const applyLockedState = () => {
                cards.forEach((card) => {
                    const lockedState = lockedSet.has(card.preset.id);
                    card.setLockedState(lockedState);
                });
            };

            applyLockedState();

            const originalSelected = selectedPreset;
            if (originalSelected) {
                selectPreset(originalSelected);
            }

            const tickerCallback: TickerCallback<void> = (ticker) => {
                ballHandle.animate(ticker.deltaTime);
            };
            context.app.ticker.add(tickerCallback);
            activeTicker = tickerCallback;
            cleanupCallbacks.push(() => {
                if (activeTicker) {
                    context.app.ticker.remove(activeTicker);
                }
                activeTicker = null;
            });

            const handleStart = async () => {
                if (!selectedPreset || resolving || lockedSet.has(selectedPreset.id)) {
                    return;
                }
                resolving = true;
                startButton.alpha = 0.6;
                startLabel.alpha = 0.6;
                startLabel.text = 'Starting…';
                context.renderStageSoon();

                const runCommit = () => payload.onCommit(selectedPreset!.selection);

                try {
                    await callMaybePromise(runCommit);
                    resolving = false;
                    startButton.alpha = 1;
                    startLabel.alpha = 1;
                    startLabel.text = 'Start';
                    context.renderStageSoon();
                    context.popScene();
                } catch {
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
