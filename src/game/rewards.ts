export type RewardType = 'sticky-paddle' | 'double-points' | 'ghost-brick';

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

export type Reward = StickyPaddleReward | DoublePointsReward | GhostBrickReward;

export type RandomSource = () => number;

interface WheelSegment {
    readonly weight: number;
    readonly create: () => Reward;
}

const clamp01 = (value: number): number => {
    if (Number.isNaN(value)) {
        return 0;
    }
    return Math.max(0, Math.min(0.999999, value));
};

const WHEEL_SEGMENTS: readonly WheelSegment[] = [
    {
        weight: 1,
        create: () => ({
            type: 'sticky-paddle',
            duration: 12,
        }),
    },
    {
        weight: 0.9,
        create: () => ({
            type: 'double-points',
            duration: 15,
            multiplier: 2,
        }),
    },
    {
        weight: 0.8,
        create: () => ({
            type: 'ghost-brick',
            duration: 10,
            ghostCount: 4,
        }),
    },
];

const TOTAL_WEIGHT = WHEEL_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);

export const spinWheel = (rng: RandomSource = Math.random): Reward => {
    const roll = clamp01(rng()) * TOTAL_WEIGHT;

    let accumulator = 0;
    for (const segment of WHEEL_SEGMENTS) {
        accumulator += segment.weight;
        if (roll <= accumulator) {
            return segment.create();
        }
    }

    return WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1]?.create() ?? {
        type: 'sticky-paddle',
        duration: 10,
    };
};
