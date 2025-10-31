import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'util/log';
import {
    SYNC_DRIFT_HISTORY_SECONDS,
    SYNC_DRIFT_RECOVERY_THRESHOLD_MS,
    SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS,
    SYNC_DRIFT_WARN_THRESHOLD_MS,
    createSyncDriftTelemetry,
    updateSyncDriftMetrics,
} from 'app/runtime/state-store';

const createDriftState = () => ({
    syncDriftHistory: [] as { timestamp: number; drift: number; magnitude: number }[],
    syncDriftAverageMs: 0,
    syncDriftPeakMs: 0,
    syncDriftPeakRecordedAt: 0,
    syncDriftMs: 0,
});

const createLoggerStub = (): Logger => {
    const stub: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => stub),
    };
    return stub;
};

describe('runtime state-store sync drift metrics', () => {
    it('tracks sync drift averages and peaks across samples', () => {
        const state = createDriftState();
        updateSyncDriftMetrics(state, 10, 0.1);
        updateSyncDriftMetrics(state, -4, 0.2);
        updateSyncDriftMetrics(state, 20, 1.2);

        expect(state.syncDriftHistory).toHaveLength(3);
        expect(state.syncDriftAverageMs).toBeCloseTo((10 - 4 + 20) / 3, 3);
        expect(state.syncDriftPeakMs).toBeCloseTo(20);
        expect(state.syncDriftPeakRecordedAt).toBeCloseTo(1.2);
    });

    it('drops stale sync drift samples beyond the history window', () => {
        const state = createDriftState();
        updateSyncDriftMetrics(state, 5, 0);
        updateSyncDriftMetrics(state, 1, SYNC_DRIFT_HISTORY_SECONDS + 0.1);

        expect(state.syncDriftHistory).toHaveLength(1);
        expect(state.syncDriftAverageMs).toBeCloseTo(1);
        expect(state.syncDriftPeakMs).toBeCloseTo(1);
        expect(state.syncDriftPeakRecordedAt).toBeCloseTo(SYNC_DRIFT_HISTORY_SECONDS + 0.1);
    });
});

describe('runtime state-store telemetry', () => {
    it('emits debug samples and threshold warnings then recovers', () => {
        const logger = createLoggerStub();
        const telemetry = createSyncDriftTelemetry({
            logger,
            hasPerformanceNow: true,
        });

        const state = createDriftState();
        let elapsed = 0;
        const advance = (seconds: number, driftMs: number) => {
            elapsed += seconds;
            state.syncDriftMs = driftMs;
            updateSyncDriftMetrics(state, driftMs, elapsed);
            telemetry.emit(elapsed, state);
        };

        const severeDriftMs = Math.max(1, SYNC_DRIFT_WARN_THRESHOLD_MS * 1.5);
        const mildDriftMs = Math.max(1, SYNC_DRIFT_RECOVERY_THRESHOLD_MS * 0.25);

        advance(SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS / 2, severeDriftMs);
        advance(SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS / 2, severeDriftMs);

        expect(logger.warn).toHaveBeenCalledWith('Audio sync drift above threshold', expect.objectContaining({
            peakMs: expect.any(Number),
            thresholdMs: SYNC_DRIFT_WARN_THRESHOLD_MS,
        }));
        expect(logger.debug).toHaveBeenCalledWith('Sync drift sample', expect.objectContaining({
            sampleWindowSeconds: SYNC_DRIFT_HISTORY_SECONDS,
            sampleCount: expect.any(Number),
        }));

        advance(SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS / 2, mildDriftMs);
        advance(SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS / 2, mildDriftMs);
        advance(SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS / 2, mildDriftMs);
        advance(SYNC_DRIFT_TELEMETRY_INTERVAL_SECONDS / 2, mildDriftMs);

        expect(logger.info).toHaveBeenCalledWith('Audio sync drift recovered', expect.objectContaining({
            peakMs: expect.any(Number),
        }));
    });

    it('resets collected state when reset is invoked', () => {
        const logger = createLoggerStub();
        const telemetry = createSyncDriftTelemetry({
            logger,
            hasPerformanceNow: true,
        });

        const state = createDriftState();
        updateSyncDriftMetrics(state, SYNC_DRIFT_WARN_THRESHOLD_MS * 2, 1);
        telemetry.emit(1, state);
        expect(logger.warn).toHaveBeenCalled();

        telemetry.reset();
        const resetState = createDriftState();
        updateSyncDriftMetrics(resetState, SYNC_DRIFT_RECOVERY_THRESHOLD_MS / 2, 2);
        telemetry.emit(2, resetState);
        expect(logger.info).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
