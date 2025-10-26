import { MembraneSynth, PolySynth, Synth, now as toneNow } from 'tone';

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
const SCALE_PATTERNS: readonly (readonly number[])[] = [
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

export interface MidiEngine {
    readonly triggerWallHit: (options?: MidiWallHitOptions) => void;
    readonly triggerBrickAccent: (options: MidiBrickAccentOptions) => void;
    readonly triggerPowerUp: (options?: MidiPowerUpOptions) => void;
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

const resolveComboNote = (combo: number): number => {
    if (!Number.isFinite(combo) || combo <= 0) {
        return SCALE_PATTERNS[0][0];
    }
    const stepIndex = Math.max(0, Math.floor(combo) - 1);

    // Use combo number as seed for deterministic but varied scale selection
    const scalePatternIndex = Math.abs(Math.floor(combo * 7.3 + combo)) % SCALE_PATTERNS.length;
    const selectedScale = SCALE_PATTERNS[scalePatternIndex] ?? SCALE_PATTERNS[0];

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

const createBrickHandle = (): SynthHandle => {
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
            handle.volume.value = -12;
        }
        configureSynth(handle, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.005, decay: 0.22, sustain: 0.18, release: 0.6 },
        });
        return handle;
    } catch {
        return createStubHandle();
    }
};

const createPercussionHandle = (): SynthHandle => {
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
        const instance = new ctor({
            pitchDecay: 0.03,
            octaves: 1.1,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.45 },
        }).toDestination();
        const handle = instance as unknown as SynthHandle;
        if (handle.volume) {
            handle.volume.value = -10;
        }
        return handle;
    } catch {
        return createStubHandle();
    }
};

const createChimeHandle = (): SynthHandle => {
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
            handle.volume.value = -8;
        }
        configureSynth(handle, {
            oscillator: { type: 'square' },
            envelope: { attack: 0.004, decay: 0.18, sustain: 0.1, release: 0.5 },
        });
        return handle;
    } catch {
        return createStubHandle();
    }
};

export const createMidiEngine = (): MidiEngine => {
    const brickHandle = createBrickHandle();
    const percussionHandle = createPercussionHandle();
    const chimeHandle = createChimeHandle();

    let disposed = false;

    const triggerWallHit: MidiEngine['triggerWallHit'] = (options) => {
        if (disposed) {
            return;
        }
        const resolvedTime = resolveTime(options?.time);
        const normalizedSpeed = clamp01(Math.abs(options?.speed ?? 0) / 80);
        const note = 36 + Math.round(normalizedSpeed * 4);
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
        const note = resolveComboNote(comboForNote);
        const normalizedIntensity = clamp01(options.intensity ?? (accent === 'break' ? 0.65 : 0.4));
        const baseVelocity = accent === 'break' ? 0.45 : 0.25;
        const velocity = resolveVelocity(baseVelocity + normalizedIntensity * (accent === 'break' ? 0.45 : 0.3));
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
        const noteSequence = [67, 71, 76];
        const offsets = [0, 0.14, 0.28];
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
        dispose,
    };
};
