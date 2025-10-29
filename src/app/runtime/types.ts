import type { Vector2 } from 'input/contracts';
import type { PhysicsDebugOverlayState } from 'render/debug-overlay';

export interface SyncDriftSample {
    readonly timestamp: number;
    readonly drift: number;
    readonly magnitude: number;
}

export interface GameplayRuntimeState {
    sessionElapsedSeconds: number;
    frameTimestampMs: number;
    audioVisualSkewSeconds: number;
    syncDriftMs: number;
    syncDriftAverageMs: number;
    syncDriftPeakMs: number;
    syncDriftPeakRecordedAt: number;
    syncDriftHistory: SyncDriftSample[];
    ballGlowPulse: number;
    paddleGlowPulse: number;
    comboRingPulse: number;
    comboRingPhase: number;
    lastRecordedInputTarget: Vector2 | null;
    previousPaddlePosition: Vector2;
    lastPhysicsDebugState: PhysicsDebugOverlayState | null;
    currentBaseSpeed: number;
    currentMaxSpeed: number;
    currentLaunchSpeed: number;
    gravity: number;
    ballRestitution: number;
    paddleBaseWidth: number;
    speedGovernorMultiplier: number;
}
