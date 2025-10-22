/**
 * Combo-Based Scoring System
 *
 * Adapted from Banana Music Game's scoring mechanics
 * Rewards chains with multipliers and decays over time
 */
import { gameConfig, type GameConfig } from 'config/game';

export interface ScoreState {
    /** Current total score */
    score: number;
    /** Current combo count */
    combo: number;
    /** Time remaining before combo resets (in seconds) */
    comboTimer: number;
    /** Callback to update HUD/UI */
    updateHUD?: () => void;
}

export interface ScoringConfig {
    /** Base points per brick break */
    readonly basePoints?: number;
    /** Combo threshold for multiplier increase (default: 8) */
    readonly multiplierThreshold?: number;
    /** Multiplier increase per threshold (default: 0.25 = +25%) */
    readonly multiplierPerThreshold?: number;
    /** Combo decay timer duration in seconds (default: 1.6) */
    readonly comboDecayTime?: number;
}

const config: GameConfig = gameConfig;
const DEFAULT_BASE_POINTS = config.scoring.basePoints;
const DEFAULT_MULTIPLIER_THRESHOLD = config.scoring.multiplierThreshold;
const DEFAULT_MULTIPLIER_PER_THRESHOLD = config.scoring.multiplierPerThreshold;
const DEFAULT_COMBO_DECAY_TIME = config.scoring.comboDecayTime;

/**
 * Create a new scoring state
 *
 * @param updateHUD - Optional callback to trigger HUD updates
 * @returns Initial score state
 */
export function createScoring(updateHUD?: () => void): ScoreState {
    return {
        score: 0,
        combo: 0,
        comboTimer: 0,
        updateHUD,
    };
}

/**
 * Award points for brick break with combo multiplier
 *
 * @param state - Score state to update (mutates in place)
 * @param config - Scoring configuration
 * @returns Points awarded
 */
export function awardBrickPoints(state: ScoreState, config: ScoringConfig = {}): number {
    const basePoints = config.basePoints ?? DEFAULT_BASE_POINTS;
    const threshold = config.multiplierThreshold ?? DEFAULT_MULTIPLIER_THRESHOLD;
    const multiplierPer = config.multiplierPerThreshold ?? DEFAULT_MULTIPLIER_PER_THRESHOLD;
    const decayTime = config.comboDecayTime ?? DEFAULT_COMBO_DECAY_TIME;

    // Calculate multiplier based on combo threshold
    const multiplier = 1 + Math.floor(state.combo / threshold) * multiplierPer;
    const points = Math.round(basePoints * multiplier);

    // Update state
    state.score += points;
    state.combo += 1;
    state.comboTimer = decayTime; // Reset decay timer

    // Trigger HUD update if callback provided
    state.updateHUD?.();

    return points;
}

/**
 * Decay combo over time, resetting when timer reaches zero
 *
 * @param state - Score state to update (mutates in place)
 * @param deltaSeconds - Time elapsed since last update (in seconds)
 */
export function decayCombo(state: ScoreState, deltaSeconds: number): void {
    if (state.comboTimer > 0) {
        state.comboTimer -= deltaSeconds;
        if (state.comboTimer <= 0) {
            state.combo = 0;
            state.comboTimer = 0;
            state.updateHUD?.();
        }
    }
}

/**
 * Reset combo immediately (e.g., on life lost)
 *
 * @param state - Score state to update (mutates in place)
 */
export function resetCombo(state: ScoreState): void {
    state.combo = 0;
    state.comboTimer = 0;
    state.updateHUD?.();
}

/**
 * Get current combo multiplier
 *
 * @param combo - Current combo count
 * @param config - Scoring configuration
 * @returns Current multiplier (1.0 = no bonus)
 */
export function getComboMultiplier(combo: number, config: ScoringConfig = {}): number {
    const threshold = config.multiplierThreshold ?? DEFAULT_MULTIPLIER_THRESHOLD;
    const multiplierPer = config.multiplierPerThreshold ?? DEFAULT_MULTIPLIER_PER_THRESHOLD;
    return 1 + Math.floor(combo / threshold) * multiplierPer;
}

/**
 * Check if combo reached a milestone threshold
 *
 * @param combo - Current combo count
 * @param threshold - Milestone threshold
 * @returns True if combo is exactly at a multiple of threshold
 */
export function isComboMilestone(combo: number, threshold: number = DEFAULT_MULTIPLIER_THRESHOLD): boolean {
    return combo > 0 && combo % threshold === 0;
}

/**
 * Get scoring debug info
 *
 * @param state - Score state
 * @param config - Scoring configuration
 * @returns Debug information about scoring state
 */
export function getScoringDebugInfo(state: ScoreState, config: ScoringConfig = {}): {
    score: number;
    combo: number;
    comboTimer: number;
    multiplier: number;
    nextMilestone: number;
    comboActive: boolean;
} {
    const threshold = config.multiplierThreshold ?? DEFAULT_MULTIPLIER_THRESHOLD;
    const multiplier = getComboMultiplier(state.combo, config);
    const nextMilestone = Math.ceil(state.combo / threshold) * threshold;

    return {
        score: state.score,
        combo: state.combo,
        comboTimer: state.comboTimer,
        multiplier,
        nextMilestone,
        comboActive: state.comboTimer > 0,
    };
}
