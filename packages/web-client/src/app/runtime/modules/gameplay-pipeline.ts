/**
 * Gameplay Pipeline - Modular update stages for the main gameplay loop
 *
 * Extracted from the monolithic runGameplayUpdate function to improve
 * maintainability and testability. Each stage handles a discrete aspect
 * of the gameplay update cycle.
 */

import { Vector as MatterVector } from 'physics/matter';
import type { GameplayRuntimeState } from '../types';
import { clampUnit } from 'render/playfield-visuals';
import { updateSyncDriftMetrics } from '../state-store';
import { calculateBallSpeedScale } from 'util/power-ups';
import { getAdaptiveBaseSpeed } from 'util/speed-regulation';
import { toMusicLives } from '../utils/audio-utils';

export interface TimingSyncContext {
    deltaSeconds: number;
    scheduler: any;
    runtimeState: GameplayRuntimeState;
    replayBuffer: any;
    sessionNow: () => number;
    hasPerformanceNow: boolean;
    syncDriftTelemetry: {
        emit: (timestamp: number, state: GameplayRuntimeState) => void;
        reset: () => void;
    };
}

export interface SpeedCalculationContext {
    runtimeState: GameplayRuntimeState;
    scoringState: any;
    powerUpManager: any;
    roundMachine: any;
    configResolver: {
        baseSpeed: number;
        maxSpeed: number;
        launchSpeed: number;
    };
    loadoutPhysicsMultipliers: {
        baseSpeed: number;
        maxSpeed: number;
        launchSpeed: number;
    };
}

export interface ManagerUpdateContext {
    deltaSeconds: number;
    timeScale: number;
}

/**
 * Updates audio/visual synchronization tracking and drift metrics
 */
export function updateTimingAndSync(ctx: TimingSyncContext): void {
    const audioTimeSeconds = ctx.scheduler.now();
    const nextElapsedSeconds = ctx.runtimeState.sessionElapsedSeconds + ctx.deltaSeconds;

    if (ctx.hasPerformanceNow) {
        const wallClockSeconds = performance.now() / 1000;
        ctx.runtimeState.audioVisualSkewSeconds = wallClockSeconds - audioTimeSeconds;
        ctx.runtimeState.syncDriftMs = ctx.runtimeState.audioVisualSkewSeconds * 1000;
        updateSyncDriftMetrics(ctx.runtimeState, ctx.runtimeState.syncDriftMs, nextElapsedSeconds);
    } else {
        ctx.runtimeState.audioVisualSkewSeconds = 0;
        ctx.runtimeState.syncDriftMs = 0;
        ctx.runtimeState.syncDriftAverageMs = 0;
        ctx.runtimeState.syncDriftPeakMs = 0;
        ctx.runtimeState.syncDriftPeakRecordedAt = nextElapsedSeconds;
        ctx.runtimeState.syncDriftHistory.length = 0;
        ctx.syncDriftTelemetry.reset();
    }

    ctx.runtimeState.sessionElapsedSeconds = nextElapsedSeconds;
    ctx.syncDriftTelemetry.emit(ctx.runtimeState.sessionElapsedSeconds, ctx.runtimeState);
    ctx.replayBuffer.markTime(ctx.runtimeState.sessionElapsedSeconds);
    ctx.runtimeState.frameTimestampMs = ctx.sessionNow();
}

/**
 * Calculates current speed targets based on powerups, difficulty, and combo
 */
export function calculateSpeedTargets(ctx: SpeedCalculationContext): {
    currentBaseSpeed: number;
    currentMaxSpeed: number;
    currentLaunchSpeed: number;
} {
    const speedMultiplier = calculateBallSpeedScale(ctx.powerUpManager.getEffect('ball-speed'));
    const difficultyScale = ctx.roundMachine.getLevelDifficultyMultiplier();
    const governor = ctx.runtimeState.speedGovernorMultiplier;

    const baseTargetSpeed =
        ctx.configResolver.baseSpeed *
        ctx.loadoutPhysicsMultipliers.baseSpeed *
        speedMultiplier *
        difficultyScale *
        governor;

    const maxSpeedTarget =
        ctx.configResolver.maxSpeed *
        ctx.loadoutPhysicsMultipliers.maxSpeed *
        speedMultiplier *
        difficultyScale *
        governor;

    const currentMaxSpeed = Math.max(1, maxSpeedTarget);
    const currentBaseSpeed = getAdaptiveBaseSpeed(
        baseTargetSpeed,
        currentMaxSpeed,
        ctx.scoringState.combo,
    );

    const currentLaunchSpeed =
        ctx.configResolver.launchSpeed *
        ctx.loadoutPhysicsMultipliers.launchSpeed *
        speedMultiplier *
        difficultyScale *
        governor;

    return { currentBaseSpeed, currentMaxSpeed, currentLaunchSpeed };
}

/**
 * Builds music state from current gameplay metrics
 */
export function buildMusicState(
    speedAfterRegulation: number,
    currentBaseSpeed: number,
    currentMaxSpeed: number,
    bricksRemaining: number,
    bricksTotal: number,
    livesRemaining: number,
    combo: number,
): {
    lives: 1 | 2 | 3;
    combo: number;
    tempoRatio: number;
    bricksRemainingRatio: number;
    warbleIntensity: number;
} {
    const speedRange = Math.max(1, currentMaxSpeed - currentBaseSpeed);
    const normalizedSpeed =
        speedRange <= 1
            ? clampUnit(speedAfterRegulation / Math.max(1, currentMaxSpeed))
            : clampUnit((speedAfterRegulation - currentBaseSpeed) / speedRange);

    const bricksRatio = bricksTotal > 0 ? clampUnit(bricksRemaining / bricksTotal) : 1;
    const lowLives = livesRemaining <= 1;
    const midLives = livesRemaining === 2;
    const baseWarble = lowLives ? 0.55 : midLives ? 0.25 : 0;
    const warbleIntensity = clampUnit(
        baseWarble + normalizedSpeed * 0.35 + (1 - bricksRatio) * (lowLives ? 0.35 : 0.2),
    );

    return {
        lives: toMusicLives(livesRemaining),
        combo,
        tempoRatio: normalizedSpeed,
        bricksRemainingRatio: bricksRatio,
        warbleIntensity,
    };
}

/**
 * Builds ball trail sources for visual effects
 */
export function buildBallTrailSources(
    multiBallController: any,
    ballRadius: number,
    currentMaxSpeed: number,
): Array<{
    id: number;
    position: { x: number; y: number };
    radius: number;
    normalizedSpeed: number;
    isPrimary: boolean;
}> {
    const sources: Array<{
        id: number;
        position: { x: number; y: number };
        radius: number;
        normalizedSpeed: number;
        isPrimary: boolean;
    }> = [];

    multiBallController.visitActiveBalls(({ body, isPrimary }: any) => {
        const normalizedSpeed = clampUnit(
            MatterVector.magnitude(body.velocity) / Math.max(1, currentMaxSpeed),
        );
        sources.push({
            id: body.id,
            position: { x: body.position.x, y: body.position.y },
            radius: ballRadius,
            normalizedSpeed,
            isPrimary,
        });
    });

    return sources;
}

/**
 * Builds chromatic trail sources for advanced visual effects
 */
export function buildChromaticSources(
    multiBallController: any,
    currentMaxSpeed: number,
): Array<{
    id: number;
    position: { x: number; y: number };
    speed: number;
    maxSpeed: number;
    isPrimary: boolean;
}> {
    const sources: Array<{
        id: number;
        position: { x: number; y: number };
        speed: number;
        maxSpeed: number;
        isPrimary: boolean;
    }> = [];

    multiBallController.visitActiveBalls(({ body, isPrimary }: any) => {
        sources.push({
            id: body.id,
            position: { x: body.position.x, y: body.position.y },
            speed: MatterVector.magnitude(body.velocity),
            maxSpeed: currentMaxSpeed,
            isPrimary,
        });
    });

    return sources;
}

/**
 * Builds heat distortion sources from active balls
 */
export function buildHeatDistortionSources(
    multiBallController: any,
    currentMaxSpeed: number,
    playfieldWidth: number,
    playfieldHeight: number,
): Array<{
    position: { x: number; y: number };
    intensity: number;
    swirl: number;
}> {
    const sources: Array<{
        position: { x: number; y: number };
        intensity: number;
        swirl: number;
    }> = [];

    multiBallController.visitActiveBalls(({ body }: any) => {
        const normalizedX = clampUnit(body.position.x / playfieldWidth);
        const normalizedY = clampUnit(body.position.y / playfieldHeight);
        const speed = MatterVector.magnitude(body.velocity);
        const normalizedSpeed = clampUnit(speed / Math.max(1, currentMaxSpeed));
        const swirl = 6 + normalizedSpeed * 18;

        sources.push({
            position: { x: normalizedX, y: normalizedY },
            intensity: normalizedSpeed,
            swirl,
        });
    });

    return sources;
}
