import { rootLogger, type Logger } from 'util/log';
import type { MidiPaletteConfig } from 'audio/midi-engine';

const STORAGE_KEY = 'lucky-break::meta-upgrades::v1';
const STATE_VERSION = 1;
const MAX_TRAIT_SLOTS = 2;

export type VisualPaletteId = 'baseline' | 'aurora-wave' | 'emberwake';
export type AudioPaletteId = 'baseline' | 'celestial-lattice' | 'thunderdrum';
export type TraitId = 'combo-buffer' | 'safety-net';

export type MetaUpgradeId = `visual:${VisualPaletteId}` | `audio:${AudioPaletteId}` | `trait:${TraitId}`;

export interface TraitEffectSummary {
    readonly extraLives: number;
    readonly comboDecayMultiplier: number;
}

interface TraitEffectDefinition {
    readonly extraLives?: number;
    readonly comboDecayMultiplier?: number;
}

interface VisualPaletteDefinition {
    readonly id: VisualPaletteId;
    readonly label: string;
    readonly description: string;
    readonly cost: number;
    readonly previewAccent: string;
    readonly ball?: {
        readonly core?: string;
        readonly aura?: string;
        readonly highlight?: string;
        readonly baseAlpha?: number;
        readonly rimAlpha?: number;
        readonly innerAlpha?: number;
        readonly innerScale?: number;
    };
    readonly paddle?: {
        readonly gradient?: readonly string[];
        readonly accentColor?: string;
        readonly pulseStrength?: number;
        readonly motionGlow?: number;
    };
    readonly accents?: {
        readonly combo?: string;
        readonly powerUp?: string;
        readonly background?: readonly string[];
    };
}

interface AudioPaletteDefinition {
    readonly id: AudioPaletteId;
    readonly label: string;
    readonly description: string;
    readonly cost: number;
    readonly config: MidiPaletteConfig;
}

interface TraitDefinition {
    readonly id: TraitId;
    readonly label: string;
    readonly description: string;
    readonly cost: number;
    readonly effect: TraitEffectDefinition;
}

const VISUAL_PALETTES: readonly VisualPaletteDefinition[] = Object.freeze([
    {
        id: 'baseline',
        label: 'Baseline Prism',
        description: 'Default palette tuned for clarity and contrast.',
        cost: 0,
        previewAccent: '#FFD04A',
    },
    {
        id: 'aurora-wave',
        label: 'Aurora Wave',
        description: 'Iridescent blues and violets that ebb with every beat.',
        cost: 120,
        previewAccent: '#91C1FF',
        ball: {
            core: '#F9FBFF',
            aura: '#A8E0FF',
            highlight: '#FFFFFF',
            baseAlpha: 0.82,
            innerAlpha: 0.36,
        },
        paddle: {
            gradient: ['#4158D0', '#C850C0'],
            accentColor: '#7BDFFF',
            pulseStrength: 0.3,
            motionGlow: 0.4,
        },
        accents: {
            combo: '#B7F0FF',
            powerUp: '#6F9BFF',
            background: ['#132347', '#27406D', '#3B5B96'],
        },
    },
    {
        id: 'emberwake',
        label: 'Emberwake',
        description: 'Molten embers and soot-streaked highlights for the daring.',
        cost: 140,
        previewAccent: '#FF8738',
        ball: {
            core: '#FFE2C6',
            aura: '#FFB088',
            highlight: '#FFFFFF',
            baseAlpha: 0.76,
            innerAlpha: 0.28,
        },
        paddle: {
            gradient: ['#4B1D12', '#FF5E2B'],
            accentColor: '#FFD2AE',
            pulseStrength: 0.22,
            motionGlow: 0.3,
        },
        accents: {
            combo: '#FFB45E',
            powerUp: '#FF7033',
            background: ['#1C0D0A', '#30120D', '#45190F'],
        },
    },
]);

const AUDIO_PALETTES: readonly AudioPaletteDefinition[] = Object.freeze([
    {
        id: 'baseline',
        label: 'Baseline Ensemble',
        description: 'Balanced instrumentation designed for broad appeal.',
        cost: 0,
        config: {},
    },
    {
        id: 'celestial-lattice',
        label: 'Celestial Lattice',
        description: 'Glass harmonics and lydian flourishes that reward clean play.',
        cost: 160,
        config: {
            scalePatterns: [
                [60, 64, 67, 71, 74, 76, 79, 83],
                [62, 66, 69, 73, 76, 78, 81, 85],
                [57, 61, 64, 68, 71, 73, 76, 80],
            ],
            brickSynth: {
                oscillatorType: 'sine',
                envelope: { attack: 0.01, decay: 0.18, sustain: 0.2, release: 0.65 },
                volume: -10,
            },
            chimeSynth: {
                oscillatorType: 'triangle',
                envelope: { attack: 0.005, decay: 0.22, sustain: 0.18, release: 0.7 },
                volume: -6,
            },
            comboVelocityBias: 0.08,
            powerUpSequence: [79, 83, 88],
        },
    },
    {
        id: 'thunderdrum',
        label: 'Thunderdrum Line',
        description: 'Percussive resonance with aggressive stabs for high stakes.',
        cost: 150,
        config: {
            scalePatterns: [
                [48, 51, 55, 58, 62, 65, 69, 72],
                [50, 53, 57, 60, 64, 67, 71, 74],
                [43, 46, 50, 53, 57, 60, 64, 67],
            ],
            brickSynth: {
                oscillatorType: 'square',
                envelope: { attack: 0.003, decay: 0.16, sustain: 0.12, release: 0.4 },
                volume: -8,
            },
            percussion: {
                volume: -6,
                pitchDecay: 0.04,
                octaves: 1.6,
            },
            comboVelocityBias: 0.15,
            wallHitNoteBase: 34,
        },
    },
]);

const TRAITS: readonly TraitDefinition[] = Object.freeze([
    {
        id: 'combo-buffer',
        label: 'Combo Buffer',
        description: 'Extends combo decay timer by 10% to keep streaks alive.',
        cost: 80,
        effect: {
            comboDecayMultiplier: 1.1,
        },
    },
    {
        id: 'safety-net',
        label: 'Safety Net',
        description: 'Start each run with one additional life.',
        cost: 110,
        effect: {
            extraLives: 1,
        },
    },
]);

type VisualPaletteLookup = Map<VisualPaletteId, VisualPaletteDefinition>;
type AudioPaletteLookup = Map<AudioPaletteId, AudioPaletteDefinition>;
type TraitLookup = Map<TraitId, TraitDefinition>;

const VISUAL_LOOKUP: VisualPaletteLookup = new Map(VISUAL_PALETTES.map((definition) => [definition.id, definition]));
const AUDIO_LOOKUP: AudioPaletteLookup = new Map(AUDIO_PALETTES.map((definition) => [definition.id, definition]));
const TRAIT_LOOKUP: TraitLookup = new Map(TRAITS.map((definition) => [definition.id, definition]));

const isVisualPaletteId = (value: unknown): value is VisualPaletteId =>
    typeof value === 'string' && VISUAL_LOOKUP.has(value as VisualPaletteId);

const isAudioPaletteId = (value: unknown): value is AudioPaletteId =>
    typeof value === 'string' && AUDIO_LOOKUP.has(value as AudioPaletteId);

const isTraitId = (value: unknown): value is TraitId => typeof value === 'string' && TRAIT_LOOKUP.has(value as TraitId);

interface PersistedUnlockedState {
    readonly visualPalettes?: unknown;
    readonly audioPalettes?: unknown;
    readonly traits?: unknown;
}

interface PersistedEquippedState {
    readonly visualPalette?: unknown;
    readonly audioPalette?: unknown;
    readonly traits?: unknown;
}

interface PersistedMetaUpgradeState {
    readonly version?: unknown;
    readonly dust?: unknown;
    readonly unlocked?: PersistedUnlockedState;
    readonly equipped?: PersistedEquippedState;
}

interface MetaUpgradeInternalState {
    dust: number;
    unlocked: {
        visualPalettes: VisualPaletteId[];
        audioPalettes: AudioPaletteId[];
        traits: TraitId[];
    };
    equipped: {
        visualPalette: VisualPaletteId;
        audioPalette: AudioPaletteId;
        traits: TraitId[];
    };
}

const DEFAULT_STATE: MetaUpgradeInternalState = {
    dust: 0,
    unlocked: {
        visualPalettes: ['baseline'],
        audioPalettes: ['baseline'],
        traits: [],
    },
    equipped: {
        visualPalette: 'baseline',
        audioPalette: 'baseline',
        traits: [],
    },
};

const resolveStorage = (explicit?: Storage | null): Storage | null => {
    if (explicit !== undefined) {
        return explicit;
    }
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch (error) {
        void error;
    }
    return null;
};

const sanitizeNumber = (value: unknown, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return value;
};

const sanitizeIdArray = <Id extends string>(
    value: unknown,
    predicate: (candidate: unknown) => candidate is Id,
): Id[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<Id>();
    const sanitized: Id[] = [];
    for (const candidate of value) {
        if (!predicate(candidate)) {
            continue;
        }
        if (seen.has(candidate)) {
            continue;
        }
        seen.add(candidate);
        sanitized.push(candidate);
    }
    return sanitized;
};

const sanitizeUnlocked = (value: PersistedUnlockedState | undefined): MetaUpgradeInternalState['unlocked'] => {
    const base = DEFAULT_STATE.unlocked;
    if (!value || typeof value !== 'object') {
        return {
            visualPalettes: [...base.visualPalettes],
            audioPalettes: [...base.audioPalettes],
            traits: [...base.traits],
        } satisfies MetaUpgradeInternalState['unlocked'];
    }

    const visualPalettes = sanitizeIdArray(value.visualPalettes, isVisualPaletteId);
    if (!visualPalettes.includes('baseline')) {
        visualPalettes.unshift('baseline');
    }

    const audioPalettes = sanitizeIdArray(value.audioPalettes, isAudioPaletteId);
    if (!audioPalettes.includes('baseline')) {
        audioPalettes.unshift('baseline');
    }

    const traits = sanitizeIdArray(value.traits, isTraitId);

    return {
        visualPalettes,
        audioPalettes,
        traits,
    } satisfies MetaUpgradeInternalState['unlocked'];
};

const sanitizeEquipped = (
    value: PersistedEquippedState | undefined,
    unlocked: MetaUpgradeInternalState['unlocked'],
): MetaUpgradeInternalState['equipped'] => {
    if (!value || typeof value !== 'object') {
        return {
            visualPalette: unlocked.visualPalettes[0] ?? 'baseline',
            audioPalette: unlocked.audioPalettes[0] ?? 'baseline',
            traits: [],
        } satisfies MetaUpgradeInternalState['equipped'];
    }

    const visualCandidate = value.visualPalette;
    const audioCandidate = value.audioPalette;
    const traitCandidates = value.traits;

    const visualPalette = isVisualPaletteId(visualCandidate) && unlocked.visualPalettes.includes(visualCandidate)
        ? visualCandidate
        : unlocked.visualPalettes[0] ?? 'baseline';

    const audioPalette = isAudioPaletteId(audioCandidate) && unlocked.audioPalettes.includes(audioCandidate)
        ? audioCandidate
        : unlocked.audioPalettes[0] ?? 'baseline';

    const traits = sanitizeIdArray(traitCandidates, isTraitId).filter((id) => unlocked.traits.includes(id)).slice(0, MAX_TRAIT_SLOTS);

    return {
        visualPalette,
        audioPalette,
        traits,
    } satisfies MetaUpgradeInternalState['equipped'];
};

const readState = (storage: Storage | null, logger: Logger): MetaUpgradeInternalState => {
    if (!storage) {
        return {
            dust: DEFAULT_STATE.dust,
            unlocked: {
                visualPalettes: [...DEFAULT_STATE.unlocked.visualPalettes],
                audioPalettes: [...DEFAULT_STATE.unlocked.audioPalettes],
                traits: [...DEFAULT_STATE.unlocked.traits],
            },
            equipped: {
                visualPalette: DEFAULT_STATE.equipped.visualPalette,
                audioPalette: DEFAULT_STATE.equipped.audioPalette,
                traits: [...DEFAULT_STATE.equipped.traits],
            },
        } satisfies MetaUpgradeInternalState;
    }

    try {
        const payload = storage.getItem(STORAGE_KEY);
        if (!payload) {
            return {
                dust: DEFAULT_STATE.dust,
                unlocked: {
                    visualPalettes: [...DEFAULT_STATE.unlocked.visualPalettes],
                    audioPalettes: [...DEFAULT_STATE.unlocked.audioPalettes],
                    traits: [...DEFAULT_STATE.unlocked.traits],
                },
                equipped: {
                    visualPalette: DEFAULT_STATE.equipped.visualPalette,
                    audioPalette: DEFAULT_STATE.equipped.audioPalette,
                    traits: [...DEFAULT_STATE.equipped.traits],
                },
            } satisfies MetaUpgradeInternalState;
        }
        const parsed = JSON.parse(payload) as PersistedMetaUpgradeState;
        if (!parsed || typeof parsed !== 'object') {
            return {
                dust: DEFAULT_STATE.dust,
                unlocked: {
                    visualPalettes: [...DEFAULT_STATE.unlocked.visualPalettes],
                    audioPalettes: [...DEFAULT_STATE.unlocked.audioPalettes],
                    traits: [...DEFAULT_STATE.unlocked.traits],
                },
                equipped: {
                    visualPalette: DEFAULT_STATE.equipped.visualPalette,
                    audioPalette: DEFAULT_STATE.equipped.audioPalette,
                    traits: [...DEFAULT_STATE.equipped.traits],
                },
            } satisfies MetaUpgradeInternalState;
        }

        const dust = Math.max(0, Math.floor(sanitizeNumber(parsed.dust, DEFAULT_STATE.dust)));
        const unlocked = sanitizeUnlocked(parsed.unlocked);
        const equipped = sanitizeEquipped(parsed.equipped, unlocked);

        return {
            dust,
            unlocked,
            equipped,
        } satisfies MetaUpgradeInternalState;
    } catch (error) {
        logger.warn('Failed to read meta upgrades state; using defaults', { error });
        return {
            dust: DEFAULT_STATE.dust,
            unlocked: {
                visualPalettes: [...DEFAULT_STATE.unlocked.visualPalettes],
                audioPalettes: [...DEFAULT_STATE.unlocked.audioPalettes],
                traits: [...DEFAULT_STATE.unlocked.traits],
            },
            equipped: {
                visualPalette: DEFAULT_STATE.equipped.visualPalette,
                audioPalette: DEFAULT_STATE.equipped.audioPalette,
                traits: [...DEFAULT_STATE.equipped.traits],
            },
        } satisfies MetaUpgradeInternalState;
    }
};

const writeState = (storage: Storage | null, state: MetaUpgradeInternalState, logger: Logger): void => {
    if (!storage) {
        return;
    }

    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: STATE_VERSION,
                dust: state.dust,
                unlocked: state.unlocked,
                equipped: state.equipped,
            } satisfies PersistedMetaUpgradeState),
        );
    } catch (error) {
        logger.warn('Failed to persist meta upgrades state', { error });
    }
};

export interface MetaUpgradeSnapshot {
    readonly version: number;
    readonly dustBalance: number;
    readonly unlocked: {
        readonly visualPalettes: readonly VisualPaletteId[];
        readonly audioPalettes: readonly AudioPaletteId[];
        readonly traits: readonly TraitId[];
    };
    readonly equipped: {
        readonly visualPalette: VisualPaletteId;
        readonly audioPalette: AudioPaletteId;
        readonly traits: readonly TraitId[];
    };
}

export interface MetaUpgradeCatalog {
    readonly visualPalettes: readonly VisualPaletteDefinition[];
    readonly audioPalettes: readonly AudioPaletteDefinition[];
    readonly traits: readonly TraitDefinition[];
}

export interface MetaUpgradeLoadout {
    readonly visualPalette: VisualPaletteDefinition;
    readonly audioPalette: AudioPaletteDefinition;
    readonly traitEffects: TraitEffectSummary;
}

export interface MetaUpgradeGrantResult {
    readonly dustBalance: number;
    readonly snapshot: MetaUpgradeSnapshot;
}

export type MetaUpgradeActionReason =
    | 'not-found'
    | 'already-unlocked'
    | 'insufficient-dust'
    | 'locked'
    | 'trait-slots-full';

export interface MetaUpgradeActionResult {
    readonly success: boolean;
    readonly reason?: MetaUpgradeActionReason;
    readonly snapshot: MetaUpgradeSnapshot;
}

export interface MetaUpgradeManagerOptions {
    readonly storage?: Storage | null;
    readonly now?: () => number;
    readonly logger?: Logger;
}

export type MetaUpgradeListener = (snapshot: MetaUpgradeSnapshot) => void;

export interface MetaUpgradeManager {
    readonly getSnapshot: () => MetaUpgradeSnapshot;
    readonly getCatalog: () => MetaUpgradeCatalog;
    readonly getLoadout: () => MetaUpgradeLoadout;
    readonly grantDust: (amount: number) => MetaUpgradeGrantResult;
    readonly purchase: (upgradeId: MetaUpgradeId) => MetaUpgradeActionResult;
    readonly equipVisualPalette: (id: VisualPaletteId) => MetaUpgradeActionResult;
    readonly equipAudioPalette: (id: AudioPaletteId) => MetaUpgradeActionResult;
    readonly toggleTrait: (id: TraitId) => MetaUpgradeActionResult;
    readonly subscribe: (listener: MetaUpgradeListener) => () => void;
}

const cloneSnapshot = (state: MetaUpgradeInternalState): MetaUpgradeSnapshot => ({
    version: STATE_VERSION,
    dustBalance: state.dust,
    unlocked: {
        visualPalettes: [...state.unlocked.visualPalettes],
        audioPalettes: [...state.unlocked.audioPalettes],
        traits: [...state.unlocked.traits],
    },
    equipped: {
        visualPalette: state.equipped.visualPalette,
        audioPalette: state.equipped.audioPalette,
        traits: [...state.equipped.traits],
    },
});

const applyTraitEffects = (traitIds: readonly TraitId[]): TraitEffectSummary => {
    let extraLives = 0;
    let comboMultiplier = 1;
    for (const id of traitIds) {
        const definition = TRAIT_LOOKUP.get(id);
        if (!definition) {
            continue;
        }
        const effect = definition.effect;
        if (typeof effect.extraLives === 'number' && Number.isFinite(effect.extraLives)) {
            extraLives += effect.extraLives;
        }
        if (typeof effect.comboDecayMultiplier === 'number' && Number.isFinite(effect.comboDecayMultiplier)) {
            comboMultiplier *= effect.comboDecayMultiplier;
        }
    }
    return {
        extraLives,
        comboDecayMultiplier: comboMultiplier,
    } satisfies TraitEffectSummary;
};

const resolveVisualPalette = (state: MetaUpgradeInternalState): VisualPaletteDefinition =>
    VISUAL_LOOKUP.get(state.equipped.visualPalette) ?? VISUAL_LOOKUP.get('baseline')!;

const resolveAudioPalette = (state: MetaUpgradeInternalState): AudioPaletteDefinition =>
    AUDIO_LOOKUP.get(state.equipped.audioPalette) ?? AUDIO_LOOKUP.get('baseline')!;

const buildLoadout = (state: MetaUpgradeInternalState): MetaUpgradeLoadout => ({
    visualPalette: resolveVisualPalette(state),
    audioPalette: resolveAudioPalette(state),
    traitEffects: applyTraitEffects(state.equipped.traits),
});

export const createMetaUpgradeManager = (options: MetaUpgradeManagerOptions = {}): MetaUpgradeManager => {
    const logger = options.logger ?? rootLogger.child('meta-upgrades');
    const storage = resolveStorage(options.storage);
    const now = options.now ?? Date.now;

    const state: MetaUpgradeInternalState = readState(storage, logger);

    const listeners = new Set<MetaUpgradeListener>();

    const emit = () => {
        const snapshot = cloneSnapshot(state);
        for (const listener of listeners) {
            try {
                listener(snapshot);
            } catch (error) {
                logger.warn('Meta upgrade listener failed', { error });
            }
        }
    };

    const persist = () => {
        writeState(storage, state, logger);
    };

    const getSnapshot: MetaUpgradeManager['getSnapshot'] = () => cloneSnapshot(state);

    const getCatalog: MetaUpgradeManager['getCatalog'] = () => ({
        visualPalettes: VISUAL_PALETTES,
        audioPalettes: AUDIO_PALETTES,
        traits: TRAITS,
    });

    const getLoadout: MetaUpgradeManager['getLoadout'] = () => buildLoadout(state);

    const grantDust: MetaUpgradeManager['grantDust'] = (amount) => {
        if (!Number.isFinite(amount) || amount <= 0) {
            return {
                dustBalance: state.dust,
                snapshot: cloneSnapshot(state),
            } satisfies MetaUpgradeGrantResult;
        }
        const normalized = Math.floor(amount);
        if (normalized <= 0) {
            return {
                dustBalance: state.dust,
                snapshot: cloneSnapshot(state),
            } satisfies MetaUpgradeGrantResult;
        }
        const before = state.dust;
        state.dust = Math.max(0, before + normalized);
        persist();
        emit();
        logger.info('Granted certainty dust', { amount: normalized, balance: state.dust, at: now() });
        return {
            dustBalance: state.dust,
            snapshot: cloneSnapshot(state),
        } satisfies MetaUpgradeGrantResult;
    };

    const respond = (success: boolean, reason?: MetaUpgradeActionReason): MetaUpgradeActionResult => ({
        success,
        reason,
        snapshot: cloneSnapshot(state),
    });

    const purchase: MetaUpgradeManager['purchase'] = (upgradeId) => {
        const [kind, rawId] = upgradeId.split(':', 2) as [string, string];
        if (kind === 'visual') {
            if (!isVisualPaletteId(rawId)) {
                return respond(false, 'not-found');
            }
            if (state.unlocked.visualPalettes.includes(rawId)) {
                return respond(false, 'already-unlocked');
            }
            const definition = VISUAL_LOOKUP.get(rawId);
            if (!definition) {
                return respond(false, 'not-found');
            }
            if (state.dust < definition.cost) {
                return respond(false, 'insufficient-dust');
            }
            state.dust -= definition.cost;
            state.unlocked.visualPalettes.push(rawId);
            state.equipped.visualPalette = rawId;
            persist();
            emit();
            logger.info('Unlocked visual palette', { id: rawId, cost: definition.cost });
            return respond(true);
        }
        if (kind === 'audio') {
            if (!isAudioPaletteId(rawId)) {
                return respond(false, 'not-found');
            }
            if (state.unlocked.audioPalettes.includes(rawId)) {
                return respond(false, 'already-unlocked');
            }
            const definition = AUDIO_LOOKUP.get(rawId);
            if (!definition) {
                return respond(false, 'not-found');
            }
            if (state.dust < definition.cost) {
                return respond(false, 'insufficient-dust');
            }
            state.dust -= definition.cost;
            state.unlocked.audioPalettes.push(rawId);
            state.equipped.audioPalette = rawId;
            persist();
            emit();
            logger.info('Unlocked audio palette', { id: rawId, cost: definition.cost });
            return respond(true);
        }
        if (kind === 'trait') {
            if (!isTraitId(rawId)) {
                return respond(false, 'not-found');
            }
            if (state.unlocked.traits.includes(rawId)) {
                return respond(false, 'already-unlocked');
            }
            const definition = TRAIT_LOOKUP.get(rawId);
            if (!definition) {
                return respond(false, 'not-found');
            }
            if (state.dust < definition.cost) {
                return respond(false, 'insufficient-dust');
            }
            state.dust -= definition.cost;
            state.unlocked.traits.push(rawId);
            if (state.equipped.traits.length < MAX_TRAIT_SLOTS) {
                state.equipped.traits = [...state.equipped.traits, rawId];
            }
            persist();
            emit();
            logger.info('Unlocked trait', { id: rawId, cost: definition.cost });
            return respond(true);
        }
        return respond(false, 'not-found');
    };

    const equipVisualPalette: MetaUpgradeManager['equipVisualPalette'] = (id) => {
        if (!state.unlocked.visualPalettes.includes(id)) {
            return respond(false, 'locked');
        }
        if (state.equipped.visualPalette === id) {
            return respond(true);
        }
        state.equipped.visualPalette = id;
        persist();
        emit();
        logger.info('Equipped visual palette', { id });
        return respond(true);
    };

    const equipAudioPalette: MetaUpgradeManager['equipAudioPalette'] = (id) => {
        if (!state.unlocked.audioPalettes.includes(id)) {
            return respond(false, 'locked');
        }
        if (state.equipped.audioPalette === id) {
            return respond(true);
        }
        state.equipped.audioPalette = id;
        persist();
        emit();
        logger.info('Equipped audio palette', { id });
        return respond(true);
    };

    const toggleTrait: MetaUpgradeManager['toggleTrait'] = (id) => {
        if (!state.unlocked.traits.includes(id)) {
            return respond(false, 'locked');
        }
        const index = state.equipped.traits.indexOf(id);
        if (index >= 0) {
            const next = state.equipped.traits.slice();
            next.splice(index, 1);
            state.equipped.traits = next;
            persist();
            emit();
            logger.info('Unequipped trait', { id });
            return respond(true);
        }
        if (state.equipped.traits.length >= MAX_TRAIT_SLOTS) {
            return respond(false, 'trait-slots-full');
        }
        state.equipped.traits = [...state.equipped.traits, id];
        persist();
        emit();
        logger.info('Equipped trait', { id });
        return respond(true);
    };

    const subscribe: MetaUpgradeManager['subscribe'] = (listener) => {
        listeners.add(listener);
        try {
            listener(cloneSnapshot(state));
        } catch (error) {
            logger.warn('Meta upgrade listener failed during subscription', { error });
        }
        return () => {
            listeners.delete(listener);
        };
    };

    return {
        getSnapshot,
        getCatalog,
        getLoadout,
        grantDust,
        purchase,
        equipVisualPalette,
        equipAudioPalette,
        toggleTrait,
        subscribe,
    } satisfies MetaUpgradeManager;
};

export const resetMetaUpgradeStorageForTests = (storage?: Storage | null): void => {
    const target = resolveStorage(storage);
    try {
        target?.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
};
