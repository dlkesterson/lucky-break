import { gameConfig, type RewardKey } from 'config/game';
import type { RandomSource } from 'util/random';

export type RewardType = RewardKey;

interface BaseReward {
    readonly type: RewardType;
    readonly duration: number; // seconds
}

export interface StickyPaddleReward extends BaseReward {
    readonly type: 'sticky-paddle';
}

export interface DoublePointsReward extends BaseReward {
    readonly type: 'double-points';
    readonly multiplier: number;
}

export interface GhostBrickReward extends BaseReward {
    readonly type: 'ghost-brick';
    readonly ghostCount: number;
}

export interface MultiBallReward extends BaseReward {
    readonly type: 'multi-ball';
    readonly extraBalls: number;
}

export interface SlowTimeReward extends BaseReward {
    readonly type: 'slow-time';
    readonly timeScale: number;
}

export interface WidePaddleReward extends BaseReward {
    readonly type: 'wide-paddle';
    readonly widthMultiplier: number;
}

export type Reward =
    | StickyPaddleReward
    | DoublePointsReward
    | GhostBrickReward
    | MultiBallReward
    | SlowTimeReward
    | WidePaddleReward;

const clamp01 = (value: number): number => {
    if (Number.isNaN(value)) {
        return 0;
    }
    return Math.max(0, Math.min(0.999999, value));
};

const rewardSettings = gameConfig.rewards;
const wheelSegments = rewardSettings.wheelSegments;
const rewardDefinitions = rewardSettings.definitions;
const fallback = rewardSettings.fallback;

const TOTAL_WEIGHT = wheelSegments.reduce((sum, segment) => sum + segment.weight, 0);

const buildReward = (type: RewardType, overrideDuration?: number): Reward => {
    switch (type) {
        case 'sticky-paddle': {
            const { duration } = rewardDefinitions[type];
            return {
                type,
                duration: overrideDuration ?? duration,
            };
        }
        case 'double-points': {
            const { duration, multiplier } = rewardDefinitions[type];
            return {
                type,
                duration: overrideDuration ?? duration,
                multiplier,
            };
        }
        case 'ghost-brick': {
            const { duration, ghostCount } = rewardDefinitions[type];
            return {
                type,
                duration: overrideDuration ?? duration,
                ghostCount,
            };
        }
        case 'multi-ball': {
            const { duration, extraBalls } = rewardDefinitions[type];
            return {
                type,
                duration: overrideDuration ?? duration,
                extraBalls,
            };
        }
        case 'slow-time': {
            const { duration, timeScale } = rewardDefinitions[type];
            return {
                type,
                duration: overrideDuration ?? duration,
                timeScale,
            };
        }
        case 'wide-paddle': {
            const { duration, widthMultiplier } = rewardDefinitions[type];
            return {
                type,
                duration: overrideDuration ?? duration,
                widthMultiplier,
            };
        }
        default: {
            const exhaustiveCheck: never = type;
            throw new Error(`Unsupported reward type: ${String(exhaustiveCheck)}`);
        }
    }
};

export const spinWheel = (rng: RandomSource = Math.random): Reward => {
    const roll = clamp01(rng()) * TOTAL_WEIGHT;

    let accumulator = 0;
    for (const segment of wheelSegments) {
        accumulator += segment.weight;
        if (roll <= accumulator) {
            return buildReward(segment.type);
        }
    }

    return buildReward(fallback.type, fallback.duration);
};
