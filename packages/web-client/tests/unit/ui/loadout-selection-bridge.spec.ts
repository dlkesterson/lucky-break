import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadoutSelection } from 'config/loadouts';
import type { LoadoutFormPreset } from 'app/runtime/loadouts';
import { loadoutSelectionUiBridge, useLoadoutSelectionUi, type LoadoutSelectionUiPayload } from 'ui/state/loadout-selection-bridge';

const baseSelection: LoadoutSelection = {
    form: 'ivory-orb',
    trait: 'fortune-favored',
    sigil: 'luck-rune',
    voice: 'chime',
};

const createPreset = (): LoadoutFormPreset => ({
    id: 'ivory-orb',
    name: 'Polished Ivory Orb',
    description: 'Baseline Mayhaps form.',
    cardSummary: ['Balanced control'],
    combinedSummary: ['Balanced control'],
    selection: baseSelection,
    trait: {
        id: 'fortune-favored',
        name: 'Fortune Favored',
        description: 'Increases luck.',
        effectSummary: ['Lucky bounces'],
    },
    sigil: {
        id: 'luck-rune',
        name: 'Luck Rune',
        description: 'Imbues luck.',
        effectSummary: ['Lucky aura'],
    },
    voice: {
        id: 'chime',
        name: 'Chime',
        description: 'Resonant tone.',
        effectSummary: ['Resonant tone'],
    },
    preview: { baseColor: 0xffffff, accentColor: 0x000000 },
});

const resetLoadoutState = () => {
    useLoadoutSelectionUi.setState(
        {
            visible: false,
            suspended: false,
            presets: [],
            lockedForms: [],
            defaultFormId: null,
            commitSelection: undefined,
        },
        true,
    );
};

describe('loadoutSelectionUiBridge', () => {
    beforeEach(() => {
        resetLoadoutState();
    });

    it('enters with payload and allows committing selection', async () => {
        const commitSelection = vi.fn().mockResolvedValue(undefined);
        const preset = createPreset();
        const payload: LoadoutSelectionUiPayload = {
            presets: [preset],
            lockedForms: ['nebular-jelly'] as const,
            defaultFormId: 'ivory-orb',
            commitSelection,
        };

        loadoutSelectionUiBridge.enter(payload);

        const active = useLoadoutSelectionUi.getState();
        expect(active.visible).toBe(true);
        expect(active.suspended).toBe(false);
        expect(active.presets).toEqual([preset]);
        expect(active.lockedForms).toEqual(['nebular-jelly']);
        expect(active.defaultFormId).toBe('ivory-orb');
        expect(active.commitSelection).toBeTruthy();

        await active.commitSelection?.(baseSelection);
        expect(commitSelection).toHaveBeenCalledWith(baseSelection);

        loadoutSelectionUiBridge.exit();
        const reset = useLoadoutSelectionUi.getState();
        expect(reset).toEqual({
            visible: false,
            suspended: false,
            presets: [],
            lockedForms: [],
            defaultFormId: null,
            commitSelection: undefined,
        });
    });

    it('controls suspension lifecycle', () => {
        loadoutSelectionUiBridge.suspend();
        expect(useLoadoutSelectionUi.getState().suspended).toBe(false);

        const payload: LoadoutSelectionUiPayload = {
            presets: [createPreset()],
            lockedForms: [] as const,
            defaultFormId: null,
            commitSelection: vi.fn(),
        };
        loadoutSelectionUiBridge.enter(payload);
        loadoutSelectionUiBridge.suspend();
        expect(useLoadoutSelectionUi.getState().suspended).toBe(true);

        loadoutSelectionUiBridge.resume();
        expect(useLoadoutSelectionUi.getState().suspended).toBe(false);

        loadoutSelectionUiBridge.resume();
        expect(useLoadoutSelectionUi.getState().suspended).toBe(false);
    });
});
