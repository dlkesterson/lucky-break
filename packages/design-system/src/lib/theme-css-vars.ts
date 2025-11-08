import type { GameThemeDefinition } from './themes';

/**
 * Converts a GameThemeDefinition to CSS variable declarations
 * that can be applied to the design system root element.
 */
export const themeToCssVars = (theme: GameThemeDefinition): Record<string, string> => {
    // Convert hex colors to HSL format expected by Tailwind
    const hexToHsl = (hex: string): string => {
        // Remove the # if present
        const cleanHex = hex.replace(/^#/, '');

        // Parse RGB values
        const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
        const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
        const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

        // Find min and max channel values
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        // Calculate lightness
        const l = (max + min) / 2;

        // Calculate saturation
        let s = 0;
        if (delta !== 0) {
            s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        }

        // Calculate hue
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

        // Convert to degrees and percentages
        const hDeg = Math.round(h * 360);
        const sPercent = Math.round(s * 100);
        const lPercent = Math.round(l * 100);

        // Return in the format expected by Tailwind (e.g., "240 51% 8%")
        return `${hDeg} ${sPercent}% ${lPercent}%`;
    };

    return {
        // Font families
        '--font-display': theme.font,
        '--font-body': theme.font,
        '--font-mono': theme.monoFont,
        '--font-ui': theme.font,

        // Custom accent colors (as raw hex for gradients)
        '--accent-combo': theme.accents.combo,
        '--accent-powerup': theme.accents.powerUp,
        '--accent-bloom': theme.ball.highlight,

        // Core palette (HSL for Tailwind compatibility)
        '--background': hexToHsl(theme.background.from),
        '--foreground': hexToHsl(theme.hud.textPrimary),
        '--muted': hexToHsl(theme.hud.panelLine),
        '--muted-foreground': hexToHsl(theme.hud.textSecondary),

        // Design system semantic tokens
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
