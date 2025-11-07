import { create } from 'zustand';
import type { LegendItem } from 'ui/scenes/PauseView';

export interface PauseUiSnapshot {
    readonly title: string;
    readonly score: number;
    readonly legendTitle: string | null;
    readonly legendItems: readonly LegendItem[];
    readonly resumeLabel: string;
    readonly quitLabel: string | null;
    readonly onResume: () => Promise<void>;
    readonly onQuit: (() => Promise<void>) | null;
}

interface PauseUiState {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly snapshot: PauseUiSnapshot | null;
}

const createInitialState = (): PauseUiState => ({
    visible: false,
    suspended: false,
    snapshot: null,
});

export const usePauseUi = create<PauseUiState>(() => createInitialState());

export const pauseUiBridge = {
    enter(snapshot: PauseUiSnapshot): void {
        usePauseUi.setState({ visible: true, suspended: false, snapshot });
    },
    exit(): void {
        usePauseUi.setState(createInitialState(), true);
    },
    suspend(): void {
        usePauseUi.setState((previous) => {
            if (!previous.visible || previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: true } satisfies PauseUiState;
        });
    },
    resume(): void {
        usePauseUi.setState((previous) => {
            if (!previous.visible || !previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: false } satisfies PauseUiState;
        });
    },
};
