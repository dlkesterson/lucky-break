import type { MatterBody as Body } from 'physics/matter';

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

export interface GambleBrickSummary {
    readonly armedCount: number;
    readonly primedCount: number;
    readonly nextExpirationSeconds: number | null;
    readonly timerSeconds: number;
    readonly rewardMultiplier: number;
}

export interface GambleBrickManager {
    readonly register: (brick: Body) => void;
    readonly unregister: (brick: Body) => void;
    readonly clear: () => void;
    readonly onHit: (brick: Body) => GambleHitResult;
    readonly tick: (deltaSeconds: number) => readonly GambleExpiryResult[];
    readonly getState: (brick: Body) => GambleBrickState | null;
    readonly getRemainingTimer: (brick: Body) => number | null;
    readonly forEach: (callback: (brick: Body, state: GambleBrickState) => void) => void;
    readonly snapshot: () => GambleBrickSummary;
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

    const getRemainingTimer: GambleBrickManager['getRemainingTimer'] = (brick) => {
        const entry = entries.get(brick);
        if (!entry) {
            return null;
        }
        if (entry.status === 'primed') {
            return Math.max(0, entry.timer);
        }
        return timerSeconds;
    };

    const forEach: GambleBrickManager['forEach'] = (callback) => {
        entries.forEach((state, brick) => {
            callback(brick, state.status);
        });
    };

    const snapshot: GambleBrickManager['snapshot'] = () => {
        let armedCount = 0;
        let primedCount = 0;
        let shortestTimer = Number.POSITIVE_INFINITY;

        entries.forEach((state) => {
            if (state.status === 'primed') {
                primedCount += 1;
                if (Number.isFinite(state.timer) && state.timer < shortestTimer) {
                    shortestTimer = state.timer;
                }
            } else {
                armedCount += 1;
            }
        });

        const nextExpirationSeconds = primedCount > 0 && Number.isFinite(shortestTimer)
            ? Math.max(0, shortestTimer)
            : null;

        return {
            armedCount,
            primedCount,
            nextExpirationSeconds,
            timerSeconds,
            rewardMultiplier,
        } satisfies GambleBrickSummary;
    };

    return {
        register,
        unregister,
        clear,
        onHit,
        tick,
        getState,
        getRemainingTimer,
        forEach,
        snapshot,
    };
};
