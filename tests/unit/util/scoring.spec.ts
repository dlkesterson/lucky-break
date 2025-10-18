/**
 * Tests for Combo Scoring System
 */

import { describe, it, expect } from 'vitest';
import {
    createScoring,
    awardBrickPoints,
    decayCombo,
    resetCombo,
    getComboMultiplier,
    isComboMilestone,
    getScoringDebugInfo,
} from 'util/scoring';

describe('scoring', () => {
    describe('createScoring', () => {
        it('should create initial state with zeros', () => {
            const state = createScoring();
            expect(state.score).toBe(0);
            expect(state.combo).toBe(0);
            expect(state.comboTimer).toBe(0);
        });
    });

    describe('awardBrickPoints', () => {
        it('should award base points with no combo', () => {
            const state = createScoring();
            const points = awardBrickPoints(state, { basePoints: 10 });

            expect(points).toBe(10);
            expect(state.score).toBe(10);
            expect(state.combo).toBe(1);
            expect(state.comboTimer).toBeGreaterThan(0);
        });

        it('should apply multiplier at combo threshold', () => {
            const state = createScoring();
            state.combo = 7; // Just below threshold

            const points1 = awardBrickPoints(state, { basePoints: 10, multiplierThreshold: 8 });
            expect(points1).toBe(10); // Still 1x multiplier
            expect(state.combo).toBe(8);

            const points2 = awardBrickPoints(state, { basePoints: 10, multiplierThreshold: 8 });
            expect(points2).toBe(13); // Now 1.25x multiplier (rounded)
            expect(state.combo).toBe(9);
        });

        it('should increase multiplier at higher combos', () => {
            const state = createScoring();
            state.combo = 15;

            const points = awardBrickPoints(state, {
                basePoints: 10,
                multiplierThreshold: 8,
                multiplierPerThreshold: 0.25,
            });

            // Combo becomes 16: floor(15/8) * 0.25 = 0.25, so 1.25x multiplier = 13 points (rounded)
            expect(points).toBe(13);
        });

        it('should reset combo timer on each brick break', () => {
            const state = createScoring();
            state.comboTimer = 0.5;

            awardBrickPoints(state, { comboDecayTime: 2.0 });

            expect(state.comboTimer).toBe(2.0);
        });
    });

    describe('decayCombo', () => {
        it('should decrease timer over time', () => {
            const state = createScoring();
            state.combo = 5;
            state.comboTimer = 1.5;

            decayCombo(state, 0.5);

            expect(state.comboTimer).toBeCloseTo(1.0, 1);
            expect(state.combo).toBe(5); // Combo still active
        });

        it('should reset combo when timer reaches zero', () => {
            const state = createScoring();
            state.combo = 5;
            state.comboTimer = 0.3;

            decayCombo(state, 0.5);

            expect(state.comboTimer).toBe(0);
            expect(state.combo).toBe(0);
        });

        it('should not decay if timer is already zero', () => {
            const state = createScoring();
            state.combo = 0;
            state.comboTimer = 0;

            decayCombo(state, 1.0);

            expect(state.comboTimer).toBe(0);
            expect(state.combo).toBe(0);
        });
    });

    describe('resetCombo', () => {
        it('should immediately reset combo and timer', () => {
            const state = createScoring();
            state.combo = 10;
            state.comboTimer = 1.5;

            resetCombo(state);

            expect(state.combo).toBe(0);
            expect(state.comboTimer).toBe(0);
        });
    });

    describe('getComboMultiplier', () => {
        it('should return 1.0 with no combo', () => {
            const multiplier = getComboMultiplier(0);
            expect(multiplier).toBe(1.0);
        });

        it('should return 1.0 below threshold', () => {
            const multiplier = getComboMultiplier(7, { multiplierThreshold: 8 });
            expect(multiplier).toBe(1.0);
        });

        it('should return 1.25 at first threshold', () => {
            const multiplier = getComboMultiplier(8, {
                multiplierThreshold: 8,
                multiplierPerThreshold: 0.25,
            });
            expect(multiplier).toBe(1.25);
        });

        it('should scale with multiple thresholds', () => {
            const multiplier = getComboMultiplier(20, {
                multiplierThreshold: 8,
                multiplierPerThreshold: 0.25,
            });
            // floor(20/8) = 2, so 1 + 2*0.25 = 1.5
            expect(multiplier).toBe(1.5);
        });
    });

    describe('isComboMilestone', () => {
        it('should return true at exact threshold', () => {
            expect(isComboMilestone(8, 8)).toBe(true);
            expect(isComboMilestone(16, 8)).toBe(true);
        });

        it('should return false between thresholds', () => {
            expect(isComboMilestone(7, 8)).toBe(false);
            expect(isComboMilestone(9, 8)).toBe(false);
        });

        it('should return false at zero', () => {
            expect(isComboMilestone(0, 8)).toBe(false);
        });
    });

    describe('getScoringDebugInfo', () => {
        it('should provide complete debug info', () => {
            const state = createScoring();
            state.score = 150;
            state.combo = 12;
            state.comboTimer = 1.2;

            const info = getScoringDebugInfo(state, { multiplierThreshold: 8 });

            expect(info.score).toBe(150);
            expect(info.combo).toBe(12);
            expect(info.comboTimer).toBe(1.2);
            expect(info.multiplier).toBe(1.25); // floor(12/8) * 0.25 = 0.25, so 1.25
            expect(info.nextMilestone).toBe(16);
            expect(info.comboActive).toBe(true);
        });
    });
});
