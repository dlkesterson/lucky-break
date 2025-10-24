import { Container, Text } from 'pixi.js';
import type { HudScoreboardEntry, HudScoreboardView } from './hud';
import type { HudDisplay, HudDisplayUpdate } from './hud-display';
import type { GameThemeDefinition } from './theme';

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 110;
const PADDING = 16;
const MIN_HEIGHT = 96;

const parseColor = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

type EntryId = HudScoreboardEntry['id'];

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

    const container = new Container();
    container.eventMode = 'none';
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

    const layoutTexts = () => {
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
        currentHeight = Math.max(MIN_HEIGHT, Math.round(cursor + PADDING));
    };

    const buildStatLine = (view: HudScoreboardView): string => {
        const score = pickEntryValue(view, 'score') ?? '0';
        const lives = pickEntryValue(view, 'lives') ?? '—';
        const coins = pickEntryValue(view, 'coins') ?? '0c';
        return `Score ${score} · Lives ${lives} · Coins ${coins}`;
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

        layoutTexts();
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
    };

    return {
        container,
        width: PANEL_WIDTH,
        getHeight: () => currentHeight,
        update,
        pulseCombo,
        setTheme: applyTheme,
    } satisfies HudDisplay;
};
