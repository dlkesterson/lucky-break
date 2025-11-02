import type { MultiBallReward, SlowTimeReward } from 'game/rewards';

interface MultiBallRewardContext {
    readonly reward: MultiBallReward;
    readonly currentExtraCount: number;
    readonly capacity: number;
    readonly maxDuration: number;
}

interface MultiBallRewardResolution {
    readonly duration: number;
    readonly extrasToSpawn: number;
}

interface SlowTimeRewardContext {
    readonly reward: SlowTimeReward;
    readonly maxDuration: number;
    readonly activeRemaining?: number;
    readonly activeScale?: number;
}

interface SlowTimeRewardResolution {
    readonly duration: number;
    readonly scale: number;
    readonly extended: boolean;
}

const clampDuration = (duration: number): number => {
    if (!Number.isFinite(duration) || duration <= 0) {
        return 0;
    }
    return duration;
};

const clampExtras = (count: number): number => {
    if (!Number.isFinite(count) || count <= 0) {
        return 0;
    }
    return Math.floor(count);
};

const clampSlowTimeScale = (scale: number): number => {
    if (!Number.isFinite(scale)) {
        return 1;
    }
    return Math.min(1, Math.max(0.1, scale));
};

export const resolveMultiBallReward = ({
    reward,
    currentExtraCount,
    capacity,
    maxDuration,
}: MultiBallRewardContext): MultiBallRewardResolution => {
    const safeCapacity = Math.max(0, Math.floor(capacity));
    const safeCurrentExtras = Math.min(Math.max(0, Math.floor(currentExtraCount)), safeCapacity);
    const rewardExtras = clampExtras(reward.extraBalls);
    const desiredExtras = Math.min(safeCapacity, rewardExtras);
    const extrasToSpawn = Math.max(0, desiredExtras - safeCurrentExtras);

    const safeDuration = clampDuration(reward.duration);
    const boundedDuration = Math.min(maxDuration, safeDuration);

    return {
        duration: boundedDuration,
        extrasToSpawn,
    };
};

export const resolveSlowTimeReward = ({
    reward,
    maxDuration,
    activeRemaining,
    activeScale,
}: SlowTimeRewardContext): SlowTimeRewardResolution => {
    const previousDuration = Math.min(maxDuration, clampDuration(activeRemaining ?? 0));
    const hasActiveSlowTime = previousDuration > 0;

    const safeDuration = clampDuration(reward.duration);
    const boundedDuration = Math.min(maxDuration, safeDuration);
    const safeTargetScale = clampSlowTimeScale(reward.timeScale);
    const safePreviousScale = hasActiveSlowTime ? clampSlowTimeScale(activeScale ?? 1) : 1;

    const combinedDuration = hasActiveSlowTime
        ? Math.min(maxDuration, previousDuration + boundedDuration)
        : boundedDuration;

    const nextScale = hasActiveSlowTime ? safePreviousScale : safeTargetScale;
    const extended = hasActiveSlowTime && combinedDuration > previousDuration;

    return {
        duration: combinedDuration,
        scale: combinedDuration > 0 ? nextScale : 1,
        extended,
    };
};
