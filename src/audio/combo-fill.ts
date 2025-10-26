import { Gain, NoiseSynth, Reverb, now as toneNow } from 'tone';

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

export interface ComboFillTriggerOptions {
    readonly intensity?: number;
    readonly time?: number;
}

export interface ComboFillEngine {
    readonly trigger: (options?: ComboFillTriggerOptions) => void;
    readonly dispose: () => void;
}

const createFallbackEngine = (): ComboFillEngine => ({
    trigger: () => undefined,
    dispose: () => undefined,
});

export const createComboFillEngine = (): ComboFillEngine => {
    let synth: NoiseSynth | null = null;
    let reverb: Reverb | null = null;
    let gain: Gain | null = null;

    try {
        reverb = new Reverb({
            decay: 1.8,
            preDelay: 0.02,
            wet: 0.85,
        }).toDestination();
        if (typeof reverb.generate === 'function') {
            void reverb.generate();
        }

        gain = new Gain(0);
        gain.connect(reverb);

        synth = new NoiseSynth({
            noise: { type: 'pink' },
            envelope: {
                attack: 0.004,
                decay: 0.7,
                sustain: 0,
                release: 0.45,
            },
        });
        synth.connect(gain);
    } catch {
        synth?.dispose();
        reverb?.dispose();
        gain?.dispose();
        return createFallbackEngine();
    }

    const trigger: ComboFillEngine['trigger'] = (options = {}) => {
        if (!synth || !reverb || !gain) {
            return;
        }
        const nowTime = toneNow();
        const targetTime = Number.isFinite(options.time ?? NaN) ? options.time ?? nowTime : nowTime;
        const intensity = clamp01(options.intensity ?? 0.7);
        const peakGain = 0.08 + intensity * 0.22;

        try {
            const startTime = Math.max(nowTime, targetTime);
            const releaseTime = startTime + 1.2;
            gain.gain.cancelAndHoldAtTime(startTime);
            gain.gain.setValueAtTime(peakGain, startTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, releaseTime);
            synth.triggerAttackRelease('8n', startTime);
        } catch {
            // Ignore playback errors; they usually indicate the audio context is suspended.
        }
    };

    const dispose: ComboFillEngine['dispose'] = () => {
        synth?.dispose();
        reverb?.dispose();
        gain?.dispose();
        synth = null;
        reverb = null;
        gain = null;
    };

    return {
        trigger,
        dispose,
    };
};
