import { create } from 'zustand';
import type { AchievementUnlock } from 'app/achievements';

export interface GameOverUiSnapshot {
    readonly score: number;
    readonly title: string;
    readonly prompt: string;
    readonly scoreLabel: string;
    readonly achievements: readonly AchievementUnlock[];
    readonly dustAwarded: number | null;
    readonly onRestart: () => Promise<void>;
}

interface GameOverUiState {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly snapshot: GameOverUiSnapshot | null;
}

const createInitialState = (): GameOverUiState => ({
    visible: false,
    suspended: false,
    snapshot: null,
});

export const useGameOverUi = create<GameOverUiState>(() => createInitialState());

export const gameOverUiBridge = {
    enter(snapshot: GameOverUiSnapshot): void {
        useGameOverUi.setState({ visible: true, suspended: false, snapshot });
    },
    exit(): void {
        useGameOverUi.setState(createInitialState(), true);
    },
    suspend(): void {
        useGameOverUi.setState((previous) => {
            if (!previous.visible || previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: true } satisfies GameOverUiState;
        });
    },
    resume(): void {
        useGameOverUi.setState((previous) => {
            if (!previous.visible || !previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: false } satisfies GameOverUiState;
        });
    },
};
