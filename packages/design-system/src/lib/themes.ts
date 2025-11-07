/**
 * Game theme definitions for Lucky Break.
 * These are the canonical theme constants used across the application.
 */

export interface GameThemeDefinition {
    readonly background: {
        readonly from: string;
        readonly to: string;
        readonly starAlpha: number;
    };
    readonly brickColors: readonly string[];
    readonly paddle: {
        readonly gradient: readonly string[];
        readonly glow: number;
    };
    readonly ball: {
        readonly core: string;
        readonly aura: string;
        readonly highlight: string;
    };
    readonly font: string;
    readonly monoFont: string;
    readonly hud: {
        readonly panelFill: string;
        readonly panelLine: string;
        readonly textPrimary: string;
        readonly textSecondary: string;
        readonly accent: string;
        readonly danger: string;
    };
    readonly accents: {
        readonly combo: string;
        readonly powerUp: string;
    };
}

export type ThemeName = 'default' | 'colorBlind';

export interface ThemeOption {
    readonly name: ThemeName;
    readonly label: string;
}

/**
 * Default vibrant theme with high-energy colors.
 */
export const DEFAULT_THEME: GameThemeDefinition = {
    background: { from: '#160B27', to: '#2B1140', starAlpha: 0.18 },
    brickColors: ['#F3443C', '#FF8A34', '#FFD04A', '#95D146'],
    paddle: { gradient: ['#4CB7FF', '#1E3F9A'], glow: 0.48 },
    ball: { core: '#F8F4DD', aura: '#FFF2D7', highlight: '#FFFFFF' },
    font: 'Luckiest Guy, Overpass, sans-serif',
    monoFont: 'Overpass Mono, monospace',
    hud: {
        panelFill: '#1A1230',
        panelLine: '#FF8A34',
        textPrimary: '#FFEFD9',
        textSecondary: '#FFCE63',
        accent: '#FFD04A',
        danger: '#F3443C',
    },
    accents: {
        combo: '#FFD04A',
        powerUp: '#FF6B35',
    },
};

/**
 * Color-blind accessible theme with high contrast colors.
 */
export const COLOR_BLIND_THEME: GameThemeDefinition = {
    background: { from: '#081229', to: '#12315A', starAlpha: 0.22 },
    brickColors: ['#2E86AB', '#F18F01', '#F9C80E', '#1B998B'],
    paddle: { gradient: ['#F6C28B', '#3A1772'], glow: 0.52 },
    ball: { core: '#F5FBFF', aura: '#CDE7FF', highlight: '#FFFFFF' },
    font: 'Luckiest Guy, Overpass, sans-serif',
    monoFont: 'Overpass Mono, monospace',
    hud: {
        panelFill: '#0B1E35',
        panelLine: '#F18F01',
        textPrimary: '#F5FBFF',
        textSecondary: '#FAE589',
        accent: '#F18F01',
        danger: '#EF476F',
    },
    accents: {
        combo: '#FAE589',
        powerUp: '#2E86AB',
    },
};

/**
 * Theme registry mapping theme names to their definitions.
 */
export const THEME_REGISTRY: Record<ThemeName, GameThemeDefinition> = {
    default: DEFAULT_THEME,
    colorBlind: COLOR_BLIND_THEME,
};

/**
 * Available theme options for UI selection.
 */
export const THEME_OPTIONS: readonly ThemeOption[] = [
    { name: 'default', label: 'Vibrant' },
    { name: 'colorBlind', label: 'High Contrast' },
] as const;
