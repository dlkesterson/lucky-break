import type { LuckyBreakEventBus } from 'app/events';
import type { LaserPaddleReward } from 'game/rewards';
import type { LaserStrikeOptions, CollisionRuntime } from './collisions';
import type { RuntimeVisuals } from './visuals';
import type { LevelRuntimeHandle } from '../level-runtime';
import type { MatterBody as Body } from 'physics/matter';
import type { BrickSpec } from 'util/levels';

interface LaserEffectHandle {
    fire(payload: LaserFirePayload): void;
    update(deltaSeconds: number): void;
}

interface LaserFirePayload {
    readonly beams: readonly LaserBeamPayload[];
    readonly duration: number;
}

interface LaserBeamPayload {
    readonly origin: { readonly x: number; readonly y: number };
    readonly hitY: number;
    readonly hits: readonly { readonly x: number; readonly y: number }[];
}

export interface LaserControllerOptions {
    readonly collisionRuntime: Pick<CollisionRuntime, 'applyLaserStrike'>;
    readonly visuals: Pick<RuntimeVisuals, 'laserEffect'> | null;
    readonly levelRuntime: Pick<LevelRuntimeHandle, 'brickHealth' | 'brickMetadata'>;
    readonly bus: LuckyBreakEventBus;
    readonly getSessionId: () => string;
    readonly computeScheduledAudioTime: (offsetMs?: number) => number;
    readonly scheduleVisualEffect: (scheduledTime: number | undefined, effect: () => void) => void;
    readonly playfieldTop: number;
    readonly getPaddleState: () => {
        readonly center: { readonly x: number; readonly y: number };
        readonly width: number;
        readonly height: number;
    };
}

export interface LaserController {
    activate(reward: LaserPaddleReward): void;
    deactivate(): void;
    update(deltaSeconds: number): void;
    isActive(): boolean;
    dispose(): void;
}

const HORIZONTAL_TOLERANCE = 18;
const MIN_COOLDOWN = 0.12;
const MIN_DURATION = 0.05;

const resolveBrickType = (spec: BrickSpec | undefined): 'standard' | 'multi-hit' | 'indestructible' => {
    if (!spec) {
        return 'standard';
    }
    if (spec.breakable === false) {
        return 'indestructible';
    }
    if (spec.traits?.includes('fortified')) {
        return 'multi-hit';
    }
    return 'standard';
};

export const createLaserController = ({
    collisionRuntime,
    visuals,
    levelRuntime,
    bus,
    getSessionId,
    computeScheduledAudioTime,
    scheduleVisualEffect,
    playfieldTop,
    getPaddleState,
}: LaserControllerOptions): LaserController => {
    const brickHealth = levelRuntime.brickHealth;
    const brickMetadata = levelRuntime.brickMetadata;
    let activeReward: LaserPaddleReward | null = null;
    let remainingDuration = 0;
    let cooldownTimer = 0;
    let cachedEffect: LaserEffectHandle | null = visuals?.laserEffect ?? null;

    const resolveEffect = (): LaserEffectHandle | null => {
        if (cachedEffect) {
            return cachedEffect;
        }
        cachedEffect = visuals?.laserEffect ?? null;
        return cachedEffect;
    };

    const deactivate = () => {
        activeReward = null;
        remainingDuration = 0;
        cooldownTimer = 0;
    };

    const activate = (reward: LaserPaddleReward) => {
        activeReward = reward;
        remainingDuration = Math.max(reward.duration, MIN_DURATION);
        cooldownTimer = 0;
    };

    const collectTargets = (originX: number, originY: number, pierceCount: number): Body[] => {
        const candidates: { body: Body; distance: number }[] = [];
        for (const [body, hp] of brickHealth) {
            if (!hp || hp <= 0) {
                continue;
            }
            const bounds = body.bounds;
            if (!bounds) {
                continue;
            }
            if (bounds.max.y >= originY) {
                continue;
            }
            const withinX = originX >= bounds.min.x - HORIZONTAL_TOLERANCE && originX <= bounds.max.x + HORIZONTAL_TOLERANCE;
            if (!withinX) {
                continue;
            }
            const distance = originY - bounds.max.y;
            if (distance <= 0) {
                continue;
            }
            const metadata = brickMetadata.get(body);
            if (metadata?.breakable === false) {
                continue;
            }
            candidates.push({ body, distance });
        }
        candidates.sort((a, b) => a.distance - b.distance);
        return candidates
            .slice(0, Math.max(1, pierceCount))
            .map((entry) => entry.body);
    };

    const fireLaser = () => {
        if (!activeReward) {
            return;
        }
        const paddle = getPaddleState();
        const halfWidth = paddle.width / 2;
        const emitterInset = Math.min(Math.max(halfWidth * 0.35, 14), Math.max(halfWidth - 6, 14));
        const originY = paddle.center.y - paddle.height / 2;
        const origins = [
            { x: paddle.center.x - emitterInset, y: originY },
            { x: paddle.center.x + emitterInset, y: originY },
        ];

        const sessionId = getSessionId();
        const scheduledTime = computeScheduledAudioTime();
        const pierceCount = Math.max(1, activeReward.pierceCount);
        const impactVelocity = Math.max(activeReward.beamVelocity, 10);
        const beams: LaserBeamPayload[] = [];

        origins.forEach((origin) => {
            const targets = collectTargets(origin.x, origin.y, pierceCount);
            const hits: { readonly x: number; readonly y: number }[] = [];
            targets.forEach((target, index) => {
                const metadata = brickMetadata.get(target);
                const bounds = target.bounds;
                if (bounds) {
                    hits.push({ x: target.position.x, y: bounds.min.y });
                }
                const strike: LaserStrikeOptions = {
                    brick: target,
                    origin,
                    impactVelocity,
                } satisfies LaserStrikeOptions;
                collisionRuntime.applyLaserStrike(strike);
                const brickType = resolveBrickType(metadata);
                bus.publish('LaserHit', {
                    sessionId,
                    row: metadata?.row ?? 0,
                    col: metadata?.col ?? 0,
                    brickType,
                    impactVelocity,
                    pierceIndex: index,
                    scheduledTime,
                });
            });
            beams.push({
                origin,
                hitY: hits.length > 0 ? Math.min(...hits.map((hit) => hit.y)) : playfieldTop,
                hits,
            });
        });

        bus.publish('LaserFire', {
            sessionId,
            origins,
            scheduledTime,
        });

        const effect = resolveEffect();
        if (effect) {
            scheduleVisualEffect(scheduledTime, () => {
                effect.fire({
                    beams,
                    duration: Math.max(0.1, activeReward?.cooldown ?? 0.1) * 0.6,
                });
            });
        }

        cooldownTimer = Math.max(MIN_COOLDOWN, activeReward.cooldown);
    };

    const update = (deltaSeconds: number) => {
        const effect = resolveEffect();
        effect?.update(deltaSeconds);

        if (!activeReward) {
            return;
        }
        remainingDuration = Math.max(0, remainingDuration - deltaSeconds);
        if (remainingDuration === 0) {
            deactivate();
            return;
        }
        cooldownTimer = Math.max(0, cooldownTimer - deltaSeconds);
        if (cooldownTimer <= 0) {
            fireLaser();
        }
    };

    return {
        activate,
        deactivate,
        update,
        isActive: () => Boolean(activeReward && remainingDuration > 0),
        dispose: () => {
            cachedEffect = null;
            deactivate();
        },
    } satisfies LaserController;
};
