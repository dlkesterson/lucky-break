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
