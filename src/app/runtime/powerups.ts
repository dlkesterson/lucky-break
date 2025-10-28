import { calculatePaddleWidthScale, PowerUpManager, type PowerUpType } from 'util/power-ups';
import type { HudPowerUpView, HudRewardView } from 'render/hud-display';
import { createReward, type LaserPaddleReward, type Reward } from 'game/rewards';
import { resolveMultiBallReward, resolveSlowTimeReward } from '../reward-stack';
import type { MultiBallController } from '../multi-ball-controller';
import type { Logger } from 'util/log';

const formatPowerUpLabel = (type: PowerUpType): string => {
    switch (type) {
        case 'paddle-width':
            return 'Paddle Width';
        case 'ball-speed':
            return 'Ball Speed';
        case 'multi-ball':
            return 'Multi Ball';
        case 'sticky-paddle':
            return 'Sticky Paddle';
        case 'laser':
            return 'Laser Strike';
        default:
            return type;
    }
};

export interface RuntimePowerupsDeps {
    readonly logger: Logger;
    readonly multiBallController: MultiBallController;
    readonly flashBallLight: (intensity: number) => void;
    readonly flashPaddleLight: (intensity: number) => void;
    readonly spawnExtraBalls: (requestedCount?: number) => void;
    readonly resetGhostBricks: () => void;
    readonly applyGhostBrickReward: (duration: number, ghostCount: number) => void;
    readonly getGhostBrickRemainingDuration: () => number;
    readonly enableLaserReward: (reward: LaserPaddleReward) => void;
    readonly disableLaserReward: () => void;
    readonly defaults: {
        readonly paddleWidthMultiplier: number;
        readonly multiBallCapacity: number;
        readonly multiBallMaxDuration: number;
        readonly slowTimeMaxDuration: number;
    };
}

export interface RuntimePowerups {
    readonly manager: PowerUpManager;
    reset(): void;
    activateReward(reward: Reward | null): void;
    getActiveReward(): Reward | null;
    getDoublePointsMultiplier(): number;
    getSlowTimeScale(): number;
    getSlowTimeRemaining(): number;
    getMultiBallRewardTimer(): number;
    getPaddleWidthScale(): number;
    collectHudPowerUps(): HudPowerUpView[];
    resolveRewardView(): HudRewardView | null;
    handlePowerUpActivation(type: PowerUpType): void;
    tick(deltaSeconds: number): void;
}

export const createRuntimePowerups = ({
    logger,
    multiBallController,
    flashBallLight,
    flashPaddleLight,
    spawnExtraBalls,
    resetGhostBricks,
    applyGhostBrickReward,
    getGhostBrickRemainingDuration,
    defaults,
    enableLaserReward,
    disableLaserReward,
}: RuntimePowerupsDeps): RuntimePowerups => {
    const manager = new PowerUpManager();

    let activeReward: Reward | null = null;
    let doublePointsMultiplier = 1;
    let doublePointsTimer = 0;
    let rewardPaddleWidthMultiplier = defaults.paddleWidthMultiplier;
    let slowTimeTimer = 0;
    let slowTimeScale = 1;
    let multiBallRewardTimer = 0;
    let widePaddleRewardActive = false;
    let laserRewardTimer = 0;
    let activeLaserReward: LaserPaddleReward | null = null;

    const resetRewardState = () => {
        doublePointsMultiplier = 1;
        doublePointsTimer = 0;
        rewardPaddleWidthMultiplier = defaults.paddleWidthMultiplier;
        slowTimeTimer = 0;
        slowTimeScale = 1;
        multiBallRewardTimer = 0;
        widePaddleRewardActive = false;
        if (activeLaserReward) {
            disableLaserReward();
        }
        activeLaserReward = null;
        laserRewardTimer = 0;
    };

    const activateReward = (reward: Reward | null) => {
        const existingSlowTime = slowTimeTimer > 0 ? { remaining: slowTimeTimer, scale: slowTimeScale } : null;

        activeReward = reward;
        resetRewardState();
        resetGhostBricks();

        if (!reward) {
            return;
        }

        switch (reward.type) {
            case 'sticky-paddle':
                manager.refresh('sticky-paddle', { defaultDuration: reward.duration });
                break;
            case 'double-points':
                doublePointsMultiplier = reward.multiplier;
                doublePointsTimer = reward.duration;
                break;
            case 'ghost-brick':
                applyGhostBrickReward(reward.duration, reward.ghostCount);
                break;
            case 'multi-ball': {
                const currentExtras = multiBallController.count();
                const resolution = resolveMultiBallReward({
                    reward,
                    currentExtraCount: currentExtras,
                    capacity: defaults.multiBallCapacity,
                    maxDuration: defaults.multiBallMaxDuration,
                });
                multiBallRewardTimer = resolution.duration;
                if (resolution.extrasToSpawn > 0) {
                    spawnExtraBalls(resolution.extrasToSpawn);
                }
                const afterCount = multiBallController.count();
                logger.info('Multi-ball reward applied', {
                    duration: resolution.duration,
                    previousExtras: currentExtras,
                    afterCount,
                    capacity: defaults.multiBallCapacity,
                    requestedExtras: reward.extraBalls,
                    spawnedExtras: resolution.extrasToSpawn,
                });
                break;
            }
            case 'slow-time': {
                const resolution = resolveSlowTimeReward({
                    reward,
                    maxDuration: defaults.slowTimeMaxDuration,
                    activeRemaining: existingSlowTime?.remaining,
                    activeScale: existingSlowTime?.scale,
                });
                slowTimeTimer = resolution.duration;
                slowTimeScale = resolution.duration > 0 ? resolution.scale : 1;
                logger.info('Slow-time reward applied', {
                    duration: resolution.duration,
                    targetScale: resolution.scale,
                    extended: resolution.extended,
                    previousDuration: existingSlowTime?.remaining ?? 0,
                    previousScale: existingSlowTime?.scale ?? 1,
                });
                break;
            }
            case 'wide-paddle':
                rewardPaddleWidthMultiplier = Math.max(1, reward.widthMultiplier);
                manager.refresh('paddle-width', { defaultDuration: reward.duration });
                widePaddleRewardActive = true;
                break;
            case 'laser-paddle':
                activeLaserReward = reward;
                laserRewardTimer = reward.duration;
                enableLaserReward(reward);
                break;
        }
    };

    const reset = () => {
        manager.clearAll();
        activateReward(null);
    };

    const collectHudPowerUps = (): HudPowerUpView[] =>
        manager.getActiveEffects().map((effect) => ({
            label: formatPowerUpLabel(effect.type),
            remaining: `${Math.max(0, effect.remainingTime).toFixed(1)}s`,
        }));

    const resolveRewardView = (): HudRewardView | null => {
        if (!activeReward) {
            return null;
        }

        const label = (() => {
            switch (activeReward.type) {
                case 'double-points':
                    return 'Double Points';
                case 'ghost-brick':
                    return 'Ghost Bricks';
                case 'sticky-paddle':
                    return 'Sticky Paddle';
                case 'multi-ball':
                    return 'Multi Ball';
                case 'slow-time':
                    return 'Slow Time';
                case 'wide-paddle':
                    return 'Wide Paddle';
                case 'laser-paddle':
                    return 'Laser Paddle';
                default:
                    return 'Lucky Reward';
            }
        })();

        let remaining = 0;
        let remainingLabel: string | undefined;

        switch (activeReward.type) {
            case 'double-points':
                remaining = Math.max(0, doublePointsTimer);
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            case 'ghost-brick':
                remaining = getGhostBrickRemainingDuration();
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            case 'sticky-paddle': {
                const sticky = manager.getEffect('sticky-paddle');
                remaining = sticky ? Math.max(0, sticky.remainingTime) : 0;
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            }
            case 'multi-ball': {
                remaining = Math.max(0, multiBallRewardTimer);
                const extras = multiBallController.count();
                if (extras > 0) {
                    remainingLabel = `${extras} extra`;
                } else if (remaining > 0) {
                    remainingLabel = `${remaining.toFixed(1)}s`;
                }
                break;
            }
            case 'slow-time':
                remaining = Math.max(0, slowTimeTimer);
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            case 'wide-paddle': {
                const widthEffect = manager.getEffect('paddle-width');
                remaining = widthEffect ? Math.max(0, widthEffect.remainingTime) : 0;
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            }
            case 'laser-paddle':
                remaining = Math.max(0, laserRewardTimer);
                remainingLabel = remaining > 0 ? `${remaining.toFixed(1)}s` : undefined;
                break;
            default:
                remaining = 0;
                break;
        }

        if (!remainingLabel && activeReward.type !== 'sticky-paddle') {
            return { label };
        }

        return {
            label,
            remaining: remainingLabel,
        } satisfies HudRewardView;
    };

    const handlePowerUpActivation = (type: PowerUpType): void => {
        const lightBoost = (() => {
            switch (type) {
                case 'multi-ball':
                    return 0.9;
                case 'ball-speed':
                    return 0.7;
                case 'paddle-width':
                    return 0.55;
                case 'sticky-paddle':
                    return 0.5;
                case 'laser':
                    return 0.8;
                default:
                    return 0.6;
            }
        })();

        flashBallLight(lightBoost);
        flashPaddleLight(Math.min(0.8, lightBoost * 0.75 + 0.25));

        if (type === 'multi-ball') {
            spawnExtraBalls();
            return;
        }

        if (type === 'laser') {
            activateReward(createReward('laser-paddle'));
        }
    };

    const tick = (deltaSeconds: number): void => {
        manager.update(deltaSeconds);

        if (doublePointsTimer > 0) {
            doublePointsTimer = Math.max(0, doublePointsTimer - deltaSeconds);
            if (doublePointsTimer === 0 && activeReward?.type === 'double-points') {
                doublePointsMultiplier = 1;
                activeReward = null;
            }
        }

        if (slowTimeTimer > 0) {
            slowTimeTimer = Math.max(0, slowTimeTimer - deltaSeconds);
            if (slowTimeTimer === 0) {
                slowTimeScale = 1;
                if (activeReward?.type === 'slow-time') {
                    activeReward = null;
                }
            }
        }

        if (multiBallRewardTimer > 0) {
            multiBallRewardTimer = Math.max(0, multiBallRewardTimer - deltaSeconds);
        }

        if (activeReward?.type === 'multi-ball' && multiBallRewardTimer <= 0 && multiBallController.count() === 0) {
            activeReward = null;
        }

        if (activeReward?.type === 'ghost-brick' && getGhostBrickRemainingDuration() <= 0) {
            activeReward = null;
        }

        if (activeReward?.type === 'sticky-paddle' && !manager.isActive('sticky-paddle')) {
            activeReward = null;
        }

        if (widePaddleRewardActive) {
            const widthEffect = manager.getEffect('paddle-width');
            if (!widthEffect || widthEffect.remainingTime <= 0) {
                widePaddleRewardActive = false;
                rewardPaddleWidthMultiplier = defaults.paddleWidthMultiplier;
                if (activeReward?.type === 'wide-paddle') {
                    activeReward = null;
                }
            }
        }

        if (laserRewardTimer > 0) {
            laserRewardTimer = Math.max(0, laserRewardTimer - deltaSeconds);
            if (laserRewardTimer === 0) {
                disableLaserReward();
                activeLaserReward = null;
                if (activeReward?.type === 'laser-paddle') {
                    activeReward = null;
                }
            }
        }
    };

    const getPaddleWidthScale = () => {
        const widthEffect = manager.getEffect('paddle-width');
        const paddleWidthMultiplier = widePaddleRewardActive
            ? rewardPaddleWidthMultiplier
            : defaults.paddleWidthMultiplier;
        return calculatePaddleWidthScale(widthEffect, { paddleWidthMultiplier });
    };

    const getDoublePointsMultiplier = () => doublePointsMultiplier;
    const getActiveReward = () => activeReward;
    const getSlowTimeScale = () => (slowTimeTimer > 0 ? slowTimeScale : 1);
    const getSlowTimeRemaining = () => slowTimeTimer;
    const getMultiBallTimer = () => multiBallRewardTimer;

    return {
        manager,
        reset,
        activateReward,
        getActiveReward,
        getDoublePointsMultiplier,
        getSlowTimeScale,
        getSlowTimeRemaining,
        getMultiBallRewardTimer: getMultiBallTimer,
        getPaddleWidthScale,
        collectHudPowerUps,
        resolveRewardView,
        handlePowerUpActivation,
        tick,
    } satisfies RuntimePowerups;
};
