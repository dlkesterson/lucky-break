import { createMidiEngine, type MidiEngine, type MidiPaletteConfig } from 'audio/midi-engine';
import type { LoadoutVoiceId } from 'config/loadouts';
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

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface AudioBootstrapOptions {
    readonly logger: Logger;
    readonly getPaletteConfig?: () => MidiPaletteConfig | undefined;
    readonly getPaletteOverrides?: () => Partial<MidiPaletteConfig> | undefined;
    readonly getVoiceId?: () => LoadoutVoiceId | undefined;
    readonly ensureToneAudioImpl?: typeof ensureToneAudioBase;
    readonly midiEngineFactory?: (options: { palette?: MidiPaletteConfig; voiceId?: LoadoutVoiceId }) => MidiEngine;
}

export interface AudioBootstrap {
    readonly ensureToneAudio: () => Promise<void>;
    readonly createMidiEngine: () => MidiEngine;
    readonly rebuildMidiEngine: (previous: MidiEngine) => MidiEngine;
}

const defaultMidiEngineFactory = (options: { palette?: MidiPaletteConfig; voiceId?: LoadoutVoiceId }): MidiEngine => {
    return createMidiEngine({ palette: options.palette, voiceId: options.voiceId });
};

const pickNumber = (override: number | undefined, fallback: number | undefined): number | undefined => {
    if (typeof override === 'number' && Number.isFinite(override)) {
        return override;
    }
    if (typeof fallback === 'number' && Number.isFinite(fallback)) {
        return fallback;
    }
    return undefined;
};

const mergeEnvelope = (
    base?: Partial<{ attack: number; decay: number; sustain: number; release: number }>,
    override?: Partial<{ attack: number; decay: number; sustain: number; release: number }>,
): Partial<{ attack: number; decay: number; sustain: number; release: number }> | undefined => {
    if (!base && !override) {
        return undefined;
    }
    const result: Partial<{ attack: number; decay: number; sustain: number; release: number }> = {
        ...(base ?? {}),
    };
    if (override) {
        for (const key of ['attack', 'decay', 'sustain', 'release'] as const) {
            const value = override[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                result[key] = value;
            }
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
};

type PaletteSynthConfig = NonNullable<MidiPaletteConfig['brickSynth']>;

const mergeSynthConfig = (
    base?: PaletteSynthConfig,
    override?: Partial<PaletteSynthConfig>,
): PaletteSynthConfig | undefined => {
    if (!base && !override) {
        return undefined;
    }
    const result: Mutable<Partial<PaletteSynthConfig>> = {
        ...(base ?? {}),
    };
    if (override?.oscillatorType && typeof override.oscillatorType === 'string') {
        result.oscillatorType = override.oscillatorType;
    }
    if (override?.envelope) {
        const envelope = mergeEnvelope(base?.envelope, override.envelope);
        if (envelope) {
            result.envelope = envelope;
        }
    }
    if (override?.volume !== undefined && Number.isFinite(override.volume)) {
        result.volume = override.volume;
    }
    return Object.keys(result).length > 0 ? (result as PaletteSynthConfig) : undefined;
};

type PalettePercussionConfig = NonNullable<MidiPaletteConfig['percussion']>;

const mergePercussionConfig = (
    base?: PalettePercussionConfig,
    override?: Partial<PalettePercussionConfig>,
): PalettePercussionConfig | undefined => {
    if (!base && !override) {
        return undefined;
    }
    const result: Mutable<Partial<PalettePercussionConfig>> = {
        ...(base ?? {}),
    };
    if (override?.volume !== undefined && Number.isFinite(override.volume)) {
        result.volume = override.volume;
    }
    if (override?.pitchDecay !== undefined && Number.isFinite(override.pitchDecay)) {
        result.pitchDecay = override.pitchDecay;
    }
    if (override?.octaves !== undefined && Number.isFinite(override.octaves)) {
        result.octaves = override.octaves;
    }
    if (override?.oscillatorType && typeof override.oscillatorType === 'string') {
        result.oscillatorType = override.oscillatorType;
    }
    return Object.keys(result).length > 0 ? (result as PalettePercussionConfig) : undefined;
};

const cloneNumberArray = (values: readonly number[] | undefined): readonly number[] | undefined => {
    if (!values) {
        return undefined;
    }
    const filtered = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
    return filtered.length > 0 ? filtered.map((value) => Number(value)) : undefined;
};

const cloneScalePatterns = (
    patterns: readonly (readonly number[])[] | undefined,
): readonly (readonly number[])[] | undefined => {
    if (!patterns) {
        return undefined;
    }
    const cloned = patterns
        .map((pattern) => cloneNumberArray(pattern))
        .filter((pattern): pattern is readonly number[] => Array.isArray(pattern) && pattern.length > 0);
    return cloned.length > 0 ? cloned : undefined;
};

const mergeMidiPaletteConfig = (
    base?: MidiPaletteConfig,
    override?: Partial<MidiPaletteConfig>,
): MidiPaletteConfig | undefined => {
    if (!base && !override) {
        return undefined;
    }
    const result: Mutable<Partial<MidiPaletteConfig>> = {};

    const scalePatterns = cloneScalePatterns(override?.scalePatterns ?? base?.scalePatterns);
    if (scalePatterns) {
        result.scalePatterns = scalePatterns;
    }

    const brickSynth = mergeSynthConfig(base?.brickSynth, override?.brickSynth);
    if (brickSynth) {
        result.brickSynth = brickSynth;
    }

    const chimeSynth = mergeSynthConfig(base?.chimeSynth, override?.chimeSynth);
    if (chimeSynth) {
        result.chimeSynth = chimeSynth;
    }

    const percussion = mergePercussionConfig(base?.percussion, override?.percussion);
    if (percussion) {
        result.percussion = percussion;
    }

    const comboVelocityBias = pickNumber(override?.comboVelocityBias, base?.comboVelocityBias);
    if (comboVelocityBias !== undefined) {
        result.comboVelocityBias = comboVelocityBias;
    }

    const powerUpSequence = cloneNumberArray(override?.powerUpSequence ?? base?.powerUpSequence);
    if (powerUpSequence) {
        result.powerUpSequence = powerUpSequence;
    }

    const powerUpOffsets = cloneNumberArray(override?.powerUpOffsets ?? base?.powerUpOffsets);
    if (powerUpOffsets) {
        result.powerUpOffsets = powerUpOffsets;
    }

    const wallHitNoteBase = pickNumber(override?.wallHitNoteBase, base?.wallHitNoteBase);
    if (wallHitNoteBase !== undefined) {
        result.wallHitNoteBase = wallHitNoteBase;
    }

    if (Object.keys(result).length === 0) {
        return undefined;
    }

    return result as MidiPaletteConfig;
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
        const basePalette = options.getPaletteConfig?.();
        const overridePalette = options.getPaletteOverrides?.();
        const palette = mergeMidiPaletteConfig(basePalette, overridePalette);
        const voiceId = options.getVoiceId?.();
        return midiEngineFactory({ palette, voiceId });
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
