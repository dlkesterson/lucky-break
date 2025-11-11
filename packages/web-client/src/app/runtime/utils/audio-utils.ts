/**
 * Audio Utilities
 *
 * Helper functions for audio-related calculations and conversions.
 */

/**
 * Converts a linear volume value (0-1) to decibels.
 *
 * @param value - Linear volume value between 0 and 1
 * @returns Volume in decibels, clamped to minimum of -60dB
 *
 * @example
 * ```typescript
 * volumeToDecibels(1.0)   // 0dB (full volume)
 * volumeToDecibels(0.5)   // ~-6dB (half volume)
 * volumeToDecibels(0.0)   // -60dB (silence)
 * volumeToDecibels(0.001) // -60dB (near silence)
 * ```
 */
export const volumeToDecibels = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
        return -60;
    }
    const clamped = Math.max(1e-3, Math.min(1, value));
    return Math.max(-60, 20 * Math.log10(clamped));
};

/**
 * Converts player lives count to a simplified music intensity tier.
 *
 * The music system uses a 3-tier system to adjust intensity based on
 * remaining lives. This creates dynamic tension as the player's situation
 * becomes more dire.
 *
 * @param lives - Number of remaining lives
 * @returns Music intensity tier: 3 (high), 2 (medium), or 1 (low)
 *
 * @example
 * ```typescript
 * toMusicLives(5)  // 3 (comfortable - high intensity music)
 * toMusicLives(3)  // 3
 * toMusicLives(2)  // 2 (getting tense - medium intensity)
 * toMusicLives(1)  // 1 (danger - low/dramatic intensity)
 * toMusicLives(0)  // 1
 * ```
 */
export const toMusicLives = (lives: number): 1 | 2 | 3 => {
    if (lives >= 3) {
        return 3;
    }
    if (lives <= 1) {
        return 1;
    }
    return 2;
};
