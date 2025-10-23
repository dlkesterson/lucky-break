import type { Body } from 'matter-js';

export interface GambleBrickManagerOptions {
    readonly timerSeconds: number;
    readonly rewardMultiplier: number;
    readonly primeResetHp: number;
    readonly failPenaltyHp: number;
}

export type GambleBrickState = 'armed' | 'primed';

export interface GambleHitPrimeResult {
    readonly type: 'prime';
    readonly resetHp: number;
}

export interface GambleHitSuccessResult {
    readonly type: 'success';
    readonly rewardMultiplier: number;
}

export interface GambleHitStandardResult {
    readonly type: 'standard';
}

export type GambleHitResult = GambleHitPrimeResult | GambleHitSuccessResult | GambleHitStandardResult;

export interface GambleExpiryResult {
    readonly brick: Body;
    readonly penaltyHp: number;
}

const createPrimeResult = (resetHp: number): GambleHitPrimeResult => ({
    type: 'prime',
    resetHp,
});

const createSuccessResult = (rewardMultiplier: number): GambleHitSuccessResult => ({
    type: 'success',
    rewardMultiplier,
});

const STANDARD_RESULT: GambleHitStandardResult = { type: 'standard' };

interface InternalState {
    status: GambleBrickState;
    timer: number;
}

export interface GambleBrickManager {
    readonly register: (brick: Body) => void;
    readonly unregister: (brick: Body) => void;
    readonly clear: () => void;
    readonly onHit: (brick: Body) => GambleHitResult;
    readonly tick: (deltaSeconds: number) => readonly GambleExpiryResult[];
    readonly getState: (brick: Body) => GambleBrickState | null;
    readonly forEach: (callback: (brick: Body, state: GambleBrickState) => void) => void;
}

export const createGambleBrickManager = (
    options: GambleBrickManagerOptions,
): GambleBrickManager => {
    const { timerSeconds, rewardMultiplier, primeResetHp, failPenaltyHp } = options;
    const entries = new Map<Body, InternalState>();

    const register: GambleBrickManager['register'] = (brick) => {
        entries.set(brick, { status: 'armed', timer: 0 });
    };

    const unregister: GambleBrickManager['unregister'] = (brick) => {
        entries.delete(brick);
    };

    const clear: GambleBrickManager['clear'] = () => {
        entries.clear();
    };

    const onHit: GambleBrickManager['onHit'] = (brick) => {
        const entry = entries.get(brick);
        if (!entry) {
            return STANDARD_RESULT;
        }

        if (entry.status === 'armed') {
            entry.status = 'primed';
            entry.timer = timerSeconds;
            return createPrimeResult(Math.max(1, Math.round(primeResetHp)));
        }

        entries.delete(brick);
        return createSuccessResult(rewardMultiplier);
    };

    const tick: GambleBrickManager['tick'] = (deltaSeconds) => {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || entries.size === 0) {
            return [];
        }

        const expired: GambleExpiryResult[] = [];
        entries.forEach((state, brick) => {
            if (state.status !== 'primed') {
                return;
            }

            state.timer = Math.max(0, state.timer - deltaSeconds);
            if (state.timer <= 0) {
                entries.delete(brick);
                expired.push({
                    brick,
                    penaltyHp: Math.max(1, Math.round(failPenaltyHp)),
                });
            }
        });
        return expired;
    };

    const getState: GambleBrickManager['getState'] = (brick) => entries.get(brick)?.status ?? null;

    const forEach: GambleBrickManager['forEach'] = (callback) => {
        entries.forEach((state, brick) => {
            callback(brick, state.status);
        });
    };

    return {
        register,
        unregister,
        clear,
        onHit,
        tick,
        getState,
        forEach,
    };
};
