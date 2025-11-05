import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BiasPhasePayload } from 'scenes/bias-phase';
import { biasPhaseUiBridge, useBiasPhaseUi } from 'ui/state/bias-phase-bridge';

const resetBiasPhaseState = () => {
    useBiasPhaseUi.setState({ visible: false, suspended: false, payload: null }, true);
};

const createPayload = (): BiasPhasePayload => ({
    session: {
        nextLevel: 5,
        score: 123_000,
        coins: 12,
        lives: 3,
        highestCombo: 16,
        entropyDelta: 4,
        gravity: 1,
        gravityDelta: 0.1,
        speedGovernor: 1,
        speedDelta: -0.05,
        coinsRuleLocked: false,
        seed: 42,
    },
    options: [
        {
            id: 'recover',
            label: 'Recover',
            description: 'Stabilise the run.',
            risk: 'tilt',
            effectSummary: ['Restore stability'],
        },
    ],
    onSelect: vi.fn(),
    onSkip: vi.fn(),
});

describe('biasPhaseUiBridge', () => {
    beforeEach(() => {
        resetBiasPhaseState();
    });

    it('enters with payload and resets on exit', () => {
        const payload = createPayload();
        biasPhaseUiBridge.enter(payload);

        const activeState = useBiasPhaseUi.getState();
        expect(activeState.visible).toBe(true);
        expect(activeState.suspended).toBe(false);
        expect(activeState.payload).toBe(payload);

        biasPhaseUiBridge.exit();
        expect(useBiasPhaseUi.getState()).toEqual({ visible: false, suspended: false, payload: null });
    });

    it('toggles suspension only when visible', () => {
        biasPhaseUiBridge.suspend();
        expect(useBiasPhaseUi.getState().suspended).toBe(false);

        const payload = createPayload();
        biasPhaseUiBridge.enter(payload);
        biasPhaseUiBridge.suspend();
        expect(useBiasPhaseUi.getState().suspended).toBe(true);

        biasPhaseUiBridge.resume();
        expect(useBiasPhaseUi.getState().suspended).toBe(false);

        biasPhaseUiBridge.resume();
        expect(useBiasPhaseUi.getState().suspended).toBe(false);
    });
});
