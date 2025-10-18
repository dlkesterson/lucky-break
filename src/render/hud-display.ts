import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import type { HudScoreboardEntry, HudScoreboardPrompt, HudScoreboardView } from './hud';
import type { GameThemeDefinition } from './theme';

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
}

export interface HudDisplay {
    readonly container: Container;
    readonly width: number;
    getHeight(): number;
    update(payload: HudDisplayUpdate): void;
    pulseCombo(intensity?: number): void;
    setTheme(theme: GameThemeDefinition): void;
}

const PANEL_WIDTH = 300;
const PANEL_RADIUS = 18;
const PANEL_PADDING = 18;
const PANEL_MIN_HEIGHT = 260;
const ENTRY_ROW_HEIGHT = 20;
const POWER_UP_ROW_HEIGHT = 18;
const PROMPT_ROW_HEIGHT = 18;

const parseColor = (value: string): number => Number.parseInt(value.replace('#', ''), 16);

const createText = (
    text: string,
    style: { readonly fill: number; readonly fontSize: number; readonly fontWeight?: 'normal' | 'bold' },
): Text => {
    return new Text(text, {
        fill: style.fill,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight ?? 'normal',
        letterSpacing: 0.5,
    });
};

export const createHudDisplay = (theme: GameThemeDefinition): HudDisplay => {
    let activeTheme = theme;
    let colorPrimary = parseColor(activeTheme.hud.textPrimary);
    let colorSecondary = parseColor(activeTheme.hud.textSecondary);
    let colorCombo = parseColor(activeTheme.accents.combo);
    let colorReward = parseColor(activeTheme.hud.accent);
    let colorWarning = parseColor(activeTheme.hud.danger);

    const container = new Container();
    container.eventMode = 'none';

    const panel = new Graphics();
    panel.alpha = 0.86;
    panel.eventMode = 'none';
    container.addChild(panel);

    let currentPanelHeight = PANEL_MIN_HEIGHT;
    const redrawPanel = (height: number) => {
        currentPanelHeight = height;
        panel.clear();
        const gradient = new FillGradient(0, 0, 0, height);
        gradient.addColorStop(0, activeTheme.hud.panelFill);
        gradient.addColorStop(1, activeTheme.background.to);
        panel.roundRect(0, 0, PANEL_WIDTH, height, PANEL_RADIUS);
        panel.fill(gradient);
        panel.stroke({ color: parseColor(activeTheme.hud.panelLine), width: 2, alpha: 0.75 });
    };
    redrawPanel(PANEL_MIN_HEIGHT);

    const statusText = createText('', { fill: colorPrimary, fontSize: 20, fontWeight: 'bold' });
    statusText.x = PANEL_PADDING;
    container.addChild(statusText);

    const summaryText = createText('', { fill: colorSecondary, fontSize: 14 });
    summaryText.x = PANEL_PADDING;
    summaryText.alpha = 0.8;
    container.addChild(summaryText);

    const entryOrder: readonly HudScoreboardEntry['id'][] = ['score', 'lives', 'bricks', 'momentum', 'audio'];
    const entryTexts = new Map<HudScoreboardEntry['id'], Text>();

    entryOrder.forEach((id, index) => {
        const text = createText('', { fill: colorPrimary, fontSize: 14 });
        text.x = PANEL_PADDING;
        text.y = PANEL_PADDING + 70 + index * ENTRY_ROW_HEIGHT;
        container.addChild(text);
        entryTexts.set(id, text);
    });

    const difficultyText = createText('', { fill: colorSecondary, fontSize: 13 });
    difficultyText.x = PANEL_PADDING;
    container.addChild(difficultyText);

    const comboLabel = createText('', { fill: colorCombo, fontSize: 18, fontWeight: 'bold' });
    comboLabel.x = PANEL_PADDING;
    comboLabel.visible = false;
    container.addChild(comboLabel);

    const comboTimerText = createText('', { fill: colorSecondary, fontSize: 12 });
    comboTimerText.x = PANEL_PADDING + 6;
    comboTimerText.visible = false;
    container.addChild(comboTimerText);

    const powerUpHeader = createText('Power-Ups', { fill: colorSecondary, fontSize: 12 });
    powerUpHeader.x = PANEL_PADDING;
    powerUpHeader.visible = false;
    powerUpHeader.alpha = 0.9;
    container.addChild(powerUpHeader);

    const powerUpTexts: Text[] = Array.from({ length: 4 }, () => {
        const text = createText('', { fill: colorPrimary, fontSize: 13 });
        text.x = PANEL_PADDING + 10;
        text.visible = false;
        container.addChild(text);
        return text;
    });

    const rewardText = createText('', { fill: colorReward, fontSize: 13, fontWeight: 'bold' });
    rewardText.x = PANEL_PADDING;
    rewardText.visible = false;
    container.addChild(rewardText);

    const promptTexts: Text[] = Array.from({ length: 2 }, (_, index) => {
        const baseColor = index === 0 ? colorWarning : colorReward;
        const text = createText('', { fill: baseColor, fontSize: 12 });
        text.x = PANEL_PADDING;
        text.visible = false;
        container.addChild(text);
        return text;
    });

    let comboPulseStrength = 0;

    const updateEntries = (entries: readonly HudScoreboardEntry[], startY: number): number => {
        let cursor = startY;
        entryOrder.forEach((id) => {
            const target = entryTexts.get(id);
            if (!target) {
                return;
            }
            const entry = entries.find((candidate) => candidate.id === id);
            if (!entry) {
                target.visible = false;
                return;
            }
            target.visible = true;
            target.text = `${entry.label}: ${entry.value}`;
            target.y = cursor;
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
        statusText.text = payload.view.statusText;
        statusText.y = PANEL_PADDING;

        summaryText.text = payload.view.summaryLine;
        summaryText.visible = payload.view.summaryLine.length > 0;
        summaryText.y = statusText.y + 26;

        let cursor = summaryText.visible ? summaryText.y + 24 : statusText.y + 20;
        cursor = updateEntries(payload.view.entries, cursor + 4);

        difficultyText.text = `Difficulty ×${payload.difficultyMultiplier.toFixed(2)}`;
        difficultyText.y = cursor + 8;
        cursor = difficultyText.y + 24;

        const hasCombo = payload.comboCount > 0;
        comboLabel.visible = hasCombo;
        comboTimerText.visible = hasCombo;
        if (hasCombo) {
            comboLabel.text = `Combo ×${payload.comboCount}`;
            comboLabel.y = cursor;
            comboLabel.scale.set(1 + comboPulseStrength * 0.12);

            comboTimerText.text = `${payload.comboTimer.toFixed(1)}s window`;
            comboTimerText.y = comboLabel.y + 20;
            comboTimerText.alpha = Math.min(1, 0.7 + comboPulseStrength * 0.3);
            cursor = comboTimerText.y + 24;
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
            rewardText.y = cursor + 8;
            cursor = rewardText.y + 22;
        } else {
            rewardText.visible = false;
        }

        updatePrompts(payload.view.prompts, cursor + 8);

        const requiredHeight = Math.max(PANEL_MIN_HEIGHT, Math.round(cursor + 48));
        if (Math.abs(requiredHeight - currentPanelHeight) > 1) {
            redrawPanel(requiredHeight);
        }
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

        statusText.style.fill = colorPrimary;
        summaryText.style.fill = colorSecondary;
        entryTexts.forEach((text) => {
            text.style.fill = colorPrimary;
        });
        difficultyText.style.fill = colorSecondary;
        comboLabel.style.fill = colorCombo;
        comboTimerText.style.fill = colorSecondary;
        powerUpHeader.style.fill = colorSecondary;
        powerUpTexts.forEach((text) => {
            text.style.fill = colorPrimary;
        });
        rewardText.style.fill = colorReward;
        promptTexts.forEach((text, index) => {
            text.style.fill = index === 0 ? colorWarning : colorReward;
        });

        redrawPanel(currentPanelHeight);
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
