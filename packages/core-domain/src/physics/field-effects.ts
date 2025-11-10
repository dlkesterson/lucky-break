import type { MatterBody as Body } from 'physics/matter';
import type { Vector2 } from 'physics/contracts';

export interface VortexFieldOptions {
    readonly pullStrength: number;
    readonly radiusPixels: number;
    readonly durationSeconds: number;
    readonly chainBonus: number;
}

export interface VortexInstance {
    readonly position: Vector2;
    readonly remainingSeconds: number;
    readonly pullStrength: number;
    readonly radius: number;
    readonly hitThroughPortal: boolean;
}

interface InternalVortexState {
    position: Vector2;
    remainingSeconds: number;
    hitThroughPortal: boolean;
}

export interface VortexFieldManager {
    readonly spawn: (position: Vector2) => void;
    readonly tick: (deltaSeconds: number) => void;
    readonly clear: () => void;
    readonly applyPullForces: (bricks: readonly Body[], getBrickPosition: (brick: Body) => Vector2, applyForce: (brick: Body, force: Vector2) => void) => void;
    readonly isNearPortal: (position: Vector2, threshold: number) => boolean;
    readonly markPortalHit: (position: Vector2) => void;
    readonly wasHitThroughPortal: (position: Vector2) => boolean;
    readonly forEach: (callback: (vortex: VortexInstance) => void) => void;
    readonly count: () => number;
}

export const createVortexFieldManager = (options: VortexFieldOptions): VortexFieldManager => {
    const { pullStrength, radiusPixels, durationSeconds } = options;
    const vortices: InternalVortexState[] = [];

    const spawn: VortexFieldManager['spawn'] = (position) => {
        vortices.push({
            position: { x: position.x, y: position.y },
            remainingSeconds: durationSeconds,
            hitThroughPortal: false,
        });
    };

    const tick: VortexFieldManager['tick'] = (deltaSeconds) => {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
            return;
        }

        for (let i = vortices.length - 1; i >= 0; i--) {
            const vortex = vortices[i];
            if (!vortex) continue;

            vortex.remainingSeconds = Math.max(0, vortex.remainingSeconds - deltaSeconds);
            if (vortex.remainingSeconds <= 0) {
                vortices.splice(i, 1);
            }
        }
    };

    const clear: VortexFieldManager['clear'] = () => {
        vortices.length = 0;
    };

    const applyPullForces: VortexFieldManager['applyPullForces'] = (bricks, getBrickPosition, applyForce) => {
        if (vortices.length === 0 || bricks.length === 0) {
            return;
        }

        for (const vortex of vortices) {
            for (const brick of bricks) {
                const brickPos = getBrickPosition(brick);
                const dx = vortex.position.x - brickPos.x;
                const dy = vortex.position.y - brickPos.y;
                const distSquared = dx * dx + dy * dy;
                const radiusSquared = radiusPixels * radiusPixels;

                if (distSquared < radiusSquared && distSquared > 0) {
                    const dist = Math.sqrt(distSquared);
                    const normalizedDx = dx / dist;
                    const normalizedDy = dy / dist;
                    const falloff = 1 - (dist / radiusPixels);
                    const forceMagnitude = pullStrength * falloff;

                    applyForce(brick, {
                        x: normalizedDx * forceMagnitude,
                        y: normalizedDy * forceMagnitude,
                    });
                }
            }
        }
    };

    const isNearPortal: VortexFieldManager['isNearPortal'] = (position, threshold) => {
        for (const vortex of vortices) {
            const dx = vortex.position.x - position.x;
            const dy = vortex.position.y - position.y;
            const distSquared = dx * dx + dy * dy;
            if (distSquared < threshold * threshold) {
                return true;
            }
        }
        return false;
    };

    const markPortalHit: VortexFieldManager['markPortalHit'] = (position) => {
        for (const vortex of vortices) {
            const dx = vortex.position.x - position.x;
            const dy = vortex.position.y - position.y;
            const distSquared = dx * dx + dy * dy;
            if (distSquared < radiusPixels * radiusPixels) {
                vortex.hitThroughPortal = true;
                return;
            }
        }
    };

    const wasHitThroughPortal: VortexFieldManager['wasHitThroughPortal'] = (position) => {
        for (const vortex of vortices) {
            const dx = vortex.position.x - position.x;
            const dy = vortex.position.y - position.y;
            const distSquared = dx * dx + dy * dy;
            if (distSquared < radiusPixels * radiusPixels) {
                return vortex.hitThroughPortal;
            }
        }
        return false;
    };

    const forEach: VortexFieldManager['forEach'] = (callback) => {
        for (const vortex of vortices) {
            callback({
                position: { x: vortex.position.x, y: vortex.position.y },
                remainingSeconds: vortex.remainingSeconds,
                pullStrength,
                radius: radiusPixels,
                hitThroughPortal: vortex.hitThroughPortal,
            });
        }
    };

    const count: VortexFieldManager['count'] = () => {
        return vortices.length;
    };

    return {
        spawn,
        tick,
        clear,
        applyPullForces,
        isNearPortal,
        markPortalHit,
        wasHitThroughPortal,
        forEach,
        count,
    };
};
