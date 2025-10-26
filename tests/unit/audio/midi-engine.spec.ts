import { afterEach, describe, expect, it, vi } from 'vitest';

interface ToneMockConfig {
    now: number;
    polySynthAvailable: boolean;
    membraneSynthAvailable: boolean;
    polySynthSetQueue: ('success' | 'throw')[];
}

type TriggerCall = [frequency: number | string, duration: string, time?: number, velocity?: number];

let toneConfig: ToneMockConfig;
let polySynthInstances: any[] = [];
let membraneInstances: any[] = [];

const midiToFrequency = (note: number): number => 440 * 2 ** ((note - 69) / 12);

const installToneMock = async (overrides?: Partial<ToneMockConfig>) => {
    toneConfig = {
        now: 0,
        polySynthAvailable: true,
        membraneSynthAvailable: true,
        polySynthSetQueue: [],
        ...overrides,
    } satisfies ToneMockConfig;

    toneConfig.polySynthSetQueue = [...toneConfig.polySynthSetQueue];

    polySynthInstances = [];
    membraneInstances = [];

    vi.resetModules();
    vi.doUnmock('tone');
    vi.doMock('tone', () => {
        class PolySynthStub {
            public readonly volume = { value: 0 };
            public readonly triggerAttackRelease = vi.fn();
            public readonly dispose = vi.fn();
            public readonly toDestination = vi.fn(() => this);
            public readonly set = vi.fn((options: unknown) => {
                void options;
                const behavior = toneConfig.polySynthSetQueue.shift() ?? 'success';
                if (behavior === 'throw') {
                    throw new Error('configure failure');
                }
            });

            public constructor(...args: unknown[]) {
                void args;
                polySynthInstances.push(this);
            }
        }

        class MembraneSynthStub {
            public readonly volume = { value: 0 };
            public readonly triggerAttackRelease = vi.fn();
            public readonly dispose = vi.fn();
            public readonly toDestination = vi.fn(() => this);
            public readonly options: unknown;

            public constructor(...args: unknown[]) {
                [this.options] = args;
                membraneInstances.push(this);
            }
        }

        class SynthStub { }

        return {
            PolySynth: toneConfig.polySynthAvailable ? PolySynthStub : undefined,
            MembraneSynth: toneConfig.membraneSynthAvailable ? MembraneSynthStub : undefined,
            Synth: SynthStub,
            now: () => toneConfig.now,
        };
    });

    return import('audio/midi-engine');
};

afterEach(() => {
    vi.doUnmock('tone');
    vi.resetModules();
});

describe('createMidiEngine', () => {
    it('normalizes playback parameters and guards against disposal', async () => {
        const module = await installToneMock({ polySynthSetQueue: ['success', 'throw'] });
        const engine = module.createMidiEngine();

        expect(polySynthInstances).toHaveLength(2);
        expect(polySynthInstances[0]?.volume.value).toBe(-12);
        expect(polySynthInstances[1]?.volume.value).toBe(-8);
        expect(polySynthInstances[0]?.set).toHaveBeenCalledWith(
            expect.objectContaining({ envelope: expect.objectContaining({ attack: 0.005 }) }),
        );
        expect(polySynthInstances[1]?.set).toHaveBeenCalledWith(
            expect.objectContaining({ envelope: expect.objectContaining({ attack: 0.004 }) }),
        );

        expect(membraneInstances).toHaveLength(1);
        expect(membraneInstances[0]?.volume.value).toBe(-10);

        engine.triggerBrickAccent({ combo: 0 });
        engine.triggerBrickAccent({ combo: 1, intensity: Number.POSITIVE_INFINITY });
        engine.triggerBrickAccent({ combo: 48, accent: 'break', intensity: -4, time: 6.2 });

        const brickCalls = polySynthInstances[0]?.triggerAttackRelease.mock.calls as TriggerCall[];
        expect(brickCalls).toHaveLength(3);
        expect(brickCalls[0]?.[1]).toBe('16n');
        expect(brickCalls[0]?.[3]).toBeCloseTo(0.37, 2);
        expect(brickCalls[1]?.[1]).toBe('16n');
        expect(brickCalls[1]?.[3]).toBeCloseTo(0.25, 2);
        expect(brickCalls[2]?.[1]).toBe('8n');
        expect(brickCalls[2]?.[2]).toBe(6.2);
        expect(brickCalls[2]?.[3]).toBeGreaterThan(0.44);

        toneConfig.now = 2.5;
        engine.triggerWallHit({ speed: 160 });
        engine.triggerWallHit({ speed: -20, time: 1.1 });

        const wallCalls = membraneInstances[0]?.triggerAttackRelease.mock.calls as TriggerCall[];
        expect(wallCalls).toHaveLength(2);
        expect(wallCalls[0]?.[0]).toBeCloseTo(midiToFrequency(40), 5);
        expect(wallCalls[0]?.[1]).toBe('8n');
        expect(wallCalls[0]?.[2]).toBe(2.5);
        expect(wallCalls[0]?.[3]).toBeLessThanOrEqual(0.85);
        expect(wallCalls[1]?.[2]).toBe(1.1);
        expect(wallCalls[1]?.[3]).toBeGreaterThanOrEqual(0.25);

        engine.triggerPowerUp({ sparkle: 5, time: 4 });
        const chimeCalls = polySynthInstances[1]?.triggerAttackRelease.mock.calls as TriggerCall[];
        expect(chimeCalls).toHaveLength(3);
        expect(chimeCalls[0]?.[2]).toBeCloseTo(4, 5);
        expect(chimeCalls[1]?.[2]).toBeCloseTo(4.14, 2);
        expect(chimeCalls[2]?.[2]).toBeCloseTo(4.28, 2);

        engine.dispose();
        expect(polySynthInstances[0]?.dispose).toHaveBeenCalledTimes(1);
        expect(membraneInstances[0]?.dispose).toHaveBeenCalledTimes(1);
        expect(polySynthInstances[1]?.dispose).toHaveBeenCalledTimes(1);

        polySynthInstances[0]?.triggerAttackRelease.mockClear();
        membraneInstances[0]?.triggerAttackRelease.mockClear();
        engine.triggerBrickAccent({ combo: 3 });
        engine.triggerWallHit({ speed: 10 });
        expect(polySynthInstances[0]?.triggerAttackRelease).not.toHaveBeenCalled();
        expect(membraneInstances[0]?.triggerAttackRelease).not.toHaveBeenCalled();
    });

    it('falls back to silent stubs when Tone synthesis is unavailable', async () => {
        const module = await installToneMock({
            polySynthAvailable: false,
            membraneSynthAvailable: false,
        });
        const engine = module.createMidiEngine();

        expect(polySynthInstances).toHaveLength(0);
        expect(membraneInstances).toHaveLength(0);

        expect(() => engine.triggerWallHit({ speed: 999 })).not.toThrow();
        expect(() => engine.triggerBrickAccent({ combo: -5 })).not.toThrow();
        expect(() => engine.triggerPowerUp()).not.toThrow();
        expect(() => engine.dispose()).not.toThrow();
    });
});
