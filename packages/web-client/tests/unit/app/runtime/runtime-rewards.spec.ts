import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntropyActionType } from 'app/events';
import type { EntropySpendResult, GameSessionSnapshot } from 'app/state';
import type { Reward } from 'game/rewards';
import type { RoundMachine } from 'app/runtime/round-machine';
import type { RewardsWorldBridge } from 'app/runtime/contracts';
import type { RandomManager } from 'util/random';
import { createRuntimeRewards } from 'app/runtime/modules/runtime-rewards';

const { createRewardWheelOrchestratorMock } = vi.hoisted(() => ({
    createRewardWheelOrchestratorMock: vi.fn(() => ({ orchestrator: true })),
}));

vi.mock('app/runtime/reward-wheel', () => ({
    createRewardWheelOrchestrator: createRewardWheelOrchestratorMock,
}));

type EntropyState = ReturnType<RoundMachine['getEntropyActionState']>;

const defaultSpendResult: EntropySpendResult = {
    success: true,
    action: 'reroll',
    cost: 10,
    storedRemaining: 80,
    chargeRemaining: 50,
};

const createReward = (id: string): Reward => ({ id } as unknown as Reward);

const createHarness = () => {
    let sessionStatus: GameSessionSnapshot['status'] = 'active';
    let pendingReward: Reward | null = createReward('pending');
    let locked = false;
    let consumeTokenResult = true;
    let entropyState: EntropyState = {
        rerollTokens: 1,
        shieldCharges: 2,
        lastAction: null,
    };
    let now = 1000;
    let spendResult: EntropySpendResult = { ...defaultSpendResult };

    const randomSource = vi.fn(() => 0.42);
    const randomManager: RandomManager = {
        seed: vi.fn(() => 1),
        setSeed: vi.fn(() => 1),
        reset: vi.fn(),
        next: vi.fn(() => 0.42),
        random: randomSource,
        nextInt: vi.fn(() => 0),
        boolean: vi.fn(() => true),
    };

    const roundMachineMocks = {
        getPendingReward: vi.fn(() => pendingReward),
        isPendingRewardLocked: vi.fn(() => locked),
        consumeRerollToken: vi.fn(() => consumeTokenResult),
        setPendingReward: vi.fn((reward: Reward | null) => {
            pendingReward = reward;
        }),
        grantEntropyAction: vi.fn(),
        recordBailoutActivation: vi.fn(),
        getEntropyActionState: vi.fn(() => entropyState),
    };

    const roundMachine = roundMachineMocks as unknown as RoundMachine;

    const worldBridgeMocks = {
        renderStageSoon: vi.fn(),
        requestHudRefresh: vi.fn(),
        pulseHudCombo: vi.fn(),
        flashPaddleLight: vi.fn(),
        clearExtraBalls: vi.fn(),
        reattachBallToPaddle: vi.fn(),
        resetAutoCompleteCountdown: vi.fn(),
    } satisfies RewardsWorldBridge;

    const sessionNow = vi.fn(() => now);
    const getSessionSnapshot = vi.fn(() => ({ status: sessionStatus } as GameSessionSnapshot));

    const spendStoredEntropy = vi.fn(() => spendResult);
    const spendCoins = vi.fn(() => true);
    const eventBus = { publish: vi.fn() };

    const spinReward = vi.fn(() => createReward('spin-result'));
    const setRewardOverride = vi.fn();
    const createRewardFactory = vi.fn(() => createReward('created'));

    const entropyCosts: Record<EntropyActionType, number> = {
        reroll: 20,
        shield: 30,
        bailout: 60,
    };

    const bindings: Record<EntropyActionType, { key: string; hotkey: string; label: string }> = {
        reroll: { key: 'R', hotkey: 'R', label: 'Reroll' },
        shield: { key: 'S', hotkey: 'S', label: 'Shield' },
        bailout: { key: 'B', hotkey: 'B', label: 'Bailout' },
    };

    const runtimeRewards = createRuntimeRewards({
        random: randomManager,
        roundMachine,
        sessionNow,
        getSessionSnapshot,
        spendStoredEntropy,
        spendCoins,
        eventBus,
        wheelSegments: [] as never,
        entropyCosts,
        entropyBindings: bindings,
        entropyOrder: ['reroll', 'shield', 'bailout'],
        lockCoinCost: 50,
        spinReward,
        setRewardOverride,
        createReward: createRewardFactory,
        worldBridge: worldBridgeMocks,
    });

    return {
        runtimeRewards,
        randomManager,
        roundMachineMocks,
        worldBridgeMocks,
        getSessionSnapshot,
        spendStoredEntropy,
        spendCoins,
        setSessionStatus: (status: GameSessionSnapshot['status']) => {
            sessionStatus = status;
        },
        setPendingReward: (reward: Reward | null) => {
            pendingReward = reward;
        },
        setLocked: (value: boolean) => {
            locked = value;
        },
        setConsumeTokenResult: (value: boolean) => {
            consumeTokenResult = value;
        },
        setEntropyState: (state: EntropyState) => {
            entropyState = state;
        },
        setNow: (value: number) => {
            now = value;
        },
        setSpendResult: (result: EntropySpendResult) => {
            spendResult = result;
        },
        resetSpendResult: () => {
            spendResult = { ...defaultSpendResult };
        },
        spinReward,
        setRewardOverride,
        createRewardFactory,
        randomSource,
    };
};

describe('createRuntimeRewards', () => {
    beforeEach(() => {
        createRewardWheelOrchestratorMock.mockClear();
    });

    it('throws when a binding is missing', () => {
        const randomManagerStub: RandomManager = {
            seed: vi.fn(() => 1),
            setSeed: vi.fn(() => 1),
            reset: vi.fn(),
            next: vi.fn(() => 0.5),
            random: vi.fn(() => 0.5),
            nextInt: vi.fn(() => 1),
            boolean: vi.fn(() => true),
        };

        expect(() =>
            createRuntimeRewards({
                random: randomManagerStub,
                roundMachine: {} as unknown as RoundMachine,
                sessionNow: vi.fn(),
                getSessionSnapshot: vi.fn(() => ({ status: 'active' } as GameSessionSnapshot)),
                spendStoredEntropy: vi.fn(),
                spendCoins: vi.fn(),
                eventBus: { publish: vi.fn() },
                wheelSegments: [] as never,
                entropyCosts: { reroll: 1, shield: 1, bailout: 1 },
                entropyBindings: { reroll: { key: 'R', hotkey: 'R', label: 'Reroll' } } as Record<EntropyActionType, {
                    key: string;
                    hotkey: string;
                    label: string;
                }>,
                entropyOrder: ['reroll', 'shield'],
                lockCoinCost: 10,
                spinReward: vi.fn(),
                setRewardOverride: vi.fn(),
                createReward: vi.fn(),
                worldBridge: {
                    renderStageSoon: vi.fn(),
                    requestHudRefresh: vi.fn(),
                    pulseHudCombo: vi.fn(),
                    flashPaddleLight: vi.fn(),
                    clearExtraBalls: vi.fn(),
                    reattachBallToPaddle: vi.fn(),
                    resetAutoCompleteCountdown: vi.fn(),
                },
            }),
        ).toThrowError('Missing entropy action binding for action "shield"');
    });

    it('rejects reroll when session status is invalid or reward is locked', () => {
        const harness = createHarness();

        harness.setSessionStatus('pending');
        expect(harness.runtimeRewards.attemptEntropyAction('reroll')).toEqual({
            success: false,
            reason: 'invalid-state',
        });
        expect(harness.spendStoredEntropy).not.toHaveBeenCalled();

        harness.setSessionStatus('active');
        harness.setLocked(true);
        expect(harness.runtimeRewards.attemptEntropyAction('reroll')).toEqual({
            success: false,
            reason: 'locked',
        });
        expect(harness.spendStoredEntropy).not.toHaveBeenCalled();
    });

    it('maps entropy spend failures to user facing reasons', () => {
        const harness = createHarness();

        harness.setSpendResult({
            success: false,
            action: 'shield',
            cost: 30,
            storedRemaining: 10,
            chargeRemaining: 50,
            reason: 'insufficient',
        });
        expect(harness.runtimeRewards.attemptEntropyAction('shield')).toEqual({
            success: false,
            reason: 'insufficient',
        });

        harness.setSpendResult({
            success: false,
            action: 'shield',
            cost: 30,
            storedRemaining: 10,
            chargeRemaining: 50,
            reason: 'invalid-cost',
        });
        expect(harness.runtimeRewards.attemptEntropyAction('shield')).toEqual({
            success: false,
            reason: 'invalid-state',
        });
    });

    it('applies reroll immediately when tokens are available', () => {
        const harness = createHarness();

        const nextReward = createReward('next');
        harness.spinReward.mockReturnValueOnce(nextReward);

        const result = harness.runtimeRewards.attemptEntropyAction('reroll');
        expect(result).toEqual({ success: true });
        expect(harness.roundMachineMocks.grantEntropyAction).toHaveBeenCalledWith('reroll', 1000);
        expect(harness.roundMachineMocks.consumeRerollToken).toHaveBeenCalledWith(1000);
        expect(harness.roundMachineMocks.setPendingReward).toHaveBeenCalledWith(nextReward);
        expect(harness.worldBridgeMocks.pulseHudCombo).toHaveBeenCalledWith(0.3);
        expect(harness.worldBridgeMocks.renderStageSoon).toHaveBeenCalledTimes(1);
        expect(harness.worldBridgeMocks.requestHudRefresh).toHaveBeenCalledTimes(1);
        expect(harness.spinReward).toHaveBeenCalledWith(harness.randomManager.random);
    });

    it('returns invalid-state when reroll token cannot be consumed or reward missing', () => {
        const harness = createHarness();

        harness.setConsumeTokenResult(false);
        expect(harness.runtimeRewards.attemptEntropyAction('reroll')).toEqual({
            success: false,
            reason: 'invalid-state',
        });
        expect(harness.worldBridgeMocks.requestHudRefresh).not.toHaveBeenCalled();

        harness.resetSpendResult();
        harness.setConsumeTokenResult(true);
        harness.setPendingReward(null);
        expect(harness.runtimeRewards.attemptEntropyAction('reroll')).toEqual({
            success: false,
            reason: 'invalid-state',
        });
        expect(harness.worldBridgeMocks.requestHudRefresh).not.toHaveBeenCalled();
    });

    it('applies shield and bailout actions with the expected world bridge effects', () => {
        const harness = createHarness();

        expect(harness.runtimeRewards.attemptEntropyAction('shield')).toEqual({ success: true });
        expect(harness.roundMachineMocks.grantEntropyAction).toHaveBeenCalledWith('shield', 1000);
        expect(harness.worldBridgeMocks.pulseHudCombo).toHaveBeenCalledWith(0.4);

        harness.roundMachineMocks.grantEntropyAction.mockClear();
        expect(harness.runtimeRewards.attemptEntropyAction('bailout')).toEqual({ success: true });
        expect(harness.roundMachineMocks.recordBailoutActivation).toHaveBeenCalledWith(1000);
        expect(harness.worldBridgeMocks.clearExtraBalls).toHaveBeenCalledTimes(1);
        expect(harness.worldBridgeMocks.reattachBallToPaddle).toHaveBeenCalledTimes(1);
        expect(harness.worldBridgeMocks.resetAutoCompleteCountdown).toHaveBeenCalledTimes(1);
        expect(harness.worldBridgeMocks.flashPaddleLight).toHaveBeenCalledWith(0.55);
        expect(harness.worldBridgeMocks.pulseHudCombo).toHaveBeenCalledWith(0.5);
        expect(harness.worldBridgeMocks.renderStageSoon).toHaveBeenCalledTimes(1);
        expect(harness.worldBridgeMocks.requestHudRefresh).toHaveBeenCalledTimes(2);
    });

    it('exposes hud entropy descriptors with charges, affordability, and last action timestamp', () => {
        const harness = createHarness();

        harness.setEntropyState({
            rerollTokens: 2,
            shieldCharges: 1,
            lastAction: { action: 'shield', timestamp: 555 },
        });

        const descriptors = harness.runtimeRewards.getHudEntropyActions(35);
        expect(descriptors).toHaveLength(3);
        expect(descriptors[0]).toMatchObject({
            action: 'reroll',
            charges: 2,
            affordable: true,
            lastActionTimestamp: undefined,
        });
        expect(descriptors[1]).toMatchObject({
            action: 'shield',
            charges: 1,
            affordable: true,
            lastActionTimestamp: 555,
        });
        expect(descriptors[2]).toMatchObject({
            action: 'bailout',
            charges: 0,
            affordable: false,
        });
    });

    it('returns resolved entropy bindings in order', () => {
        const harness = createHarness();
        const bindings = harness.runtimeRewards.getActionBindings();
        expect(bindings.map((binding) => binding.action)).toEqual(['reroll', 'shield', 'bailout']);
        expect(bindings[0]).toMatchObject({ hotkey: 'R', label: 'Reroll' });
    });
});