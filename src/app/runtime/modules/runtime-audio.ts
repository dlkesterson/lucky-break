import { clampUnit } from 'render/playfield-visuals';
import type { ToneScheduler } from 'audio/scheduler';
import type {
    MusicDirector,
    MusicState,
    MusicBeatEvent,
    MusicMeasureEvent,
} from 'audio/music-director';
import type { MidiEngine } from 'audio/midi-engine';
import type { AudioBootstrap } from '../audio-bootstrap';

export interface RuntimeAudioOptions {
    readonly audioBootstrap: AudioBootstrap;
    readonly scheduler: ToneScheduler;
    readonly musicDirector: MusicDirector;
    readonly hasPerformanceNow: boolean;
    readonly getWallClockSeconds?: () => number | null;
    readonly getAudioVisualSkewSeconds: () => number;
}

export interface RuntimeAudioHandle {
    getMidiEngine(): MidiEngine;
    rebuildMidiEngine(): MidiEngine;
    computeScheduledAudioTime(offsetMs?: number): number;
    scheduleVisualEffect(scheduledTime: number | undefined, effect: () => void): void;
    pushMusicState(state: MusicState): void;
    setBeatCallback(callback: ((event: MusicBeatEvent) => void) | null): void;
    setMeasureCallback(callback: ((event: MusicMeasureEvent) => void) | null): void;
    enableMusic(): void;
    disableMusic(): void;
    clearScheduledVisualEffects(): void;
    dispose(): void;
}

const isFiniteNumber = (value: number | null | undefined): value is number => {
    return typeof value === 'number' && Number.isFinite(value);
};

export const createRuntimeAudio = ({
    audioBootstrap,
    scheduler,
    musicDirector,
    hasPerformanceNow,
    getWallClockSeconds,
    getAudioVisualSkewSeconds,
}: RuntimeAudioOptions): RuntimeAudioHandle => {
    let midiEngine = audioBootstrap.createMidiEngine();
    const pendingVisualTimers = new Set<ReturnType<typeof setTimeout>>();
    let lastMusicState: MusicState | null = null;

    const resolveWallClockSeconds = (): number | null => {
        if (!hasPerformanceNow) {
            return null;
        }
        const provided = getWallClockSeconds?.();
        if (isFiniteNumber(provided)) {
            return provided;
        }
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now() / 1000;
        }
        return null;
    };

    const scheduleVisualEffect = (scheduledTime: number | undefined, effect: () => void): void => {
        if (!isFiniteNumber(scheduledTime)) {
            effect();
            return;
        }

        const wallNowSeconds = resolveWallClockSeconds();
        if (!isFiniteNumber(wallNowSeconds)) {
            effect();
            return;
        }

        const targetVisualSeconds = scheduledTime + getAudioVisualSkewSeconds();
        const delayMs = Math.max(0, (targetVisualSeconds - wallNowSeconds) * 1000);

        if (delayMs <= 2) {
            effect();
            return;
        }

        const timer = setTimeout(() => {
            pendingVisualTimers.delete(timer);
            effect();
        }, delayMs);
        pendingVisualTimers.add(timer);
    };

    const computeScheduledAudioTime = (offsetMs = 0): number => {
        return scheduler.predictAt(offsetMs);
    };

    const pushMusicState = (state: MusicState): void => {
        const normalized: MusicState = {
            lives: state.lives,
            combo: Math.max(0, state.combo ?? 0),
            tempoRatio: clampUnit(state.tempoRatio ?? 0),
            paused: Boolean(state.paused),
            warbleIntensity: clampUnit(state.warbleIntensity ?? 0),
            bricksRemainingRatio: clampUnit(state.bricksRemainingRatio ?? 1),
        };

        if (
            lastMusicState &&
            lastMusicState.lives === normalized.lives &&
            Math.abs(lastMusicState.combo - normalized.combo) <= 1e-3 &&
            Math.abs((lastMusicState.tempoRatio ?? 0) - (normalized.tempoRatio ?? 0)) <= 1e-3 &&
            Math.abs((lastMusicState.warbleIntensity ?? 0) - (normalized.warbleIntensity ?? 0)) <= 1e-3 &&
            Math.abs((lastMusicState.bricksRemainingRatio ?? 1) - (normalized.bricksRemainingRatio ?? 1)) <= 1e-3 &&
            (lastMusicState.paused ?? false) === (normalized.paused ?? false)
        ) {
            return;
        }

        musicDirector.setState(normalized);
        lastMusicState = { ...normalized };
    };

    const clearScheduledVisualEffects = () => {
        if (pendingVisualTimers.size === 0) {
            return;
        }
        for (const timer of pendingVisualTimers) {
            clearTimeout(timer);
        }
        pendingVisualTimers.clear();
    };

    const dispose = () => {
        clearScheduledVisualEffects();
        musicDirector.setBeatCallback(null);
        musicDirector.setMeasureCallback(null);
        midiEngine.dispose();
        lastMusicState = null;
    };

    return {
        getMidiEngine: () => midiEngine,
        rebuildMidiEngine: () => {
            midiEngine = audioBootstrap.rebuildMidiEngine(midiEngine);
            return midiEngine;
        },
        computeScheduledAudioTime,
        scheduleVisualEffect,
        pushMusicState,
        setBeatCallback: (callback) => {
            musicDirector.setBeatCallback(callback);
        },
        setMeasureCallback: (callback) => {
            musicDirector.setMeasureCallback(callback);
        },
        enableMusic: () => {
            musicDirector.setEnabled(true);
        },
        disableMusic: () => {
            musicDirector.setEnabled(false);
        },
        clearScheduledVisualEffects,
        dispose,
    } satisfies RuntimeAudioHandle;
};
