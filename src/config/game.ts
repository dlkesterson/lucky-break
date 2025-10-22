interface NumericRange {
    readonly min: number;
    readonly max: number;
}

interface LevelLoopProgressionStep {
    readonly speedMultiplier: number;
    readonly brickHpMultiplier: number;
    readonly brickHpBonus: number;
    readonly powerUpChanceMultiplier: number;
    readonly gapScale: number;
    readonly fortifiedChance: number;
    readonly voidColumnChance: number;
    readonly centerFortifiedBias: number;
}

interface LevelLoopProgressionFallback {
    readonly speedMultiplierIncrement: number;
    readonly brickHpMultiplierIncrement: number;
    readonly brickHpBonusIncrement: number;
    readonly powerUpChanceMultiplierStep: number;
    readonly gapScaleStep: number;
    readonly fortifiedChanceIncrement: number;
    readonly voidColumnChanceIncrement: number;
    readonly centerFortifiedBiasIncrement: number;
    readonly maxSpeedMultiplier: number;
    readonly minPowerUpChanceMultiplier: number;
    readonly minGapScale: number;
    readonly maxFortifiedChance: number;
    readonly maxVoidColumnChance: number;
    readonly maxCenterFortifiedBias: number;
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
        readonly minGap: number;
        readonly maxVoidColumns: number;
        readonly loopProgression: readonly LevelLoopProgressionStep[];
        readonly loopFallback: LevelLoopProgressionFallback;
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
        minGap: 8,
        maxVoidColumns: 2,
        loopProgression: [
            {
                speedMultiplier: 1.08,
                brickHpMultiplier: 1.25,
                brickHpBonus: 0.5,
                powerUpChanceMultiplier: 0.9,
                gapScale: 0.95,
                fortifiedChance: 0.12,
                voidColumnChance: 0.05,
                centerFortifiedBias: 0.35,
            },
            {
                speedMultiplier: 1.16,
                brickHpMultiplier: 1.4,
                brickHpBonus: 1,
                powerUpChanceMultiplier: 0.85,
                gapScale: 0.9,
                fortifiedChance: 0.2,
                voidColumnChance: 0.08,
                centerFortifiedBias: 0.45,
            },
            {
                speedMultiplier: 1.24,
                brickHpMultiplier: 1.6,
                brickHpBonus: 1.5,
                powerUpChanceMultiplier: 0.8,
                gapScale: 0.85,
                fortifiedChance: 0.28,
                voidColumnChance: 0.12,
                centerFortifiedBias: 0.5,
            },
        ],
        loopFallback: {
            speedMultiplierIncrement: 0.06,
            brickHpMultiplierIncrement: 0.2,
            brickHpBonusIncrement: 0.75,
            powerUpChanceMultiplierStep: -0.05,
            gapScaleStep: -0.04,
            fortifiedChanceIncrement: 0.05,
            voidColumnChanceIncrement: 0.03,
            centerFortifiedBiasIncrement: 0.05,
            maxSpeedMultiplier: 2,
            minPowerUpChanceMultiplier: 0.55,
            minGapScale: 0.7,
            maxFortifiedChance: 0.6,
            maxVoidColumnChance: 0.25,
            maxCenterFortifiedBias: 0.8,
        },
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