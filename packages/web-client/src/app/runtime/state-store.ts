import type { Logger } from 'util/log';
import type { GameplayRuntimeState, SyncDriftSample } from './types';

export interface RuntimeStateDefaults {
    readonly baseBallSpeed: number;
    readonly maxBallSpeed: number;
    readonly launchBallSpeed: number;
    readonly gravity: number;
    readonly ballRestitution: number;
    readonly paddleBaseWidth: number;
    readonly paddleWidthMultiplier: number;
    readonly speedGovernorMultiplier: number;
}

export const SYNC_DRIFT_HISTORY_SECONDS = 6;
export const SYNC_DRIFT_HISTORY_MAX_SAMPLES = SYNC_DRIFT_HISTORY_SECONDS * 120;
export const SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS = 12;
export const SYNC_DRIFT_WARN_THRESHOLD_MS = 35;
export const SYNC_DRIFT_RECOVERY_THRESHOLD_MS = 12;

export const createRuntimeState = (defaults: RuntimeStateDefaults): GameplayRuntimeState => ({
    sessionElapsedSeconds: 0,
    frameTimestampMs: 0,
    audioVisualSkewSeconds: 0,
    syncDriftMs: 0,
    syncDriftAverageMs: 0,
    syncDriftPeakMs: 0,
    syncDriftPeakRecordedAt: 0,
    syncDriftHistory: [],
    ballGlowPulse: 0,
    paddleGlowPulse: 0,
    comboRingPulse: 0,
    comboRingPhase: 0,
    lastRecordedInputTarget: null,
    previousPaddlePosition: { x: 0, y: 0 },
    lastPhysicsDebugState: null,
    currentBaseSpeed: defaults.baseBallSpeed,
    currentMaxSpeed: defaults.maxBallSpeed,
    currentLaunchSpeed: defaults.launchBallSpeed,
    gravity: defaults.gravity,
    ballRestitution: defaults.ballRestitution,
    paddleBaseWidth: defaults.paddleBaseWidth * defaults.paddleWidthMultiplier,
    speedGovernorMultiplier: defaults.speedGovernorMultiplier,
});

export const updateSyncDriftMetrics = (
    state: Pick<
        GameplayRuntimeState,
        'syncDriftHistory' | 'syncDriftAverageMs' | 'syncDriftPeakMs' | 'syncDriftPeakRecordedAt'
    >,
    driftMs: number,
    elapsedSeconds: number,
): void => {
    const safeElapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
    const safeDrift = Number.isFinite(driftMs) ? driftMs : 0;
    state.syncDriftHistory.push({
        timestamp: safeElapsed,
        drift: safeDrift,
        magnitude: Math.abs(safeDrift),
    } satisfies SyncDriftSample);

    const cutoff = safeElapsed - SYNC_DRIFT_HISTORY_SECONDS;
    while (state.syncDriftHistory.length > 0) {
        const oldest = state.syncDriftHistory[0];
        if (!oldest || oldest.timestamp >= cutoff) {
            break;
        }
        state.syncDriftHistory.shift();
    }

    if (state.syncDriftHistory.length > SYNC_DRIFT_HISTORY_MAX_SAMPLES) {
        state.syncDriftHistory.splice(0, state.syncDriftHistory.length - SYNC_DRIFT_HISTORY_MAX_SAMPLES);
    }

    if (state.syncDriftHistory.length === 0) {
        state.syncDriftAverageMs = 0;
        state.syncDriftPeakMs = 0;
        state.syncDriftPeakRecordedAt = safeElapsed;
        return;
    }

    let sum = 0;
    let peak = 0;
    let peakTimestamp = state.syncDriftHistory[state.syncDriftHistory.length - 1]?.timestamp ?? safeElapsed;
    for (const sample of state.syncDriftHistory) {
        sum += sample.drift;
        if (sample.magnitude >= peak) {
            peak = sample.magnitude;
            peakTimestamp = sample.timestamp;
        }
    }

    state.syncDriftAverageMs = sum / state.syncDriftHistory.length;
    state.syncDriftPeakMs = peak;
    state.syncDriftPeakRecordedAt = peakTimestamp;
};

const formatDriftValue = (value: number): number => {
    if (!Number.isFinite(value)) {
        return value;
    }
    return Number(value.toFixed(2));
};

export interface SyncDriftTelemetryDependencies {
    readonly logger: Logger;
    readonly hasPerformanceNow: boolean;
}

export interface SyncDriftTelemetryController {
    emit(elapsedSeconds: number, state: Pick<GameplayRuntimeState, 'syncDriftHistory' | 'syncDriftMs' | 'syncDriftAverageMs' | 'syncDriftPeakMs' | 'syncDriftPeakRecordedAt'>): void;
    reset(): void;
}

export const createSyncDriftTelemetry = ({
    logger,
    hasPerformanceNow,
}: SyncDriftTelemetryDependencies): SyncDriftTelemetryController => {
    let nextSyncDriftTelemetryLogAt = SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
    let syncDriftWarnActive = false;

    const emit: SyncDriftTelemetryController['emit'] = (elapsedSeconds, state) => {
        if (!hasPerformanceNow) {
            return;
        }

        const sampleCount = state.syncDriftHistory.length;
        if (sampleCount === 0) {
            return;
        }

        if (elapsedSeconds >= nextSyncDriftTelemetryLogAt) {
            logger.debug('Sync drift sample', {
                elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
                currentMs: formatDriftValue(state.syncDriftMs),
                averageMs: formatDriftValue(state.syncDriftAverageMs),
                peakMs: formatDriftValue(state.syncDriftPeakMs),
                peakRecordedAt: Number(state.syncDriftPeakRecordedAt.toFixed(3)),
                sampleWindowSeconds: SYNC_DRIFT_HISTORY_SECONDS,
                sampleCount,
            });
            nextSyncDriftTelemetryLogAt = elapsedSeconds + SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
        }

        const peakMagnitude = Math.abs(state.syncDriftPeakMs);
        const averageMagnitude = Math.abs(state.syncDriftAverageMs);

        if (!syncDriftWarnActive && peakMagnitude >= SYNC_DRIFT_WARN_THRESHOLD_MS) {
            logger.warn('Audio sync drift above threshold', {
                peakMs: formatDriftValue(state.syncDriftPeakMs),
                averageMs: formatDriftValue(state.syncDriftAverageMs),
                currentMs: formatDriftValue(state.syncDriftMs),
                recordedAt: Number(state.syncDriftPeakRecordedAt.toFixed(3)),
                thresholdMs: SYNC_DRIFT_WARN_THRESHOLD_MS,
            });
            syncDriftWarnActive = true;
        } else if (syncDriftWarnActive && peakMagnitude <= SYNC_DRIFT_RECOVERY_THRESHOLD_MS && averageMagnitude <= SYNC_DRIFT_RECOVERY_THRESHOLD_MS) {
            logger.info('Audio sync drift recovered', {
                peakMs: formatDriftValue(state.syncDriftPeakMs),
                averageMs: formatDriftValue(state.syncDriftAverageMs),
                currentMs: formatDriftValue(state.syncDriftMs),
                recordedAt: Number(state.syncDriftPeakRecordedAt.toFixed(3)),
            });
            syncDriftWarnActive = false;
        }
    };

    const reset: SyncDriftTelemetryController['reset'] = () => {
        nextSyncDriftTelemetryLogAt = SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS;
        syncDriftWarnActive = false;
    };

    return {
        emit,
        reset,
    };
};
