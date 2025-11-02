import { MembraneSynth, PolySynth, Synth, now as toneNow } from 'tone';
import type { ToneOscillatorType } from 'tone';
const sanitizeOscillatorType = (value: unknown, fallback: ToneOscillatorType): ToneOscillatorType => {
    if (typeof value !== 'string') {
        return fallback;
    }
    return value as ToneOscillatorType;
};

const clamp01 = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
};

const midiToFrequency = (note: number): number => 440 * 2 ** ((note - 69) / 12);

// Multiple scale patterns for variety in combo sounds
const DEFAULT_SCALE_PATTERNS: readonly (readonly number[])[] = [
    [60, 62, 64, 65, 67, 69, 71, 72], // C major
    [62, 64, 66, 67, 69, 71, 73, 74], // D major
    [64, 66, 68, 69, 71, 73, 75, 76], // E major
    [65, 67, 69, 70, 72, 74, 76, 77], // F major
    [67, 69, 71, 72, 74, 76, 78, 79], // G major
    [57, 59, 61, 62, 64, 66, 68, 69], // A major (lower octave)
    [59, 61, 63, 64, 66, 68, 70, 71], // B major (lower octave)
    [60, 63, 65, 67, 69, 72, 74, 76], // C minor
    [62, 65, 67, 69, 71, 74, 76, 78], // D minor
    [64, 67, 69, 71, 73, 76, 78, 80], // E minor
];

export interface MidiPaletteConfig {
    readonly scalePatterns?: readonly (readonly number[])[];
    readonly brickSynth?: {
        readonly oscillatorType?: string;
        readonly envelope?: Partial<{ attack: number; decay: number; sustain: number; release: number }>;
        readonly volume?: number;
    };
    readonly chimeSynth?: {
        readonly oscillatorType?: string;
        readonly envelope?: Partial<{ attack: number; decay: number; sustain: number; release: number }>;
        readonly volume?: number;
    };
    readonly percussion?: {
        readonly volume?: number;
        readonly pitchDecay?: number;
        readonly octaves?: number;
        readonly oscillatorType?: string;
    };
    readonly comboVelocityBias?: number;
    readonly powerUpSequence?: readonly number[];
    readonly powerUpOffsets?: readonly number[];
    readonly wallHitNoteBase?: number;
}

export interface MidiEngineOptions {
    readonly palette?: MidiPaletteConfig;
}

export interface MidiWallHitOptions {
    readonly speed?: number;
    readonly time?: number;
}

export interface MidiBrickAccentOptions {
    readonly combo: number;
    readonly time?: number;
    readonly intensity?: number;
    readonly accent?: 'hit' | 'break';
}

export interface MidiPowerUpOptions {
    readonly time?: number;
    readonly sparkle?: number;
}

export interface MidiGambleCountdownOptions {
    readonly time?: number;
    readonly urgency?: number;
    readonly second?: number;
}

export interface MidiEngine {
    readonly triggerWallHit: (options?: MidiWallHitOptions) => void;
    readonly triggerBrickAccent: (options: MidiBrickAccentOptions) => void;
    readonly triggerPowerUp: (options?: MidiPowerUpOptions) => void;
    readonly triggerGambleCountdown: (options?: MidiGambleCountdownOptions) => void;
    readonly dispose: () => void;
}

interface SynthHandle {
    triggerAttackRelease: (frequency: number | string, duration: string, time?: number, velocity?: number) => void;
    dispose: () => void;
    volume?: { value: number };
    set?: (options: unknown) => void;
}

const createStubHandle = (): SynthHandle => ({
    triggerAttackRelease: () => undefined,
    dispose: () => undefined,
    volume: { value: -Infinity },
});

const resolveTime = (time?: number): number => {
    if (typeof time === 'number' && Number.isFinite(time)) {
        return time;
    }
    return toneNow();
};

const resolveVelocity = (value: number, min = 0.2, max = 0.95): number => {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
};

const resolveComboNote = (combo: number, scalePatterns: readonly (readonly number[])[]): number => {
    if (!Number.isFinite(combo) || combo <= 0) {
        return scalePatterns[0]?.[0] ?? 60;
    }
    const stepIndex = Math.max(0, Math.floor(combo) - 1);

    // Use combo number as seed for deterministic but varied scale selection
    const scalePatternIndex = Math.abs(Math.floor(combo * 7.3 + combo)) % scalePatterns.length;
    const selectedScale = scalePatterns[scalePatternIndex] ?? scalePatterns[0];

    const scaleIndex = stepIndex % selectedScale.length;
    const octaveOffset = Math.floor(stepIndex / selectedScale.length);
    const baseNote = selectedScale[scaleIndex] ?? selectedScale[0];
    const clampedOctave = Math.min(octaveOffset, 3);
    const note = baseNote + clampedOctave * 12;
    return Math.min(note, 96);
};

const configureSynth = (handle: SynthHandle, options: unknown) => {
    try {
        handle.set?.(options);
    } catch {
        // Ignore configuration failures; Tone.js will use defaults.
    }
};

const createBrickHandle = (palette?: MidiPaletteConfig): SynthHandle => {
    let ctor: typeof PolySynth | null = null;
    try {
        ctor = typeof PolySynth === 'function' ? PolySynth : null;
    } catch {
        ctor = null;
    }
    if (!ctor) {
        return createStubHandle();
    }

    try {
        const instance = new ctor(Synth).toDestination();
        const handle = instance as unknown as SynthHandle;
        if (handle.volume) {
            const volume = typeof palette?.brickSynth?.volume === 'number' && Number.isFinite(palette.brickSynth.volume)
                ? palette.brickSynth.volume
                : -12;
            handle.volume.value = volume;
        }
        const oscillatorType = sanitizeOscillatorType(palette?.brickSynth?.oscillatorType, 'triangle');
        const envelope = {
            attack: 0.005,
            decay: 0.22,
            sustain: 0.18,
            release: 0.6,
            ...palette?.brickSynth?.envelope,
        } satisfies { attack: number; decay: number; sustain: number; release: number };
        const synthOptions = {
            oscillator: { type: oscillatorType },
            envelope,
        } as const;
        configureSynth(handle, synthOptions as never);
        return handle;
    } catch {
        return createStubHandle();
    }
};

const createPercussionHandle = (palette?: MidiPaletteConfig): SynthHandle => {
    let ctor: typeof MembraneSynth | null = null;
    try {
        ctor = typeof MembraneSynth === 'function' ? MembraneSynth : null;
    } catch {
        ctor = null;
    }
    if (!ctor) {
        return createStubHandle();
    }

    try {
        const pitchDecay = typeof palette?.percussion?.pitchDecay === 'number'
            ? palette.percussion.pitchDecay
            : 0.03;
        const octaves = typeof palette?.percussion?.octaves === 'number'
            ? palette.percussion.octaves
            : 1.1;
        const oscillatorType = sanitizeOscillatorType(palette?.percussion?.oscillatorType, 'sine');
        const membraneOptions = {
            pitchDecay,
            octaves,
            oscillator: { type: oscillatorType },
            envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.45 },
        } as const;
        const instance = new ctor(membraneOptions as never).toDestination();
        const handle = instance as unknown as SynthHandle;
        if (handle.volume) {
            const volume = typeof palette?.percussion?.volume === 'number' && Number.isFinite(palette.percussion.volume)
                ? palette.percussion.volume
                : -10;
            handle.volume.value = volume;
        }
        return handle;
    } catch {
        return createStubHandle();
    }
};

const createChimeHandle = (palette?: MidiPaletteConfig): SynthHandle => {
    let ctor: typeof PolySynth | null = null;
    try {
        ctor = typeof PolySynth === 'function' ? PolySynth : null;
    } catch {
        ctor = null;
    }
    if (!ctor) {
        return createStubHandle();
    }

    try {
        const instance = new ctor(Synth).toDestination();
        const handle = instance as unknown as SynthHandle;
        if (handle.volume) {
            const volume = typeof palette?.chimeSynth?.volume === 'number' && Number.isFinite(palette.chimeSynth.volume)
                ? palette.chimeSynth.volume
                : -8;
            handle.volume.value = volume;
        }
        const oscillatorType = sanitizeOscillatorType(palette?.chimeSynth?.oscillatorType, 'square');
        const envelope = {
            attack: 0.004,
            decay: 0.18,
            sustain: 0.1,
            release: 0.5,
            ...palette?.chimeSynth?.envelope,
        } satisfies { attack: number; decay: number; sustain: number; release: number };
        const synthOptions = {
            oscillator: { type: oscillatorType },
            envelope,
        } as const;
        configureSynth(handle, synthOptions as never);
        return handle;
    } catch {
        return createStubHandle();
    }
};

export const createMidiEngine = (options: MidiEngineOptions = {}): MidiEngine => {
    const palette = options.palette;
    const scalePatterns = palette?.scalePatterns && palette.scalePatterns.length > 0
        ? palette.scalePatterns
        : DEFAULT_SCALE_PATTERNS;

    const brickHandle = createBrickHandle(palette);
    const percussionHandle = createPercussionHandle(palette);
    const chimeHandle = createChimeHandle(palette);

    let disposed = false;

    const comboVelocityBias = Number.isFinite(palette?.comboVelocityBias ?? 0)
        ? (palette?.comboVelocityBias ?? 0)
        : 0;
    const powerUpSequence = palette?.powerUpSequence && palette.powerUpSequence.length > 0
        ? palette.powerUpSequence
        : [67, 71, 76];
    const powerUpOffsets = palette?.powerUpOffsets && palette.powerUpOffsets.length === powerUpSequence.length
        ? palette.powerUpOffsets
        : [0, 0.14, 0.28];
    const wallHitBase = Number.isFinite(palette?.wallHitNoteBase ?? 0)
        ? (palette?.wallHitNoteBase ?? 36)
        : 36;

    const triggerWallHit: MidiEngine['triggerWallHit'] = (options) => {
        if (disposed) {
            return;
        }
        const resolvedTime = resolveTime(options?.time);
        const normalizedSpeed = clamp01(Math.abs(options?.speed ?? 0) / 80);
        const note = wallHitBase + Math.round(normalizedSpeed * 4);
        const velocity = resolveVelocity(0.3 + normalizedSpeed * 0.5, 0.25, 0.85);
        try {
            percussionHandle.triggerAttackRelease(midiToFrequency(note), '8n', resolvedTime, velocity);
        } catch {
            // Ignore playback failures; usually the audio context is not ready yet.
        }
    };

    const triggerBrickAccent: MidiEngine['triggerBrickAccent'] = (options) => {
        if (disposed) {
            return;
        }
        const accent = options.accent ?? 'hit';
        const resolvedTime = resolveTime(options.time);
        const comboForNote = Math.max(1, Math.floor(Number.isFinite(options.combo) ? options.combo : 1));
        const note = resolveComboNote(comboForNote, scalePatterns);
        const normalizedIntensity = clamp01(options.intensity ?? (accent === 'break' ? 0.65 : 0.4));
        const baseVelocity = accent === 'break' ? 0.45 : 0.25;
        const velocity = resolveVelocity(
            baseVelocity + normalizedIntensity * (accent === 'break' ? 0.45 : 0.3) + comboVelocityBias * normalizedIntensity,
        );
        const duration = accent === 'break' ? '8n' : '16n';
        try {
            brickHandle.triggerAttackRelease(midiToFrequency(note), duration, resolvedTime, velocity);
        } catch {
            // Ignore playback failures; brick accents are secondary flair.
        }
    };

    const triggerPowerUp: MidiEngine['triggerPowerUp'] = (options) => {
        if (disposed) {
            return;
        }
        const baseTime = resolveTime(options?.time);
        const sparkle = clamp01(options?.sparkle ?? 0.7);
        const noteSequence = powerUpSequence;
        const offsets = powerUpOffsets;
        const velocities = [0.45, 0.6, 0.85].map((value) => resolveVelocity(value + sparkle * 0.1));
        for (let index = 0; index < noteSequence.length; index += 1) {
            const scheduled = baseTime + offsets[index];
            try {
                chimeHandle.triggerAttackRelease(
                    midiToFrequency(noteSequence[index]),
                    '16n',
                    scheduled,
                    velocities[index],
                );
            } catch {
                // Ignore playback failures; the remaining notes may still sound.
            }
        }
    };

    const triggerGambleCountdown: MidiEngine['triggerGambleCountdown'] = (options) => {
        if (disposed) {
            return;
        }
        const baseTime = resolveTime(options?.time);
        const urgency = clamp01(options?.urgency ?? 0);
        const second = Math.max(0, Math.floor(options?.second ?? 0));
        const pitchOffset = Math.min(8, Math.round(urgency * 8) + (second <= 1 ? 2 : 0));
        const rootNote = 78 + pitchOffset;
        const velocity = resolveVelocity(0.35 + urgency * 0.45, 0.3, 0.95);
        const duration = urgency > 0.6 ? '16n' : '32n';

        try {
            chimeHandle.triggerAttackRelease(midiToFrequency(rootNote), duration, baseTime, velocity);
        } catch {
            // Ignore playback failures; countdown cue is best-effort.
        }

        const accentDelay = Math.max(0.04, 0.12 - urgency * 0.05);
        const accentNote = rootNote + 3;
        try {
            chimeHandle.triggerAttackRelease(
                midiToFrequency(accentNote),
                duration,
                baseTime + accentDelay,
                Math.min(0.95, velocity * 0.9 + urgency * 0.1),
            );
        } catch {
            // Secondary accent can fail silently.
        }
    };

    const dispose = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        brickHandle.dispose();
        percussionHandle.dispose();
        chimeHandle.dispose();
    };

    return {
        triggerWallHit,
        triggerBrickAccent,
        triggerPowerUp,
        triggerGambleCountdown,
        dispose,
    };
};
