import { create } from 'zustand';

export interface MainMenuUiScore {
    readonly id: string;
    readonly rank: number;
    readonly name: string;
    readonly score: number;
    readonly round: number;
    readonly achievedAt: number;
}

type MaybePromise<T> = T | Promise<T>;

export interface MainMenuUiSnapshot {
    readonly title: string;
    readonly prompt: string;
    readonly helpLines: readonly string[];
    readonly scores: readonly MainMenuUiScore[];
    readonly performanceEnabled: boolean;
    readonly onStart: () => Promise<void>;
    readonly onOpenLedger: () => Promise<void>;
    readonly onTogglePerformance: () => MaybePromise<void>;
    readonly onToggleTheme: () => void;
}

interface MainMenuUiState {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly snapshot: MainMenuUiSnapshot | null;
}

const createInitialState = (): MainMenuUiState => ({
    visible: false,
    suspended: false,
    snapshot: null,
});

export const useMainMenuUi = create<MainMenuUiState>(() => createInitialState());

export const mainMenuUiBridge = {
    enter(snapshot: MainMenuUiSnapshot): void {
        useMainMenuUi.setState({ visible: true, suspended: false, snapshot });
    },
    exit(): void {
        useMainMenuUi.setState(createInitialState(), true);
    },
    suspend(): void {
        useMainMenuUi.setState((previous) => {
            if (!previous.visible || previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: true } satisfies MainMenuUiState;
        });
    },
    resume(): void {
        useMainMenuUi.setState((previous) => {
            if (!previous.visible || !previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: false } satisfies MainMenuUiState;
        });
    },
    updatePerformance(performanceEnabled: boolean): void {
        useMainMenuUi.setState((previous) => {
            const snapshot = previous.snapshot;
            if (!snapshot || snapshot.performanceEnabled === performanceEnabled) {
                return previous;
            }
            return {
                ...previous,
                snapshot: { ...snapshot, performanceEnabled },
            } satisfies MainMenuUiState;
        });
    },
    updateScores(scores: readonly MainMenuUiScore[]): void {
        useMainMenuUi.setState((previous) => {
            const snapshot = previous.snapshot;
            if (!snapshot) {
                return previous;
            }
            return {
                ...previous,
                snapshot: { ...snapshot, scores: scores.map((entry) => ({ ...entry })) },
            } satisfies MainMenuUiState;
        });
    },
};
