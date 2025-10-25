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
export type MusicLayerId = BaseLayerId;

export interface MusicState {
    readonly lives: 1 | 2 | 3;
    readonly combo: number;
    readonly tempoRatio?: number;
    readonly paused?: boolean;
    readonly warbleIntensity?: number;
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
}

export interface MusicDirector {
    readonly setState: (state: MusicState) => void;
    readonly getState: () => MusicState | null;
    readonly setEnabled: (enabled: boolean) => void;
    readonly setBeatCallback: (callback: ((event: MusicBeatEvent) => void) | null) => void;
    readonly setMeasureCallback: (callback: ((event: MusicMeasureEvent) => void) | null) => void;
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

const selectBaseLayer = (lives: 1 | 2 | 3): BaseLayerId => (lives === 3 ? 'calm' : 'intense');

const otherBaseLayer = (layer: BaseLayerId): BaseLayerId => (layer === 'calm' ? 'intense' : 'calm');

type TransitionKey = 'base';

export const createMusicDirector = (options: MusicDirectorOptions = {}): MusicDirector => {
    const transport = options.transport ?? Transport;
    const now = options.now ?? toneNow;
    const crossfadeSeconds = Math.max(0.05, options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS);
    const comboBoostRate = options.comboBoostRate ?? 0.0125;
    const comboBoostCap = options.comboBoostCap ?? 0.3;
    const layerFactory = options.layerFactory ?? createToneMusicLayer;
    const beatsPerMeasure = Math.max(1, Math.round(options.beatsPerMeasure ?? 4));

    const definitions: Record<MusicLayerId, MusicLayerDefinition> = {
        calm: mergeLayerDefinition('calm', options.layers?.calm),
        intense: mergeLayerDefinition('intense', options.layers?.intense),
    };

    const calmLayer = layerFactory(definitions.calm, { now });
    const intenseLayer = layerFactory(definitions.intense, { now });
    const baseLayers: Record<BaseLayerId, MusicLayerHandle> = {
        calm: calmLayer,
        intense: intenseLayer,
    };

    for (const layer of [calmLayer, intenseLayer]) {
        layer.ensureStarted();
        layer.setImmediate(0);
    }

    let disposed = false;
    let initialized = false;
    let enabled = true;
    let currentBase: BaseLayerId = 'calm';
    const baseLevels: Record<BaseLayerId, number> = { calm: 0, intense: 0 };
    let pendingBaseTarget: BaseLayerId | null = null;
    let pendingBaseLevel = 0;
    const pendingTransitions = new Map<TransitionKey, number>();
    let lastState: MusicState | null = null;
    let beatCallback: ((event: MusicBeatEvent) => void) | null = null;
    let measureCallback: ((event: MusicMeasureEvent) => void) | null = null;
    let beatScheduleHandle: number | null = null;
    let beatIndex = 0;
    let measureIndex = 0;

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

    const applyInitialState = (state: MusicState) => {
        const baseKey = selectBaseLayer(state.lives);
        const boost = computeComboBoost(state.combo, comboBoostRate, comboBoostCap);
        const baseTargetLevel = clamp01(definitions[baseKey].baseLevel + boost);
        const otherKey = otherBaseLayer(baseKey);

        baseLayers[baseKey].setImmediate(baseTargetLevel);
        baseLevels[baseKey] = baseTargetLevel;

        if (baseLevels[otherKey] > 0) {
            baseLayers[otherKey].setImmediate(0);
            baseLevels[otherKey] = 0;
        }

        currentBase = baseKey;
        initialized = true;
    };

    const silenceLayers = (time: number) => {
        for (const key of ['calm', 'intense'] as const) {
            baseLayers[key].rampTo(0, time, crossfadeSeconds);
            baseLevels[key] = 0;
        }
    };

    const updateBaseLayer = (target: BaseLayerId, level: number) => {
        const recordedLevel = baseLevels[target];
        const actualLevel = baseLayers[target].getLevel();
        const recordedMatches = Math.abs(recordedLevel - level) <= LEVEL_EPSILON;
        const actualMatches = Math.abs(actualLevel - level) <= LEVEL_EPSILON;
        const alreadyAtLevel = currentBase === target && recordedMatches && actualMatches;

        if (alreadyAtLevel && pendingBaseTarget === null) {
            return;
        }

        if (
            pendingBaseTarget === target &&
            Math.abs(pendingBaseLevel - level) <= LEVEL_EPSILON &&
            actualMatches
        ) {
            return;
        }

        pendingBaseTarget = target;
        pendingBaseLevel = level;

        scheduleTransition('base', (time) => {
            if (disposed) {
                return;
            }

            const activeLayer = baseLayers[target];
            const inactiveKey = otherBaseLayer(target);
            const inactiveLayer = baseLayers[inactiveKey];

            activeLayer.rampTo(level, time, crossfadeSeconds);
            baseLevels[target] = level;

            const inactiveLevel = baseLevels[inactiveKey];
            if (inactiveLevel > LEVEL_EPSILON) {
                inactiveLayer.rampTo(0, time, crossfadeSeconds);
                baseLevels[inactiveKey] = 0;
            }

            currentBase = target;
            pendingBaseTarget = null;
        });
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
            tempoRatio: state.tempoRatio,
            paused: state.paused,
            warbleIntensity: state.warbleIntensity,
        };

        if (!enabled) {
            lastState = { ...normalizedState };
            return;
        }

        if (!initialized) {
            applyInitialState(normalizedState);
            lastState = { ...normalizedState };
            return;
        }

        const baseTarget = selectBaseLayer(normalizedState.lives);
        const baseMismatch = Math.abs(baseLayers[baseTarget].getLevel() - baseLevels[baseTarget]) > LEVEL_EPSILON * 2;

        if (
            lastState &&
            lastState.lives === normalizedState.lives &&
            Math.abs((lastState.combo ?? 0) - (normalizedState.combo ?? 0)) <= LEVEL_EPSILON &&
            !baseMismatch
        ) {
            lastState = { ...normalizedState };
            return;
        }

        const boost = computeComboBoost(normalizedState.combo, comboBoostRate, comboBoostCap);
        const baseTargetLevel = clamp01(definitions[baseTarget].baseLevel + boost);

        updateBaseLayer(baseTarget, baseTargetLevel);
        lastState = { ...normalizedState };
    };

    const setEnabled: MusicDirector['setEnabled'] = (value) => {
        if (disposed || enabled === value) {
            return;
        }

        enabled = value;

        if (!value) {
            cancelTransition('base');
            pendingBaseTarget = null;
            pendingBaseLevel = 0;
            cancelBeatSchedule();
            const start = now();
            silenceLayers(start);
            initialized = false;
            return;
        }

        pendingBaseTarget = null;
        pendingBaseLevel = 0;
        initialized = false;
        scheduleBeatEvents();
    };

    const dispose: MusicDirector['dispose'] = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        cancelTransition('base');
        cancelBeatSchedule();
        try {
            transport.cancel?.(now());
        } catch {
            // Best effort; ignore transport cancellation errors.
        }
        calmLayer.dispose();
        intenseLayer.dispose();
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
        dispose,
    };
};
