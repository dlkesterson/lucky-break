import { describe, expect, it, vi } from 'vitest';
import {
    createRewardWheelOrchestrator,
    type EntropyActionAttemptResult,
} from 'app/runtime/reward-wheel';
import type { Reward, RewardType } from 'game/rewards';
import type { EntropyActionType } from 'app/events';
import type { GameSessionSnapshot } from 'app/state';

const createRewardFactory = () => {
    return vi.fn((type: RewardType): Reward => {
        if (type === 'sticky-paddle') {
            return { type, duration: 10 };
        }
        if (type === 'slow-time') {
            return { type, duration: 8, timeScale: 0.5 };
        }
        throw new Error(`Unsupported reward type for test: ${type}`);
    });
};

const createRoundMachineStub = () => {
    let currentReward: Reward | null = null;
    let locked = false;
    let lockResult = true;

    const getPendingReward = vi.fn(() => currentReward);
    const isPendingRewardLocked = vi.fn(() => locked);
    const lockPendingReward = vi.fn(() => {
        if (!lockResult || !currentReward) {
            return false;
        }
        locked = true;
        return true;
    });

    return {
        getPendingReward,
        isPendingRewardLocked,
        lockPendingReward,
        setReward: (next: Reward | null) => {
            currentReward = next;
        },
        setLocked: (value: boolean) => {
            locked = value;
        },
        setLockResult: (value: boolean) => {
            lockResult = value;
        },
    } as const;
};

const buildSessionSnapshot = (session: { coins: number; entropyStored: number }): GameSessionSnapshot => {
    return {
        sessionId: 'session-1',
        status: 'active',
        score: 0,
        coins: session.coins,
        livesRemaining: 3,
        round: 1,
        elapsedTimeMs: 0,
        brickTotal: 0,
        brickRemaining: 0,
        lastOutcome: undefined,
        momentum: {
            volleyLength: 0,
            speedPressure: 0,
            brickDensity: 0,
            comboHeat: 0,
            comboTimer: 0,
            updatedAt: 0,
        },
        audio: {
            scene: 'calm',
            nextScene: null,
            barCountdown: 0,
            sends: { reverb: 0, delay: 0 },
            primaryLayerActive: false,
        },
        entropy: {
            charge: 0,
            stored: session.entropyStored,
            trend: 'stable',
            lastEvent: null,
            updatedAt: 0,
        },
        preferences: {
            masterVolume: 1,
            muted: false,
            reducedMotion: false,
            controlScheme: 'keyboard',
            controlSensitivity: 0.5,
        },
        hud: {
            score: 0,
            coins: session.coins,
            lives: 3,
            round: 1,
            brickRemaining: 0,
            brickTotal: 0,
            momentum: {
                volleyLength: 0,
                speedPressure: 0,
                brickDensity: 0,
                comboHeat: 0,
                comboTimer: 0,
            },
            entropy: {
                charge: 0,
                stored: session.entropyStored,
                trend: 'stable',
            },
            audio: {
                scene: 'calm',
                nextScene: null,
                barCountdown: 0,
            },
            prompts: [],
            settings: {
                muted: false,
                masterVolume: 1,
                reducedMotion: false,
            },
        },
        updatedAt: 0,
    } satisfies GameSessionSnapshot;
};

const bootstrapOrchestrator = () => {
    const roundMachine = createRoundMachineStub();
    const session = { coins: 120, entropyStored: 45 };
    const getSessionSnapshot = vi.fn(() => buildSessionSnapshot(session));
    const spendCoins = vi.fn((amount: number) => {
        if (session.coins < amount) {
            return false;
        }
        session.coins -= amount;
        return true;
    });
    const entropyCosts = { reroll: 15, lockCoins: 20 };
    let entropyResult: EntropyActionAttemptResult = { success: true };
    const attemptEntropyAction = vi.fn((action: EntropyActionType) => {
        const result = entropyResult;
        if (result.success && action === 'reroll') {
            session.entropyStored = Math.max(0, session.entropyStored - entropyCosts.reroll);
        }
        return result;
    });
    const setEntropyResult = (result: EntropyActionAttemptResult) => {
        entropyResult = result;
    };
    const setRewardOverride = vi.fn();
    const refreshHud = vi.fn();
    const renderStageSoon = vi.fn();
    const publishMock = vi.fn();
    const createReward = createRewardFactory();

    const orchestrator = createRewardWheelOrchestrator({
        wheelSegments: [
            { type: 'sticky-paddle', weight: 1 },
            { type: 'slow-time', weight: 2 },
        ],
        roundMachine: {
            getPendingReward: roundMachine.getPendingReward,
            isPendingRewardLocked: roundMachine.isPendingRewardLocked,
            lockPendingReward: roundMachine.lockPendingReward,
        },
        getSessionSnapshot,
        spendCoins,
        entropyCosts,
        attemptEntropyAction,
        setRewardOverride,
        refreshHud,
        renderStageSoon,
        eventBus: { publish: publishMock },
        createReward,
    });

    return {
        orchestrator,
        roundMachine,
        session,
        spendCoins,
        attemptEntropyAction,
        setEntropyResult,
        setReward: roundMachine.setReward,
        setLocked: roundMachine.setLocked,
        setLockResult: roundMachine.setLockResult,
        setSessionCoins: (value: number) => {
            session.coins = value;
        },
        setSessionEntropy: (value: number) => {
            session.entropyStored = value;
        },
        setRewardOverride,
        refreshHud,
        renderStageSoon,
        publishMock,
        getSessionSnapshot,
        entropyCosts,
    } as const;
};

const stickyReward: Reward = { type: 'sticky-paddle', duration: 12 };

describe('createRewardWheelOrchestrator', () => {
    it('buildPayload surfaces wheel odds and state metadata', () => {
        const context = bootstrapOrchestrator();
        context.setReward(stickyReward);
        context.setLocked(false);
        context.setSessionEntropy(60);
        context.setSessionCoins(80);

        const payload = context.orchestrator.buildPayload();

        expect(payload.odds).toHaveLength(2);
        expect(payload.odds[0].chance + payload.odds[1].chance).toBeCloseTo(1);
        expect(payload.state.reward).toEqual(stickyReward);
        expect(payload.state.canReroll).toBe(true);
        expect(payload.state.canLock).toBe(true);
        expect(typeof payload.actions.reroll).toBe('function');
        expect(typeof payload.actions.lock).toBe('function');
    });

    it('reroll handles missing reward and entropy constraints', async () => {
        const context = bootstrapOrchestrator();

        const missing = await context.orchestrator.reroll();
        expect(missing.success).toBe(false);
        expect(missing.message).toBe('No reward to reroll');
        expect(context.publishMock).not.toHaveBeenCalled();

        context.setReward(stickyReward);
        context.setLocked(false);
        context.setSessionEntropy(40);
        context.setEntropyResult({ success: false, reason: 'locked' });

        const lockedResult = await context.orchestrator.reroll();
        expect(lockedResult.success).toBe(false);
        expect(lockedResult.message).toBe('Reward is locked');
        expect(context.publishMock).not.toHaveBeenCalled();
    });

    it('reroll publishes interaction on success', async () => {
        const context = bootstrapOrchestrator();
        context.setReward(stickyReward);
        context.setLocked(false);
        context.setSessionEntropy(50);
        context.publishMock.mockClear();

        const success = await context.orchestrator.reroll();

        expect(success.success).toBe(true);
        expect(success.message).toBe('Reward rerolled');
        expect(context.publishMock).toHaveBeenCalledWith(
            'RewardWheelInteraction',
            expect.objectContaining({
                action: 'reroll',
                entropyCost: context.entropyCosts.reroll,
                rewardType: stickyReward.type,
            }),
        );
    });

    it('lock enforces prerequisites before success', async () => {
        const withoutReward = bootstrapOrchestrator();
        const noReward = await withoutReward.orchestrator.lock();
        expect(noReward.success).toBe(false);
        expect(noReward.message).toBe('No reward to lock');

        const alreadyLocked = bootstrapOrchestrator();
        alreadyLocked.setReward(stickyReward);
        alreadyLocked.setLocked(true);
        const lockedResult = await alreadyLocked.orchestrator.lock();
        expect(lockedResult.message).toBe('Reward already locked');

        const insufficientCoins = bootstrapOrchestrator();
        insufficientCoins.setReward(stickyReward);
        insufficientCoins.setLocked(false);
        insufficientCoins.setSessionCoins(5);
        const coinFail = await insufficientCoins.orchestrator.lock();
        expect(coinFail.message).toBe('Not enough coins');

        const failedLock = bootstrapOrchestrator();
        failedLock.setReward(stickyReward);
        failedLock.setLocked(false);
        failedLock.setSessionCoins(50);
        failedLock.setLockResult(false);
        const lockFail = await failedLock.orchestrator.lock();
        expect(lockFail.message).toBe('Unable to lock reward');

        const successContext = bootstrapOrchestrator();
        successContext.setReward(stickyReward);
        successContext.setLocked(false);
        successContext.setSessionCoins(80);
        successContext.setLockResult(true);
        successContext.publishMock.mockClear();
        successContext.setRewardOverride.mockClear();
        successContext.refreshHud.mockClear();
        successContext.renderStageSoon.mockClear();

        const success = await successContext.orchestrator.lock();

        expect(success.success).toBe(true);
        expect(success.state.locked).toBe(true);
        expect(successContext.setRewardOverride).toHaveBeenCalledWith({
            type: stickyReward.type,
            duration: stickyReward.duration,
            persist: false,
        });
        expect(successContext.refreshHud).toHaveBeenCalledTimes(1);
        expect(successContext.renderStageSoon).toHaveBeenCalledTimes(1);
        expect(successContext.publishMock).toHaveBeenCalledWith(
            'RewardWheelInteraction',
            expect.objectContaining({
                action: 'lock',
                coinsCost: successContext.entropyCosts.lockCoins,
                rewardType: stickyReward.type,
            }),
        );
        expect(successContext.session.coins).toBe(60);
    });
});
