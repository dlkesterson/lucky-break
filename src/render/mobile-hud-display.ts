import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { EntropyActionType } from 'app/events';
import type { HudEntropyActionDescriptor, HudScoreboardEntry, HudScoreboardView } from './hud';
import type { HudDisplay, HudDisplayUpdate } from './hud-display';
import type { GameThemeDefinition } from './theme';

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 110;
const PADDING = 16;
const MIN_HEIGHT = 96;
const ENTROPY_BUTTON_HEIGHT = 70;
const ENTROPY_BUTTON_RADIUS = 14;
const ENTROPY_BUTTON_GAP = 14;
const ENTROPY_SECTION_MARGIN = 12;

const parseColor = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

type EntryId = HudScoreboardEntry['id'];
type EntropyActionHandler = (action: EntropyActionType) => void;

interface EntropyButtonView {
    readonly container: Container;
    readonly background: Graphics;
    readonly label: Text;
    readonly detail: Text;
    action: EntropyActionType;
    enabled: boolean;
}

interface TextStyleOptions {
    readonly fill: number;
    readonly fontSize: number;
    readonly fontWeight?: 'normal' | 'bold';
    readonly fontFamily?: string;
    readonly letterSpacing?: number;
    readonly alpha?: number;
}

const createText = (value: string, style: TextStyleOptions): Text =>
    new Text(value, {
        fill: style.fill,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight ?? 'normal',
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing ?? 0.5,
    });

const pickEntryValue = (view: HudScoreboardView, id: EntryId): string | null =>
    view.entries.find((entry) => entry.id === id)?.value ?? null;

export const createMobileHudDisplay = (theme: GameThemeDefinition): HudDisplay => {
    let activeTheme = theme;
    let primaryColor = parseColor(activeTheme.hud.textPrimary);
    let secondaryColor = parseColor(activeTheme.hud.textSecondary);
    let accentColor = parseColor(activeTheme.accents.combo);
    let fontFamilyPrimary = activeTheme.font;
    let fontFamilyMono = activeTheme.monoFont ?? activeTheme.font;

    let currentHeight = PANEL_HEIGHT;
    let comboPulseStrength = 0;
    let entropyActionHandler: EntropyActionHandler | null = null;

    const container = new Container();
    container.eventMode = 'passive';
    container.alpha = 1;

    const statusText = createText('', {
        fill: primaryColor,
        fontSize: 42,
        fontWeight: 'bold',
        fontFamily: fontFamilyPrimary,
    });
    statusText.x = PADDING;
    container.addChild(statusText);

    const summaryText = createText('', {
        fill: secondaryColor,
        fontSize: 28,
        fontFamily: fontFamilyPrimary,
        alpha: 0.88,
    });
    summaryText.x = PADDING;
    summaryText.alpha = 0.88;
    container.addChild(summaryText);

    const statLineText = createText('', {
        fill: primaryColor,
        fontSize: 30,
        fontFamily: fontFamilyMono,
    });
    statLineText.x = PADDING;
    container.addChild(statLineText);

    const difficultyText = createText('', {
        fill: secondaryColor,
        fontSize: 24,
        fontFamily: fontFamilyMono,
    });
    difficultyText.x = PADDING;
    container.addChild(difficultyText);

    const comboText = createText('', {
        fill: accentColor,
        fontSize: 42,
        fontWeight: 'bold',
        fontFamily: fontFamilyPrimary,
    });
    comboText.x = PADDING;
    comboText.visible = false;
    container.addChild(comboText);

    const entropyContainer = new Container();
    entropyContainer.x = PADDING;
    entropyContainer.visible = false;
    entropyContainer.label = 'entropy-actions';
    container.addChild(entropyContainer);

    const entropyHeader = createText('Entropy Actions', {
        fill: secondaryColor,
        fontSize: 26,
        fontFamily: fontFamilyPrimary,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    });
    entropyHeader.x = 0;
    entropyHeader.visible = false;
    entropyContainer.addChild(entropyHeader);

    const entropyButtons: EntropyButtonView[] = [];

    const ensureEntropyButton = (index: number): EntropyButtonView => {
        if (entropyButtons[index]) {
            return entropyButtons[index];
        }

        const buttonContainer = new Container();
        buttonContainer.visible = false;
        buttonContainer.eventMode = 'none';
        buttonContainer.name = '';
        entropyContainer.addChild(buttonContainer);

        const background = new Graphics();
        buttonContainer.addChild(background);

        const label = createText('', {
            fill: primaryColor,
            fontSize: 28,
            fontFamily: fontFamilyPrimary,
            fontWeight: 'bold',
        });
        label.x = 18;
        label.y = 10;
        buttonContainer.addChild(label);

        const detail = createText('', {
            fill: secondaryColor,
            fontSize: 20,
            fontFamily: fontFamilyMono,
            alpha: 0.9,
        });
        detail.x = 18;
        detail.y = 40;
        buttonContainer.addChild(detail);

        const view: EntropyButtonView = {
            container: buttonContainer,
            background,
            label,
            detail,
            action: 'reroll',
            enabled: false,
        };

        entropyButtons[index] = view;
        return view;
    };

    const layoutTexts = (entropySectionHeight: number) => {
        let cursor = PADDING;
        if (statusText.visible) {
            statusText.y = cursor;
            cursor += statusText.height + 6;
        }
        if (summaryText.visible) {
            summaryText.y = cursor;
            cursor += summaryText.height + 8;
        }
        statLineText.y = cursor;
        cursor += statLineText.height + 8;
        difficultyText.y = cursor;
        cursor += difficultyText.height + 8;
        if (comboText.visible) {
            comboText.y = cursor;
            cursor += comboText.height + 10;
        }
        if (entropySectionHeight > 0) {
            entropyContainer.visible = true;
            entropyContainer.y = cursor;
            cursor += entropySectionHeight;
        } else {
            entropyContainer.visible = false;
        }
        currentHeight = Math.max(MIN_HEIGHT, Math.round(cursor + PADDING));
    };

    const buildStatLine = (view: HudScoreboardView): string => {
        const score = pickEntryValue(view, 'score') ?? '0';
        const lives = pickEntryValue(view, 'lives') ?? '—';
        const coins = pickEntryValue(view, 'coins') ?? '0c';
        return `Score ${score} · Lives ${lives} · Coins ${coins}`;
    };

    const formatEntropyDetail = (descriptor: HudEntropyActionDescriptor): string => {
        const cost = Math.max(0, Math.round(descriptor.cost));
        const status = descriptor.charges > 0
            ? `Charges ×${descriptor.charges}`
            : descriptor.affordable
                ? 'Ready'
                : 'Locked';
        return `${descriptor.hotkey.toUpperCase()} · Cost ${cost}% · ${status}`;
    };

    const updateEntropyButtons = (actions: readonly HudEntropyActionDescriptor[]): number => {
        entropyHeader.visible = actions.length > 0;
        const buttonWidth = PANEL_WIDTH - PADDING * 2;

        if (actions.length === 0) {
            entropyButtons.forEach((view) => {
                view.container.visible = false;
                view.enabled = false;
                view.container.eventMode = 'none';
                if ('cursor' in view.container) {
                    (view.container as { cursor?: string }).cursor = undefined;
                }
                view.container.hitArea = null;
                view.container.removeAllListeners?.();
            });
            return 0;
        }

        entropyContainer.visible = true;
        entropyHeader.y = 0;
        let cursor = entropyHeader.height + 10;

        actions.forEach((descriptor, index) => {
            const view = ensureEntropyButton(index);
            const { container: buttonContainer, background, label, detail } = view;
            const enabled = descriptor.charges > 0 || descriptor.affordable;

            buttonContainer.visible = true;
            buttonContainer.y = cursor;
            buttonContainer.eventMode = enabled ? 'static' : 'none';
            buttonContainer.name = `mobile-entropy-action-${descriptor.action}`;
            if ('cursor' in buttonContainer) {
                (buttonContainer as { cursor?: string }).cursor = enabled ? 'pointer' : 'not-allowed';
            }
            buttonContainer.hitArea = enabled ? new Rectangle(0, 0, buttonWidth, ENTROPY_BUTTON_HEIGHT) : null;
            buttonContainer.removeAllListeners?.();
            if (enabled) {
                buttonContainer.on?.('pointertap', () => {
                    const handler = entropyActionHandler;
                    if (handler) {
                        handler(descriptor.action);
                    }
                });
            }

            background.clear();
            background.roundRect(0, 0, buttonWidth, ENTROPY_BUTTON_HEIGHT, ENTROPY_BUTTON_RADIUS);
            background.fill({ color: enabled ? primaryColor : secondaryColor, alpha: enabled ? 0.22 : 0.08 });
            background.stroke({ color: enabled ? primaryColor : secondaryColor, alpha: enabled ? 0.55 : 0.22, width: 2 });

            label.text = descriptor.label;
            label.style.fill = enabled ? primaryColor : secondaryColor;
            label.style.fontFamily = fontFamilyPrimary;
            label.alpha = enabled ? 1 : 0.82;

            detail.text = formatEntropyDetail(descriptor);
            detail.style.fill = secondaryColor;
            detail.style.fontFamily = fontFamilyMono;
            detail.alpha = enabled ? 0.95 : 0.65;

            view.action = descriptor.action;
            view.enabled = enabled;

            cursor += ENTROPY_BUTTON_HEIGHT + ENTROPY_BUTTON_GAP;
        });

        for (let index = actions.length; index < entropyButtons.length; index += 1) {
            const view = entropyButtons[index];
            view.container.visible = false;
            view.enabled = false;
            view.container.eventMode = 'none';
            if ('cursor' in view.container) {
                (view.container as { cursor?: string }).cursor = undefined;
            }
            view.container.hitArea = null;
            view.container.removeAllListeners?.();
        }

        cursor -= ENTROPY_BUTTON_GAP;
        return cursor + ENTROPY_SECTION_MARGIN;
    };

    const update: HudDisplay['update'] = (payload: HudDisplayUpdate) => {
        const { view } = payload;
        statusText.text = view.statusText;
        statusText.visible = view.statusText.length > 0;

        summaryText.text = view.summaryLine;
        summaryText.visible = summaryText.text.length > 0;

        statLineText.text = buildStatLine(view);
        difficultyText.text = `Diff ×${payload.difficultyMultiplier.toFixed(2)}`;

        if (payload.comboCount > 0) {
            comboText.visible = true;
            comboText.text = `Combo ×${payload.comboCount}`;
            comboText.scale.set(1 + comboPulseStrength * 0.12);
            comboText.alpha = 0.8 + comboPulseStrength * 0.2;
            comboPulseStrength = Math.max(0, comboPulseStrength - 0.05);
        } else {
            comboText.visible = false;
            comboText.scale.set(1);
            comboPulseStrength = 0;
        }

        const entropySectionHeight = updateEntropyButtons(payload.entropyActions ?? []);
        layoutTexts(entropySectionHeight);
    };

    const pulseCombo: HudDisplay['pulseCombo'] = (intensity = 0.6) => {
        comboPulseStrength = Math.max(comboPulseStrength, intensity);
    };

    const applyTheme = (nextTheme: GameThemeDefinition) => {
        activeTheme = nextTheme;
        primaryColor = parseColor(activeTheme.hud.textPrimary);
        secondaryColor = parseColor(activeTheme.hud.textSecondary);
        accentColor = parseColor(activeTheme.accents.combo);
        fontFamilyPrimary = activeTheme.font;
        fontFamilyMono = activeTheme.monoFont ?? activeTheme.font;

        statusText.style.fill = primaryColor;
        statusText.style.fontFamily = fontFamilyPrimary;
        summaryText.style.fill = secondaryColor;
        summaryText.style.fontFamily = fontFamilyPrimary;
        statLineText.style.fill = primaryColor;
        statLineText.style.fontFamily = fontFamilyMono;
        difficultyText.style.fill = secondaryColor;
        difficultyText.style.fontFamily = fontFamilyMono;
        comboText.style.fill = accentColor;
        comboText.style.fontFamily = fontFamilyPrimary;
        entropyHeader.style.fill = secondaryColor;
        entropyHeader.style.fontFamily = fontFamilyPrimary;
        entropyButtons.forEach((button) => {
            button.label.style.fontFamily = fontFamilyPrimary;
            button.label.style.fill = button.enabled ? primaryColor : secondaryColor;
            button.detail.style.fontFamily = fontFamilyMono;
            button.detail.style.fill = secondaryColor;
        });
    };

    const setEntropyActionHandler = (handler: EntropyActionHandler | null): void => {
        entropyActionHandler = handler;
    };

    return {
        container,
        width: PANEL_WIDTH,
        getHeight: () => currentHeight,
        update,
        pulseCombo,
        setTheme: applyTheme,
        setEntropyActionHandler,
    } satisfies HudDisplay;
};
