import type { LoopOptions } from '../../loop';
import type { RuntimeVisuals } from '../physics-assembly';

interface PerformanceLogger {
    info(message: string, context?: Record<string, unknown>): void;
}

export interface RuntimePerformanceOptions {
    readonly logger: PerformanceLogger;
    readonly initialPreference: boolean;
    readonly subscribePreference: (listener: (preference: boolean) => void) => (() => void) | null;
}

export interface RuntimePerformanceHandle {
    readonly handleFrameMetrics: LoopOptions['onFrameMetrics'];
    readonly updateVisuals: (visuals: RuntimeVisuals | null) => void;
    readonly reset: () => void;
    readonly dispose: () => void;
    readonly getProfile: () => 'quality' | 'performance';
}

const LOW_FPS_THRESHOLD = 45;
const RECOVER_FPS_THRESHOLD = 55;
const LOW_FPS_TRIGGER_MS = 4_000;
const HIGH_FPS_RECOVER_MS = 6_000;

export const createRuntimePerformance = ({
    logger,
    initialPreference,
    subscribePreference,
}: RuntimePerformanceOptions): RuntimePerformanceHandle => {
    let visuals: RuntimeVisuals | null = null;
    let userPreference = Boolean(initialPreference);
    let dynamicPerformanceMode = false;
    let desiredProfile: 'quality' | 'performance' = userPreference ? 'performance' : 'quality';
    let accumulatedLowFpsMs = 0;
    let accumulatedHighFpsMs = 0;

    const applyProfile = () => {
        desiredProfile = userPreference || dynamicPerformanceMode ? 'performance' : 'quality';
        visuals?.setEffectProfile(desiredProfile);
    };

    const unsubscribePreference = subscribePreference((preference) => {
        userPreference = Boolean(preference);
        applyProfile();
    });

    const handleFrameMetrics: LoopOptions['onFrameMetrics'] = ({ rawDeltaMs }) => {
        if (!Number.isFinite(rawDeltaMs) || rawDeltaMs <= 0) {
            return;
        }

        const clampedDelta = Math.max(0, rawDeltaMs);
        const fps = clampedDelta > 0 ? 1000 / clampedDelta : Number.POSITIVE_INFINITY;

        if (fps < LOW_FPS_THRESHOLD) {
            accumulatedLowFpsMs = Math.min(LOW_FPS_TRIGGER_MS, accumulatedLowFpsMs + clampedDelta);
            accumulatedHighFpsMs = Math.max(0, accumulatedHighFpsMs - clampedDelta * 0.5);
        } else if (fps >= RECOVER_FPS_THRESHOLD) {
            accumulatedHighFpsMs = Math.min(HIGH_FPS_RECOVER_MS, accumulatedHighFpsMs + clampedDelta);
            accumulatedLowFpsMs = Math.max(0, accumulatedLowFpsMs - clampedDelta);
        } else {
            accumulatedLowFpsMs = Math.max(0, accumulatedLowFpsMs - clampedDelta * 0.5);
            accumulatedHighFpsMs = Math.max(0, accumulatedHighFpsMs - clampedDelta);
        }

        if (!dynamicPerformanceMode && accumulatedLowFpsMs >= LOW_FPS_TRIGGER_MS) {
            dynamicPerformanceMode = true;
            accumulatedHighFpsMs = 0;
            logger.info('Enabling performance profile due to sustained low FPS', {
                fps: Number(fps.toFixed(1)),
            });
            applyProfile();
        } else if (dynamicPerformanceMode && !userPreference && accumulatedHighFpsMs >= HIGH_FPS_RECOVER_MS) {
            dynamicPerformanceMode = false;
            accumulatedLowFpsMs = 0;
            logger.info('Restoring quality profile after sustained recovery', {
                fps: Number(fps.toFixed(1)),
            });
            applyProfile();
        }
    };

    const updateVisuals = (nextVisuals: RuntimeVisuals | null) => {
        visuals = nextVisuals;
        if (visuals) {
            visuals.setEffectProfile(desiredProfile);
        }
    };

    const reset = () => {
        dynamicPerformanceMode = false;
        accumulatedLowFpsMs = 0;
        accumulatedHighFpsMs = 0;
        applyProfile();
    };

    const dispose = () => {
        unsubscribePreference?.();
    };

    const getProfile = () => desiredProfile;

    return {
        handleFrameMetrics,
        updateVisuals,
        reset,
        dispose,
        getProfile,
    } satisfies RuntimePerformanceHandle;
};
