import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeAudio, type RuntimeAudioOptions } from 'app/runtime/modules/runtime-audio';
import type { AudioBootstrap } from 'app/runtime/audio-bootstrap';
import type { ToneScheduler } from 'audio/scheduler';
import type { MusicDirector, MusicState } from 'audio/music-director';
import type { MidiEngine } from 'audio/midi-engine';

type RuntimeAudioOverrides = Partial<
    Pick<RuntimeAudioOptions, 'hasPerformanceNow' | 'getWallClockSeconds' | 'getAudioVisualSkewSeconds'>
>;

const createTestContext = (overrides: RuntimeAudioOverrides = {}) => {
    const midiEngine = { dispose: vi.fn() } as unknown as MidiEngine;
    const rebuiltMidiEngine = { dispose: vi.fn() } as unknown as MidiEngine;

    const createMidiEngineMock = vi.fn<[], MidiEngine>(() => midiEngine);
    const rebuildMidiEngineMock = vi.fn<[MidiEngine], MidiEngine>(() => rebuiltMidiEngine);
    const ensureToneAudioMock = vi.fn<[], Promise<void>>(() => Promise.resolve());

    const audioBootstrap: AudioBootstrap = {
        ensureToneAudio: ensureToneAudioMock,
        createMidiEngine: createMidiEngineMock,
        rebuildMidiEngine: rebuildMidiEngineMock,
    };

    const schedulerPredictAt = vi.fn<[number?], number>((offset = 0) => 0.5 + (offset ?? 0) / 1000);
    const scheduler = {
        predictAt: schedulerPredictAt,
    } as unknown as ToneScheduler;

    const musicDirector: MusicDirector = {
        setState: vi.fn(),
        getState: vi.fn(() => null),
        setEnabled: vi.fn(),
        setBeatCallback: vi.fn(),
        setMeasureCallback: vi.fn(),
        triggerComboAccent: vi.fn(),
        triggerGambleCountdown: vi.fn(),
        dispose: vi.fn(),
    };

    const options: RuntimeAudioOptions = {
        audioBootstrap,
        scheduler,
        musicDirector,
        hasPerformanceNow: overrides.hasPerformanceNow ?? true,
        getWallClockSeconds: overrides.getWallClockSeconds ?? (() => 10),
        getAudioVisualSkewSeconds: overrides.getAudioVisualSkewSeconds ?? (() => 0),
    };

    const handle = createRuntimeAudio(options);

    return {
        handle,
        audioBootstrap,
        schedulerPredictAt,
        musicDirector,
        midiEngine,
        rebuiltMidiEngine,
    };
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('createRuntimeAudio', () => {
    it('normalizes music state before pushing to director', () => {
        const { handle, musicDirector } = createTestContext();
        const input: MusicState = {
            lives: 3,
            combo: -5,
            tempoRatio: 2,
            paused: true,
            warbleIntensity: 4,
            bricksRemainingRatio: -0.5,
        };

        handle.pushMusicState(input);

        expect(musicDirector.setState).toHaveBeenCalledTimes(1);
        expect(musicDirector.setState).toHaveBeenCalledWith({
            lives: 3,
            combo: 0,
            tempoRatio: 1,
            paused: true,
            warbleIntensity: 1,
            bricksRemainingRatio: 0,
        });
    });

    it('skips redundant music state updates when values are unchanged', () => {
        const { handle, musicDirector } = createTestContext();
        const base: MusicState = {
            lives: 2,
            combo: 4.25,
            tempoRatio: 0.4,
            paused: false,
            warbleIntensity: 0.2,
            bricksRemainingRatio: 0.7,
        };

        handle.pushMusicState(base);
        handle.pushMusicState({ ...base, combo: 4.2505 });

        expect(musicDirector.setState).toHaveBeenCalledTimes(1);
    });

    it('computes scheduled audio time using scheduler predictions', () => {
        const { handle, schedulerPredictAt } = createTestContext();
        schedulerPredictAt.mockReturnValueOnce(42);

        const result = handle.computeScheduledAudioTime(200);

        expect(result).toBe(42);
        expect(schedulerPredictAt).toHaveBeenCalledWith(200);
    });

    it('rebuilds midi engine through bootstrap and updates handle reference', () => {
        const { handle, audioBootstrap, midiEngine, rebuiltMidiEngine } = createTestContext();

        expect(handle.getMidiEngine()).toBe(midiEngine);

        const rebuilt = handle.rebuildMidiEngine();

        expect(audioBootstrap.rebuildMidiEngine).toHaveBeenCalledWith(midiEngine);
        expect(rebuilt).toBe(rebuiltMidiEngine);
        expect(handle.getMidiEngine()).toBe(rebuiltMidiEngine);
    });

    it('runs visual effect immediately when scheduled time is not finite', () => {
        const { handle } = createTestContext();
        const effect = vi.fn();

        handle.scheduleVisualEffect(undefined, effect);

        expect(effect).toHaveBeenCalledTimes(1);
    });

    it('runs visual effect immediately when wall clock is unavailable', () => {
        const { handle } = createTestContext({ hasPerformanceNow: false });
        const effect = vi.fn();

        handle.scheduleVisualEffect(20, effect);

        expect(effect).toHaveBeenCalledTimes(1);
    });

    it('runs visual effect immediately when delay is negligible', () => {
        const { handle } = createTestContext({ getWallClockSeconds: () => 8 });
        const effect = vi.fn();

        handle.scheduleVisualEffect(8.001, effect);

        expect(effect).toHaveBeenCalledTimes(1);
    });

    it('schedules visual effect relative to wall clock and clears pending timers', () => {
        vi.useFakeTimers();
        const { handle } = createTestContext({ getWallClockSeconds: () => 5, getAudioVisualSkewSeconds: () => 0 });
        const effect = vi.fn();

        handle.scheduleVisualEffect(7, effect);

        expect(effect).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1999);
        expect(effect).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(effect).toHaveBeenCalledTimes(1);

        const secondEffect = vi.fn();
        handle.scheduleVisualEffect(12, secondEffect);
        handle.clearScheduledVisualEffects();
        vi.runAllTimers();
        expect(secondEffect).not.toHaveBeenCalled();
    });

    it('ignores clear requests when no visual effects are pending', () => {
        const { handle } = createTestContext();

        expect(() => handle.clearScheduledVisualEffects()).not.toThrow();
    });

    it('falls back to performance.now when wall clock provider is not finite', () => {
        vi.useFakeTimers();
        const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(15_000);
        const { handle } = createTestContext({ getWallClockSeconds: () => Number.NaN });
        const effect = vi.fn();

        handle.scheduleVisualEffect(16, effect);

        vi.advanceTimersByTime(1000);
        expect(effect).toHaveBeenCalledTimes(1);
        nowSpy.mockRestore();
    });

    it('runs visual effect immediately when performance timing is unavailable', () => {
        const globalRef = globalThis as { performance?: Performance };
        const originalPerformance = globalRef.performance;
        Reflect.deleteProperty(globalRef, 'performance');
        const { handle } = createTestContext({ getWallClockSeconds: () => Number.NaN });
        const effect = vi.fn();

        handle.scheduleVisualEffect(9, effect);

        expect(effect).toHaveBeenCalledTimes(1);
        if (originalPerformance) {
            globalRef.performance = originalPerformance;
        } else {
            Reflect.deleteProperty(globalRef, 'performance');
        }
    });

    it('disposes resources, clears timers, and releases callbacks', () => {
        vi.useFakeTimers();
        const { handle, musicDirector, midiEngine } = createTestContext({ getWallClockSeconds: () => 1 });
        const effect = vi.fn();

        handle.scheduleVisualEffect(3, effect);
        handle.setBeatCallback(vi.fn());
        handle.setMeasureCallback(vi.fn());

        handle.dispose();

        expect(musicDirector.setBeatCallback).toHaveBeenCalledWith(null);
        expect(musicDirector.setMeasureCallback).toHaveBeenCalledWith(null);
        expect(midiEngine.dispose).toHaveBeenCalledTimes(1);

        vi.runAllTimers();
        expect(effect).not.toHaveBeenCalled();
    });

    it('forwards music enablement and callbacks to the director', () => {
        const { handle, musicDirector } = createTestContext();
        const beat = vi.fn();
        const measure = vi.fn();

        handle.setBeatCallback(beat);
        handle.setMeasureCallback(measure);
        handle.enableMusic();
        handle.disableMusic();

        expect(musicDirector.setBeatCallback).toHaveBeenCalledWith(beat);
        expect(musicDirector.setMeasureCallback).toHaveBeenCalledWith(measure);
        expect(musicDirector.setEnabled).toHaveBeenNthCalledWith(1, true);
        expect(musicDirector.setEnabled).toHaveBeenNthCalledWith(2, false);
    });
});
