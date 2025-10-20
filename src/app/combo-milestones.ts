import type { LuckyBreakEventBus } from './events';
import { getComboMultiplier, isComboMilestone, type ScoringConfig } from 'util/scoring';

export interface PublishComboMilestoneOptions {
    readonly bus: LuckyBreakEventBus;
    readonly sessionId: string;
    readonly previousCombo: number;
    readonly currentCombo: number;
    readonly pointsAwarded: number;
    readonly totalScore: number;
    readonly config?: ScoringConfig;
}

/**
 * Publish a combo milestone event when the combo crosses a threshold.
 *
 * Returns true when an event was emitted so callers can react if needed.
 */
export const publishComboMilestoneIfNeeded = (options: PublishComboMilestoneOptions): boolean => {
    if (options.currentCombo <= options.previousCombo) {
        return false;
    }

    const threshold = options.config?.multiplierThreshold;
    const milestoneReached =
        threshold !== undefined
            ? isComboMilestone(options.currentCombo, threshold)
            : isComboMilestone(options.currentCombo);

    if (!milestoneReached) {
        return false;
    }

    const multiplier = getComboMultiplier(options.currentCombo, options.config);

    options.bus.publish('ComboMilestoneReached', {
        sessionId: options.sessionId,
        combo: options.currentCombo,
        multiplier,
        pointsAwarded: options.pointsAwarded,
        totalScore: options.totalScore,
    });

    return true;
};
