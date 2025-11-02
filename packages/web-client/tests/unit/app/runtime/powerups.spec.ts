import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createRuntimePowerups, type RuntimePowerups, type RuntimePowerupsDeps } from 'app/runtime/powerups';
import type { MultiBallController } from 'app/multi-ball-controller';
import type { LaserPaddleReward, Reward } from 'game/rewards';

const createLoggerMock = () => {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
    };
    logger.child.mockReturnValue(logger);
    return logger;
};

interface RuntimeHarness {
    readonly runtime: RuntimePowerups;
    readonly logger: ReturnType<typeof createLoggerMock>;
    readonly flashBallLight: Mock<[number], void>;
    readonly flashPaddleLight: Mock<[number], void>;
    readonly spawnExtraBalls: Mock<[count?: number], void>;
    readonly resetGhostBricks: Mock<[], void>;
    readonly applyGhostBrickReward: Mock<[number, number], void>;
    readonly enableLaserReward: Mock<[LaserPaddleReward], void>;
    readonly disableLaserReward: Mock<[], void>;
    readonly multiBallCount: Mock<[], number>;
    readonly setMultiBallCount: (value: number) => void;
    readonly setGhostDuration: (value: number) => void;
}

const createRuntime = (overrides: Partial<RuntimePowerupsDeps> = {}): RuntimeHarness => {
    let multiBallCountValue = 0;
    const multiBallCount: Mock<[], number> = vi.fn(() => multiBallCountValue);
    const multiBallController = { count: multiBallCount } as unknown as MultiBallController;

    let ghostBrickDuration = 0;
    const getGhostBrickRemainingDuration: Mock<[], number> = vi.fn(() => ghostBrickDuration);

    const flashBallLight: Mock<[number], void> = vi.fn();
    const flashPaddleLight: Mock<[number], void> = vi.fn();
    const spawnExtraBalls: Mock<[count?: number], void> = vi.fn();
    const resetGhostBricks: Mock<[], void> = vi.fn();
    const applyGhostBrickReward: Mock<[number, number], void> = vi.fn();
    const enableLaserReward: Mock<[LaserPaddleReward], void> = vi.fn();
    const disableLaserReward: Mock<[], void> = vi.fn();
    const logger = createLoggerMock();

    const deps: RuntimePowerupsDeps = {
        logger,
        multiBallController,
        flashBallLight,
        flashPaddleLight,
        spawnExtraBalls,
        resetGhostBricks,
        applyGhostBrickReward,
        getGhostBrickRemainingDuration,
        defaults: {
            paddleWidthMultiplier: 1.25,
            multiBallCapacity: 4,
            multiBallMaxDuration: 12,
            slowTimeMaxDuration: 9,
        },
        enableLaserReward,
        disableLaserReward,
        ...overrides,
    };

    const runtime = createRuntimePowerups(deps);

    return {
        runtime,
        logger,
        flashBallLight,
        flashPaddleLight,
        spawnExtraBalls,
        resetGhostBricks,
        applyGhostBrickReward,
        enableLaserReward,
        disableLaserReward,
        multiBallCount,
        setMultiBallCount(value: number) {
            multiBallCountValue = value;
        },
        setGhostDuration(value: number) {
            ghostBrickDuration = value;
        },
    } satisfies RuntimeHarness;
};

describe('createRuntimePowerups', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('applies multi-ball rewards and clears them once extras expire', () => {
        const { runtime, logger, multiBallCount, setMultiBallCount, spawnExtraBalls } = createRuntime();
        multiBallCount.mockImplementationOnce(() => 1);
        multiBallCount.mockImplementationOnce(() => 3);
        setMultiBallCount(2);

        const reward: Reward = { type: 'multi-ball', duration: 6, extraBalls: 3 };
        runtime.activateReward(reward);

        expect(spawnExtraBalls).toHaveBeenCalledTimes(1);
        expect(spawnExtraBalls).toHaveBeenCalledWith(2);
        expect(logger.info).toHaveBeenCalledWith(
            'Multi-ball reward applied',
            expect.objectContaining({
                duration: 6,
                previousExtras: 1,
                afterCount: 3,
                capacity: 4,
                requestedExtras: 3,
                spawnedExtras: 2,
            }),
        );
        expect(runtime.getMultiBallRewardTimer()).toBe(6);
        expect(runtime.getActiveReward()).toEqual(reward);

        setMultiBallCount(0);
        runtime.tick(6);

        expect(runtime.getMultiBallRewardTimer()).toBe(0);
        expect(runtime.getActiveReward()).toBeNull();
    });

    it('extends active slow-time rewards and restores default speed on expiry', () => {
        const { runtime, logger } = createRuntime();
        const initial: Reward = { type: 'slow-time', duration: 4, timeScale: 0.6 };
        runtime.activateReward(initial);

        expect(runtime.getSlowTimeRemaining()).toBe(4);
        expect(runtime.getSlowTimeScale()).toBeCloseTo(0.6, 3);

        const followUp: Reward = { type: 'slow-time', duration: 6, timeScale: 0.3 };
        runtime.activateReward(followUp);

        expect(logger.info).toHaveBeenLastCalledWith(
            'Slow-time reward applied',
            expect.objectContaining({
                duration: 9,
                extended: true,
                previousDuration: 4,
                previousScale: 0.6,
            }),
        );
        expect(runtime.getSlowTimeRemaining()).toBe(9);
        expect(runtime.getSlowTimeScale()).toBeCloseTo(0.6, 3);

        runtime.tick(9);

        expect(runtime.getSlowTimeRemaining()).toBe(0);
        expect(runtime.getSlowTimeScale()).toBe(1);
        expect(runtime.getActiveReward()).toBeNull();
    });

    it('presents wide-paddle rewards in the HUD and resets paddle width after expiry', () => {
        const { runtime } = createRuntime();
        const reward: Reward = { type: 'wide-paddle', duration: 2, widthMultiplier: 1.6 };
        runtime.activateReward(reward);

        expect(runtime.collectHudPowerUps()).toEqual([{ label: 'Paddle Width', remaining: '2.0s' }]);
        expect(runtime.getPaddleWidthScale()).toBeGreaterThan(1);
        expect(runtime.resolveRewardView()).toEqual({ label: 'Wide Paddle', remaining: '2.0s' });

        runtime.tick(2.1);

        expect(runtime.collectHudPowerUps()).toEqual([]);
        expect(runtime.getPaddleWidthScale()).toBeCloseTo(1, 5);
        expect(runtime.getActiveReward()).toBeNull();
    });

    it('activates laser paddle rewards and disables them after the timer expires', () => {
        const { runtime, enableLaserReward, disableLaserReward } = createRuntime();
        const reward: LaserPaddleReward = {
            type: 'laser-paddle',
            duration: 1.2,
            cooldown: 0.3,
            beamVelocity: 480,
            pierceCount: 2,
        };

        runtime.activateReward(reward);

        expect(enableLaserReward).toHaveBeenCalledTimes(1);
        expect(enableLaserReward).toHaveBeenCalledWith(reward);
        expect(runtime.resolveRewardView()).toEqual({ label: 'Laser Paddle', remaining: '1.2s' });

        runtime.tick(1.2);

        expect(disableLaserReward).toHaveBeenCalledTimes(1);
        expect(runtime.getActiveReward()).toBeNull();
        expect(runtime.resolveRewardView()).toBeNull();
    });

    it('delegates ghost brick rewards and clears them when the external timer ends', () => {
        const { runtime, applyGhostBrickReward, setGhostDuration } = createRuntime();
        setGhostDuration(5);
        const reward: Reward = { type: 'ghost-brick', duration: 5, ghostCount: 3 };

        runtime.activateReward(reward);

        expect(applyGhostBrickReward).toHaveBeenCalledWith(5, 3);
        expect(runtime.resolveRewardView()).toEqual({ label: 'Ghost Bricks', remaining: '5.0s' });

        setGhostDuration(0);
        runtime.tick(0.1);

        expect(runtime.getActiveReward()).toBeNull();
    });

    it('counts down double points rewards and restores multiplier when finished', () => {
        const { runtime } = createRuntime();
        const reward: Reward = { type: 'double-points', duration: 3, multiplier: 4 };

        runtime.activateReward(reward);

        expect(runtime.getDoublePointsMultiplier()).toBe(4);
        expect(runtime.resolveRewardView()).toEqual({ label: 'Double Points', remaining: '3.0s' });

        runtime.tick(3);

        expect(runtime.getDoublePointsMultiplier()).toBe(1);
        expect(runtime.getActiveReward()).toBeNull();
    });

    it('handles power-up activation feedback and optional laser reward creation', () => {
        const { runtime, flashBallLight, flashPaddleLight, spawnExtraBalls, enableLaserReward } = createRuntime();

        runtime.handlePowerUpActivation('multi-ball');

        expect(flashBallLight).toHaveBeenCalledWith(0.9);
        expect(flashPaddleLight).toHaveBeenCalledWith(0.8);
        expect(spawnExtraBalls).toHaveBeenCalledWith();

        flashBallLight.mockClear();
        flashPaddleLight.mockClear();

        runtime.handlePowerUpActivation('laser');

        expect(flashBallLight).toHaveBeenCalledWith(0.8);
        expect(flashPaddleLight).toHaveBeenCalledWith(0.8);
        expect(enableLaserReward).toHaveBeenCalled();
    });
});
