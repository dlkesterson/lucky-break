import type { MatterBody as Body } from 'physics/matter';
import type { Vector2 } from 'physics/contracts';

export interface EchoTrailOptions {
    readonly durationSeconds: number;
    readonly phaseChance: number;
}

export interface EchoTrailSnapshot {
    readonly position: Vector2;
    readonly velocity: Vector2;
    readonly remainingSeconds: number;
    readonly hasPhased: boolean;
}

interface InternalEchoState {
    position: Vector2;
    velocity: Vector2;
    remainingSeconds: number;
    hasPhased: boolean;
}

export interface EchoTrailManager {
    readonly register: (ball: Body, position: Vector2, velocity: Vector2) => void;
    readonly tick: (deltaSeconds: number) => void;
    readonly canPhaseThrough: (ball: Body, rng: () => number) => boolean;
    readonly markPhased: (ball: Body) => void;
    readonly clear: () => void;
    readonly forEach: (callback: (ball: Body, snapshot: EchoTrailSnapshot) => void) => void;
    readonly getTrail: (ball: Body) => EchoTrailSnapshot | null;
}

export const createEchoTrailManager = (options: EchoTrailOptions): EchoTrailManager => {
    const { durationSeconds, phaseChance } = options;
    const trails = new Map<Body, InternalEchoState>();

    const register: EchoTrailManager['register'] = (ball, position, velocity) => {
        trails.set(ball, {
            position: { x: position.x, y: position.y },
            velocity: { x: velocity.x, y: velocity.y },
            remainingSeconds: durationSeconds,
            hasPhased: false,
        });
    };

    const tick: EchoTrailManager['tick'] = (deltaSeconds) => {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
            return;
        }

        const expired: Body[] = [];
        trails.forEach((state, ball) => {
            state.remainingSeconds = Math.max(0, state.remainingSeconds - deltaSeconds);
            if (state.remainingSeconds <= 0) {
                expired.push(ball);
            }
        });

        expired.forEach((ball) => trails.delete(ball));
    };

    const canPhaseThrough: EchoTrailManager['canPhaseThrough'] = (ball, rng) => {
        const state = trails.get(ball);
        if (!state || state.hasPhased) {
            return false;
        }
        return rng() < phaseChance;
    };

    const markPhased: EchoTrailManager['markPhased'] = (ball) => {
        const state = trails.get(ball);
        if (state) {
            state.hasPhased = true;
        }
    };

    const clear: EchoTrailManager['clear'] = () => {
        trails.clear();
    };

    const forEach: EchoTrailManager['forEach'] = (callback) => {
        trails.forEach((state, ball) => {
            callback(ball, {
                position: { x: state.position.x, y: state.position.y },
                velocity: { x: state.velocity.x, y: state.velocity.y },
                remainingSeconds: state.remainingSeconds,
                hasPhased: state.hasPhased,
            });
        });
    };

    const getTrail: EchoTrailManager['getTrail'] = (ball) => {
        const state = trails.get(ball);
        if (!state) {
            return null;
        }
        return {
            position: { x: state.position.x, y: state.position.y },
            velocity: { x: state.velocity.x, y: state.velocity.y },
            remainingSeconds: state.remainingSeconds,
            hasPhased: state.hasPhased,
        };
    };

    return {
        register,
        tick,
        canPhaseThrough,
        markPhased,
        clear,
        forEach,
        getTrail,
    };
};
