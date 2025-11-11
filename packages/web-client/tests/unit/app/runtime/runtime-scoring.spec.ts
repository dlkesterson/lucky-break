import { describe, expect, it, vi } from 'vitest';
import type { LuckyBreakEventBus, LuckyBreakEventMap, LuckyBreakEventName } from 'app/events';
import { createRuntimeScoring } from 'app/runtime/scoring';

type PublishCall = [LuckyBreakEventName, LuckyBreakEventMap[LuckyBreakEventName], number | undefined];

const createMockBus = () => {
    const publishCalls: PublishCall[] = [];

    const publish: LuckyBreakEventBus['publish'] = (type, payload, timestamp) => {
        publishCalls.push([type, payload, timestamp]);
    };

    const subscribe: LuckyBreakEventBus['subscribe'] = () => () => { };
    const subscribeOnce: LuckyBreakEventBus['subscribeOnce'] = () => () => { };
    const unsubscribe: LuckyBreakEventBus['unsubscribe'] = () => { };
    const clear: LuckyBreakEventBus['clear'] = () => { };
    const listeners: LuckyBreakEventBus['listeners'] = () => [];

    const bus: LuckyBreakEventBus = {
        publish,
        subscribe,
        subscribeOnce,
        unsubscribe,
        clear,
        listeners,
    };

    return { bus, publishCalls };
};

describe('createRuntimeScoring', () => {
    it('awards brick points, applies multipliers, and emits milestone events', () => {
        const { bus, publishCalls } = createMockBus();
        const scoring = createRuntimeScoring({
            bus,
            scoringConfig: {
                basePoints: 100,
                multiplierThreshold: 2,
                multiplierPerThreshold: 1,
            },
        });

        const hudUpdater = vi.fn();
        scoring.setHudUpdater(hudUpdater);

        const firstAward = scoring.awardBrick({
            sessionId: 'session-1',
            row: 3,
            col: 7,
            impactVelocity: 12,
            brickType: 'standard',
            initialHp: 2,
            bricksRemainingAfter: 8,
            brickTotal: 16,
            comboDecayWindow: 2,
            maxSpeed: 24,
            frameTimestampMs: 1_000,
            gambleMultiplier: 2,
            doublePointsMultiplier: 1.5,
        });

        expect(firstAward.basePoints).toBe(100);
        expect(firstAward.pointsAwarded).toBe(300);
        expect(firstAward.previousCombo).toBe(0);
        expect(firstAward.currentCombo).toBe(1);
        expect(firstAward.milestone).toBe(false);
        expect(scoring.state.score).toBe(300);
        expect(scoring.state.combo).toBe(1);
        // HUD updater is now called only by the base scoring function, not by the wrapper
        expect(hudUpdater).toHaveBeenCalledTimes(1);

        expect(publishCalls).toHaveLength(1);
        const [eventType, eventPayload, eventTimestamp] = publishCalls[0];
        expect(eventType).toBe('BrickBreak');
        expect(eventPayload).toMatchObject({
            sessionId: 'session-1',
            row: 3,
            col: 7,
            comboHeat: 0,
            initialHp: 2,
        });
        expect(eventTimestamp).toBe(1_000);

        const secondAward = scoring.awardBrick({
            sessionId: 'session-1',
            row: 4,
            col: 2,
            impactVelocity: 18,
            brickType: 'standard',
            initialHp: 1,
            bricksRemainingAfter: 6,
            brickTotal: 16,
            comboDecayWindow: 2,
            maxSpeed: 24,
            frameTimestampMs: 2_000,
            impactContext: {
                bricksRemaining: 6,
                brickTotal: 16,
                impactSpeed: 18,
                maxSpeed: 24,
            },
        });

        expect(secondAward.basePoints).toBe(100);
        expect(secondAward.pointsAwarded).toBe(100);
        expect(secondAward.previousCombo).toBe(1);
        expect(secondAward.currentCombo).toBe(2);
        expect(secondAward.milestone).toBe(true);
        expect(scoring.state.score).toBe(400);
        expect(scoring.state.combo).toBe(2);
        // HUD updater is now called only by the base scoring function (once per award)
        expect(hudUpdater).toHaveBeenCalledTimes(2);

        expect(publishCalls).toHaveLength(3);
        const milestoneCall = publishCalls.at(-1);
        expect(milestoneCall?.[0]).toBe('ComboMilestoneReached');
        expect(milestoneCall?.[1]).toMatchObject({
            sessionId: 'session-1',
            combo: 2,
            pointsAwarded: 100,
            totalScore: 400,
        });
        expect(milestoneCall?.[2]).toBe(2_000);
    });

    it('decays combos, resets state, and manages HUD updates', () => {
        const { bus } = createMockBus();
        const scoring = createRuntimeScoring({
            bus,
            scoringConfig: {
                momentum: {
                    speedPressureDecayPerSecond: 0.5,
                },
            },
        });

        const hudUpdater = vi.fn();
        scoring.setHudUpdater(hudUpdater);

        scoring.state.combo = 2;
        scoring.state.comboTimer = 1.5;
        scoring.state.momentum.speedPressure = 1;
        scoring.state.momentum.comboHeat = 0.6;
        scoring.state.momentum.volleyLength = 3;

        scoring.decayCombo(1, { momentum: { speedPressureDecayPerSecond: 0.25 } });
        expect(scoring.state.combo).toBe(2);
        expect(scoring.state.comboTimer).toBeCloseTo(0.5, 5);
        expect(scoring.state.momentum.speedPressure).toBeCloseTo(0.75, 5);
        expect(scoring.state.momentum.comboTimer).toBeCloseTo(0.5, 5);
        expect(hudUpdater).not.toHaveBeenCalled();

        scoring.decayCombo(1);
        expect(scoring.state.combo).toBe(0);
        expect(scoring.state.comboTimer).toBe(0);
        expect(scoring.state.momentum.comboHeat).toBe(0);
        expect(scoring.state.momentum.volleyLength).toBe(0);
        expect(hudUpdater).toHaveBeenCalledTimes(1);

        scoring.lifeLost();
        expect(scoring.state.combo).toBe(0);
        expect(hudUpdater).toHaveBeenCalledTimes(3);

        scoring.roundCompleted();
        expect(hudUpdater).toHaveBeenCalledTimes(4);

        scoring.state.score = 512;
        scoring.state.combo = 4;
        scoring.state.comboTimer = 1.2;
        scoring.state.momentum.speedPressure = 0.9;
        scoring.state.momentum.brickDensity = 0.5;
        scoring.state.momentum.comboHeat = 0.8;
        scoring.state.momentum.comboTimer = 1.2;
        scoring.state.momentum.volleyLength = 5;

        scoring.resetAll();
        expect(scoring.state.score).toBe(0);
        expect(scoring.state.combo).toBe(0);
        expect(scoring.state.comboTimer).toBe(0);
        expect(scoring.state.momentum).toMatchObject({
            volleyLength: 0,
            speedPressure: 0,
            brickDensity: 1,
            comboHeat: 0,
            comboTimer: 0,
        });
        expect(hudUpdater).toHaveBeenCalledTimes(5);

        scoring.setHudUpdater(null);
        expect(scoring.state.updateHUD).toBeUndefined();

        scoring.roundCompleted();
        expect(hudUpdater).toHaveBeenCalledTimes(5);
    });
});
