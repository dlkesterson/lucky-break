import { create } from 'zustand';
import type { FateLedgerSnapshot } from 'app/fate-ledger';

export interface FateLedgerUiSnapshot {
    readonly snapshot: FateLedgerSnapshot;
    readonly onClose: () => void;
}

interface FateLedgerUiState {
    readonly visible: boolean;
    readonly suspended: boolean;
    readonly snapshot: FateLedgerSnapshot | null;
    readonly onClose: (() => void) | null;
}

const createInitialState = (): FateLedgerUiState => ({
    visible: false,
    suspended: false,
    snapshot: null,
    onClose: null,
});

export const useFateLedgerUi = create<FateLedgerUiState>(() => createInitialState());

export const fateLedgerUiBridge = {
    enter(payload: FateLedgerUiSnapshot): void {
        useFateLedgerUi.setState({
            visible: true,
            suspended: false,
            snapshot: payload.snapshot,
            onClose: payload.onClose,
        });
    },
    update(snapshot: FateLedgerSnapshot): void {
        useFateLedgerUi.setState((previous) => {
            if (!previous.visible) {
                return previous;
            }
            return { ...previous, snapshot } satisfies FateLedgerUiState;
        });
    },
    exit(): void {
        useFateLedgerUi.setState(createInitialState(), true);
    },
    suspend(): void {
        useFateLedgerUi.setState((previous) => {
            if (!previous.visible || previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: true } satisfies FateLedgerUiState;
        });
    },
    resume(): void {
        useFateLedgerUi.setState((previous) => {
            if (!previous.visible || !previous.suspended) {
                return previous;
            }
            return { ...previous, suspended: false } satisfies FateLedgerUiState;
        });
    },
};
