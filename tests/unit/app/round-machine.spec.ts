import { describe, expect, it } from 'vitest';
import { createRoundMachine } from 'app/runtime/round-machine';
import { createReward } from 'game/rewards';

describe('round-machine entropy actions', () => {
    const createSubject = () =>
        createRoundMachine({
            autoCompleteEnabled: false,
            autoCompleteCountdown: 3,
            autoCompleteTrigger: 1,
        });

    it('tracks shield charges and consumes them when used', () => {
        const machine = createSubject();

        machine.grantEntropyAction('shield', 25);
        machine.grantEntropyAction('shield', 30);

        expect(machine.getEntropyActionState().shieldCharges).toBe(2);
        expect(machine.consumeShieldCharge(40)).toBe(true);
        expect(machine.getEntropyActionState().shieldCharges).toBe(1);
        expect(machine.consumeShieldCharge(55)).toBe(true);
        expect(machine.consumeShieldCharge(60)).toBe(false);
    });

    it('caps stored reroll tokens and records bailout usage', () => {
        const machine = createSubject();

        for (let index = 0; index < 10; index += 1) {
            machine.grantEntropyAction('reroll', index);
        }

        const state = machine.getEntropyActionState();
        expect(state.rerollTokens).toBeLessThanOrEqual(3);
        expect(state.lastAction).toMatchObject({ action: 'reroll' });

        expect(machine.consumeRerollToken(120)).toBe(true);
        expect(machine.getEntropyActionState().rerollTokens).toBeLessThanOrEqual(2);

        machine.recordBailoutActivation(360);
        expect(machine.getEntropyActionState().lastAction).toEqual({ action: 'bailout', timestamp: 360 });
    });

    it('locks pending rewards and blocks subsequent rerolls', () => {
        const machine = createSubject();
        const reward = createReward('sticky-paddle');

        machine.setPendingReward(reward);
        expect(machine.isPendingRewardLocked()).toBe(false);
        expect(machine.lockPendingReward()).toBe(true);
        expect(machine.isPendingRewardLocked()).toBe(true);

        machine.grantEntropyAction('reroll', 0);
        expect(machine.consumeRerollToken(5)).toBe(false);

        machine.setPendingReward(createReward('multi-ball'));
        expect(machine.isPendingRewardLocked()).toBe(false);
    });
});

describe('round-machine bias phase state', () => {
    const createSubject = () =>
        createRoundMachine({
            autoCompleteEnabled: false,
            autoCompleteCountdown: 3,
            autoCompleteTrigger: 1,
        });

    const sampleOptions = () => [
        {
            id: 'option-a',
            label: 'Option A',
            description: 'Test option A',
            risk: 'safe' as const,
            effects: {
                modifiers: { gravity: 0.1 },
                difficultyMultiplier: 1.05,
                powerUpChanceMultiplier: 1.02,
            },
        },
        {
            id: 'option-b',
            label: 'Option B',
            description: 'Test option B',
            risk: 'bold' as const,
            effects: {
                modifiers: { paddleWidthMultiplier: 0.95 },
                difficultyMultiplier: 1.12,
                powerUpChanceMultiplier: 1.08,
            },
        },
    ];

    it('clones bias phase options and consumes selections', () => {
        const machine = createSubject();
        machine.setBiasPhaseOptions(sampleOptions());

        const initialState = machine.getBiasPhaseState();
        expect(initialState.options).toHaveLength(2);
        expect(initialState.pendingSelection).toBeNull();

        const committed = machine.commitBiasSelection('option-b');
        expect(committed).not.toBeNull();
        expect(committed?.id).toBe('option-b');

        const stateAfterCommit = machine.getBiasPhaseState();
        expect(stateAfterCommit.options).toHaveLength(0);
        expect(stateAfterCommit.pendingSelection?.id).toBe('option-b');
        expect(stateAfterCommit.lastSelection?.id).toBe('option-b');

        const consumed = machine.consumePendingBiasSelection();
        expect(consumed?.id).toBe('option-b');
        expect(machine.getBiasPhaseState().pendingSelection).toBeNull();

        const afterReset = machine.getBiasPhaseState();
        expect(afterReset.lastSelection?.id).toBe('option-b');

        const committedMissing = machine.commitBiasSelection('missing');
        expect(committedMissing).toBeNull();
    });

    it('clears bias state on reset', () => {
        const machine = createSubject();
        machine.setBiasPhaseOptions(sampleOptions());
        machine.commitBiasSelection('option-a');
        machine.resetForNewSession();

        const state = machine.getBiasPhaseState();
        expect(state.options).toHaveLength(0);
        expect(state.pendingSelection).toBeNull();
        expect(state.lastSelection).toBeNull();
    });
});
