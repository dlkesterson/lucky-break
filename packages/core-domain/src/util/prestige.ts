import type { GameConfig } from 'config/game';

export interface PrestigeAwardInput {
    readonly score: number;
    readonly roundsCompleted: number;
    readonly highestCombo: number;
    readonly coinsBanked: number;
}

export type PrestigeDustConfig = GameConfig['prestige'];

const safeInteger = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.trunc(value));
};

const safeDivisor = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
        return 0;
    }
    return value;
};

/**
 * Derive the amount of certainty dust awarded when a run concludes.
 * The formula emphasizes sustained performance (score and rounds cleared)
 * while keeping rewards bounded for balance predictability.
 */
export const computePrestigeDust = (
    input: PrestigeAwardInput,
    config: PrestigeDustConfig,
): number => {
    const scoreDivisor = safeDivisor(config.scoreDivisor);
    const comboDivisor = safeDivisor(config.comboDivisor);
    const coinDivisor = safeDivisor(config.coinDivisor);

    const score = safeInteger(input.score);
    const roundsCompleted = safeInteger(input.roundsCompleted);
    const highestCombo = safeInteger(input.highestCombo);
    const coinsBanked = safeInteger(input.coinsBanked);

    const scoreDust = scoreDivisor > 0 ? Math.floor(score / scoreDivisor) : 0;
    const roundDust = Math.max(0, roundsCompleted - 1) * Math.max(0, config.roundBonus);
    const comboDust = comboDivisor > 0 ? Math.floor(highestCombo / comboDivisor) : 0;
    const coinDust = coinDivisor > 0 ? Math.floor(coinsBanked / coinDivisor) : 0;

    const totalDust = scoreDust + roundDust + comboDust + coinDust;
    if (totalDust <= 0) {
        return 0;
    }

    const minimumDust = Math.max(0, Math.trunc(config.minimumDust));
    const maximumDust = Math.max(minimumDust, Math.trunc(config.maximumDust));
    const boundedDust = Math.max(totalDust, minimumDust);

    return Math.min(boundedDust, maximumDust);
};
