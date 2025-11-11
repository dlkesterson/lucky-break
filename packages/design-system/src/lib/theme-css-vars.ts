import type { GameThemeDefinition } from './themes';

/**
 * Converts a GameThemeDefinition to CSS variable declarations
 * that can be applied to the design system root element.
 */
export const themeToCssVars = (theme: GameThemeDefinition): Record<string, string> => {
    const hexToHsl = (hex: string): string => {
        const cleanHex = hex.replace(/^#/, '');

        const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
        const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
        const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        const l = (max + min) / 2;

        let s = 0;
        if (delta !== 0) {
            s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        }

        let h = 0;
        if (delta !== 0) {
            if (max === r) {
                h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
            } else if (max === g) {
                h = ((b - r) / delta + 2) / 6;
            } else {
                h = ((r - g) / delta + 4) / 6;
            }
        }

        const hDeg = Math.round(h * 360);
        const sPercent = Math.round(s * 100);
        const lPercent = Math.round(l * 100);

        return `${hDeg} ${sPercent}% ${lPercent}%`;
    };

    return {
        '--font-display': theme.font,
        '--font-body': theme.font,
        '--font-mono': theme.monoFont,
        '--font-ui': theme.font,

        '--accent-combo': theme.accents.combo,
        '--accent-powerup': theme.accents.powerUp,
        '--accent-bloom': theme.ball.highlight,

        '--background': hexToHsl(theme.background.from),
        '--foreground': hexToHsl(theme.hud.textPrimary),
        '--muted': hexToHsl(theme.hud.panelLine),
        '--muted-foreground': hexToHsl(theme.hud.textSecondary),

        '--accent': hexToHsl(theme.hud.accent),
        '--accent-foreground': hexToHsl(theme.background.from),
        '--destructive': hexToHsl(theme.hud.danger),
        '--destructive-foreground': hexToHsl(theme.hud.textPrimary),
        '--card': hexToHsl(theme.hud.panelFill),
        '--card-foreground': hexToHsl(theme.hud.textPrimary),
        '--border': hexToHsl(theme.hud.panelLine),
        '--input': hexToHsl(theme.hud.panelLine),
        '--ring': hexToHsl(theme.hud.accent),
        '--primary': hexToHsl(theme.hud.accent),
        '--primary-foreground': hexToHsl(theme.background.from),
        '--secondary': hexToHsl(theme.hud.panelFill),
        '--secondary-foreground': hexToHsl(theme.hud.textPrimary),
    };
};
