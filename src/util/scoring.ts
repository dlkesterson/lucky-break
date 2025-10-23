/**
 * Combo-Based Scoring System
 *
 * Adapted from Banana Music Game's scoring mechanics
 * Rewards chains with multipliers and decays over time
 */
import { gameConfig, type GameConfig } from 'config/game';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export interface MomentumMetrics {
    /** Running count of successive brick breaks without a combo reset */
    volleyLength: number;
    /** Normalized pressure based on recent impact speed */
    speedPressure: number;
    /** Remaining bricks over total bricks in the round (0-1) */
    brickDensity: number;
    /** Normalized combo heat based on current combo vs threshold */
    comboHeat: number;
    /** Mirror of comboTimer for HUD consumers */
    comboTimer: number;
}

export type MomentumSnapshot = MomentumMetrics;

export interface ScoreState {
    /** Current total score */
    score: number;
    /** Current combo count */
    combo: number;
    /** Time remaining before combo resets (in seconds) */
    comboTimer: number;
    /** Callback to update HUD/UI */
    updateHUD?: () => void;
    /** Momentum metrics surfaced to HUD/analytics */
    momentum: MomentumMetrics;
}

export interface ScoringMomentumConfig {
    /** Scales existing pressure when a new impact arrives (0-1 keeps value bounded) */
    readonly speedPressureImpactRetention?: number;
    /** Passive decay applied when no impact data is provided (0-1 multiplier) */
    readonly speedPressureAmbientDecay?: number;
    /** Linear decay applied per second when combo is ticking down */
    readonly speedPressureDecayPerSecond?: number;
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
    /** Optional overrides for momentum tuning */
    readonly momentum?: ScoringMomentumConfig;
}

export interface BrickImpactContext {
    /** Bricks remaining after this break */
    readonly bricksRemaining?: number;
    /** Total breakable bricks for the round */
    readonly brickTotal?: number;
    /** Impact speed for the ball (units per step) */
    readonly impactSpeed?: number;
    /** Optional override for maximum expected speed */
    readonly maxSpeed?: number;
}

const config: GameConfig = gameConfig;
const DEFAULT_BASE_POINTS = config.scoring.basePoints;
const DEFAULT_MULTIPLIER_THRESHOLD = config.scoring.multiplierThreshold;
const DEFAULT_MULTIPLIER_PER_THRESHOLD = config.scoring.multiplierPerThreshold;
const DEFAULT_COMBO_DECAY_TIME = config.scoring.comboDecayTime;
const DEFAULT_MAX_SPEED = config.ball.maxSpeed;

interface MomentumTuningDefaults {
    speedPressureImpactRetention: number;
    speedPressureAmbientDecay: number;
    speedPressureDecayPerSecond: number;
}

const DEFAULT_MOMENTUM_TUNING: MomentumTuningDefaults = {
    speedPressureImpactRetention: config.scoring.momentum.speedPressureImpactRetention,
    speedPressureAmbientDecay: config.scoring.momentum.speedPressureAmbientDecay,
    speedPressureDecayPerSecond: config.scoring.momentum.speedPressureDecayPerSecond,
};

interface ResolvedMomentumConfig {
    impactRetention: number;
    ambientDecay: number;
    decayPerSecond: number;
}

const coerceNumber = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) ? value : fallback;

const resolveMomentumConfig = (override?: ScoringMomentumConfig): ResolvedMomentumConfig => {
    const impactRetention = clamp01(
        coerceNumber(override?.speedPressureImpactRetention, DEFAULT_MOMENTUM_TUNING.speedPressureImpactRetention),
    );
    const ambientDecay = clamp01(
        coerceNumber(override?.speedPressureAmbientDecay, DEFAULT_MOMENTUM_TUNING.speedPressureAmbientDecay),
    );
    const decayPerSecond = Math.max(
        0,
        coerceNumber(override?.speedPressureDecayPerSecond, DEFAULT_MOMENTUM_TUNING.speedPressureDecayPerSecond),
    );

    return { impactRetention, ambientDecay, decayPerSecond };
};

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
        momentum: {
            volleyLength: 0,
            speedPressure: 0,
            brickDensity: 1,
            comboHeat: 0,
            comboTimer: 0,
        },
    };
}

/**
 * Award points for brick break with combo multiplier
 *
 * @param state - Score state to update (mutates in place)
 * @param config - Scoring configuration
 * @returns Points awarded
 */
export function awardBrickPoints(
    state: ScoreState,
    config: ScoringConfig = {},
    context: BrickImpactContext = {},
): number {
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
    const momentum = state.momentum;
    momentum.volleyLength += 1;
    const { bricksRemaining, brickTotal, impactSpeed, maxSpeed } = context;
    if (
        brickTotal !== undefined &&
        brickTotal > 0 &&
        bricksRemaining !== undefined &&
        Number.isFinite(bricksRemaining)
    ) {
        momentum.brickDensity = clamp01(bricksRemaining / brickTotal);
    }

    const momentumConfig = resolveMomentumConfig(config.momentum);
    const speedCap = maxSpeed ?? DEFAULT_MAX_SPEED;
    if (speedCap > 0 && impactSpeed !== undefined && Number.isFinite(impactSpeed)) {
        const normalizedSpeed = clamp01(Math.abs(impactSpeed) / speedCap);
        const retained = momentum.speedPressure * momentumConfig.impactRetention;
        const updated = Math.max(retained, normalizedSpeed);
        momentum.speedPressure = clamp01(updated);
    } else {
        const decayed = momentum.speedPressure * momentumConfig.ambientDecay;
        momentum.speedPressure = clamp01(decayed);
    }

    const comboHeat = threshold > 0 ? clamp01(state.combo / threshold) : 0;
    momentum.comboHeat = Math.max(momentum.comboHeat, comboHeat);
    momentum.comboTimer = state.comboTimer;

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
export function decayCombo(state: ScoreState, deltaSeconds: number, config: ScoringConfig = {}): void {
    if (state.comboTimer > 0) {
        state.comboTimer -= deltaSeconds;
        if (state.comboTimer <= 0) {
            state.combo = 0;
            state.comboTimer = 0;
            state.updateHUD?.();
        }
    }

    const momentum = state.momentum;
    const momentumConfig = resolveMomentumConfig(config.momentum);
    if (
        momentum.speedPressure > 0 &&
        Number.isFinite(deltaSeconds) &&
        deltaSeconds > 0 &&
        momentumConfig.decayPerSecond > 0
    ) {
        const decayed = momentum.speedPressure - deltaSeconds * momentumConfig.decayPerSecond;
        momentum.speedPressure = clamp01(Math.max(0, decayed));
    }

    momentum.comboTimer = Math.max(0, state.comboTimer);
    if (state.comboTimer <= 0) {
        momentum.comboHeat = 0;
        momentum.volleyLength = 0;
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
    const momentum = state.momentum;
    momentum.comboHeat = 0;
    momentum.volleyLength = 0;
    momentum.speedPressure = 0;
    momentum.comboTimer = 0;
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
    momentum: MomentumSnapshot;
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
        momentum: { ...state.momentum },
    };
}

export const getMomentumMetrics = (state: ScoreState): MomentumSnapshot => ({
    ...state.momentum,
});
