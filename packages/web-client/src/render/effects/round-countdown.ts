import { Container, FillGradient, Graphics, Text, type Filter } from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import type { GameThemeDefinition } from 'render/theme';
import { mixColors, toColorNumber } from 'render/playfield-visuals';
import { clampUnit } from 'util/math';

const resolveColor = (value: string | number): number => (typeof value === 'number' ? value : toColorNumber(value));

const easeOutCubic = (value: number): number => {
    const t = clampUnit(value);
    const oneMinus = 1 - t;
    return 1 - oneMinus * oneMinus * oneMinus;
};

interface RoundCountdownOptions {
    readonly playfieldSize: { readonly width: number; readonly height: number };
    readonly theme: GameThemeDefinition;
}

export interface RoundCountdownDisplay {
    readonly container: Container;
    show(secondsRemaining: number, totalSeconds: number): void;
    hide(): void;
    setTheme(theme: GameThemeDefinition): void;
}

export const createRoundCountdown = ({ playfieldSize, theme }: RoundCountdownOptions): RoundCountdownDisplay => {
    let activeTheme = theme;

    const container = new Container();
    container.eventMode = 'none';
    container.visible = false;
    container.sortableChildren = true;
    container.zIndex = 2;
    container.position.set(playfieldSize.width / 2, playfieldSize.height / 2);

    const halo = new Graphics();
    halo.eventMode = 'none';
    halo.alpha = 0;
    container.addChild(halo);

    const shadowText = new Text('', {
        fill: '#000000',
        fontSize: 10,
        fontFamily: activeTheme.font,
        align: 'center',
    });
    const shadowAnchor = (shadowText as unknown as { anchor?: { set?: (value: number) => void } }).anchor;
    shadowAnchor?.set?.(0.5);
    shadowText.eventMode = 'none';
    shadowText.alpha = 0.25;
    container.addChild(shadowText);

    const valueText = new Text('', {
        fill: resolveColor(activeTheme.hud.textPrimary),
        fontSize: 10,
        fontFamily: activeTheme.font,
        fontWeight: 'bold',
        align: 'center',
    });
    const valueAnchor = (valueText as unknown as { anchor?: { set?: (value: number) => void } }).anchor;
    valueAnchor?.set?.(0.5);
    valueText.eventMode = 'none';
    container.addChild(valueText);

    const glowFilter = new GlowFilter({
        color: resolveColor(activeTheme.accents.combo),
        outerStrength: 1,
        innerStrength: 0.2,
        distance: 18,
        quality: 0.3,
    });
    valueText.filters = [glowFilter as unknown as Filter];

    const shortestEdge = Math.min(playfieldSize.width, playfieldSize.height);
    const haloRadius = shortestEdge * 0.46;
    let fontSize = Math.round(shortestEdge * 0.32);
    let strokeThickness = Math.max(6, Math.round(fontSize * 0.12));
    let letterSpacing = Math.round(fontSize * 0.08);
    let shadowOffset = Math.max(6, Math.round(fontSize * 0.08));

    let currentSeverity: 'normal' | 'caution' | 'warning' = 'normal';
    let lastDisplayedValue: number | null = null;
    let lastHaloColor = 0;

    const redrawHalo = (color: number) => {
        if (color === lastHaloColor) {
            return;
        }
        lastHaloColor = color;
        halo.clear();
        const gradient = new FillGradient(0, -haloRadius, 0, haloRadius);
        gradient.addColorStop(0, mixColors(color, 0xffffff, 0.4));
        gradient.addColorStop(1, mixColors(color, 0x050312, 0.55));
        halo.circle(0, 0, haloRadius);
        halo.fill(gradient);
        halo.stroke({ color, width: Math.max(4, Math.round(haloRadius * 0.08)), alpha: 0.22 });
        halo.blendMode = 'screen';
    };

    const applyTypography = () => {
        fontSize = Math.round(shortestEdge * 0.32);
        strokeThickness = Math.max(6, Math.round(fontSize * 0.12));
        letterSpacing = Math.round(fontSize * 0.08);
        shadowOffset = Math.max(6, Math.round(fontSize * 0.08));

        valueText.style.fontSize = fontSize;
        valueText.style.fontFamily = activeTheme.font;
        valueText.style.letterSpacing = letterSpacing;
        const strokeColor = mixColors(resolveColor(activeTheme.accents.combo), resolveColor(activeTheme.background.to), 0.25);
        valueText.style.stroke = {
            color: strokeColor,
            width: strokeThickness,
            join: 'round',
        };

        shadowText.style.fontSize = fontSize;
        shadowText.style.fontFamily = activeTheme.font;
        shadowText.style.letterSpacing = letterSpacing;
        shadowText.position.set(0, shadowOffset);
        shadowText.style.stroke = {
            color: 0x000000,
            width: Math.max(3, Math.round(strokeThickness * 0.6)),
            join: 'round',
        };
    };

    const applySeverity = (severity: 'normal' | 'caution' | 'warning') => {
        currentSeverity = severity;

        const fill = (() => {
            switch (severity) {
                case 'caution':
                    return resolveColor(activeTheme.accents.powerUp);
                case 'warning':
                    return resolveColor(activeTheme.hud.danger);
                case 'normal':
                    return resolveColor(activeTheme.hud.textPrimary);
                default: {
                    const exhaustiveCheck: never = severity;
                    return exhaustiveCheck;
                }
            }
        })();
        valueText.style.fill = fill;

        const strokeColor = (() => {
            switch (severity) {
                case 'warning':
                    return resolveColor(activeTheme.hud.danger);
                case 'caution':
                    return mixColors(resolveColor(activeTheme.accents.powerUp), resolveColor(activeTheme.background.to), 0.35);
                case 'normal':
                    return mixColors(resolveColor(activeTheme.accents.combo), resolveColor(activeTheme.background.to), 0.25);
                default: {
                    const exhaustiveCheck: never = severity;
                    return exhaustiveCheck;
                }
            }
        })();
        valueText.style.stroke = {
            color: strokeColor,
            width: strokeThickness,
            join: 'round',
        };

        const glowColor = severity === 'warning'
            ? resolveColor(activeTheme.hud.danger)
            : resolveColor(activeTheme.accents.combo);
        glowFilter.color = glowColor;

        const haloColor = (() => {
            switch (severity) {
                case 'warning':
                    return resolveColor(activeTheme.hud.danger);
                case 'caution':
                    return resolveColor(activeTheme.accents.powerUp);
                case 'normal':
                    return resolveColor(activeTheme.accents.combo);
                default: {
                    const exhaustiveCheck: never = severity;
                    return exhaustiveCheck;
                }
            }
        })();
        redrawHalo(haloColor);
    };

    applyTypography();
    applySeverity('normal');

    const show = (secondsRemaining: number, totalSeconds: number) => {
        const sanitized = Number.isFinite(secondsRemaining) ? Math.max(0, secondsRemaining) : 0;
        if (sanitized <= 0) {
            hide();
            return;
        }

        const total = Math.max(1, Number.isFinite(totalSeconds) ? totalSeconds : 1);
        const displayValue = Math.max(1, Math.ceil(sanitized));
        if (displayValue !== lastDisplayedValue) {
            const label = `${displayValue}`;
            valueText.text = label;
            shadowText.text = label;
            lastDisplayedValue = displayValue;
        }

        const fractional = sanitized - Math.floor(sanitized);
        const pulse = easeOutCubic(1 - fractional);
        halo.alpha = 0.2 + pulse * 0.3;
        const scale = 1 + pulse * 0.18;
        valueText.scale.set(scale);
        shadowText.scale.set(scale * 1.015);
        halo.scale.set(0.94 + pulse * 0.3);

        const severity = sanitized <= 3
            ? 'warning'
            : sanitized <= 6
                ? 'caution'
                : 'normal';
        if (severity !== currentSeverity) {
            applySeverity(severity);
        }

        const normalized = clampUnit(sanitized / total);
        container.visible = true;
        container.alpha = 0.6 + (1 - normalized) * 0.3;
    };

    const hide = () => {
        if (!container.visible) {
            return;
        }
        container.visible = false;
        halo.alpha = 0;
        lastDisplayedValue = null;
    };

    const setTheme = (nextTheme: GameThemeDefinition) => {
        activeTheme = nextTheme;
        applyTypography();
        applySeverity(currentSeverity);
    };

    return {
        container,
        show,
        hide,
        setTheme,
    } satisfies RoundCountdownDisplay;
};
