/**
 * Visual Effects Configuration
 *
 * Centralized configuration for visual effect systems including
 * foreshadowing, chromatic trails, and related timing constants.
 */

import type { RuntimeConfigResolver } from '../config-resolver';

/**
 * Foreshadowing system configuration - predicts ball trajectories
 * and renders visual hints for player anticipation.
 */
export interface ForeshadowConfig {
    readonly minPredictionSeconds: number;
    readonly maxPredictionSeconds: number;
    readonly minSpeed: number;
    readonly minLeadSeconds: number;
    readonly maxLeadSeconds: number;
}

/**
 * Chromatic trail system configuration - renders colorful motion trails
 * behind balls that react to combo state and speed.
 */
export interface ChromaticTrailConfig {
    readonly historySeconds: number;
    readonly maxSamples: number;
    readonly minSampleInterval: number;
    readonly followerDecay: number;
    readonly minRadiusScale: number;
    readonly speedAttenuation: number;
}

/**
 * Complete visual effects configuration bundle.
 */
export interface VisualEffectsConfig {
    readonly foreshadow: ForeshadowConfig;
    readonly chromaticTrail: ChromaticTrailConfig;
}

/**
 * Base configuration constants for visual effects.
 * These are used as defaults when no config resolver is available.
 */
export const BASE_VISUAL_EFFECTS_CONFIG: VisualEffectsConfig = {
    foreshadow: {
        minPredictionSeconds: 0.28,
        maxPredictionSeconds: 3.6,
        minSpeed: 4, // Will be computed as Math.max(4, configResolver.baseSpeed * 0.75)
        minLeadSeconds: 0.35,
        maxLeadSeconds: 2.6,
    },
    chromaticTrail: {
        historySeconds: 2.2,
        maxSamples: 120,
        minSampleInterval: 0.008,
        followerDecay: 0.18,
        minRadiusScale: 0.42,
        speedAttenuation: 0.16,
    },
} as const;

/**
 * Creates a resolved visual effects configuration using the runtime config resolver.
 * Applies dynamic adjustments based on game speed settings.
 *
 * @param configResolver - Runtime configuration resolver for accessing game config
 * @returns Fully resolved visual effects configuration
 */
export const createVisualEffectsConfig = (
    configResolver: RuntimeConfigResolver,
): VisualEffectsConfig => {
    const baseSpeed = configResolver.baseSpeed;

    return {
        foreshadow: {
            ...BASE_VISUAL_EFFECTS_CONFIG.foreshadow,
            minSpeed: Math.max(4, baseSpeed * 0.75),
        },
        chromaticTrail: {
            ...BASE_VISUAL_EFFECTS_CONFIG.chromaticTrail,
        },
    };
};
