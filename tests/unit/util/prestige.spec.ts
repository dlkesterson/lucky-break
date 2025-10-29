import { describe, expect, it } from 'vitest';
import { computePrestigeDust, type PrestigeAwardInput } from 'util/prestige';

const config = {
    scoreDivisor: 15000,
    roundBonus: 2,
    comboDivisor: 40,
    coinDivisor: 275,
    minimumDust: 2,
    maximumDust: 125,
} as const;

describe('computePrestigeDust', () => {
    const baseInput: PrestigeAwardInput = {
        score: 0,
        roundsCompleted: 1,
        highestCombo: 0,
        coinsBanked: 0,
    };

    it('returns zero dust when no meaningful progress is made', () => {
        expect(computePrestigeDust(baseInput, config)).toBe(0);
    });

    it('applies the minimum threshold when performance yields some dust', () => {
        const input: PrestigeAwardInput = {
            ...baseInput,
            score: 16000,
            roundsCompleted: 1,
        };
        expect(computePrestigeDust(input, config)).toBe(config.minimumDust);
    });

    it('scales with multiple performance vectors', () => {
        const input: PrestigeAwardInput = {
            score: 120000,
            roundsCompleted: 6,
            highestCombo: 95,
            coinsBanked: 840,
        };
        const dust = computePrestigeDust(input, config);
        expect(dust).toBeGreaterThan(config.minimumDust);
        expect(dust).toBeLessThan(config.maximumDust);
    });

    it('caps at the configured maximum', () => {
        const input: PrestigeAwardInput = {
            score: 1_000_000,
            roundsCompleted: 25,
            highestCombo: 400,
            coinsBanked: 9000,
        };
        expect(computePrestigeDust(input, config)).toBe(config.maximumDust);
    });
});
