import { afterEach, describe, expect, it, vi } from 'vitest';

interface ToneMockConfig {
    now: number;
    failReverb: boolean;
}

interface GainStub {
    readonly gain: {
        cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    readonly connect: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly initialValue: number;
}

interface ReverbStub {
    readonly options: unknown;
    readonly generate: ReturnType<typeof vi.fn>;
    readonly toDestination: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
}

interface NoiseSynthStub {
    readonly options: unknown;
    readonly connect: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly triggerAttackRelease: ReturnType<typeof vi.fn>;
}

let toneConfig: ToneMockConfig;
let gainInstances: GainStub[] = [];
let reverbInstances: ReverbStub[] = [];
let noiseSynthInstances: NoiseSynthStub[] = [];

const installToneMock = async (overrides: Partial<ToneMockConfig> = {}) => {
    toneConfig = {
        now: 0,
        failReverb: false,
        ...overrides,
    } satisfies ToneMockConfig;

    gainInstances = [];
    reverbInstances = [];
    noiseSynthInstances = [];

    vi.resetModules();
    vi.doUnmock('tone');
    vi.doMock('tone', () => {
        class ReverbClass {
            public readonly options: unknown;
            public readonly generate = vi.fn(() => undefined);
            public readonly toDestination = vi.fn(() => this);
            public readonly dispose = vi.fn();

            public constructor(options: unknown) {
                if (toneConfig.failReverb) {
                    throw new Error('reverb unavailable');
                }
                this.options = options;
                reverbInstances.push(this as unknown as ReverbStub);
            }
        }

        class GainClass {
            public readonly gain = {
                cancelAndHoldAtTime: vi.fn(),
                setValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
            };
            public readonly connect = vi.fn(() => this);
            public readonly dispose = vi.fn();
            public readonly initialValue: number;

            public constructor(value: number) {
                this.initialValue = value;
                gainInstances.push(this as unknown as GainStub);
            }
        }

        class NoiseSynthClass {
            public readonly options: unknown;
            public readonly connect = vi.fn(() => this);
            public readonly dispose = vi.fn();
            public readonly triggerAttackRelease = vi.fn();

            public constructor(options: unknown) {
                this.options = options;
                noiseSynthInstances.push(this as unknown as NoiseSynthStub);
            }
        }

        return {
            Reverb: ReverbClass,
            Gain: GainClass,
            NoiseSynth: NoiseSynthClass,
            now: () => toneConfig.now,
        };
    });

    return import('audio/combo-fill');
};

afterEach(() => {
    vi.doUnmock('tone');
    vi.resetModules();
});

describe('createComboFillEngine', () => {
    it('ramps the gain envelope based on intensity and handles playback errors', async () => {
        const module = await installToneMock({ now: 4 });
        const engine = module.createComboFillEngine();

        const reverb = reverbInstances[0];
        const gain = gainInstances[0];
        const synth = noiseSynthInstances[0];
        if (!reverb || !gain || !synth) {
            throw new Error('Expected Tone stubs to be instantiated');
        }

        expect(reverb.toDestination).toHaveBeenCalledTimes(1);
        expect(reverb.generate).toHaveBeenCalledTimes(1);
        expect(gain.connect).toHaveBeenCalledWith(reverb);
        expect(synth.connect).toHaveBeenCalledWith(gain);
        expect(gain.initialValue).toBe(0);

        toneConfig.now = 4;
        engine.trigger({ intensity: 1.5, time: 1 });
        expect(gain.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(4);
        expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.3, 4);
        expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 5.2);
        expect(synth.triggerAttackRelease).toHaveBeenCalledWith('8n', 4);

        gain.gain.cancelAndHoldAtTime.mockClear();
        gain.gain.setValueAtTime.mockClear();
        gain.gain.exponentialRampToValueAtTime.mockClear();
        synth.triggerAttackRelease.mockClear();

        toneConfig.now = 2;
        engine.trigger({ intensity: -5, time: 5 });
        expect(gain.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(5);
        expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.08, 5);
        expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 6.2);
        expect(synth.triggerAttackRelease).toHaveBeenCalledWith('8n', 5);

        gain.gain.cancelAndHoldAtTime.mockClear();
        gain.gain.setValueAtTime.mockClear();
        gain.gain.exponentialRampToValueAtTime.mockClear();
        synth.triggerAttackRelease.mockClear();

        gain.gain.setValueAtTime.mockImplementationOnce(() => {
            throw new Error('envelope failure');
        });
        toneConfig.now = 6;
        expect(() => engine.trigger({ intensity: 0.9, time: 6 })).not.toThrow();
        expect(gain.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(6);
        expect(gain.gain.exponentialRampToValueAtTime).not.toHaveBeenCalled();
        expect(synth.triggerAttackRelease).not.toHaveBeenCalled();

        gain.gain.cancelAndHoldAtTime.mockClear();
        gain.gain.setValueAtTime.mockClear();
        gain.gain.exponentialRampToValueAtTime.mockClear();
        synth.triggerAttackRelease.mockClear();

        toneConfig.now = 9;
        engine.trigger({ time: Number.POSITIVE_INFINITY });
        const expectedPeak = 0.08 + 0.7 * 0.22;
        expect(gain.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(9);
        expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(expectedPeak, 9);
        expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 10.2);
        expect(synth.triggerAttackRelease).toHaveBeenCalledWith('8n', 9);

        const setCallsBeforeDispose = gain.gain.setValueAtTime.mock.calls.length;
        engine.dispose();
        expect(reverb.dispose).toHaveBeenCalledTimes(1);
        expect(gain.dispose).toHaveBeenCalledTimes(1);
        expect(synth.dispose).toHaveBeenCalledTimes(1);

        engine.trigger({ intensity: 0.5 });
        expect(gain.gain.setValueAtTime.mock.calls.length).toBe(setCallsBeforeDispose);
    });

    it('falls back to a silent engine when Tone constructors fail', async () => {
        const module = await installToneMock({ failReverb: true });
        const engine = module.createComboFillEngine();

        expect(reverbInstances).toHaveLength(0);
        expect(gainInstances).toHaveLength(0);
        expect(noiseSynthInstances).toHaveLength(0);

        expect(() => engine.trigger({ intensity: 0.5, time: 4 })).not.toThrow();
        expect(() => engine.dispose()).not.toThrow();
    });
});
