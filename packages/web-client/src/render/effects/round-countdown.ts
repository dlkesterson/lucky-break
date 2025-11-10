import { Container, FillGradient, Graphics, Text, type Filter } from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import type { GameThemeDefinition } from 'render/theme';
import { mixColors, toColorNumber } from 'render/playfield-visuals';
import { clampUnit } from 'util/math';

const VIBRANT_BACKGROUND_FROM = '#160b27';
const VIBRANT_BACKGROUND_TO = '#2b1140';

interface GradientStop {
    readonly position: number;
    readonly color: number;
}

const RAINBOW_STOPS: readonly GradientStop[] = [
    { position: 0, color: 0x7d3cff }, // violet
    { position: 0.16, color: 0x4a4dff }, // indigo
    { position: 0.32, color: 0x008bff }, // blue
    { position: 0.48, color: 0x00f2ff }, // cyan
    { position: 0.64, color: 0x00ff83 }, // green
    { position: 0.8, color: 0xfff200 }, // yellow
    { position: 0.92, color: 0xff8c33 }, // orange
    { position: 1, color: 0xff1a1a }, // red
];

const isVibrantTheme = (theme: GameThemeDefinition): boolean =>
    theme.background.from.toLowerCase() === VIBRANT_BACKGROUND_FROM && theme.background.to.toLowerCase() === VIBRANT_BACKGROUND_TO;

const sampleRainbowColor = (value: number): number => {
    const clamped = clampUnit(value);
    for (let index = 0; index < RAINBOW_STOPS.length - 1; index += 1) {
        const start = RAINBOW_STOPS[index];
        const end = RAINBOW_STOPS[index + 1];
        if (clamped <= end.position) {
            const range = end.position - start.position;
            const local = range <= 0 ? 0 : clampUnit((clamped - start.position) / range);
            return mixColors(start.color, end.color, local);
        }
    }
    return RAINBOW_STOPS[RAINBOW_STOPS.length - 1]?.color ?? 0xff1a1a;
};

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

    const backplate = new Graphics();
    backplate.eventMode = 'none';
    backplate.alpha = 0;
    container.addChild(backplate);

    const innerGlow = new Graphics();
    innerGlow.eventMode = 'none';
    innerGlow.alpha = 0;
    innerGlow.blendMode = 'screen';
    container.addChild(innerGlow);

    const ghostText = new Text('', {
        fill: '#ffffff',
        fontSize: 10,
        fontFamily: activeTheme.font,
        fontWeight: 'bold',
        align: 'center',
    });
    const ghostAnchor = (ghostText as unknown as { anchor?: { set?: (value: number) => void } }).anchor;
    ghostAnchor?.set?.(0.5);
    ghostText.eventMode = 'none';
    ghostText.alpha = 0;
    container.addChild(ghostText);

    const progressRing = new Graphics();
    progressRing.eventMode = 'none';
    progressRing.alpha = 0;
    progressRing.blendMode = 'screen';
    container.addChild(progressRing);
    const shadowText = new Text('', {
        fill: '#000000',
        fontSize: 10,
        fontFamily: activeTheme.font,
        align: 'center',
    });
    const shadowAnchor = (shadowText as unknown as { anchor?: { set?: (value: number) => void } }).anchor;
    shadowAnchor?.set?.(0.5);
    shadowText.eventMode = 'none';
    shadowText.alpha = 0.12;
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
    valueText.alpha = 0.88;
    container.addChild(valueText);

    let usingVibrantPalette = isVibrantTheme(activeTheme);
    let currentSpectrumColor = usingVibrantPalette ? sampleRainbowColor(0) : resolveColor(activeTheme.accents.combo);

    const glowFilter = new GlowFilter({
        color: currentSpectrumColor,
        outerStrength: 0.8,
        innerStrength: 0.12,
        distance: 16,
        quality: 0.25,
    });
    valueText.filters = [glowFilter as unknown as Filter];

    const shortestEdge = Math.min(playfieldSize.width, playfieldSize.height);
    const haloRadius = shortestEdge * 0.46;
    const minHaloRadius = haloRadius * 0.78;
    const backplateRadius = haloRadius * 0.56;
    const progressOuterRadius = haloRadius * 0.62;
    const progressInnerRadius = Math.max(progressOuterRadius - Math.max(8, Math.round(haloRadius * 0.1)), backplateRadius * 0.68);
    const progressStartAngle = -Math.PI / 2;
    const innerGlowRadius = backplateRadius * 0.78;
    let fontSize = Math.round(shortestEdge * 0.26);
    let strokeThickness = Math.max(6, Math.round(fontSize * 0.16));
    let letterSpacing = Math.round(fontSize * 0.08);
    let shadowOffset = Math.max(6, Math.round(fontSize * 0.08));

    let currentSeverity: 'normal' | 'caution' | 'warning' = 'normal';
    let lastDisplayedValue: number | null = null;
    let lastHaloColor = 0;
    let lastBackplateColor = 0;
    let lastProgressNormalized = 0;
    let pendingGhostLabel: string | null = null;
    let currentRingColor = mixColors(currentSpectrumColor, 0xffffff, 0.12);
    let currentBackplateColor = mixColors(currentSpectrumColor, resolveColor(activeTheme.background.to), 0.32);
    let currentGlowColor = mixColors(currentSpectrumColor, 0xffffff, 0.26);
    let lastAppliedPaletteColor = currentSpectrumColor;

    const redrawHalo = (color: number) => {
        if (color === lastHaloColor) {
            return;
        }
        lastHaloColor = color;
        halo.clear();
        const gradient = new FillGradient(0, -haloRadius, 0, haloRadius);
        gradient.addColorStop(0, mixColors(color, 0xffffff, 0.52));
        gradient.addColorStop(1, mixColors(color, 0x050312, 0.6));
        halo.circle(0, 0, haloRadius);
        halo.fill(gradient);
        halo.stroke({ color: mixColors(color, 0xffffff, 0.35), width: Math.max(3, Math.round(haloRadius * 0.06)), alpha: 0.2 });
        halo.blendMode = 'screen';
    };

    const redrawBackplate = (color: number) => {
        if (color === lastBackplateColor) {
            return;
        }
        lastBackplateColor = color;
        backplate.clear();
        const gradient = new FillGradient(0, -backplateRadius, 0, backplateRadius);
        gradient.addColorStop(0, mixColors(color, 0xffffff, 0.48));
        gradient.addColorStop(0.55, mixColors(color, 0xffffff, 0.2));
        gradient.addColorStop(1, mixColors(color, 0x05030f, 0.55));
        backplate.circle(0, 0, backplateRadius);
        backplate.fill(gradient);
        backplate.stroke({
            color: mixColors(color, 0xffffff, 0.36),
            width: Math.max(2, Math.round(backplateRadius * 0.1)),
            alpha: 0.32,
            alignment: 0.5,
            cap: 'round',
            join: 'round',
        });
    };

    const redrawInnerGlow = (color: number) => {
        innerGlow.clear();
        const gradient = new FillGradient(0, -innerGlowRadius, 0, innerGlowRadius);
        gradient.addColorStop(0, mixColors(color, 0xffffff, 0.55));
        gradient.addColorStop(0.55, mixColors(color, 0xffffff, 0.22));
        gradient.addColorStop(1, mixColors(color, 0x05030f, 0.72));
        innerGlow.circle(0, 0, innerGlowRadius);
        innerGlow.fill(gradient);
        innerGlow.alpha = 0.12;
    };

    const updateProgressRing = (progress: number, color: number) => {
        const clamped = clampUnit(progress);
        progressRing.clear();
        if (clamped <= 0) {
            progressRing.alpha = 0;
            lastProgressNormalized = 0;
            return;
        }

        const startAngle = progressStartAngle;
        const endAngle = startAngle + Math.PI * 2 * clamped;
        const outerStartX = Math.cos(startAngle) * progressOuterRadius;
        const outerStartY = Math.sin(startAngle) * progressOuterRadius;
        const outerEndX = Math.cos(endAngle) * progressOuterRadius;
        const outerEndY = Math.sin(endAngle) * progressOuterRadius;
        const innerEndX = Math.cos(endAngle) * progressInnerRadius;
        const innerEndY = Math.sin(endAngle) * progressInnerRadius;
        const innerStartX = Math.cos(startAngle) * progressInnerRadius;
        const innerStartY = Math.sin(startAngle) * progressInnerRadius;

        progressRing.moveTo(outerStartX, outerStartY);
        progressRing.arc(0, 0, progressOuterRadius, startAngle, endAngle, false);
        progressRing.lineTo(innerEndX, innerEndY);
        progressRing.arc(0, 0, progressInnerRadius, endAngle, startAngle, true);
        progressRing.lineTo(outerStartX, outerStartY);
        progressRing.closePath();

        const gradient = new FillGradient(0, -progressOuterRadius, 0, progressOuterRadius);
        gradient.addColorStop(0, mixColors(color, 0xffffff, 0.65));
        gradient.addColorStop(0.5, mixColors(color, 0xffffff, 0.25));
        gradient.addColorStop(1, mixColors(color, 0x04020c, 0.45));
        progressRing.fill(gradient);
        progressRing.stroke({
            color: mixColors(color, 0xffffff, 0.55),
            width: Math.max(2, Math.round((progressOuterRadius - progressInnerRadius) * 0.8)),
            alpha: 0.6,
            alignment: 0.5,
            cap: 'round',
            join: 'round',
        });
        lastProgressNormalized = clamped;
    };

    const applyTypography = () => {
        fontSize = Math.round(shortestEdge * 0.26);
        strokeThickness = Math.max(4, Math.round(fontSize * 0.14));
        letterSpacing = Math.round(fontSize * 0.08);
        shadowOffset = Math.max(4, Math.round(fontSize * 0.06));

        valueText.style.fontSize = fontSize;
        valueText.style.fontFamily = activeTheme.font;
        valueText.style.letterSpacing = letterSpacing;
        const strokeColor = mixColors(resolveColor(activeTheme.accents.combo), resolveColor(activeTheme.background.to), 0.32);
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
            width: Math.max(2, Math.round(strokeThickness * 0.4)),
            join: 'round',
        };

        ghostText.style.fontSize = fontSize;
        ghostText.style.fontFamily = activeTheme.font;
        ghostText.style.letterSpacing = letterSpacing;
        ghostText.style.stroke = {
            color: 0x000000,
            width: Math.max(2, Math.round(strokeThickness * 0.35)),
            join: 'round',
        };
    };

    const resolveSeverityBaseColor = (severity: 'normal' | 'caution' | 'warning', theme: GameThemeDefinition): number => {
        switch (severity) {
            case 'warning':
                return resolveColor(theme.hud.danger);
            case 'caution':
                return mixColors(resolveColor(theme.accents.powerUp), resolveColor(theme.hud.textPrimary), 0.35);
            case 'normal':
                return resolveColor(theme.accents.combo);
            default: {
                const exhaustiveCheck: never = severity;
                return exhaustiveCheck;
            }
        }
    };

    const applyPalette = (paletteColor: number, severity: 'normal' | 'caution' | 'warning') => {
        currentSeverity = severity;
        currentSpectrumColor = paletteColor;
        lastAppliedPaletteColor = paletteColor;

        const fillLightness = severity === 'warning' ? 0.28 : severity === 'caution' ? 0.38 : 0.48;
        const fill = mixColors(paletteColor, 0xffffff, fillLightness);
        valueText.style.fill = fill;

        const strokeLightness = severity === 'warning' ? 0.5 : severity === 'caution' ? 0.56 : 0.6;
        const strokeColor = mixColors(paletteColor, 0xffffff, strokeLightness);
        valueText.style.stroke = {
            color: strokeColor,
            width: strokeThickness,
            join: 'round',
        };

        const glowBlend = severity === 'warning' ? 0.18 : 0.24;
        const glowColor = mixColors(paletteColor, 0xffffff, glowBlend);
        glowFilter.color = glowColor;

        const haloHighlight = severity === 'warning' ? 0.18 : severity === 'caution' ? 0.22 : 0.26;
        redrawHalo(mixColors(paletteColor, 0xffffff, haloHighlight));

        const backgroundBlendTarget = resolveColor(activeTheme.background.to);
        currentRingColor = mixColors(paletteColor, 0xffffff, 0.12);
        currentBackplateColor = mixColors(paletteColor, backgroundBlendTarget, severity === 'warning' ? 0.42 : severity === 'caution' ? 0.36 : 0.32);
        currentGlowColor = mixColors(paletteColor, 0xffffff, severity === 'warning' ? 0.32 : severity === 'caution' ? 0.28 : 0.26);

        redrawBackplate(currentBackplateColor);
        redrawInnerGlow(currentGlowColor);

        ghostText.style.fill = mixColors(fill, 0xffffff, 0.2);
    };

    applyTypography();
    applyPalette(currentSpectrumColor, currentSeverity);

    const show = (secondsRemaining: number, totalSeconds: number) => {
        const sanitized = Number.isFinite(secondsRemaining) ? Math.max(0, secondsRemaining) : 0;
        if (sanitized <= 0) {
            hide();
            return;
        }

        const total = Math.max(1, Number.isFinite(totalSeconds) ? totalSeconds : 1);
        const displayValue = Math.max(1, Math.ceil(sanitized));
        if (displayValue !== lastDisplayedValue) {
            if (lastDisplayedValue !== null) {
                pendingGhostLabel = `${lastDisplayedValue}`;
            }
            const label = `${displayValue}`;
            valueText.text = label;
            shadowText.text = label;
            ghostText.text = label;
            lastDisplayedValue = displayValue;
        }

        const fractional = sanitized - Math.floor(sanitized);
        const pulse = easeOutCubic(1 - fractional);
        const haloShrink = sanitized <= 5 ? Math.max(0.7, 1 - (5 - sanitized) * 0.08) : 1;
        const haloScale = 0.94 + pulse * 0.3;
        const targetHaloRadius = Math.max(minHaloRadius, haloRadius * haloScale * haloShrink);
        const effectiveHaloScale = targetHaloRadius / haloRadius;
        halo.alpha = 0.12 + pulse * 0.18;
        halo.scale.set(effectiveHaloScale);

        const scale = 1 + pulse * 0.14;
        valueText.scale.set(scale);
        shadowText.scale.set(scale * 1.01);

        innerGlow.alpha = sanitized <= 6 ? 0.14 + pulse * 0.12 : 0.1;
        innerGlow.scale.set(0.97 + pulse * 0.04);

        const normalized = clampUnit(sanitized / total);

        const severity = sanitized <= 3
            ? 'warning'
            : sanitized <= 6
                ? 'caution'
                : 'normal';

        const paletteColor = usingVibrantPalette
            ? sampleRainbowColor(1 - normalized)
            : resolveSeverityBaseColor(severity, activeTheme);

        if (paletteColor !== lastAppliedPaletteColor || severity !== currentSeverity) {
            applyPalette(paletteColor, severity);
        }
        container.visible = true;
        container.alpha = 0.4 + (1 - normalized) * 0.18;
        backplate.alpha = 0.42 + pulse * 0.08;
        backplate.scale.set(0.99 + pulse * 0.03);
        progressRing.alpha = 0.2 + pulse * 0.15;
        progressRing.scale.set(0.99 + pulse * 0.03);
        updateProgressRing(normalized, currentRingColor);

        if (pendingGhostLabel) {
            ghostText.text = pendingGhostLabel;
            ghostText.alpha = 0.18;
            ghostText.scale.set(Math.max(0.95, valueText.scale.x * 1.05));
            ghostText.tint = mixColors(currentGlowColor, 0xffffff, 0.5);
            pendingGhostLabel = null;
        } else if (ghostText.alpha > 0) {
            ghostText.alpha = Math.max(0, ghostText.alpha - 0.035);
            ghostText.scale.set(Math.max(0.92, ghostText.scale.x - 0.012));
        }
    };

    const hide = () => {
        if (!container.visible) {
            return;
        }
        container.visible = false;
        halo.alpha = 0;
        backplate.alpha = 0;
        innerGlow.alpha = 0;
        progressRing.alpha = 0;
        ghostText.alpha = 0;
        lastDisplayedValue = null;
        lastProgressNormalized = 0;
        pendingGhostLabel = null;
        ghostText.scale.set(1);
    };

    const setTheme = (nextTheme: GameThemeDefinition) => {
        activeTheme = nextTheme;
        usingVibrantPalette = isVibrantTheme(activeTheme);

        applyTypography();

        const paletteProgress = lastProgressNormalized > 0 ? lastProgressNormalized : 1;
        const paletteColor = usingVibrantPalette
            ? sampleRainbowColor(1 - paletteProgress)
            : resolveSeverityBaseColor(currentSeverity, activeTheme);

        applyPalette(paletteColor, currentSeverity);
        updateProgressRing(lastProgressNormalized, currentRingColor);
    };

    return {
        container,
        show,
        hide,
        setTheme,
    } satisfies RoundCountdownDisplay;
};
