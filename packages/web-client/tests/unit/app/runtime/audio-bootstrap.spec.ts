import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'util/log';
import type { MidiEngine, MidiPaletteConfig } from 'audio/midi-engine';
import {
    clampMidiNote,
    createAudioBootstrap,
    deriveForeshadowScale,
} from 'app/runtime/audio-bootstrap';

describe('audio-bootstrap', () => {
    const createLoggerStub = (): Logger => {
        const stub: Logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn(() => stub),
        };
        return stub;
    };

    const createMidiEngineStub = () => ({
        triggerWallHit: vi.fn(),
        triggerBrickAccent: vi.fn(),
        triggerPowerUp: vi.fn(),
        triggerGambleCountdown: vi.fn(),
        dispose: vi.fn(),
    }) satisfies MidiEngine;

    it('forwards Tone warnings to the provided logger', async () => {
        const logger = createLoggerStub();
        const warningError = new Error('oops');
        const ensureMock = vi.fn(async (options?: { warn?: (message: string, details?: { error: unknown }) => void }) => {
            options?.warn?.('test warning', { error: warningError });
        });

        const bootstrap = createAudioBootstrap({
            logger,
            getPaletteConfig: () => undefined,
            ensureToneAudioImpl: ensureMock,
            midiEngineFactory: () => createMidiEngineStub(),
        });

        await bootstrap.ensureToneAudio();

        expect(ensureMock).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith('test warning', { error: warningError });
    });

    it('forwards Tone warnings without details when details are missing', async () => {
        const logger = createLoggerStub();
        const ensureMock = vi.fn(async (options?: { warn?: (message: string, details?: { error: unknown }) => void }) => {
            options?.warn?.('warning without details');
        });

        const bootstrap = createAudioBootstrap({
            logger,
            ensureToneAudioImpl: ensureMock,
            midiEngineFactory: () => createMidiEngineStub(),
        });

        await bootstrap.ensureToneAudio();

        expect(logger.warn).toHaveBeenCalledWith('warning without details');
    });

    it('rebuilds the midi engine and disposes the previous instance', () => {
        const logger = createLoggerStub();
        const firstEngine = createMidiEngineStub();
        const secondEngine = createMidiEngineStub();
        const factory = vi.fn()
            .mockImplementationOnce(() => firstEngine)
            .mockImplementationOnce(() => secondEngine);

        const bootstrap = createAudioBootstrap({
            logger,
            getPaletteConfig: () => undefined,
            midiEngineFactory: factory,
        });

        const initial = bootstrap.createMidiEngine();
        expect(initial).toBe(firstEngine);

        const rebuilt = bootstrap.rebuildMidiEngine(initial);
        expect(factory).toHaveBeenCalledTimes(2);
        expect(firstEngine.dispose).toHaveBeenCalledTimes(1);
        expect(rebuilt).toBe(secondEngine);
    });

    it('swallows disposal errors when rebuilding midi engine', () => {
        const logger = createLoggerStub();
        const firstEngine = createMidiEngineStub();
        const secondEngine = createMidiEngineStub();
        firstEngine.dispose = vi.fn().mockImplementation(() => {
            throw new Error('disposal failed');
        });
        const factory = vi.fn()
            .mockImplementationOnce(() => firstEngine)
            .mockImplementationOnce(() => secondEngine);

        const bootstrap = createAudioBootstrap({
            logger,
            midiEngineFactory: factory,
        });

        const initial = bootstrap.createMidiEngine();
        const rebuilt = bootstrap.rebuildMidiEngine(initial);

        expect(firstEngine.dispose).toHaveBeenCalledTimes(1);
        expect(rebuilt).toBe(secondEngine);
    });

    it('merges palette configs with overrides', () => {
        const logger = createLoggerStub();
        const basePalette: MidiPaletteConfig = {
            scalePatterns: [[60, 62, 64]],
            brickSynth: {
                oscillatorType: 'sine',
                envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 },
                volume: -10,
            },
            chimeSynth: {
                oscillatorType: 'triangle',
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 0.2 },
                volume: -15,
            },
            percussion: {
                volume: -12,
                pitchDecay: 0.05,
                octaves: 3,
                oscillatorType: 'square',
            },
            comboVelocityBias: 0.5,
            powerUpSequence: [60, 64, 67],
            powerUpOffsets: [0, 2, 4],
            wallHitNoteBase: 48,
        };

        const overridePalette: Partial<MidiPaletteConfig> = {
            scalePatterns: [[55, 57, 59]],
            brickSynth: {
                oscillatorType: 'sawtooth',
                volume: -8,
            },
            percussion: {
                volume: -10,
            },
            comboVelocityBias: 0.7,
            wallHitNoteBase: 52,
        };

        let capturedPalette: MidiPaletteConfig | undefined;
        const factory = vi.fn((options: { palette?: MidiPaletteConfig }) => {
            capturedPalette = options.palette;
            return createMidiEngineStub();
        });

        const bootstrap = createAudioBootstrap({
            logger,
            getPaletteConfig: () => basePalette,
            getPaletteOverrides: () => overridePalette,
            midiEngineFactory: factory,
        });

        bootstrap.createMidiEngine();

        expect(capturedPalette).toBeDefined();
        expect(capturedPalette?.scalePatterns).toEqual([[55, 57, 59]]);
        expect(capturedPalette?.brickSynth?.oscillatorType).toBe('sawtooth');
        expect(capturedPalette?.brickSynth?.volume).toBe(-8);
        expect(capturedPalette?.brickSynth?.envelope?.attack).toBe(0.1);
        expect(capturedPalette?.percussion?.volume).toBe(-10);
        expect(capturedPalette?.percussion?.pitchDecay).toBe(0.05);
        expect(capturedPalette?.comboVelocityBias).toBe(0.7);
        expect(capturedPalette?.wallHitNoteBase).toBe(52);
    });

    it('creates midi engine with undefined palette and voiceId when getters are not provided', () => {
        const logger = createLoggerStub();
        let capturedOptions: { palette?: MidiPaletteConfig; voiceId?: string } | undefined;
        const factory = vi.fn((options: { palette?: MidiPaletteConfig; voiceId?: string }) => {
            capturedOptions = options;
            return createMidiEngineStub();
        });

        const bootstrap = createAudioBootstrap({
            logger,
            midiEngineFactory: factory,
        });

        bootstrap.createMidiEngine();

        expect(capturedOptions).toBeDefined();
        expect(capturedOptions?.palette).toBeUndefined();
        expect(capturedOptions?.voiceId).toBeUndefined();
    });

    it('passes voiceId from getter to factory', () => {
        const logger = createLoggerStub();
        let capturedVoiceId: string | undefined;
        const factory = vi.fn((options: { palette?: MidiPaletteConfig; voiceId?: string }) => {
            capturedVoiceId = options.voiceId;
            return createMidiEngineStub();
        });

        const bootstrap = createAudioBootstrap({
            logger,
            getVoiceId: () => 'chime' as const,
            midiEngineFactory: factory,
        });

        bootstrap.createMidiEngine();

        expect(capturedVoiceId).toBe('chime');
    });

    it('filters out invalid values from number arrays when merging', () => {
        const logger = createLoggerStub();
        const basePalette: MidiPaletteConfig = {
            powerUpSequence: [60, Number.NaN, 64, Number.POSITIVE_INFINITY, 67],
            powerUpOffsets: [0, Number.NaN, 2],
        };

        let capturedPalette: MidiPaletteConfig | undefined;
        const factory = vi.fn((options: { palette?: MidiPaletteConfig }) => {
            capturedPalette = options.palette;
            return createMidiEngineStub();
        });

        const bootstrap = createAudioBootstrap({
            logger,
            getPaletteConfig: () => basePalette,
            midiEngineFactory: factory,
        });

        bootstrap.createMidiEngine();

        expect(capturedPalette?.powerUpSequence).toEqual([60, 64, 67]);
        expect(capturedPalette?.powerUpOffsets).toEqual([0, 2]);
    });

    it('returns undefined when merging empty or invalid configs', () => {
        const logger = createLoggerStub();
        const emptyOverrides: Partial<MidiPaletteConfig> = {};

        let capturedPalette: MidiPaletteConfig | undefined;
        const factory = vi.fn((options: { palette?: MidiPaletteConfig }) => {
            capturedPalette = options.palette;
            return createMidiEngineStub();
        });

        const bootstrap = createAudioBootstrap({
            logger,
            getPaletteConfig: () => undefined,
            getPaletteOverrides: () => emptyOverrides,
            midiEngineFactory: factory,
        });

        bootstrap.createMidiEngine();

        expect(capturedPalette).toBeUndefined();
    });

    it('clamps midi notes and derives deterministic foreshadow scales', () => {
        const seed = 0xdecafbad;
        const derived = deriveForeshadowScale(seed);
        const again = deriveForeshadowScale(seed);

        expect(derived.length).toBeGreaterThan(0);
        expect(derived).toEqual(again);
        expect(derived.every((note) => note >= 36 && note <= 96)).toBe(true);

        expect(clampMidiNote(200)).toBe(96);
        expect(clampMidiNote(-10)).toBe(36);
        expect(clampMidiNote(Number.NaN)).toBe(36);
        expect(clampMidiNote(40, 50, 60)).toBe(50);
    });

    it('clamps midi note with invalid min/max values', () => {
        expect(clampMidiNote(50, Number.NaN, 100)).toBe(50);
        expect(clampMidiNote(50, 40, Number.NaN)).toBe(50);
        expect(clampMidiNote(50, 60, 50)).toBe(60); // min >= max case
    });
});
