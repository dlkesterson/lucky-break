import {
    loadoutForms,
    loadoutTraits,
    loadoutSigils,
    loadoutVoices,
    defaultLoadoutSelection,
    mergeLoadoutEffects,
    type LoadoutSelection,
    type LoadoutCategoryId,
    type LoadoutCombinedEffects,
    type LoadoutFormId,
    type LoadoutTraitId,
    type LoadoutSigilId,
    type LoadoutVoiceId,
    type LoadoutBallShape,
} from 'config/loadouts';

export interface LoadoutSceneOption {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly effectSummary: readonly string[];
}

export interface LoadoutSceneCategory {
    readonly id: LoadoutCategoryId;
    readonly label: string;
    readonly prompt: string;
    readonly options: readonly LoadoutSceneOption[];
}

export interface LoadoutEffectsBundle {
    readonly selection: LoadoutSelection;
    readonly combined: LoadoutCombinedEffects;
}

export type LoadoutPreviewEffect = 'echo-trails' | 'vortex-field' | null;

export interface LoadoutFormPreset {
    readonly id: LoadoutFormId;
    readonly name: string;
    readonly description: string;
    readonly cardSummary: readonly string[];
    readonly combinedSummary: readonly string[];
    readonly selection: LoadoutSelection;
    readonly trait: LoadoutSceneOption & { readonly id: LoadoutTraitId };
    readonly sigil: LoadoutSceneOption & { readonly id: LoadoutSigilId };
    readonly voice: LoadoutSceneOption & { readonly id: LoadoutVoiceId };
    readonly preview: {
        readonly baseColor: number;
        readonly accentColor: number;
        readonly shape: LoadoutBallShape;
        readonly effect: LoadoutPreviewEffect;
    };
}

const mapToSceneOption = <Id extends string>(definition: { id: Id; name: string; description: string; effectSummary: readonly string[] }): LoadoutSceneOption => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    effectSummary: definition.effectSummary,
});

export const buildLoadoutSceneCategories = (): readonly LoadoutSceneCategory[] => [
    {
        id: 'form',
        label: 'Form',
        prompt: 'Shape Mayhaps into this form',
        options: loadoutForms.map(mapToSceneOption),
    },
    {
        id: 'trait',
        label: 'Core Trait',
        prompt: 'Choose Mayhaps\' guiding impulse',
        options: loadoutTraits.map(mapToSceneOption),
    },
    {
        id: 'sigil',
        label: 'Sigil',
        prompt: 'Bind a persistent aura',
        options: loadoutSigils.map(mapToSceneOption),
    },
    {
        id: 'voice',
        label: 'Voice',
        prompt: 'Let Mayhaps sing with this timbre',
        options: loadoutVoices.map(mapToSceneOption),
    },
];

const findOption = <Definition extends { id: string }>(collection: readonly Definition[], id: string): Definition | null => {
    return collection.find((item) => item.id === id) ?? null;
};

const FORM_PRESETS: Record<LoadoutFormId, { trait: LoadoutTraitId; sigil: LoadoutSigilId; voice: LoadoutVoiceId }> = {
    'ivory-orb': {
        trait: 'fortune-favored',
        sigil: 'luck-rune',
        voice: 'chime',
    },
    'nebular-jelly': {
        trait: "drifters-calm",
        sigil: 'serene-eye',
        voice: 'whisper',
    },
    'd20-diceform': {
        trait: 'entropy-bound',
        sigil: 'chaos-knot',
        voice: 'pulse',
    },
    'stop-sign': {
        trait: 'fortune-favored',
        sigil: 'luck-rune',
        voice: 'chime',
    },
    'crystal-probability': {
        trait: 'stable-bias',
        sigil: 'void-bloom',
        voice: 'static-choir',
    },
    'entropy-core': {
        trait: 'double-edged',
        sigil: 'mirror-spiral',
        voice: 'coinfall',
    },
    'shadow-mirage': {
        trait: 'fortune-favored',
        sigil: 'mirror-spiral',
        voice: 'whisper',
    },
    'vortex-weaver': {
        trait: 'entropy-bound',
        sigil: 'void-bloom',
        voice: 'pulse',
    },
};

const DEFAULT_PREVIEW = {
    baseColor: 0xf4f4f4,
    accentColor: 0xffcc66,
    shape: 'sphere' as LoadoutBallShape,
    effect: null as LoadoutPreviewEffect,
} as const;

const uniqueSummary = (entries: readonly string[]): readonly string[] => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const entry of entries) {
        if (seen.has(entry)) {
            continue;
        }
        seen.add(entry);
        ordered.push(entry);
    }
    return ordered;
};

const resolveSceneOption = <Id extends string>(collection: readonly { id: Id; name: string; description: string; effectSummary: readonly string[] }[], id: Id): (LoadoutSceneOption & { readonly id: Id }) => {
    const option = findOption(collection, id);
    if (!option) {
        throw new Error(`Expected loadout option with id "${id}"`);
    }
    return {
        id: option.id,
        name: option.name,
        description: option.description,
        effectSummary: option.effectSummary,
    };
};

export const buildLoadoutFormPresets = (): readonly LoadoutFormPreset[] =>
    loadoutForms.map((form) => {
        const mapping = FORM_PRESETS[form.id] ?? FORM_PRESETS[defaultLoadoutSelection.form];
        const trait = resolveSceneOption(loadoutTraits, mapping.trait);
        const sigil = resolveSceneOption(loadoutSigils, mapping.sigil);
        const voice = resolveSceneOption(loadoutVoices, mapping.voice);
        const selection: LoadoutSelection = {
            form: form.id,
            trait: trait.id,
            sigil: sigil.id,
            voice: voice.id,
        };
        const combinedSummary = uniqueSummary([
            ...form.effectSummary,
            ...trait.effectSummary,
            ...sigil.effectSummary,
            ...voice.effectSummary,
        ]);
        const cardSummary = uniqueSummary(form.effectSummary);
        const previewVisuals = form.contribution.visuals?.ball;

        // Determine visual effect based on loadout form
        let effect: LoadoutPreviewEffect = null;
        if (form.id === 'shadow-mirage') {
            effect = 'echo-trails';
        } else if (form.id === 'vortex-weaver') {
            effect = 'vortex-field';
        }

        const preview = previewVisuals
            ? {
                baseColor: previewVisuals.baseColor ?? DEFAULT_PREVIEW.baseColor,
                accentColor: previewVisuals.innerColor
                    ?? previewVisuals.rimColor
                    ?? DEFAULT_PREVIEW.accentColor,
                shape: previewVisuals.shape ?? DEFAULT_PREVIEW.shape,
                effect,
            }
            : { ...DEFAULT_PREVIEW, effect };
        return {
            id: form.id,
            name: form.name,
            description: form.description,
            cardSummary,
            combinedSummary,
            selection,
            trait,
            sigil,
            voice,
            preview,
        } satisfies LoadoutFormPreset;
    });

export const normalizeLoadoutSelection = (selection: Partial<LoadoutSelection> | null | undefined): LoadoutSelection => ({
    form: selection?.form && findOption(loadoutForms, selection.form) ? selection.form : defaultLoadoutSelection.form,
    trait: selection?.trait && findOption(loadoutTraits, selection.trait) ? selection.trait : defaultLoadoutSelection.trait,
    sigil: selection?.sigil && findOption(loadoutSigils, selection.sigil) ? selection.sigil : defaultLoadoutSelection.sigil,
    voice: selection?.voice && findOption(loadoutVoices, selection.voice) ? selection.voice : defaultLoadoutSelection.voice,
});

export const computeLoadoutEffects = (selection: LoadoutSelection): LoadoutEffectsBundle => {
    const form = findOption(loadoutForms, selection.form);
    const trait = findOption(loadoutTraits, selection.trait);
    const sigil = findOption(loadoutSigils, selection.sigil);
    const voice = findOption(loadoutVoices, selection.voice);

    if (!form || !trait || !sigil || !voice) {
        const normalized = normalizeLoadoutSelection(selection);
        return computeLoadoutEffects(normalized);
    }

    const combined = mergeLoadoutEffects([
        form.contribution,
        trait.contribution,
        sigil.contribution,
        voice.contribution,
    ]);

    return {
        selection,
        combined,
    } satisfies LoadoutEffectsBundle;
};
