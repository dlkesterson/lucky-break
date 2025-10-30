import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'util/log';
import type { MidiEngine } from 'audio/midi-engine';
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
});
