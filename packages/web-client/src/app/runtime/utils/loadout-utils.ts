/**
 * Loadout Utilities
 *
 * Helper functions for processing and transforming loadout configuration
 * including visual overrides and audio palette customizations.
 */

import type { MidiPaletteConfig } from 'audio/midi-engine';
import type {
    LoadoutBallVisualOverrides,
    LoadoutVoicePaletteOverrides,
} from 'config/loadouts';
import type { BallVisualPalette } from 'render/playfield-visuals';

/**
 * Sanitizes and validates voice palette overrides.
 *
 * Ensures that overrides are a valid object and not empty. Returns undefined
 * if the input is invalid or contains no overrides.
 *
 * @param overrides - Optional voice palette overrides from loadout
 * @returns Validated partial MIDI palette config, or undefined if invalid/empty
 *
 * @example
 * ```typescript
 * sanitizeVoiceOverrides({ attack: 0.5 })  // { attack: 0.5 }
 * sanitizeVoiceOverrides({})               // undefined
 * sanitizeVoiceOverrides(undefined)        // undefined
 * sanitizeVoiceOverrides(null)             // undefined
 * ```
 */
export const sanitizeVoiceOverrides = (
    overrides: LoadoutVoicePaletteOverrides | undefined,
): Partial<MidiPaletteConfig> | undefined => {
    if (!overrides || typeof overrides !== 'object') {
        return undefined;
    }
    if (Object.keys(overrides).length === 0) {
        return undefined;
    }
    return { ...(overrides as Partial<MidiPaletteConfig>) };
};

/**
 * Converts loadout ball visual overrides to a partial ball visual palette.
 *
 * Transforms the loadout-specific override format into the visual system's
 * palette format, filtering out undefined values. Returns null if no valid
 * overrides are present.
 *
 * @param overrides - Optional ball visual overrides from loadout
 * @returns Partial ball visual palette, or null if no overrides
 *
 * @example
 * ```typescript
 * toBallPaletteOverride({ baseColor: 0xff0000, baseAlpha: 0.8 })
 * // { baseColor: 0xff0000, baseAlpha: 0.8 }
 *
 * toBallPaletteOverride({ shape: 'hexagon' })
 * // { shape: 'hexagon' }
 *
 * toBallPaletteOverride(undefined)
 * // null
 * ```
 */
export const toBallPaletteOverride = (
    overrides: LoadoutBallVisualOverrides | undefined,
): Partial<BallVisualPalette> | null => {
    if (!overrides) {
        return null;
    }
    const palette: Partial<BallVisualPalette> = {
        ...(overrides.baseColor !== undefined ? { baseColor: overrides.baseColor } : {}),
        ...(overrides.baseAlpha !== undefined ? { baseAlpha: overrides.baseAlpha } : {}),
        ...(overrides.innerColor !== undefined ? { innerColor: overrides.innerColor } : {}),
        ...(overrides.innerAlpha !== undefined ? { innerAlpha: overrides.innerAlpha } : {}),
        ...(overrides.innerScale !== undefined ? { innerScale: overrides.innerScale } : {}),
        ...(overrides.rimColor !== undefined ? { rimColor: overrides.rimColor } : {}),
        ...(overrides.rimAlpha !== undefined ? { rimAlpha: overrides.rimAlpha } : {}),
        ...(overrides.shape !== undefined ? { shape: overrides.shape } : {}),
    };
    return Object.keys(palette).length > 0 ? palette : null;
};
