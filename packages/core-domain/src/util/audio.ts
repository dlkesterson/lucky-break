/**
 * Audio utility functions
 */

/**
 * Clamp a MIDI note number to a valid range
 * @param note - The MIDI note number to clamp
 * @param min - Minimum MIDI note (default: 36 = C2)
 * @param max - Maximum MIDI note (default: 96 = C7)
 */
export const clampMidi = (note: number, min = 36, max = 96): number => {
    if (!Number.isFinite(note)) {
        return min;
    }
    const clampedMin = Number.isFinite(min) ? min : 36;
    const clampedMax = Number.isFinite(max) ? max : 96;
    if (clampedMin >= clampedMax) {
        return clampedMin;
    }
    return Math.max(clampedMin, Math.min(clampedMax, Math.round(note)));
};

/**
 * Convert MIDI note number to frequency in Hz
 * @param note - MIDI note number (A4 = 69 = 440Hz)
 */
export const midiToFrequency = (note: number): number => 440 * 2 ** ((note - 69) / 12);
