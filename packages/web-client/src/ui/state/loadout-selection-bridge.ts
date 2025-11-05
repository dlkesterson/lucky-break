import { create } from 'zustand';
import type { LoadoutSelection } from 'config/loadouts';
import type { LoadoutFormId } from 'config/loadouts';
import type { LoadoutFormPreset } from 'app/runtime/loadouts';

export interface LoadoutSelectionUiPayload {
    readonly presets: readonly LoadoutFormPreset[];
    readonly lockedForms: readonly LoadoutFormId[];
    readonly defaultFormId: LoadoutFormId | null;
    readonly commitSelection: (selection: LoadoutSelection) => Promise<void>;
}

interface LoadoutSelectionUiState {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly presets: readonly LoadoutFormPreset[];
    readonly lockedForms: readonly LoadoutFormId[];
    readonly defaultFormId: LoadoutFormId | null;
    readonly commitSelection?: (selection: LoadoutSelection) => Promise<void>;
}

const createInitialState = (): LoadoutSelectionUiState => ({
    visible: false,
    suspended: false,
    presets: [],
    lockedForms: [],
    defaultFormId: null,
    commitSelection: undefined,
});

export const useLoadoutSelectionUi = create<LoadoutSelectionUiState>(() => createInitialState());

export const loadoutSelectionUiBridge = {
    enter(payload: LoadoutSelectionUiPayload): void {
        useLoadoutSelectionUi.setState({
            visible: true,
            suspended: false,
            presets: payload.presets,
            lockedForms: payload.lockedForms,
            defaultFormId: payload.defaultFormId,
            commitSelection: payload.commitSelection,
        });
    },
    exit(): void {
        useLoadoutSelectionUi.setState(createInitialState(), true);
    },
    suspend(): void {
        useLoadoutSelectionUi.setState((previous) => {
            if (!previous.visible || previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: true };
        });
    },
    resume(): void {
        useLoadoutSelectionUi.setState((previous) => {
            if (!previous.visible || !previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: false };
        });
    },
};
