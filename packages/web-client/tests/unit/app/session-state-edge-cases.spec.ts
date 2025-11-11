/**
 * Unit Tests: Session State Edge Cases
 *
 * Tests edge cases for session state management, particularly around:
 * - completeRound() vs recordBrickBreak() behavior
 * - Round machine autocomplete countdown logic
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createGameSessionManager, type GameSessionManager } from 'app/state';
import { createRoundMachine, type RoundMachine } from 'app/runtime/round-machine';

describe('Session State Edge Cases', () => {
    let session: GameSessionManager;

    beforeEach(() => {
        session = createGameSessionManager({
            sessionId: 'test-session',
        });
    });

    describe('Round Lifecycle', () => {
        it('startRound sets brick count to breakableBricks', () => {
            session.startRound({ breakableBricks: 15, roundNumber: 1 });
            expect(session.snapshot().brickRemaining).toBe(15);
            expect(session.snapshot().brickTotal).toBe(15);
        });

        it('completeRound resets brick count without changing score', () => {
            session.startRound({ breakableBricks: 10, roundNumber: 1 });

            // Add some score
            session.recordBrickBreak({
                points: 100,
                event: {
                    row: 0,
                    col: 0,
                    impactVelocity: 300,
                    brickType: 'standard',
                    initialHp: 1,
                    comboHeat: 0,
                },
                momentum: {
                    volleyLength: 1,
                    speedPressure: 0.5,
                    brickDensity: 0.9,
                    comboHeat: 0,
                    comboTimer: 0,
                },
            });

            const scoreBeforeComplete = session.snapshot().score;
            session.completeRound();

            const after = session.snapshot();
            expect(after.brickRemaining).toBe(0);
            expect(after.score).toBe(scoreBeforeComplete);
        });

        it('recordBrickBreak decrements brick count and adds score', () => {
            session.startRound({ breakableBricks: 10, roundNumber: 1 });

            const before = session.snapshot();
            session.recordBrickBreak({
                points: 150,
                event: {
                    row: 0,
                    col: 0,
                    impactVelocity: 300,
                    brickType: 'standard',
                    initialHp: 1,
                    comboHeat: 0,
                },
                momentum: {
                    volleyLength: 1,
                    speedPressure: 0.5,
                    brickDensity: 0.9,
                    comboHeat: 0,
                    comboTimer: 0,
                },
            });

            const after = session.snapshot();
            expect(after.brickRemaining).toBe(before.brickRemaining - 1);
            expect(after.score).toBe(before.score + 150);
        });

        it('recordBrickBreak can decrement to zero bricks', () => {
            session.startRound({ breakableBricks: 1, roundNumber: 1 });

            session.recordBrickBreak({
                points: 100,
                event: {
                    row: 0,
                    col: 0,
                    impactVelocity: 300,
                    brickType: 'standard',
                    initialHp: 1,
                    comboHeat: 0,
                },
                momentum: {
                    volleyLength: 1,
                    speedPressure: 0.5,
                    brickDensity: 0,
                    comboHeat: 0,
                    comboTimer: 0,
                },
            });

            expect(session.snapshot().brickRemaining).toBe(0);
        });

        it('multiple recordBrickBreak calls correctly accumulate score', () => {
            session.startRound({ breakableBricks: 5, roundNumber: 1 });

            const points = [100, 150, 200];
            points.forEach((p) => {
                session.recordBrickBreak({
                    points: p,
                    event: {
                        row: 0,
                        col: 0,
                        impactVelocity: 300,
                        brickType: 'standard',
                        initialHp: 1,
                        comboHeat: 0,
                    },
                    momentum: {
                        volleyLength: 1,
                        speedPressure: 0.5,
                        brickDensity: 0.5,
                        comboHeat: 0,
                        comboTimer: 0,
                    },
                });
            });

            const totalExpected = points.reduce((sum, p) => sum + p, 0);
            expect(session.snapshot().score).toBe(totalExpected);
            expect(session.snapshot().brickRemaining).toBe(2);
        });
    });

    describe('Life Management', () => {
        it('recordLifeLost decrements lives when session is active', () => {
            session.startRound({ breakableBricks: 10, roundNumber: 1 });

            const before = session.snapshot().livesRemaining;
            session.recordLifeLost('ball-drop');

            expect(session.snapshot().livesRemaining).toBe(before - 1);
        });

        it('lives cannot go negative', () => {
            session.startRound({ breakableBricks: 10, roundNumber: 1 });

            // Lose all lives
            for (let i = 0; i < 10; i++) {
                session.recordLifeLost('ball-drop');
            }

            expect(session.snapshot().livesRemaining).toBeGreaterThanOrEqual(0);
        });
    });
});

describe('Round Machine AutoComplete Edge Cases', () => {
    let roundMachine: RoundMachine;

    beforeEach(() => {
        roundMachine = createRoundMachine({
            autoCompleteEnabled: true,
            autoCompleteCountdown: 10,
            autoCompleteTrigger: 1, // Trigger when 1 brick remains
        });
    });

    it('autocomplete does not activate when more than trigger bricks remain', () => {
        const result = roundMachine.tickAutoComplete({
            deltaSeconds: 1,
            bricksRemaining: 5,
            sessionActive: true,
        });

        expect(result.triggered).toBe(false);
        expect(roundMachine.getAutoCompleteState().active).toBe(false);
    });

    it('autocomplete activates when brick count reaches trigger', () => {
        const result = roundMachine.tickAutoComplete({
            deltaSeconds: 0.1,
            bricksRemaining: 1, // Exactly at trigger
            sessionActive: true,
        });

        expect(result.stateChanged).toBe(true);
        expect(roundMachine.getAutoCompleteState().active).toBe(true);
        expect(result.triggered).toBe(false); // Not triggered yet, just started
    });

    it('autocomplete counts down when active', () => {
        // Activate autocomplete
        roundMachine.tickAutoComplete({
            deltaSeconds: 0,
            bricksRemaining: 1,
            sessionActive: true,
        });

        const stateBefore = roundMachine.getAutoCompleteState();
        const initialTimer = stateBefore.timer;

        // Tick forward
        roundMachine.tickAutoComplete({
            deltaSeconds: 2,
            bricksRemaining: 1,
            sessionActive: true,
        });

        const stateAfter = roundMachine.getAutoCompleteState();
        expect(stateAfter.timer).toBeLessThan(initialTimer);
    });

    it('autocomplete triggers when countdown reaches zero', () => {
        // Activate autocomplete
        roundMachine.tickAutoComplete({
            deltaSeconds: 0,
            bricksRemaining: 1,
            sessionActive: true,
        });

        // Tick past the countdown duration
        const result = roundMachine.tickAutoComplete({
            deltaSeconds: 100, // Much longer than countdown
            bricksRemaining: 1,
            sessionActive: true,
        });

        expect(result.triggered).toBe(true);
        expect(roundMachine.isLevelAutoCompleted()).toBe(true);
    });

    it('autocomplete resets when brick count goes above trigger', () => {
        // Activate autocomplete
        roundMachine.tickAutoComplete({
            deltaSeconds: 0,
            bricksRemaining: 1,
            sessionActive: true,
        });

        expect(roundMachine.getAutoCompleteState().active).toBe(true);

        // Brick count increases (shouldn't happen normally, but edge case)
        const result = roundMachine.tickAutoComplete({
            deltaSeconds: 0.1,
            bricksRemaining: 5,
            sessionActive: true,
        });

        expect(result.stateChanged).toBe(true);
        expect(roundMachine.getAutoCompleteState().active).toBe(false);
    });

    it('autocomplete does not activate when session is inactive', () => {
        const result = roundMachine.tickAutoComplete({
            deltaSeconds: 1,
            bricksRemaining: 1,
            sessionActive: false,
        });

        expect(result.triggered).toBe(false);
        expect(roundMachine.getAutoCompleteState().active).toBe(false);
    });

    it('autocomplete does not activate when disabled', () => {
        const disabledMachine = createRoundMachine({
            autoCompleteEnabled: false,
            autoCompleteCountdown: 10,
            autoCompleteTrigger: 1,
        });

        const result = disabledMachine.tickAutoComplete({
            deltaSeconds: 1,
            bricksRemaining: 1,
            sessionActive: true,
        });

        expect(result.triggered).toBe(false);
        expect(disabledMachine.getAutoCompleteState().active).toBe(false);
    });

    it('autocomplete timer does not go negative', () => {
        // Activate autocomplete
        roundMachine.tickAutoComplete({
            deltaSeconds: 0,
            bricksRemaining: 1,
            sessionActive: true,
        });

        // Tick with huge delta
        roundMachine.tickAutoComplete({
            deltaSeconds: 99999,
            bricksRemaining: 1,
            sessionActive: true,
        });

        const state = roundMachine.getAutoCompleteState();
        expect(state.timer).toBeGreaterThanOrEqual(0);
    });

    it('beginAutoCompleteCountdown sets timer to countdown duration', () => {
        roundMachine.beginAutoCompleteCountdown();

        const state = roundMachine.getAutoCompleteState();
        expect(state.active).toBe(true);
        expect(state.timer).toBe(10); // countdown duration
    });

    it('resetAutoCompleteCountdown clears active state and resets timer', () => {
        roundMachine.beginAutoCompleteCountdown();
        expect(roundMachine.getAutoCompleteState().active).toBe(true);

        roundMachine.resetAutoCompleteCountdown();
        const state = roundMachine.getAutoCompleteState();
        expect(state.active).toBe(false);
        expect(state.timer).toBe(state.countdown); // Timer resets to countdown duration
    });
});
