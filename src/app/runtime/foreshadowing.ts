import {
    scheduleForeshadowEvent,
    initForeshadower,
    cancelForeshadowEvent,
    disposeForeshadower,
} from 'audio/foreshadow-api';
import type { ForeshadowDiagnostics } from 'audio/AudioForeshadower';
import type { ToneScheduler } from 'audio/scheduler';
import { Transport } from 'tone';
import { clampUnit } from 'render/playfield-visuals';
import { Vector as MatterVector } from 'physics/matter';
import type { MatterBody as Body } from 'physics/matter';
import { deriveForeshadowScale, FORESHADOW_EVENT_SALT, clampMidiNote } from './audio-bootstrap';
import type { RuntimeVisuals, ForeshadowInstrument } from './visuals';
import type { GameplayRuntimeState } from './types';
import type { MultiBallController } from '../multi-ball-controller';
import type { LevelRuntimeHandle } from '../level-runtime';

const resolveBallRadius = (body: Body): number => {
    if (typeof body.circleRadius === 'number' && Number.isFinite(body.circleRadius)) {
        return Math.max(2, body.circleRadius);
    }
    const width = body.bounds?.max.x - body.bounds?.min.x;
    const height = body.bounds?.max.y - body.bounds?.min.y;
    if (Number.isFinite(width) && Number.isFinite(height)) {
        return Math.max(2, Math.max(width ?? 0, height ?? 0) / 2);
    }
    return 10;
};

const intersectRayWithExpandedAabb = (
    origin: { readonly x: number; readonly y: number },
    direction: { readonly x: number; readonly y: number },
    bounds: Body['bounds'],
    radius: number,
): number | null => {
    const minX = bounds.min.x - radius;
    const maxX = bounds.max.x + radius;
    const minY = bounds.min.y - radius;
    const maxY = bounds.max.y + radius;

    let tMin = 0;
    let tMax = Number.POSITIVE_INFINITY;

    if (Math.abs(direction.x) < 1e-6) {
        if (origin.x < minX || origin.x > maxX) {
            return null;
        }
    } else {
        const t1 = (minX - origin.x) / direction.x;
        const t2 = (maxX - origin.x) / direction.x;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
    }

    if (Math.abs(direction.y) < 1e-6) {
        if (origin.y < minY || origin.y > maxY) {
            return null;
        }
    } else {
        const t1 = (minY - origin.y) / direction.y;
        const t2 = (maxY - origin.y) / direction.y;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
    }

    if (tMax < 0) {
        return null;
    }

    const impactTime = tMin >= 0 ? tMin : tMax;
    if (!Number.isFinite(impactTime) || impactTime < 0) {
        return null;
    }
    return impactTime;
};

interface BallForeshadowState {
    readonly eventId: string;
    readonly brickId: number;
    readonly scheduledAt: number;
}

interface ForeshadowLevelAdapter {
    readonly brickHealth: LevelRuntimeHandle['brickHealth'];
    readonly brickMetadata: LevelRuntimeHandle['brickMetadata'];
}

type ForeshadowMultiBallAdapter = Pick<MultiBallController, 'visitActiveBalls'>;

export interface ForeshadowingConfig {
    readonly minPredictionSeconds: number;
    readonly maxPredictionSeconds: number;
    readonly minSpeed: number;
    readonly minLeadSeconds: number;
    readonly maxLeadSeconds: number;
}

export interface ForeshadowingRuntimeDeps {
    readonly randomSeed: number;
    readonly runtimeState: Pick<
        GameplayRuntimeState,
        'sessionElapsedSeconds' | 'currentMaxSpeed' | 'audioVisualSkewSeconds'
    >;
    readonly scheduler: ToneScheduler;
    readonly getVisuals: () => RuntimeVisuals | null;
    readonly multiBallController: ForeshadowMultiBallAdapter;
    readonly levelRuntime: ForeshadowLevelAdapter;
    readonly config: ForeshadowingConfig;
    readonly scheduleVisualEffect: (scheduledTime: number | undefined, effect: () => void) => void;
}

export interface ForeshadowingRuntime {
    updatePredictions(): void;
    cancelForBall(ballId: number): void;
    releaseForBall(ballId: number, actualTimeSeconds?: number): void;
    reset(): void;
    dispose(): void;
    getActiveBallIds(): readonly number[];
}

export const createForeshadowingRuntime = ({
    randomSeed,
    runtimeState,
    scheduler,
    getVisuals,
    multiBallController,
    levelRuntime,
    config,
    scheduleVisualEffect,
}: ForeshadowingRuntimeDeps): ForeshadowingRuntime => {
    const foreshadowScale = deriveForeshadowScale(randomSeed);
    const foreshadowSeed = (randomSeed ^ FORESHADOW_EVENT_SALT) >>> 0;
    const foreshadowVisualEvents = new Map<string, ForeshadowInstrument>();

    const resolveForeshadowVisualTime = (transportTime: number): number | undefined => {
        if (!Number.isFinite(transportTime)) {
            return undefined;
        }
        const nowSeconds = Transport.now();
        const deltaSeconds = Math.max(0, transportTime - nowSeconds);
        const offsetMs = deltaSeconds * 1000 - scheduler.lookAheadMs;
        if (!Number.isFinite(offsetMs)) {
            return undefined;
        }
        return scheduler.predictAt(offsetMs);
    };

    const triggerForeshadowWave = (
        accent: 'schedule' | 'note' | 'cancel',
        instrument: ForeshadowInstrument,
        intensity: number,
        transportTime?: number,
    ): void => {
        const visuals = getVisuals();
        const backdrop = visuals?.audioWaveBackdrop;
        if (!backdrop) {
            return;
        }
        const clampedIntensity = clampUnit(intensity);
        if (clampedIntensity <= 0 && accent !== 'cancel') {
            return;
        }
        const applyBump = () => {
            const resolved = accent === 'cancel' ? Math.max(clampedIntensity, 0.35) : clampedIntensity;
            backdrop.setVisible(true);
            backdrop.bump('foreshadow', {
                accent,
                instrument,
                intensity: resolved,
            });
        };
        const scheduledTime = typeof transportTime === 'number'
            ? resolveForeshadowVisualTime(transportTime)
            : undefined;
        scheduleVisualEffect(scheduledTime, applyBump);
    };

    const diagnostics: ForeshadowDiagnostics = {
        onPatternScheduled: ({ event, instrument, averageVelocity, startTime }) => {
            foreshadowVisualEvents.set(event.id, instrument);
            triggerForeshadowWave('schedule', instrument, averageVelocity, startTime);
        },
        onNoteTriggered: ({ eventId, instrument, velocity, time }) => {
            foreshadowVisualEvents.set(eventId, instrument);
            triggerForeshadowWave('note', instrument, velocity, time);
        },
        onEventFinalized: ({ eventId, reason }) => {
            const instrument = foreshadowVisualEvents.get(eventId) ?? 'melodic';
            if (reason === 'cancelled') {
                triggerForeshadowWave('cancel', instrument, 0.6);
            }
            foreshadowVisualEvents.delete(eventId);
        },
    };

    initForeshadower({
        scale: foreshadowScale,
        seed: foreshadowSeed,
        diagnostics,
    });

    const activeForeshadowByBall = new Map<number, BallForeshadowState>();
    let foreshadowEventCounter = 0;

    const nextForeshadowEventId = (): string => {
        foreshadowEventCounter = (foreshadowEventCounter + 1) >>> 0;
        const salted = foreshadowEventCounter ^ foreshadowSeed;
        return `foreshadow:${salted.toString(16)}`;
    };

    const cancelForBall = (ballId: number): void => {
        const entry = activeForeshadowByBall.get(ballId);
        if (!entry) {
            return;
        }
        cancelForeshadowEvent(entry.eventId);
        activeForeshadowByBall.delete(ballId);
    };

    const releaseForBall = (ballId: number, actualTimeSeconds?: number): void => {
        const entry = activeForeshadowByBall.get(ballId);
        if (!entry) {
            return;
        }
        if (typeof actualTimeSeconds === 'number' && entry.scheduledAt - actualTimeSeconds > 0.12) {
            cancelForeshadowEvent(entry.eventId);
        }
        activeForeshadowByBall.delete(ballId);
    };

    const reset = (): void => {
        activeForeshadowByBall.forEach((entry) => {
            cancelForeshadowEvent(entry.eventId);
        });
        activeForeshadowByBall.clear();
        foreshadowEventCounter = 0;
        foreshadowVisualEvents.clear();
        getVisuals()?.audioWaveBackdrop?.setVisible(false);
    };

    interface PredictedBrickImpact {
        readonly brick: Body;
        readonly timeUntil: number;
        readonly speed: number;
    }

    const resolveBrickTargetMidi = (brick: Body): number => {
        const metadata = levelRuntime.brickMetadata.get(brick);
        if (!metadata) {
            return foreshadowScale[0] ?? 60;
        }
        const scaleLength = foreshadowScale.length || 1;
        const base = foreshadowScale[Math.abs(metadata.row) % scaleLength] ?? foreshadowScale[0] ?? 60;
        const octaveStep = Math.floor(metadata.row / scaleLength);
        const octaveOffset = Math.max(-1, Math.min(2, octaveStep)) * 12;
        const columnAccent = (metadata.col ?? 0) % 3;
        const columnOffset = columnAccent === 2 ? 4 : columnAccent === 1 ? 2 : 0;
        return clampMidiNote(base + octaveOffset + columnOffset);
    };

    const predictNextBrickImpact = (ballBody: Body): PredictedBrickImpact | null => {
        const speed = MatterVector.magnitude(ballBody.velocity);
        if (!Number.isFinite(speed) || speed < config.minSpeed) {
            return null;
        }
        const direction = ballBody.velocity;
        if (Math.abs(direction.x) < 1e-6 && Math.abs(direction.y) < 1e-6) {
            return null;
        }

        const radius = resolveBallRadius(ballBody);
        const origin = { x: ballBody.position.x, y: ballBody.position.y };

        let best: PredictedBrickImpact | null = null;

        levelRuntime.brickHealth.forEach((hp, brick) => {
            if (hp <= 0) {
                return;
            }
            if (brick.isSensor) {
                return;
            }
            const metadata = levelRuntime.brickMetadata.get(brick);
            if (metadata?.breakable === false) {
                return;
            }

            const bounds = brick.bounds;
            const impactTime = intersectRayWithExpandedAabb(origin, direction, bounds, radius);
            if (impactTime === null) {
                return;
            }
            if (impactTime < config.minPredictionSeconds || impactTime > config.maxPredictionSeconds) {
                return;
            }
            if (!best || impactTime < best.timeUntil) {
                best = {
                    brick,
                    timeUntil: impactTime,
                    speed,
                };
            }
        });

        return best;
    };

    const updatePredictions = (): void => {
        const nowSeconds = runtimeState.sessionElapsedSeconds;
        const visited = new Set<number>();
        multiBallController.visitActiveBalls(({ body }) => {
            visited.add(body.id);
            const prediction = predictNextBrickImpact(body);
            if (!prediction) {
                cancelForBall(body.id);
                return;
            }

            const scheduledAt = nowSeconds + prediction.timeUntil;
            const existing = activeForeshadowByBall.get(body.id);
            if (existing) {
                const timeDelta = Math.abs(existing.scheduledAt - scheduledAt);
                if (existing.brickId === prediction.brick.id && timeDelta < 0.1) {
                    return;
                }
                cancelForBall(body.id);
            }

            const eventId = nextForeshadowEventId();
            const targetMidi = resolveBrickTargetMidi(prediction.brick);
            const normalizedIntensity = clampUnit(
                prediction.speed /
                Math.max(config.minSpeed, runtimeState.currentMaxSpeed || config.minSpeed),
            );
            const rawLead = prediction.timeUntil * 0.75;
            const leadInSeconds = Math.min(
                Math.max(config.minLeadSeconds, rawLead),
                Math.max(config.minLeadSeconds, Math.min(prediction.timeUntil - 0.1, config.maxLeadSeconds)),
            );

            scheduleForeshadowEvent({
                id: eventId,
                type: 'brickHit',
                timeUntil: prediction.timeUntil,
                targetMidi,
                intensity: normalizedIntensity,
                leadInSeconds,
            });

            activeForeshadowByBall.set(body.id, {
                eventId,
                brickId: prediction.brick.id,
                scheduledAt,
            });
        });

        activeForeshadowByBall.forEach((entry, ballId) => {
            if (!visited.has(ballId)) {
                cancelForBall(ballId);
            }
        });
    };

    const dispose = (): void => {
        reset();
        disposeForeshadower();
    };

    const getActiveBallIds = (): readonly number[] => Array.from(activeForeshadowByBall.keys());

    return {
        updatePredictions,
        cancelForBall,
        releaseForBall,
        reset,
        dispose,
        getActiveBallIds,
    } satisfies ForeshadowingRuntime;
};

export { resolveBallRadius, intersectRayWithExpandedAabb };
