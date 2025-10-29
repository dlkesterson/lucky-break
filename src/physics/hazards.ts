import { Bodies, Body } from 'physics/matter';
import type { MatterEngine as Engine, MatterBody as MatterBody } from 'physics/matter';

export type HazardType = 'gravity-well' | 'moving-bumper' | 'portal';

export type HazardFalloff = 'none' | 'linear';

export interface HazardUpdateContext {
    readonly engine: Engine;
    readonly deltaSeconds: number;
}

export interface PhysicsHazard<Type extends HazardType = HazardType> {
    readonly id: string;
    readonly type: Type;
    readonly body?: MatterBody;
    readonly update: (context: HazardUpdateContext) => void;
    readonly dispose?: () => void;
}

export interface GravityWellHazardConfig {
    readonly id?: string;
    readonly position: { readonly x: number; readonly y: number };
    readonly radius: number;
    /** Force intensity per second to apply toward the well's center. */
    readonly strength: number;
    readonly falloff?: HazardFalloff;
    /** Optional label applied to the generated sensor body. */
    readonly label?: string;
    /** Only bodies matching this label receive the attraction force. Defaults to `ball`. */
    readonly affectsLabel?: string;
}

export interface GravityWellHazard extends PhysicsHazard<'gravity-well'> {
    readonly position: { readonly x: number; readonly y: number };
    readonly radius: number;
    readonly strength: number;
    readonly falloff: HazardFalloff;
    readonly affectsLabel: string;
}

export interface MovingBumperHazardConfig {
    readonly id?: string;
    readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly radius: number;
    readonly speed: number;
    readonly impulse: number;
    readonly affectsLabel?: string;
    readonly label?: string;
    readonly onPositionChange?: (position: { x: number; y: number }, direction: { x: number; y: number }) => void;
}

export interface MovingBumperHazard extends PhysicsHazard<'moving-bumper'> {
    readonly position: { x: number; y: number };
    readonly radius: number;
    readonly impulse: number;
    readonly direction: { x: number; y: number };
    readonly affectsLabel: string;
}

export interface PortalHazardConfig {
    readonly id?: string;
    readonly entry: { readonly x: number; readonly y: number };
    readonly exit: { readonly x: number; readonly y: number };
    readonly radius: number;
    readonly affectsLabel?: string;
    readonly cooldownSeconds?: number;
    readonly label?: string;
}

export interface PortalHazard extends PhysicsHazard<'portal'> {
    readonly position: { x: number; y: number };
    readonly radius: number;
    readonly exit: { x: number; y: number };
    readonly affectsLabel: string;
    readonly cooldownSeconds: number;
}

let hazardIdCounter = 0;

const nextHazardId = (prefix: string): string => {
    hazardIdCounter += 1;
    return `${prefix}-${hazardIdCounter}`;
};

const clampPositive = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(0, value);
};

export const createGravityWellHazard = (config: GravityWellHazardConfig): GravityWellHazard => {
    const radius = clampPositive(config.radius, 0);
    if (radius <= 0) {
        throw new Error('Gravity well radius must be greater than zero.');
    }

    const strength = clampPositive(config.strength, 0);
    if (strength <= 0) {
        throw new Error('Gravity well strength must be greater than zero.');
    }

    const id = config.id ?? nextHazardId('gravity-well');
    const label = config.label ?? 'hazard-gravity-well';
    const falloff: HazardFalloff = config.falloff ?? 'linear';
    const affectsLabel = config.affectsLabel ?? 'ball';
    const center = { x: config.position.x, y: config.position.y };

    const body = Bodies.circle(center.x, center.y, radius, {
        isSensor: true,
        isStatic: true,
        label,
    });

    const radiusSquared = radius * radius;

    const update: GravityWellHazard['update'] = ({ engine, deltaSeconds }) => {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
            return;
        }

        const bodies = engine.world?.bodies ?? [];
        for (const candidate of bodies) {
            if (!candidate || candidate === body) {
                continue;
            }

            if (candidate.label !== affectsLabel) {
                continue;
            }

            const dx = center.x - candidate.position.x;
            const dy = center.y - candidate.position.y;
            const distanceSquared = dx * dx + dy * dy;

            if (!Number.isFinite(distanceSquared) || distanceSquared === 0 || distanceSquared > radiusSquared) {
                continue;
            }

            const distance = Math.sqrt(distanceSquared);
            if (distance <= 0) {
                continue;
            }

            const falloffRatio = falloff === 'linear'
                ? Math.max(0, 1 - distance / radius)
                : 1;
            if (falloffRatio <= 0) {
                continue;
            }

            const unitX = dx / distance;
            const unitY = dy / distance;
            const forceMagnitude = strength * falloffRatio * deltaSeconds;
            if (!Number.isFinite(forceMagnitude) || forceMagnitude === 0) {
                continue;
            }

            Body.applyForce(candidate, candidate.position, {
                x: unitX * forceMagnitude,
                y: unitY * forceMagnitude,
            });
        }
    };

    return {
        id,
        type: 'gravity-well',
        body,
        update,
        position: center,
        radius,
        strength,
        falloff,
        affectsLabel,
    } satisfies GravityWellHazard;
};

const normalizeVector = (vector: { x: number; y: number }): { x: number; y: number } => {
    const magnitude = Math.hypot(vector.x, vector.y);
    if (magnitude === 0 || !Number.isFinite(magnitude)) {
        return { x: 0, y: 0 };
    }
    return { x: vector.x / magnitude, y: vector.y / magnitude };
};

export const createMovingBumperHazard = (config: MovingBumperHazardConfig): MovingBumperHazard => {
    const radius = clampPositive(config.radius, 0);
    if (radius <= 0) {
        throw new Error('Moving bumper radius must be greater than zero.');
    }

    const speed = clampPositive(config.speed, 0);
    if (speed <= 0) {
        throw new Error('Moving bumper speed must be greater than zero.');
    }

    const impulse = clampPositive(config.impulse, 0);
    if (impulse <= 0) {
        throw new Error('Moving bumper impulse must be greater than zero.');
    }

    const id = config.id ?? nextHazardId('moving-bumper');
    const label = config.label ?? 'hazard-moving-bumper';
    const affectsLabel = config.affectsLabel ?? 'ball';
    const start = { x: config.start.x, y: config.start.y };
    const end = { x: config.end.x, y: config.end.y };

    const pathVector = { x: end.x - start.x, y: end.y - start.y };
    const pathLength = Math.hypot(pathVector.x, pathVector.y);
    const pathDirection = normalizeVector(pathVector);
    const travelTime = pathLength > 0 ? pathLength / speed : 0;
    const position = { x: start.x, y: start.y };
    let progress = 0;
    let forward = true;

    const body = Bodies.circle(position.x, position.y, radius, {
        isSensor: true,
        isStatic: true,
        label,
    });

    const updatePosition = (t: number) => {
        const ratio = Math.max(0, Math.min(1, t));
        position.x = start.x + pathVector.x * ratio;
        position.y = start.y + pathVector.y * ratio;
        Body.setPosition(body, position);
        config.onPositionChange?.({ x: position.x, y: position.y }, forward ? pathDirection : { x: -pathDirection.x, y: -pathDirection.y });
    };

    const update: MovingBumperHazard['update'] = ({ deltaSeconds }) => {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || travelTime === 0) {
            return;
        }

        progress += (forward ? deltaSeconds : -deltaSeconds) / travelTime;
        if (progress >= 1) {
            progress = 1;
            forward = false;
        } else if (progress <= 0) {
            progress = 0;
            forward = true;
        }
        updatePosition(progress);
    };

    updatePosition(progress);

    return {
        id,
        type: 'moving-bumper',
        body,
        update,
        position,
        radius,
        impulse,
        direction: pathDirection,
        affectsLabel,
    } satisfies MovingBumperHazard;
};

export const createPortalHazard = (config: PortalHazardConfig): PortalHazard => {
    const radius = clampPositive(config.radius, 0);
    if (radius <= 0) {
        throw new Error('Portal radius must be greater than zero.');
    }

    const id = config.id ?? nextHazardId('portal');
    const label = config.label ?? 'hazard-portal';
    const entry = { x: config.entry.x, y: config.entry.y };
    const exit = { x: config.exit.x, y: config.exit.y };
    const affectsLabel = config.affectsLabel ?? 'ball';
    const cooldownSeconds = clampPositive(config.cooldownSeconds ?? 0.3, 0);

    const body = Bodies.circle(entry.x, entry.y, radius, {
        isSensor: true,
        isStatic: true,
        label,
    });

    const update: PortalHazard['update'] = () => {
        // Portals have no per-frame updates.
    };

    return {
        id,
        type: 'portal',
        body,
        update,
        position: entry,
        radius,
        exit,
        affectsLabel,
        cooldownSeconds,
    } satisfies PortalHazard;
};
