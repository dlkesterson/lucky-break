import { Container, Graphics, Text } from 'pixi.js';
import type { HudScoreboardEntry, HudScoreboardPrompt, HudScoreboardView } from './hud';
import type { GameThemeDefinition } from './theme';
import type { HudSnapshot } from 'app/state';

export interface HudPowerUpView {
    readonly label: string;
    readonly remaining: string;
}

export interface HudRewardView {
    readonly label: string;
    readonly remaining?: string;
}

export interface HudDisplayUpdate {
    readonly view: HudScoreboardView;
    readonly difficultyMultiplier: number;
    readonly comboCount: number;
    readonly comboTimer: number;
    readonly activePowerUps: readonly HudPowerUpView[];
    readonly reward?: HudRewardView | null;
    readonly momentum: HudSnapshot['momentum'];
}

export interface HudDisplay {
    readonly container: Container;
    readonly width: number;
    getHeight(): number;
    update(payload: HudDisplayUpdate): void;
    pulseCombo(intensity?: number): void;
    setTheme(theme: GameThemeDefinition): void;
}

const PANEL_WIDTH = 480;
const PANEL_PADDING = 12;
const PANEL_MIN_HEIGHT = 220;
const ENTRY_ROW_HEIGHT = 32;
const POWER_UP_ROW_HEIGHT = 24;
const PROMPT_ROW_HEIGHT = 22;
const MOMENTUM_SECTION_MARGIN = 16;
const MOMENTUM_BAR_HEIGHT = 8;
const MOMENTUM_BAR_RADIUS = 4;
const MOMENTUM_BAR_VERTICAL_GAP = 16;

type HudMomentum = HudSnapshot['momentum'];

const parseColor = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

interface TextStyleOptions {
    readonly fill: number;
    readonly fontSize: number;
    readonly fontWeight?: 'normal' | 'bold';
    readonly fontFamily?: string;
    readonly letterSpacing?: number;
}

const createText = (
    text: string,
    style: TextStyleOptions,
): Text => {
    return new Text(text, {
        fill: style.fill,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight ?? 'normal',
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing ?? 0.5,
    });
};

export const createHudDisplay = (theme: GameThemeDefinition): HudDisplay => {
    let activeTheme = theme;
    let colorPrimary = parseColor(activeTheme.hud.textPrimary);
    let colorSecondary = parseColor(activeTheme.hud.textSecondary);
    let colorCombo = parseColor(activeTheme.accents.combo);
    let colorReward = parseColor(activeTheme.hud.accent);
    let colorWarning = parseColor(activeTheme.hud.danger);
    let fontFamilyPrimary = activeTheme.font;
    let fontFamilyMono = activeTheme.monoFont ?? activeTheme.font;

    const clampUnitValue = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

    const momentumDescriptors = [
        { key: 'comboHeat', label: 'Heat', resolveColor: () => colorCombo },
        { key: 'speedPressure', label: 'Speed', resolveColor: () => colorPrimary },
        { key: 'brickDensity', label: 'Field', resolveColor: () => colorReward },
    ] as const;

    interface MomentumBarView {
        readonly container: Container;
        readonly label: Text;
        readonly background: Graphics;
        readonly fill: Graphics;
    }

    let momentumBarBackgroundColor = parseColor(activeTheme.hud.panelLine);

    const container = new Container();
    container.eventMode = 'none';
    container.sortableChildren = true;

    const momentumContainer = new Container();
    momentumContainer.visible = false;
    momentumContainer.eventMode = 'none';
    container.addChild(momentumContainer);

    const momentumHeader = createText('Momentum Metrics', {
        fill: colorSecondary,
        fontSize: 14,
        fontFamily: fontFamilyPrimary,
        letterSpacing: 1,
    });
    momentumHeader.x = PANEL_PADDING;
    momentumContainer.addChild(momentumHeader);

    const momentumBars: MomentumBarView[] = momentumDescriptors.map(() => {
        const barContainer = new Container();
        barContainer.visible = false;
        barContainer.eventMode = 'none';

        const background = new Graphics();
        background.x = PANEL_PADDING;
        barContainer.addChild(background);

        const fill = new Graphics();
        fill.x = PANEL_PADDING;
        barContainer.addChild(fill);

        const label = createText('', {
            fill: colorSecondary,
            fontSize: 13,
            fontFamily: fontFamilyMono,
        });
        label.x = PANEL_PADDING + 4;
        barContainer.addChild(label);

        momentumContainer.addChild(barContainer);
        return { container: barContainer, label, background, fill } satisfies MomentumBarView;
    });

    let currentPanelHeight = PANEL_MIN_HEIGHT;

    const statusText = createText('', {
        fill: colorPrimary,
        fontSize: 28,
        fontWeight: 'bold',
        fontFamily: fontFamilyPrimary,
        letterSpacing: 1,
    });
    statusText.x = PANEL_PADDING;
    container.addChild(statusText);

    const summaryText = createText('', {
        fill: colorSecondary,
        fontSize: 18,
        fontFamily: fontFamilyPrimary,
        letterSpacing: 0.5,
    });
    summaryText.x = PANEL_PADDING;
    summaryText.alpha = 0.92;
    container.addChild(summaryText);

    const entryOrder: readonly HudScoreboardEntry['id'][] = ['score', 'coins', 'lives', 'bricks', 'entropy', 'momentum', 'audio'];
    const entryLabelTexts = new Map<HudScoreboardEntry['id'], Text>();
    const entryValueTexts = new Map<HudScoreboardEntry['id'], Text>();

    entryOrder.forEach((id) => {
        const label = createText('', {
            fill: colorSecondary,
            fontSize: 16,
            fontFamily: fontFamilyMono,
            letterSpacing: 1,
        });
        label.x = PANEL_PADDING;
        container.addChild(label);
        entryLabelTexts.set(id, label);

        const value = createText('', {
            fill: colorPrimary,
            fontSize: 20,
            fontFamily: fontFamilyMono,
        });
        value.anchor.set(1, 0);
        value.x = PANEL_WIDTH - PANEL_PADDING;
        container.addChild(value);
        entryValueTexts.set(id, value);
    });

    const difficultyText = createText('', {
        fill: colorSecondary,
        fontSize: 16,
        fontFamily: fontFamilyMono,
        letterSpacing: 0.5,
    });
    difficultyText.x = PANEL_PADDING;
    container.addChild(difficultyText);

    const comboLabel = createText('', {
        fill: colorCombo,
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: fontFamilyPrimary,
        letterSpacing: 1,
    });
    comboLabel.x = PANEL_PADDING;
    comboLabel.visible = false;
    container.addChild(comboLabel);

    const comboTimerText = createText('', { fill: colorSecondary, fontSize: 14, fontFamily: fontFamilyMono });
    comboTimerText.x = PANEL_PADDING + 6;
    comboTimerText.visible = false;
    container.addChild(comboTimerText);

    const powerUpHeader = createText('Power-Ups', { fill: colorSecondary, fontSize: 16, fontFamily: fontFamilyPrimary, letterSpacing: 0.5 });
    powerUpHeader.x = PANEL_PADDING;
    powerUpHeader.visible = false;
    powerUpHeader.alpha = 0.9;
    container.addChild(powerUpHeader);

    const powerUpTexts: Text[] = Array.from({ length: 4 }, () => {
        const text = createText('', { fill: colorPrimary, fontSize: 16, fontFamily: fontFamilyMono });
        text.x = PANEL_PADDING + 12;
        text.visible = false;
        container.addChild(text);
        return text;
    });

    const rewardText = createText('', { fill: colorReward, fontSize: 18, fontWeight: 'bold', fontFamily: fontFamilyPrimary });
    rewardText.x = PANEL_PADDING;
    rewardText.visible = false;
    container.addChild(rewardText);

    const promptTexts: Text[] = Array.from({ length: 2 }, (_, index) => {
        const baseColor = index === 0 ? colorWarning : colorReward;
        const text = createText('', { fill: baseColor, fontSize: 15, fontFamily: fontFamilyPrimary });
        text.x = PANEL_PADDING;
        text.visible = false;
        container.addChild(text);
        return text;
    });

    let comboPulseStrength = 0;

    const updateMomentumSection = (momentum: HudMomentum, startY: number): number => {
        if (!momentum) {
            momentumContainer.visible = false;
            momentumBars.forEach((bar) => {
                bar.container.visible = false;
            });
            return startY;
        }

        momentumContainer.visible = true;
        const sectionTop = startY + MOMENTUM_SECTION_MARGIN;
        momentumContainer.y = sectionTop;
        momentumHeader.y = 0;

        let cursor = momentumHeader.height + 6;
        const momentumBarWidth = PANEL_WIDTH - PANEL_PADDING * 2;
        momentumDescriptors.forEach((descriptor, index) => {
            const bar = momentumBars[index];
            const value = clampUnitValue(momentum[descriptor.key]);
            const percent = Math.round(value * 100);

            bar.container.visible = true;
            bar.container.y = cursor;
            bar.label.text = `${descriptor.label} ${percent}%`;
            bar.label.style.fill = colorSecondary;
            bar.label.style.fontFamily = fontFamilyMono;
            bar.label.y = 0;

            const barY = bar.label.height + 4;
            bar.background.clear();
            bar.background.roundRect(
                0,
                barY,
                momentumBarWidth,
                MOMENTUM_BAR_HEIGHT,
                MOMENTUM_BAR_RADIUS,
            );
            bar.background.fill({ color: momentumBarBackgroundColor, alpha: 0.28 });
            bar.background.visible = true;

            bar.fill.clear();
            if (value > 0) {
                const barWidth = Math.max(2, Math.round(momentumBarWidth * value));
                bar.fill.roundRect(
                    0,
                    barY,
                    barWidth,
                    MOMENTUM_BAR_HEIGHT,
                    MOMENTUM_BAR_RADIUS,
                );
                bar.fill.fill({ color: descriptor.resolveColor(), alpha: 0.9 });
                bar.fill.visible = true;
            } else {
                bar.fill.visible = false;
            }

            cursor += bar.label.height + MOMENTUM_BAR_HEIGHT + MOMENTUM_BAR_VERTICAL_GAP;
        });

        cursor += MOMENTUM_SECTION_MARGIN;
        return momentumContainer.y + cursor;
    };

    const updateEntries = (entries: readonly HudScoreboardEntry[], startY: number): number => {
        let cursor = startY;
        entryOrder.forEach((id) => {
            const labelTarget = entryLabelTexts.get(id);
            const valueTarget = entryValueTexts.get(id);
            if (!labelTarget || !valueTarget) {
                return;
            }
            const entry = entries.find((candidate) => candidate.id === id);
            if (!entry) {
                labelTarget.visible = false;
                valueTarget.visible = false;
                return;
            }
            labelTarget.visible = true;
            valueTarget.visible = true;
            labelTarget.text = entry.label.toUpperCase();
            labelTarget.y = cursor;
            valueTarget.text = entry.value;
            valueTarget.y = labelTarget.y;
            cursor += ENTRY_ROW_HEIGHT;
        });
        return cursor;
    };

    const updatePowerUps = (powerUps: readonly HudPowerUpView[], startY: number): number => {
        powerUpHeader.visible = powerUps.length > 0;
        powerUpHeader.y = startY;
        let cursor = startY;
        if (!powerUpHeader.visible) {
            powerUpTexts.forEach((text) => {
                text.visible = false;
            });
            return cursor;
        }

        cursor += POWER_UP_ROW_HEIGHT;
        powerUpTexts.forEach((text, index) => {
            const entry = powerUps[index];
            if (!entry) {
                text.visible = false;
                return;
            }
            text.visible = true;
            text.text = `${entry.label} — ${entry.remaining}`;
            text.y = cursor;
            cursor += POWER_UP_ROW_HEIGHT;
        });
        return cursor;
    };

    const updatePrompts = (prompts: readonly HudScoreboardPrompt[], startY: number): void => {
        promptTexts.forEach((text, index) => {
            const prompt = prompts[index];
            if (!prompt) {
                text.visible = false;
                return;
            }
            const prefix = prompt.severity === 'warning' ? '!' : 'i';
            text.visible = true;
            text.text = `${prefix} ${prompt.message}`;
            text.y = startY + index * PROMPT_ROW_HEIGHT;
        });
    };

    const update = (payload: HudDisplayUpdate): void => {
        let cursor = PANEL_PADDING;

        statusText.text = payload.view.statusText;
        statusText.visible = statusText.text.length > 0;
        statusText.y = cursor;
        cursor += statusText.visible ? statusText.height + 6 : 0;

        summaryText.text = payload.view.summaryLine;
        summaryText.visible = summaryText.text.length > 0;
        if (summaryText.visible) {
            summaryText.y = cursor;
            cursor += summaryText.height + 10;
        }

        cursor = updateEntries(payload.view.entries, cursor + 4);
        cursor = updateMomentumSection(payload.momentum, cursor + 4);

        difficultyText.text = `Difficulty ×${payload.difficultyMultiplier.toFixed(2)}`;
        difficultyText.y = cursor + 6;
        cursor = difficultyText.y + 28;

        const hasCombo = payload.comboCount > 0;
        comboLabel.visible = hasCombo;
        comboTimerText.visible = hasCombo;
        if (hasCombo) {
            comboLabel.text = `Combo ×${payload.comboCount}`;
            comboLabel.y = cursor;
            comboLabel.scale.set(1 + comboPulseStrength * 0.12);

            comboTimerText.text = `${payload.comboTimer.toFixed(1)}s window`;
            comboTimerText.y = comboLabel.y + comboLabel.height + 4;
            comboTimerText.alpha = Math.min(1, 0.72 + comboPulseStrength * 0.28);
            cursor = comboTimerText.y + comboTimerText.height + 6;
            comboPulseStrength = Math.max(0, comboPulseStrength - 0.04);
        } else {
            comboLabel.scale.set(1);
        }

        cursor = updatePowerUps(payload.activePowerUps, cursor);

        if (payload.reward) {
            rewardText.visible = true;
            rewardText.text = payload.reward.remaining
                ? `${payload.reward.label} — ${payload.reward.remaining}`
                : payload.reward.label;
            rewardText.y = cursor + 10;
            cursor = rewardText.y + rewardText.height + 8;
        } else {
            rewardText.visible = false;
        }

        updatePrompts(payload.view.prompts, cursor + 10);

        const promptSpan = payload.view.prompts.length > 0 ? PROMPT_ROW_HEIGHT * payload.view.prompts.length : 0;
        const requiredHeight = Math.max(PANEL_MIN_HEIGHT, Math.round(cursor + promptSpan + PANEL_PADDING));
        currentPanelHeight = requiredHeight;
    };

    const pulseCombo = (intensity = 0.6): void => {
        comboPulseStrength = Math.max(comboPulseStrength, intensity);
    };

    const setTheme = (nextTheme: GameThemeDefinition): void => {
        activeTheme = nextTheme;
        colorPrimary = parseColor(activeTheme.hud.textPrimary);
        colorSecondary = parseColor(activeTheme.hud.textSecondary);
        colorCombo = parseColor(activeTheme.accents.combo);
        colorReward = parseColor(activeTheme.hud.accent);
        colorWarning = parseColor(activeTheme.hud.danger);
        fontFamilyPrimary = activeTheme.font;
        fontFamilyMono = activeTheme.monoFont ?? activeTheme.font;

        statusText.style.fill = colorPrimary;
        statusText.style.fontFamily = fontFamilyPrimary;
        summaryText.style.fill = colorSecondary;
        summaryText.style.fontFamily = fontFamilyPrimary;
        entryLabelTexts.forEach((text) => {
            text.style.fill = colorSecondary;
            text.style.fontFamily = fontFamilyMono;
        });
        entryValueTexts.forEach((text) => {
            text.style.fill = colorPrimary;
            text.style.fontFamily = fontFamilyMono;
        });
        difficultyText.style.fill = colorSecondary;
        difficultyText.style.fontFamily = fontFamilyMono;
        comboLabel.style.fill = colorCombo;
        comboLabel.style.fontFamily = fontFamilyPrimary;
        comboTimerText.style.fill = colorSecondary;
        comboTimerText.style.fontFamily = fontFamilyMono;
        powerUpHeader.style.fill = colorSecondary;
        powerUpHeader.style.fontFamily = fontFamilyPrimary;
        powerUpTexts.forEach((text) => {
            text.style.fill = colorPrimary;
            text.style.fontFamily = fontFamilyMono;
        });
        rewardText.style.fill = colorReward;
        rewardText.style.fontFamily = fontFamilyPrimary;
        promptTexts.forEach((text, index) => {
            text.style.fill = index === 0 ? colorWarning : colorReward;
            text.style.fontFamily = fontFamilyPrimary;
        });
        momentumBarBackgroundColor = parseColor(activeTheme.hud.panelLine);
        momentumHeader.style.fill = colorSecondary;
        momentumHeader.style.fontFamily = fontFamilyPrimary;
        momentumBars.forEach((bar) => {
            bar.label.style.fill = colorSecondary;
            bar.label.style.fontFamily = fontFamilyMono;
            bar.background.clear();
            bar.fill.clear();
            bar.fill.visible = false;
        });
    };

    return {
        container,
        width: PANEL_WIDTH,
        getHeight: () => currentPanelHeight,
        update,
        pulseCombo,
        setTheme,
    } satisfies HudDisplay;
};
