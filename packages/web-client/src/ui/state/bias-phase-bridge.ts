import { create } from 'zustand';
import type { BiasPhasePayload } from 'scenes/bias-phase';

interface BiasPhaseUiState {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly payload: BiasPhasePayload | null;
}

const createInitialState = (): BiasPhaseUiState => ({
    visible: false,
    suspended: false,
    payload: null,
});

export const useBiasPhaseUi = create<BiasPhaseUiState>(() => createInitialState());

export const biasPhaseUiBridge = {
    enter(payload: BiasPhasePayload): void {
        useBiasPhaseUi.setState({ visible: true, suspended: false, payload });
    },
    exit(): void {
        useBiasPhaseUi.setState(createInitialState(), true);
    },
    suspend(): void {
        useBiasPhaseUi.setState((previous) => {
            if (!previous.visible || previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: true };
        });
    },
    resume(): void {
        useBiasPhaseUi.setState((previous) => {
            if (!previous.visible || !previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: false };
        });
    },
};
