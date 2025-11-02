import { createMidiEngine, type MidiEngine, type MidiPaletteConfig } from 'audio/midi-engine';
import { mulberry32 } from 'util/random';
import type { Logger } from 'util/log';
import { ensureToneAudio as ensureToneAudioBase } from './audio';

const FORESHADOW_SCALE_SALT = 0x4b1d9a85;
const FORESHADOW_SCALE_LIBRARY: readonly (readonly number[])[] = [
    [52, 55, 57, 59, 62, 64, 67],
    [48, 50, 53, 55, 57, 60, 62],
    [45, 48, 50, 52, 55, 57, 60],
    [47, 50, 52, 54, 57, 59, 62],
    [49, 52, 54, 56, 59, 61, 64],
    [57, 60, 62, 64, 67, 69, 72],
    [55, 58, 60, 63, 65, 67, 70],
    [53, 56, 58, 60, 63, 65, 68],
];

export const FORESHADOW_EVENT_SALT = 0x2c9277b9;

export interface AudioBootstrapOptions {
    readonly logger: Logger;
    readonly getPaletteConfig: () => MidiPaletteConfig | undefined;
    readonly ensureToneAudioImpl?: typeof ensureToneAudioBase;
    readonly midiEngineFactory?: (options: { palette?: MidiPaletteConfig }) => MidiEngine;
}

export interface AudioBootstrap {
    readonly ensureToneAudio: () => Promise<void>;
    readonly createMidiEngine: () => MidiEngine;
    readonly rebuildMidiEngine: (previous: MidiEngine) => MidiEngine;
}

const defaultMidiEngineFactory = (options: { palette?: MidiPaletteConfig }): MidiEngine => {
    return createMidiEngine({ palette: options.palette });
};

export const createAudioBootstrap = (options: AudioBootstrapOptions): AudioBootstrap => {
    const ensureImpl = options.ensureToneAudioImpl ?? ensureToneAudioBase;
    const midiEngineFactory = options.midiEngineFactory ?? defaultMidiEngineFactory;

    const ensureToneAudio = () =>
        ensureImpl({
            warn: (message, details) => {
                if (details) {
                    options.logger.warn(message, details);
                    return;
                }
                options.logger.warn(message);
            },
        });

    const createInstance = (): MidiEngine => {
        const palette = options.getPaletteConfig();
        return midiEngineFactory({ palette });
    };

    const createMidiEngine = (): MidiEngine => createInstance();

    const rebuildMidiEngine = (previous: MidiEngine): MidiEngine => {
        const next = createInstance();
        try {
            previous.dispose();
        } catch {
            // Disposing is best-effort; swallow failures to avoid cascading errors during rebuild.
        }
        return next;
    };

    return {
        ensureToneAudio,
        createMidiEngine,
        rebuildMidiEngine,
    } satisfies AudioBootstrap;
};

export const clampMidiNote = (note: number, min = 36, max = 96): number => {
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

export const deriveForeshadowScale = (seed: number): readonly number[] => {
    const normalizedSeed = (seed ^ FORESHADOW_SCALE_SALT) >>> 0;
    const rng = mulberry32(normalizedSeed);
    const libraryIndex = Math.floor(rng() * FORESHADOW_SCALE_LIBRARY.length) % FORESHADOW_SCALE_LIBRARY.length;
    const baseScale = FORESHADOW_SCALE_LIBRARY[libraryIndex] ?? FORESHADOW_SCALE_LIBRARY[0];
    const octaveShift = Math.floor(rng() * 3) - 1;
    const shiftSemitones = octaveShift * 12;
    return baseScale.map((note) => clampMidiNote(note + shiftSemitones));
};

export const __internalAudioBootstrapTesting = {
    FORESHADOW_SCALE_LIBRARY,
};
