import { Gain, Player, Transport, now as toneNow } from 'tone';

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

const DEFAULT_CROSSFADE_SECONDS = 1.2;
const LEVEL_EPSILON = 0.01;

export type BaseLayerId = 'calm' | 'intense';
export type SupportLayerId = 'melody';
export type MusicLayerId = BaseLayerId | SupportLayerId;

export interface MusicState {
    readonly lives: 1 | 2 | 3;
    readonly combo: number;
    readonly tempoRatio?: number;
    readonly paused?: boolean;
    readonly warbleIntensity?: number;
    readonly bricksRemainingRatio?: number;
}

export interface MusicLayerDefinition {
    readonly id: MusicLayerId;
    readonly url: string;
    readonly baseLevel: number;
    readonly fadeInSeconds?: number;
    readonly fadeOutSeconds?: number;
}

export interface MusicLayerContext {
    readonly now: () => number;
}

export interface MusicLayerHandle {
    readonly id: MusicLayerId;
    readonly ensureStarted: () => void;
    readonly setImmediate: (level: number) => void;
    readonly rampTo: (level: number, startTime: number, duration: number) => void;
    readonly getLevel: () => number;
    readonly setPlaybackRate: (rate: number) => void;
    readonly dispose: () => void;
}

export type MusicLayerFactory = (
    definition: MusicLayerDefinition,
    context: MusicLayerContext,
) => MusicLayerHandle;

interface TransportLike {
    scheduleOnce(callback: (time: number) => void, when: number | string): number;
    clear(id: number): void;
    cancel?(time?: number): void;
    nextSubdivision?(subdivision: string): number;
    scheduleRepeat?(callback: (time: number) => void, interval: number | string, startTime?: number): number;
    bpm?: {
        value?: number;
        rampTo?: (value: number, rampTime: number) => void;
    };
}

export interface MusicDirectorOptions {
    readonly transport?: TransportLike;
    readonly now?: () => number;
    readonly crossfadeSeconds?: number;
    readonly comboBoostRate?: number;
    readonly comboBoostCap?: number;
    readonly layerFactory?: MusicLayerFactory;
    readonly layers?: Partial<Record<MusicLayerId, Partial<Omit<MusicLayerDefinition, 'id'>>>>;
    readonly beatsPerMeasure?: number;
    readonly baseTempoBpm?: number;
    readonly maxTempoBpm?: number;
    readonly tempoRampSeconds?: number;
}

export interface MusicDirector {
    readonly setState: (state: MusicState) => void;
    readonly getState: () => MusicState | null;
    readonly setEnabled: (enabled: boolean) => void;
    readonly setBeatCallback: (callback: ((event: MusicBeatEvent) => void) | null) => void;
    readonly setMeasureCallback: (callback: ((event: MusicMeasureEvent) => void) | null) => void;
    readonly triggerComboAccent: (options?: ComboAccentOptions) => void;
    readonly triggerGambleCountdown: (options?: GambleCountdownOptions) => void;
    readonly dispose: () => void;
}

export interface MusicBeatEvent {
    readonly index: number;
    readonly subdivision: number;
    readonly isDownbeat: boolean;
    readonly transportTime: number;
}

export interface MusicMeasureEvent {
    readonly index: number;
    readonly transportTime: number;
}

export interface ComboAccentOptions {
    readonly depth?: number;
    readonly attackSeconds?: number;
    readonly holdSeconds?: number;
    readonly releaseSeconds?: number;
    readonly targets?: readonly MusicLayerId[];
}

export interface GambleCountdownOptions {
    readonly urgency?: number;
}

const DEFAULT_LAYER_DEFINITIONS: Record<MusicLayerId, MusicLayerDefinition> = {
    calm: {
        id: 'calm',
        url: new URL('../../assets/samples/073_low-drums.wav', import.meta.url).href,
        baseLevel: 0.68,
        fadeInSeconds: 0.4,
        fadeOutSeconds: 0.4,
    },
    intense: {
        id: 'intense',
        url: new URL('../../assets/samples/092_crunchy-empires-hiphop.wav', import.meta.url).href,
        baseLevel: 0.9,
        fadeInSeconds: 0.3,
        fadeOutSeconds: 0.25,
    },
    melody: {
        id: 'melody',
        url: new URL('../../assets/samples/092_funkiclassic2.wav', import.meta.url).href,
        baseLevel: 0.8,
        fadeInSeconds: 0.35,
        fadeOutSeconds: 0.45,
    },
};

const mergeLayerDefinition = (
    id: MusicLayerId,
    overrides: Partial<Omit<MusicLayerDefinition, 'id'>> | undefined,
): MusicLayerDefinition => ({
    ...DEFAULT_LAYER_DEFINITIONS[id],
    ...overrides,
    id,
});

const createToneMusicLayer: MusicLayerFactory = (definition, { now }) => {
    const player = new Player({
        url: definition.url,
        loop: true,
        autostart: false,
        fadeIn: definition.fadeInSeconds ?? 0.1,
        fadeOut: definition.fadeOutSeconds ?? 0.2,
    });

    const gain = new Gain(0);
    player.connect(gain);
    gain.toDestination();

    let started = false;
    let startRequested = false;
    let startError: unknown = null;
    let loadPromise: Promise<void> | null = null;
    let playbackRate = 1;

    const ensureLoaded = (): Promise<void> => {
        loadPromise ??= player
            .load(definition.url)
            .then(() => undefined)
            .catch((error: unknown) => {
                loadPromise = null;
                throw error;
            });
        return loadPromise;
    };

    const startPlayer = () => {
        if (started) {
            return;
        }
        if (startError) {
            startError = null;
        }
        const startTime = Math.max(now(), 0) + 0.02;
        try {
            player.start(startTime);
            started = true;
        } catch (error) {
            startError = error;
            started = false;
            startRequested = false;
            console.warn('Failed to start music layer', definition.id, error);
        }
    };

    const ensureStarted = () => {
        if (started) {
            return;
        }
        if (startRequested) {
            if (startError) {
                startPlayer();
            }
            return;
        }
        startRequested = true;
        void ensureLoaded()
            .then(() => {
                startPlayer();
            })
            .catch((error: unknown) => {
                startRequested = false;
                startError = error;
                console.error('Failed to load music layer', definition.id, error);
            });
    };

    const setImmediate = (level: number) => {
        const clamped = clamp01(level);
        const current = now();
        gain.gain.cancelAndHoldAtTime(current);
        gain.gain.setValueAtTime(clamped, current);
    };

    const rampTo = (level: number, startTime: number, duration: number) => {
        const clamped = clamp01(level);
        const start = Math.max(startTime, now());
        gain.gain.cancelAndHoldAtTime(start);
        const currentValue = gain.gain.getValueAtTime(start);
        gain.gain.setValueAtTime(currentValue, start);
        if (duration <= 0) {
            gain.gain.setValueAtTime(clamped, start);
            return;
        }
        gain.gain.linearRampToValueAtTime(clamped, start + duration);
    };

    const getLevel = () => gain.gain.value;

    const setPlaybackRate = (rate: number) => {
        if (!Number.isFinite(rate)) {
            return;
        }
        const clamped = Math.max(0.25, Math.min(rate, 4));
        if (Math.abs(playbackRate - clamped) <= 0.005) {
            return;
        }
        playbackRate = clamped;
        try {
            if (typeof (player.playbackRate as unknown as { value?: number }).value === 'number') {
                (player.playbackRate as unknown as { value: number }).value = clamped;
                return;
            }
        } catch {
            // Fallback to direct assignment below.
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (player.playbackRate as any) = clamped;
        } catch {
            // No-op if playback rate cannot be set.
        }
    };

    const dispose = () => {
        player.dispose();
        gain.dispose();
    };

    return {
        id: definition.id,
        ensureStarted,
        setImmediate,
        rampTo,
        getLevel,
        setPlaybackRate,
        dispose,
    };
};

const resolveTargetLives = (lives: number): 1 | 2 | 3 => {
    if (lives <= 1) {
        return 1;
    }
    if (lives >= 3) {
        return 3;
    }
    return 2;
};

const computeComboBoost = (combo: number, rate: number, cap: number): number => {
    if (!Number.isFinite(combo) || combo <= 0) {
        return 0;
    }
    return Math.min(cap, combo * rate);
};

type TransitionKey = 'mix' | 'duckRelease';

const clampPlaybackRate = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.max(0.25, Math.min(value, 4));
};

export const createMusicDirector = (options: MusicDirectorOptions = {}): MusicDirector => {
    const transport = options.transport ?? Transport;
    const now = options.now ?? toneNow;
    const crossfadeSeconds = Math.max(0.05, options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS);
    const comboBoostRate = options.comboBoostRate ?? 0.0125;
    const comboBoostCap = options.comboBoostCap ?? 0.3;
    const layerFactory = options.layerFactory ?? createToneMusicLayer;
    const beatsPerMeasure = Math.max(1, Math.round(options.beatsPerMeasure ?? 4));
    const baseTempoBpm = options.baseTempoBpm ?? 73;
    const maxTempoBpm = Math.max(baseTempoBpm, options.maxTempoBpm ?? 92);
    const tempoRampSeconds = Math.max(0.02, options.tempoRampSeconds ?? 0.25);

    const definitions: Record<MusicLayerId, MusicLayerDefinition> = {
        calm: mergeLayerDefinition('calm', options.layers?.calm),
        intense: mergeLayerDefinition('intense', options.layers?.intense),
        melody: mergeLayerDefinition('melody', options.layers?.melody),
    };

    const layerOrder: MusicLayerId[] = ['calm', 'intense', 'melody'];
    const musicLayers: Partial<Record<MusicLayerId, MusicLayerHandle>> = {};

    const ensureLayer = (id: MusicLayerId): MusicLayerHandle => {
        let layer = musicLayers[id];
        if (!layer) {
            layer = layerFactory(definitions[id], { now });
            layer.ensureStarted();
            layer.setImmediate(0);
            if (typeof layer.setPlaybackRate === 'function') {
                layer.setPlaybackRate(1);
            }
            musicLayers[id] = layer;
        }
        return layer;
    };

    for (const id of layerOrder) {
        ensureLayer(id);
    }

    let disposed = false;
    let initialized = false;
    let enabled = true;
    const layerLevels: Record<MusicLayerId, number> = { calm: 0, intense: 0, melody: 0 };
    const desiredLevels: Record<MusicLayerId, number> = { calm: 0, intense: 0, melody: 0 };
    const playbackRates: Record<MusicLayerId, number> = { calm: 1, intense: 1, melody: 1 };
    const pendingTransitions = new Map<TransitionKey, number>();
    let lastTempoTarget = baseTempoBpm;
    let lastState: MusicState | null = null;
    let beatCallback: ((event: MusicBeatEvent) => void) | null = null;
    let measureCallback: ((event: MusicMeasureEvent) => void) | null = null;
    let beatScheduleHandle: number | null = null;
    let beatIndex = 0;
    let measureIndex = 0;
    let activeDuck: {
        factor: number;
        targets: Set<MusicLayerId>;
        releaseSeconds: number;
    } | null = null;

    const cancelBeatSchedule = () => {
        if (beatScheduleHandle === null) {
            return;
        }
        try {
            transport.clear(beatScheduleHandle);
        } catch {
            // Best effort; ignore failures.
        }
        beatScheduleHandle = null;
    };

    const normalizeTransportTime = (time: number): number => (Number.isFinite(time) ? time : now());

    const scheduleBeatEvents = () => {
        if (beatScheduleHandle !== null) {
            // already scheduled
            return;
        }
        if (!enabled) {
            return;
        }
        if (!beatCallback && !measureCallback) {
            return;
        }
        if (typeof transport.scheduleRepeat !== 'function') {
            return;
        }

        try {
            const handle = transport.scheduleRepeat((time) => {
                const eventTime = normalizeTransportTime(time);
                const currentBeat = beatIndex;
                const subdivision = currentBeat % beatsPerMeasure;
                const isDownbeat = subdivision === 0;

                if (beatCallback) {
                    beatCallback({
                        index: currentBeat,
                        subdivision,
                        isDownbeat,
                        transportTime: eventTime,
                    });
                }

                if (isDownbeat) {
                    const currentMeasure = measureIndex;
                    if (measureCallback) {
                        measureCallback({
                            index: currentMeasure,
                            transportTime: eventTime,
                        });
                    }
                    measureIndex += 1;
                }

                beatIndex += 1;
            }, '4n');

            if (typeof handle === 'number' && Number.isFinite(handle)) {
                beatScheduleHandle = handle;
            } else {
                beatScheduleHandle = null;
            }
        } catch {
            beatScheduleHandle = null;
        }
    };

    const cancelTransition = (key: TransitionKey) => {
        const handle = pendingTransitions.get(key);
        if (handle !== undefined) {
            try {
                transport.clear(handle);
            } catch {
                // No-op; clearing is best effort.
            }
            pendingTransitions.delete(key);
        }
    };

    const scheduleTransition = (key: TransitionKey, callback: (time: number) => void) => {
        cancelTransition(key);

        if (typeof transport.scheduleOnce === 'function') {
            const target = transport.nextSubdivision?.('4n');
            const when = typeof target === 'number' && Number.isFinite(target) ? target : '+0';

            try {
                const handle = transport.scheduleOnce((time) => {
                    pendingTransitions.delete(key);
                    const scheduled = Number.isFinite(time) ? time : now();
                    callback(scheduled);
                }, when);

                if (typeof handle === 'number' && Number.isFinite(handle)) {
                    pendingTransitions.set(key, handle);
                    return;
                }
            } catch {
                // Fallback to immediate execution below.
            }
        }

        callback(now());
    };

    const applyTempoTarget = (target: number) => {
        if (!Number.isFinite(target)) {
            return;
        }
        const clamped = Math.max(20, Math.min(target, 220));
        if (Math.abs(clamped - lastTempoTarget) <= 0.05) {
            return;
        }
        const bpmControl = transport.bpm as
            | {
                value?: number;
                rampTo?: (value: number, rampTime: number) => void;
            }
            | undefined;
        try {
            if (bpmControl) {
                if (typeof bpmControl.rampTo === 'function') {
                    bpmControl.rampTo(clamped, tempoRampSeconds);
                } else if (typeof bpmControl.value === 'number') {
                    bpmControl.value = clamped;
                }
            }
        } catch {
            // Swallow tempo synchronisation issues; audio will continue.
        }
        lastTempoTarget = clamped;
    };

    const applyPlaybackRates = (rates: Record<MusicLayerId, number>) => {
        for (const id of layerOrder) {
            const target = clampPlaybackRate(rates[id] ?? 1);
            if (Math.abs(playbackRates[id] - target) <= 0.003) {
                continue;
            }
            playbackRates[id] = target;
            const layer = musicLayers[id];
            if (!layer || typeof layer.setPlaybackRate !== 'function') {
                continue;
            }
            try {
                layer.setPlaybackRate(target);
            } catch {
                // Ignore playback rate errors; layer will continue with previous rate.
            }
        }
    };

    const computeMixTargets = (state: MusicState) => {
        const speed = clamp01(Number.isFinite(state.tempoRatio ?? NaN) ? state.tempoRatio ?? 0 : 0);
        const bricksRatio = clamp01(
            Number.isFinite(state.bricksRemainingRatio ?? NaN) ? state.bricksRemainingRatio ?? 1 : 1,
        );
        const comboBoost = computeComboBoost(state.combo, comboBoostRate, comboBoostCap);
        const calmMix = clamp01(1 - speed * 0.65);
        const intenseMix = clamp01(speed * 0.75 + (1 - bricksRatio) * 0.25 + comboBoost * 0.5);
        const melodyMix = clamp01(comboBoost * 0.6 + (1 - bricksRatio) * 0.2);

        const levels: Record<MusicLayerId, number> = {
            calm: clamp01(definitions.calm.baseLevel * calmMix),
            intense: clamp01(definitions.intense.baseLevel * intenseMix),
            melody: clamp01(definitions.melody.baseLevel * melodyMix),
        };

        const warbleIntensity = clamp01(
            Number.isFinite(state.warbleIntensity ?? NaN)
                ? state.warbleIntensity ?? 0
                : 0,
        );

        const playback: Record<MusicLayerId, number> = {
            calm: 1,
            intense: clampPlaybackRate(1 + warbleIntensity * 0.045),
            melody: 1,
        };

        const comboNormalized = comboBoostCap > 0 ? comboBoost / comboBoostCap : 0;
        const tempoBlend = clamp01(speed + comboNormalized * 0.1);
        const tempoTarget = baseTempoBpm + (maxTempoBpm - baseTempoBpm) * tempoBlend;

        return { levels, playback, tempoTarget };
    };

    const updateDesiredLevels = (levels: Record<MusicLayerId, number>): boolean => {
        let changed = false;
        for (const id of layerOrder) {
            const target = clamp01(levels[id] ?? 0);
            if (Math.abs(desiredLevels[id] - target) > LEVEL_EPSILON) {
                desiredLevels[id] = target;
                changed = true;
            }
        }
        return changed;
    };

    const resolveDuckFactor = (id: MusicLayerId): number => {
        if (!activeDuck) {
            return 1;
        }
        return activeDuck.targets.has(id) ? activeDuck.factor : 1;
    };

    const applyLevels = (time: number, immediate: boolean, durationOverride?: number) => {
        for (const id of layerOrder) {
            const layer = musicLayers[id];
            const target = desiredLevels[id];
            if (!layer) {
                continue;
            }
            const effectiveTarget = target * resolveDuckFactor(id);
            if (immediate) {
                layer.setImmediate(effectiveTarget);
            } else {
                layer.rampTo(effectiveTarget, time, durationOverride ?? crossfadeSeconds);
            }
            layerLevels[id] = effectiveTarget;
        }
    };

    const requestMixUpdate = (immediate: boolean) => {
        if (!enabled) {
            return;
        }

        if (immediate) {
            cancelTransition('mix');
            applyLevels(now(), true);
            return;
        }

        const needsUpdate = layerOrder.some((id) => Math.abs(layerLevels[id] - desiredLevels[id]) > LEVEL_EPSILON);
        if (!needsUpdate) {
            return;
        }

        scheduleTransition('mix', (time) => {
            if (disposed || !enabled) {
                return;
            }
            applyLevels(time, false);
        });
    };

    const applyInitialState = (state: MusicState) => {
        const targets = computeMixTargets(state);
        updateDesiredLevels(targets.levels);
        applyPlaybackRates(targets.playback);
        applyTempoTarget(targets.tempoTarget);
        applyLevels(now(), true);
        initialized = true;
    };

    const silenceLayers = (time: number) => {
        for (const id of layerOrder) {
            const layer = musicLayers[id];
            if (!layer) {
                continue;
            }
            desiredLevels[id] = 0;
            layerLevels[id] = 0;
            layer.rampTo(0, time, crossfadeSeconds);
        }
    };

    const cancelDuckRelease = () => {
        cancelTransition('duckRelease');
    };

    const scheduleDuckRelease = (holdSeconds: number, releaseSeconds: number) => {
        if (!activeDuck) {
            return;
        }

        const safeHold = Math.max(0, holdSeconds);

        const executeRelease = (time: number) => {
            pendingTransitions.delete('duckRelease');
            if (disposed) {
                return;
            }
            activeDuck = null;
            applyLevels(Number.isFinite(time) ? time : now(), false, releaseSeconds);
        };

        cancelTransition('duckRelease');

        if (typeof transport.scheduleOnce === 'function') {
            try {
                const handle = transport.scheduleOnce((time) => {
                    executeRelease(Number.isFinite(time) ? time : now());
                }, `+${safeHold}`);
                if (typeof handle === 'number' && Number.isFinite(handle)) {
                    pendingTransitions.set('duckRelease', handle);
                    return;
                }
            } catch {
                // Fall through to immediate scheduling below on failure.
            }
        }

        executeRelease(now() + safeHold);
    };

    const setState: MusicDirector['setState'] = (state) => {
        if (disposed) {
            return;
        }

        const normalizedLives = resolveTargetLives(state.lives);
        const normalizedCombo = Number.isFinite(state.combo) ? Math.max(0, state.combo) : 0;
        const normalizedState: MusicState = {
            lives: normalizedLives,
            combo: normalizedCombo,
            tempoRatio: Number.isFinite(state.tempoRatio ?? NaN) ? clamp01(state.tempoRatio ?? 0) : 0,
            paused: state.paused,
            warbleIntensity: Number.isFinite(state.warbleIntensity ?? NaN)
                ? clamp01(state.warbleIntensity ?? 0)
                : state.warbleIntensity,
            bricksRemainingRatio: Number.isFinite(state.bricksRemainingRatio ?? NaN)
                ? clamp01(state.bricksRemainingRatio ?? 1)
                : state.bricksRemainingRatio,
        };

        lastState = { ...normalizedState };

        const targets = computeMixTargets(normalizedState);

        if (!enabled) {
            updateDesiredLevels(targets.levels);
            applyPlaybackRates(targets.playback);
            applyTempoTarget(targets.tempoTarget);
            initialized = false;
            return;
        }

        if (!initialized) {
            applyInitialState(normalizedState);
            return;
        }

        const levelsChanged = updateDesiredLevels(targets.levels);
        if (levelsChanged) {
            requestMixUpdate(false);
        }

        applyPlaybackRates(targets.playback);
        applyTempoTarget(targets.tempoTarget);
    };

    const setEnabled: MusicDirector['setEnabled'] = (value) => {
        if (disposed || enabled === value) {
            return;
        }

        enabled = value;

        if (!value) {
            cancelTransition('mix');
            cancelDuckRelease();
            activeDuck = null;
            cancelBeatSchedule();
            const start = now();
            silenceLayers(start);
            initialized = false;
            return;
        }

        initialized = false;
        scheduleBeatEvents();
        if (lastState) {
            const targets = computeMixTargets(lastState);
            updateDesiredLevels(targets.levels);
            requestMixUpdate(false);
            applyPlaybackRates(targets.playback);
            applyTempoTarget(targets.tempoTarget);
        }
    };

    const triggerComboAccent: MusicDirector['triggerComboAccent'] = (options = {}) => {
        if (disposed || !enabled) {
            return;
        }

        const attackSeconds = Math.max(0.02, options.attackSeconds ?? 0.12);
        const holdSeconds = Math.max(0.05, options.holdSeconds ?? 0.8);
        const releaseSeconds = Math.max(0.05, options.releaseSeconds ?? 0.6);
        const depth = clamp01(options.depth ?? 0.45);
        const factor = Math.max(0.2, 1 - depth);
        const targetList = options.targets && options.targets.length > 0
            ? options.targets
            : (['calm', 'intense'] as const satisfies readonly MusicLayerId[]);
        const validTargets = targetList.filter((id): id is MusicLayerId => layerOrder.includes(id));
        if (validTargets.length === 0) {
            return;
        }

        const nowTime = now();
        if (activeDuck) {
            activeDuck.factor = Math.min(activeDuck.factor, factor);
            activeDuck.releaseSeconds = Math.max(activeDuck.releaseSeconds, releaseSeconds);
            validTargets.forEach((id) => activeDuck?.targets.add(id));
        } else {
            activeDuck = {
                factor,
                targets: new Set<MusicLayerId>(validTargets),
                releaseSeconds,
            };
        }

        applyLevels(nowTime, false, attackSeconds);
        scheduleDuckRelease(holdSeconds, activeDuck.releaseSeconds);
    };

    const triggerGambleCountdown: MusicDirector['triggerGambleCountdown'] = (options = {}) => {
        if (disposed || !enabled) {
            return;
        }

        const urgency = clamp01(options.urgency ?? 0);
        const attackSeconds = Math.max(0.02, 0.1 - urgency * 0.03);
        const holdSeconds = 0.08 + urgency * 0.2;
        const releaseSeconds = 0.35 + urgency * 0.45;

        const intenseBoost = clamp01(definitions.intense.baseLevel * (0.85 + urgency * 0.4));
        if (intenseBoost > desiredLevels.intense) {
            desiredLevels.intense = intenseBoost;
        }

        const melodyBoost = clamp01(definitions.melody.baseLevel * (0.65 + urgency * 0.3));
        if (melodyBoost > desiredLevels.melody) {
            desiredLevels.melody = melodyBoost;
        }

        const depth = clamp01(0.28 + urgency * 0.5);
        triggerComboAccent({
            depth,
            attackSeconds,
            holdSeconds,
            releaseSeconds,
            targets: ['calm'],
        });

        requestMixUpdate(false);
    };

    const dispose: MusicDirector['dispose'] = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        cancelTransition('mix');
        cancelTransition('duckRelease');
        cancelBeatSchedule();
        try {
            transport.cancel?.(now());
        } catch {
            // Best effort; ignore transport cancellation errors.
        }
        for (const layer of Object.values(musicLayers)) {
            if (layer) {
                layer.dispose();
            }
        }
        pendingTransitions.clear();
    };

    const getState: MusicDirector['getState'] = () => (lastState ? { ...lastState } : null);

    const setBeatCallback: MusicDirector['setBeatCallback'] = (callback) => {
        beatCallback = callback ?? null;
        if (!beatCallback && !measureCallback) {
            cancelBeatSchedule();
        } else {
            scheduleBeatEvents();
        }
    };

    const setMeasureCallback: MusicDirector['setMeasureCallback'] = (callback) => {
        measureCallback = callback ?? null;
        if (!beatCallback && !measureCallback) {
            cancelBeatSchedule();
        } else {
            scheduleBeatEvents();
        }
    };

    return {
        setState,
        getState,
        setEnabled,
        setBeatCallback,
        setMeasureCallback,
        triggerComboAccent,
        triggerGambleCountdown,
        dispose,
    };
};
