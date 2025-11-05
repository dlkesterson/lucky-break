import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FateLedgerSnapshot } from 'app/fate-ledger';
import { fateLedgerUiBridge, useFateLedgerUi } from 'ui/state/fate-ledger-bridge';

const resetFateLedgerState = () => {
    useFateLedgerUi.setState({ visible: false, suspended: false, snapshot: null, onClose: null }, true);
};

const createSnapshot = (overrides: Partial<FateLedgerSnapshot> = {}): FateLedgerSnapshot => ({
    version: 1,
    entries: [],
    totalIdleRolls: 0,
    totals: {
        durationMs: 0,
        entropyEarned: 0,
        certaintyDustEarned: 0,
    },
    latestEntryTimestamp: null,
    ...overrides,
});

describe('fateLedgerUiBridge', () => {
    beforeEach(() => {
        resetFateLedgerState();
    });

    it('enters, updates, and exits', () => {
        const onClose = vi.fn();
        const initialSnapshot = createSnapshot();

        fateLedgerUiBridge.enter({ snapshot: initialSnapshot, onClose });

        let state = useFateLedgerUi.getState();
        expect(state.visible).toBe(true);
        expect(state.snapshot).toBe(initialSnapshot);
        expect(state.onClose).toBe(onClose);

        const updatedSnapshot = createSnapshot({ totalIdleRolls: 5 });
        fateLedgerUiBridge.update(updatedSnapshot);
        state = useFateLedgerUi.getState();
        expect(state.snapshot).toBe(updatedSnapshot);

        fateLedgerUiBridge.exit();
        expect(useFateLedgerUi.getState()).toEqual({
            visible: false,
            suspended: false,
            snapshot: null,
            onClose: null,
        });
    });

    it('suspends and resumes only when visible', () => {
        fateLedgerUiBridge.suspend();
        expect(useFateLedgerUi.getState().suspended).toBe(false);

        fateLedgerUiBridge.enter({ snapshot: createSnapshot(), onClose: () => { } });
        fateLedgerUiBridge.suspend();
        expect(useFateLedgerUi.getState().suspended).toBe(true);

        fateLedgerUiBridge.resume();
        expect(useFateLedgerUi.getState().suspended).toBe(false);
    });
});
