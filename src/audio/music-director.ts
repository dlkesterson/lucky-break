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
export type MusicLayerId = BaseLayerId | 'melody';

export interface MusicState {
    readonly lives: 1 | 2 | 3;
    readonly combo: number;
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
    nextSubdivision?(subdivision: string): number;
}

export interface MusicDirectorOptions {
    readonly transport?: TransportLike;
    readonly now?: () => number;
    readonly crossfadeSeconds?: number;
    readonly melodyFadeSeconds?: number;
    readonly comboBoostRate?: number;
    readonly comboBoostCap?: number;
    readonly layerFactory?: MusicLayerFactory;
    readonly layers?: Partial<Record<MusicLayerId, Partial<Omit<MusicLayerDefinition, 'id'>>>>;
}

export interface MusicDirector {
    readonly setState: (state: MusicState) => void;
    readonly getState: () => MusicState | null;
    readonly dispose: () => void;
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
        fadeInSeconds: 0.45,
        fadeOutSeconds: 0.35,
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
    }).sync();

    const gain = new Gain(0);
    player.connect(gain);
    gain.toDestination();

    let started = false;

    const ensureStarted = () => {
        if (started) {
            return;
        }
        player.start(0);
        started = true;
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

type TransitionKey = 'base' | 'melody';

export const createMusicDirector = (options: MusicDirectorOptions = {}): MusicDirector => {
    const transport = options.transport ?? Transport;
    const now = options.now ?? toneNow;
    const crossfadeSeconds = Math.max(0.05, options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS);
    const melodyFadeSeconds = Math.max(0.05, options.melodyFadeSeconds ?? crossfadeSeconds * 0.75);
    const comboBoostRate = options.comboBoostRate ?? 0.0125;
    const comboBoostCap = options.comboBoostCap ?? 0.3;
    const layerFactory = options.layerFactory ?? createToneMusicLayer;

    const definitions: Record<MusicLayerId, MusicLayerDefinition> = {
        calm: mergeLayerDefinition('calm', options.layers?.calm),
        intense: mergeLayerDefinition('intense', options.layers?.intense),
        melody: mergeLayerDefinition('melody', options.layers?.melody),
    };

    const calmLayer = layerFactory(definitions.calm, { now });
    const intenseLayer = layerFactory(definitions.intense, { now });
    const melodyLayer = layerFactory(definitions.melody, { now });
    const baseLayers: Record<BaseLayerId, MusicLayerHandle> = {
        calm: calmLayer,
        intense: intenseLayer,
    };

    for (const layer of [calmLayer, intenseLayer, melodyLayer]) {
        layer.ensureStarted();
        layer.setImmediate(0);
    }

    let disposed = false;
    let initialized = false;
    let currentBase: BaseLayerId = 'calm';
    const baseLevels: Record<BaseLayerId, number> = { calm: 0, intense: 0 };
    let melodyLevel = 0;
    let pendingBaseTarget: BaseLayerId | null = null;
    let pendingBaseLevel = 0;
    let pendingMelodyLevel: number | null = null;
    const pendingTransitions = new Map<TransitionKey, number>();
    let lastState: MusicState | null = null;

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
        const melodyTargetLevel = state.lives === 1
            ? clamp01(definitions.melody.baseLevel + boost * 0.5)
            : 0;

        baseLayers[baseKey].setImmediate(baseTargetLevel);
        baseLevels[baseKey] = baseTargetLevel;

        if (baseLevels[otherKey] > 0) {
            baseLayers[otherKey].setImmediate(0);
            baseLevels[otherKey] = 0;
        }

        melodyLayer.setImmediate(melodyTargetLevel);
        melodyLevel = melodyTargetLevel;
        currentBase = baseKey;
        initialized = true;
    };

    const updateBaseLayer = (target: BaseLayerId, level: number) => {
        const alreadyAtLevel = Math.abs(baseLevels[target] - level) <= LEVEL_EPSILON && currentBase === target;

        if (alreadyAtLevel && pendingBaseTarget === null) {
            return;
        }

        if (pendingBaseTarget === target && Math.abs(pendingBaseLevel - level) <= LEVEL_EPSILON) {
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

    const updateMelodyLayer = (level: number) => {
        const alreadyAtLevel = Math.abs(melodyLevel - level) <= LEVEL_EPSILON;
        if (alreadyAtLevel && pendingMelodyLevel === null) {
            return;
        }

        pendingMelodyLevel = level;

        scheduleTransition('melody', (time) => {
            if (disposed) {
                return;
            }

            melodyLayer.rampTo(level, time, melodyFadeSeconds);
            melodyLevel = level;
            pendingMelodyLevel = null;
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
        };

        if (!initialized) {
            applyInitialState(normalizedState);
            lastState = { ...normalizedState };
            return;
        }

        if (
            lastState &&
            lastState.lives === normalizedState.lives &&
            Math.abs(lastState.combo - normalizedState.combo) <= LEVEL_EPSILON
        ) {
            return;
        }

        const boost = computeComboBoost(normalizedState.combo, comboBoostRate, comboBoostCap);
        const baseTarget = selectBaseLayer(normalizedState.lives);
        const baseTargetLevel = clamp01(definitions[baseTarget].baseLevel + boost);
        const melodyTargetLevel = normalizedState.lives === 1
            ? clamp01(definitions.melody.baseLevel + boost * 0.5)
            : 0;

        updateBaseLayer(baseTarget, baseTargetLevel);
        updateMelodyLayer(melodyTargetLevel);
        lastState = { ...normalizedState };
    };

    const dispose: MusicDirector['dispose'] = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        cancelTransition('base');
        cancelTransition('melody');
        melodyLayer.dispose();
        calmLayer.dispose();
        intenseLayer.dispose();
        pendingTransitions.clear();
    };

    const getState: MusicDirector['getState'] = () => (lastState ? { ...lastState } : null);

    return {
        setState,
        getState,
        dispose,
    };
};
