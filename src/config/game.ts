interface NumericRange {
    readonly min: number;
    readonly max: number;
}

export type RewardKey =
    | 'sticky-paddle'
    | 'double-points'
    | 'ghost-brick'
    | 'multi-ball'
    | 'slow-time'
    | 'wide-paddle';

interface StickyPaddleRewardDefinition {
    readonly duration: number;
}

interface DoublePointsRewardDefinition {
    readonly duration: number;
    readonly multiplier: number;
}

interface GhostBrickRewardDefinition {
    readonly duration: number;
    readonly ghostCount: number;
}

interface MultiBallRewardDefinition {
    readonly duration: number;
    readonly extraBalls: number;
}

interface SlowTimeRewardDefinition {
    readonly duration: number;
    readonly timeScale: number;
}

interface WidePaddleRewardDefinition {
    readonly duration: number;
    readonly widthMultiplier: number;
}

interface RewardDefinitionMap {
    readonly 'sticky-paddle': StickyPaddleRewardDefinition;
    readonly 'double-points': DoublePointsRewardDefinition;
    readonly 'ghost-brick': GhostBrickRewardDefinition;
    readonly 'multi-ball': MultiBallRewardDefinition;
    readonly 'slow-time': SlowTimeRewardDefinition;
    readonly 'wide-paddle': WidePaddleRewardDefinition;
}

interface RewardWheelSegment {
    readonly weight: number;
    readonly type: RewardKey;
}

export interface GameConfig {
    readonly playfield: {
        readonly width: number;
        readonly height: number;
    };
    readonly hud: {
        readonly scale: number;
        readonly margin: number;
        readonly minScale: number;
    };
    readonly bricks: {
        readonly size: {
            readonly width: number;
            readonly height: number;
        };
        readonly lighting: {
            readonly radius: number;
            readonly restAlpha: number;
        };
    };
    readonly ball: {
        readonly baseSpeed: number;
        readonly maxSpeed: number;
        readonly launchSpeed: number;
    };
    readonly multiBall: {
        readonly spawnMultiplier: number;
        readonly maxExtraBalls: number;
    };
    readonly paddle: {
        readonly expandedWidthMultiplier: number;
        readonly control: {
            readonly smoothResponsiveness: number;
            readonly snapThreshold: number;
        };
    };
    readonly powerUp: {
        readonly spawnChance: number;
        readonly defaultDuration: number;
        readonly rewardDuration: number;
        readonly paddleWidthMultiplier: number;
        readonly ballSpeedMultiplier: number;
        readonly radius: number;
        readonly fallSpeed: number;
    };
    readonly coins: NumericRange & {
        readonly radius: number;
        readonly fallSpeed: number;
        readonly baseValue: number;
    };
    readonly scoring: {
        readonly basePoints: number;
        readonly multiplierThreshold: number;
        readonly multiplierPerThreshold: number;
        readonly comboDecayTime: number;
    };
    readonly speedRegulation: {
        readonly comboStep: number;
        readonly multiplierPerStep: number;
    };
    readonly levels: {
        readonly defaultGap: number;
        readonly defaultStartY: number;
        readonly loopDifficultyIncrement: number;
        readonly powerUpChanceLoopIncrement: number;
    };
    readonly rewards: {
        readonly definitions: RewardDefinitionMap;
        readonly wheelSegments: readonly RewardWheelSegment[];
        readonly fallback: {
            readonly type: RewardKey;
            readonly duration: number;
        };
        readonly stackLimits: {
            readonly slowTimeMaxDuration: number;
            readonly multiBallMaxDuration: number;
        };
    };
}

const rewardDefinitions = {
    'sticky-paddle': { duration: 12 },
    'double-points': { duration: 15, multiplier: 2 },
    'ghost-brick': { duration: 10, ghostCount: 4 },
    'multi-ball': { duration: 8, extraBalls: 2 },
    'slow-time': { duration: 6, timeScale: 0.5 },
    'wide-paddle': { duration: 18, widthMultiplier: 1.85 },
} as const satisfies RewardDefinitionMap;

const rewardWheelSegments = [
    { weight: 1, type: 'sticky-paddle' },
    { weight: 0.9, type: 'double-points' },
    { weight: 0.85, type: 'wide-paddle' },
    { weight: 0.78, type: 'multi-ball' },
    { weight: 0.72, type: 'slow-time' },
    { weight: 0.65, type: 'ghost-brick' },
] as const satisfies readonly RewardWheelSegment[];

/**
 * Centralized configuration for gameplay constants. Tunable values belong here so designers can tweak
 * behavior without hunting through the codebase.
 */
export const gameConfig = {
    playfield: { width: 1280, height: 720 },
    hud: { scale: 0.9, margin: 32, minScale: 0.55 },
    bricks: {
        size: { width: 100, height: 40 },
        lighting: { radius: 180, restAlpha: 0.9 },
    },
    ball: { baseSpeed: 8, maxSpeed: 14, launchSpeed: 9 },
    multiBall: { spawnMultiplier: 3, maxExtraBalls: 9 },
    paddle: {
        expandedWidthMultiplier: 1.5,
        control: { smoothResponsiveness: 16, snapThreshold: 0.75 },
    },
    powerUp: {
        spawnChance: 0.25,
        defaultDuration: 2.5,
        rewardDuration: 6,
        paddleWidthMultiplier: 1.5,
        ballSpeedMultiplier: 1.3,
        radius: 16,
        fallSpeed: 6,
    },
    coins: { radius: 13, fallSpeed: 5.8, baseValue: 5, min: 3, max: 30 },
    scoring: {
        basePoints: 10,
        multiplierThreshold: 8,
        multiplierPerThreshold: 0.25,
        comboDecayTime: 1.6,
    },
    speedRegulation: {
        comboStep: 8,
        multiplierPerStep: 0.05,
    },
    levels: {
        defaultGap: 20,
        defaultStartY: 100,
        loopDifficultyIncrement: 0.2,
        powerUpChanceLoopIncrement: 0.1,
    },
    rewards: {
        definitions: rewardDefinitions,
        wheelSegments: rewardWheelSegments,
        fallback: { type: 'sticky-paddle', duration: 10 },
        stackLimits: {
            slowTimeMaxDuration: 12,
            multiBallMaxDuration: 16,
        },
    },
} as const satisfies GameConfig;

export type GameConfigValues = typeof gameConfig;