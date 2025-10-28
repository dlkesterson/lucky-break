import { Events, Vector as MatterVector, Body as MatterBody, Bodies } from 'physics/matter';
import type { IEventCollision, MatterEngine as Engine, MatterBody as Body } from 'physics/matter';
import { calculateReflectionData, reflectOffPaddle } from 'util/paddle-reflection';
import { getMomentumMetrics } from 'util/scoring';
import { clampUnit } from 'render/playfield-visuals';
import { shouldSpawnPowerUp, selectRandomPowerUpType, type PowerUpManager, type PowerUpType } from 'util/power-ups';
import type { GameSessionManager } from '../state';
import type { LuckyBreakEventBus } from '../events';
import type { MidiEngine } from 'audio/midi-engine';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { MultiBallController } from '../multi-ball-controller';
import type { PhysicsWorldHandle } from 'physics/world';
import type { LevelRuntimeHandle } from '../level-runtime';
import type { AchievementUnlock } from '../achievements';
import type { Reward } from 'game/rewards';
import type { RandomManager } from 'util/random';
import type { GambleBrickManager } from 'game/gamble-brick-manager';
import type { GameInputManager } from 'input/input-manager';
import type { RuntimeScoringHandle } from './scoring';

export interface CollisionRuntime {
    wire(): void;
    unwire(): void;
    applyLaserStrike(options: LaserStrikeOptions): void;
}

export interface LaserStrikeOptions {
    readonly brick: Body;
    readonly origin: { readonly x: number; readonly y: number };
    readonly impactVelocity?: number;
}

type SessionSnapshot = ReturnType<GameSessionManager['snapshot']>;
type BrickMetadataMap = LevelRuntimeHandle['brickMetadata'];
type BrickVisualStateMap = LevelRuntimeHandle['brickVisualState'];

type SpawnCoinOptions = Parameters<LevelRuntimeHandle['spawnCoin']>[0];

type ScheduledEffect = () => void;

interface CollisionFunctions {
    getSessionElapsedSeconds(): number;
    getFrameTimestampMs(): number;
    getComboDecayWindow(): number;
    getCurrentBaseSpeed(): number;
    getCurrentMaxSpeed(): number;
    getPowerUpChanceMultiplier(): number;
    getDoublePointsMultiplier(): number;
    getActiveReward(): Reward | null;
    incrementLevelBricksBroken(): void;
    updateHighestCombos(combo: number): void;
    refreshAchievementUpgrades(): void;
    recordBrickBreakAchievements(combo: number): readonly AchievementUnlock[];
    queueAchievementUnlocks(unlocks: readonly AchievementUnlock[]): void;
    syncMomentum(): void;
    releaseForeshadowForBall(ballId: number, actualTimeSeconds?: number): void;
    computeScheduledAudioTime(offsetMs?: number): number;
    scheduleVisualEffect(scheduledTime: number | undefined, effect: ScheduledEffect): void;
    spawnHeatRipple(options: {
        position: { x: number; y: number };
        intensity: number;
        startRadius: number;
        endRadius: number;
    }): void;
    emitBrickParticles(options: {
        brick: Body;
        position: { x: number; y: number };
        baseColor: number;
        intensity: number;
        impactSpeed: number;
    }): void;
    flashBallLight(intensity?: number): void;
    flashPaddleLight(intensity?: number): void;
    hudPulseCombo(intensity: number): void;
    applyGambleAppearance(brick: Body): void;
    clearGhostEffect(brick: Body): void;
    removeBodyVisual(brick: Body): void;
    clearExtraBalls(): void;
    reattachBallToPaddle(): void;
    removeExtraBallByBody(body: Body): void;
    promoteExtraBallToPrimary(body: Body): boolean;
    handleLevelComplete(): void;
    handleGameOver(): void;
    handlePowerUpActivation(type: PowerUpType): void;
    spawnCoin(options: SpawnCoinOptions): void;
}

export interface CollisionContext {
    readonly session: GameSessionManager;
    readonly scoring: RuntimeScoringHandle;
    readonly gambleManager: GambleBrickManager;
    readonly levelRuntime: LevelRuntimeHandle;
    readonly brickHealth: Map<Body, number>;
    readonly brickMetadata: BrickMetadataMap;
    readonly brickVisualState: BrickVisualStateMap;
    readonly powerUpManager: PowerUpManager;
    readonly multiBallController: MultiBallController;
    readonly ball: Ball;
    readonly paddle: Paddle;
    readonly physics: Pick<PhysicsWorldHandle, 'attachBallToPaddle' | 'remove'>;
    readonly inputManager: GameInputManager;
    readonly dimensions: {
        brickWidth: number;
        brickHeight: number;
        playfieldWidth: number;
        playfieldHeight: number;
        playfieldSizeMax: number;
    };
    readonly thresholds: {
        multiplier: number;
        powerUpDuration: number;
        maxLevelBrickHp: number;
    };
    readonly coins: {
        baseValue: number;
        minValue: number;
        maxValue: number;
    };
    readonly functions: CollisionFunctions;
}

export interface CollisionRuntimeDeps {
    readonly engine: Engine;
    readonly bus: LuckyBreakEventBus;
    readonly midiEngine: MidiEngine;
    readonly random: RandomManager;
    readonly context: CollisionContext;
}

const WALL_LABEL_TO_SIDE: Record<string, 'left' | 'right' | 'top' | 'bottom'> = {
    'wall-left': 'left',
    'wall-right': 'right',
    'wall-top': 'top',
    'wall-bottom': 'bottom',
};

const isBall = (body: Body): boolean => body.label === 'ball';
const isBrick = (body: Body): boolean => body.label === 'brick';
const isPaddle = (body: Body): boolean => body.label === 'paddle';

const getNormalizedPosition = (value: number, max: number): number => (max > 0 ? clampUnit(value / max) : 0);

const toBallBrickPair = (bodyA: Body, bodyB: Body): { ballBody: Body; brickBody: Body } | null => {
    if (isBall(bodyA) && isBrick(bodyB)) {
        return { ballBody: bodyA, brickBody: bodyB };
    }
    if (isBall(bodyB) && isBrick(bodyA)) {
        return { ballBody: bodyB, brickBody: bodyA };
    }
    return null;
};

const toBallPaddlePair = (bodyA: Body, bodyB: Body): { ballBody: Body; paddleBody: Body } | null => {
    if (isBall(bodyA) && isPaddle(bodyB)) {
        return { ballBody: bodyA, paddleBody: bodyB };
    }
    if (isBall(bodyB) && isPaddle(bodyA)) {
        return { ballBody: bodyB, paddleBody: bodyA };
    }
    return null;
};

const toBallWallPair = (bodyA: Body, bodyB: Body): { ballBody: Body; wallBody: Body } | null => {
    if (isBall(bodyA) && bodyB.label.startsWith('wall-')) {
        return { ballBody: bodyA, wallBody: bodyB };
    }
    if (isBall(bodyB) && bodyA.label.startsWith('wall-')) {
        return { ballBody: bodyB, wallBody: bodyA };
    }
    return null;
};

const toSpecificPair = (label: string, target: string) => (bodyA: Body, bodyB: Body): { primary: Body; secondary: Body } | null => {
    if (bodyA.label === label && bodyB.label === target) {
        return { primary: bodyA, secondary: bodyB };
    }
    if (bodyB.label === label && bodyA.label === target) {
        return { primary: bodyB, secondary: bodyA };
    }
    return null;
};

const toPowerUpPaddlePair = toSpecificPair('powerup', 'paddle');
const toCoinPaddlePair = toSpecificPair('coin', 'paddle');
const toPowerUpBottomPair = toSpecificPair('powerup', 'wall-bottom');
const toCoinBottomPair = toSpecificPair('coin', 'wall-bottom');

const handleBallBrickCollision = (
    deps: CollisionRuntimeDeps,
    ctx: CollisionContext,
    sessionSnapshot: SessionSnapshot,
    frameTimestampMs: number,
    sessionId: string,
    brick: Body,
    ballBody: Body,
): void => {
    const {
        scoring,
        brickHealth,
        brickMetadata,
        brickVisualState,
        levelRuntime,
        gambleManager,
        ball,
    } = ctx;
    const scoringState = scoring.state;
    const fx = ctx.functions;
    const dimensions = ctx.dimensions;
    const thresholds = ctx.thresholds;
    const coins = ctx.coins;

    fx.releaseForeshadowForBall(ballBody.id, fx.getSessionElapsedSeconds());

    const currentHp = brickHealth.get(brick) ?? 1;
    const nextHp = currentHp - 1;
    const metadata = brickMetadata.get(brick);
    const row = metadata?.row ?? Math.floor((brick.position.y - 100) / dimensions.brickHeight);
    const col = metadata?.col ?? Math.floor((brick.position.x - 50) / dimensions.brickWidth);
    const impactVelocity = MatterVector.magnitude(ballBody.velocity);
    const currentMaxSpeed = fx.getCurrentMaxSpeed();
    const impactStrength = clampUnit(impactVelocity / Math.max(1, currentMaxSpeed));
    const initialHp = metadata?.hp ?? currentHp;
    const isFortified = metadata?.traits?.includes('fortified') ?? false;
    const isBreakableBrick = metadata?.breakable !== false;

    if (!isBreakableBrick) {
        const scheduledTime = fx.computeScheduledAudioTime();
        deps.bus.publish('BrickHit', {
            sessionId,
            row,
            col,
            impactVelocity,
            brickType: 'indestructible',
            comboHeat: scoringState.combo,
            previousHp: currentHp,
            remainingHp: currentHp,
            scheduledTime,
        }, frameTimestampMs);

        ctx.session.recordEntropyEvent({
            type: 'wall-hit',
            comboHeat: scoringState.combo,
            impactVelocity,
            speed: impactVelocity,
        });
        deps.midiEngine.triggerBrickAccent({
            combo: Math.max(1, scoringState.combo),
            intensity: impactStrength,
            time: scheduledTime,
            accent: 'hit',
        });
        return;
    }

    if (nextHp > 0) {
        brickHealth.set(brick, nextHp);
        levelRuntime.updateBrickDamage(brick, nextHp);
        fx.applyGambleAppearance(brick);

        const brickType = gambleManager.getState(brick)
            ? ('gamble' as const)
            : isFortified
                ? ('multi-hit' as const)
                : ('standard' as const);

        const scheduledTime = fx.computeScheduledAudioTime();
        deps.bus.publish('BrickHit', {
            sessionId,
            row,
            col,
            impactVelocity,
            brickType,
            comboHeat: scoringState.combo,
            previousHp: currentHp,
            remainingHp: nextHp,
            scheduledTime,
        }, frameTimestampMs);

        ctx.session.recordEntropyEvent({
            type: 'brick-hit',
            comboHeat: scoringState.combo,
            impactVelocity,
            speed: impactVelocity,
        });

        deps.midiEngine.triggerBrickAccent({
            combo: Math.max(1, scoringState.combo),
            intensity: impactStrength,
            time: scheduledTime,
            accent: 'hit',
        });

        fx.scheduleVisualEffect(scheduledTime, () => {
            const normalizedX = getNormalizedPosition(brick.position.x, dimensions.playfieldWidth);
            const normalizedY = getNormalizedPosition(brick.position.y, dimensions.playfieldHeight);
            const hitSpeedIntensity = clampUnit((impactVelocity ?? 0) / Math.max(1, currentMaxSpeed));
            const hitComboIntensity = clampUnit(scoringState.combo / Math.max(1, thresholds.multiplier * 2));
            const rippleIntensity = Math.min(1, 0.18 + hitSpeedIntensity * 0.45 + hitComboIntensity * 0.3);
            const contactRadius = typeof ballBody.circleRadius === 'number' && Number.isFinite(ballBody.circleRadius)
                ? Math.max(2, ballBody.circleRadius)
                : ball.radius;
            const normalizedRadius = clampUnit(contactRadius / dimensions.playfieldSizeMax);
            fx.spawnHeatRipple({
                position: { x: normalizedX, y: normalizedY },
                intensity: rippleIntensity * 0.8,
                startRadius: Math.max(0.012, normalizedRadius * 1.4),
                endRadius: Math.min(0.45, normalizedRadius * 1.3 + 0.15 + rippleIntensity * 0.2),
            });
        });
        return;
    }

    const gambleHitResult = gambleManager.onHit(brick);
    if (gambleHitResult.type === 'prime') {
        const resetHp = Math.max(1, Math.round(gambleHitResult.resetHp));
        const clampedReset = Math.min(thresholds.maxLevelBrickHp, resetHp);
        brickHealth.set(brick, clampedReset);
        const visualState = brickVisualState.get(brick);
        if (visualState) {
            const nextMax = visualState.isBreakable
                ? Math.min(thresholds.maxLevelBrickHp, Math.max(visualState.maxHp, clampedReset))
                : Math.max(visualState.maxHp, clampedReset);
            visualState.maxHp = nextMax;
            visualState.hasHpLabel = visualState.isBreakable && visualState.maxHp > 1;
        }
        levelRuntime.updateBrickDamage(brick, clampedReset);
        fx.applyGambleAppearance(brick);

        const scheduledTime = fx.computeScheduledAudioTime();
        deps.bus.publish('BrickHit', {
            sessionId,
            row,
            col,
            impactVelocity,
            brickType: 'gamble',
            comboHeat: scoringState.combo,
            previousHp: currentHp,
            remainingHp: clampedReset,
            scheduledTime,
        }, frameTimestampMs);

        ctx.session.recordEntropyEvent({
            type: 'brick-hit',
            comboHeat: scoringState.combo,
            impactVelocity,
            speed: impactVelocity,
        });
        deps.midiEngine.triggerBrickAccent({
            combo: Math.max(1, scoringState.combo),
            intensity: impactStrength,
            time: scheduledTime,
            accent: 'hit',
        });
        return;
    }

    const gambleSuccess = gambleHitResult.type === 'success';
    const brickBreakType = gambleSuccess
        ? ('gamble' as const)
        : isFortified
            ? ('multi-hit' as const)
            : ('standard' as const);

    const scheduledTime = fx.computeScheduledAudioTime();

    const bricksRemainingBefore = sessionSnapshot.brickRemaining;
    const bricksTotal = sessionSnapshot.brickTotal;
    const bricksRemainingAfter = Math.max(0, bricksRemainingBefore - 1);
    const comboDecayWindow = fx.getComboDecayWindow();
    const doublePointsMultiplier = fx.getDoublePointsMultiplier();

    const { pointsAwarded: points } = scoring.awardBrick({
        sessionId,
        row,
        col,
        impactVelocity,
        brickType: brickBreakType,
        initialHp,
        bricksRemainingAfter,
        brickTotal: bricksTotal,
        comboDecayWindow,
        maxSpeed: currentMaxSpeed,
        frameTimestampMs,
        scheduledTime,
        gambleMultiplier: gambleSuccess ? Math.max(1, gambleHitResult.rewardMultiplier) : undefined,
        doublePointsMultiplier,
        impactContext: {
            bricksRemaining: bricksRemainingAfter,
            brickTotal: bricksTotal,
            impactSpeed: impactVelocity,
            maxSpeed: currentMaxSpeed,
        },
    });

    fx.incrementLevelBricksBroken();
    fx.updateHighestCombos(scoringState.combo);

    const achievementUnlocks = fx.recordBrickBreakAchievements(scoringState.combo);
    if (achievementUnlocks.length > 0) {
        fx.queueAchievementUnlocks(achievementUnlocks);
        fx.refreshAchievementUpgrades();
        const nextDecay = fx.getComboDecayWindow();
        if (Number.isFinite(nextDecay) && nextDecay > 0) {
            scoringState.comboTimer = Math.max(scoringState.comboTimer, nextDecay);
            scoringState.momentum.comboTimer = scoringState.comboTimer;
        }
    }
    ctx.session.recordBrickBreak({
        points,
        event: {
            row,
            col,
            impactVelocity,
            brickType: brickBreakType,
            initialHp,
            comboHeat: scoringState.combo,
        },
        momentum: getMomentumMetrics(scoringState),
    });

    const speedIntensity = clampUnit((impactVelocity ?? 0) / Math.max(1, currentMaxSpeed));
    const comboIntensity = clampUnit(scoringState.combo / Math.max(1, thresholds.multiplier * 2));
    const breakAccentIntensity = Math.min(1, speedIntensity * 0.7 + comboIntensity * 0.6);
    deps.midiEngine.triggerBrickAccent({
        combo: scoringState.combo,
        intensity: breakAccentIntensity,
        time: scheduledTime,
        accent: 'break',
    });

    fx.scheduleVisualEffect(scheduledTime, () => {
        const visualState = brickVisualState.get(brick);
        if (!visualState) {
            return;
        }
        const burstStrength = Math.max(0.3, Math.min(1, comboIntensity * 0.5 + speedIntensity * 0.7));
        fx.emitBrickParticles({
            brick,
            position: { x: brick.position.x, y: brick.position.y },
            baseColor: visualState.baseColor,
            intensity: burstStrength,
            impactSpeed: impactVelocity,
        });
    });

    fx.scheduleVisualEffect(scheduledTime, () => {
        const normalizedX = getNormalizedPosition(brick.position.x, dimensions.playfieldWidth);
        const normalizedY = getNormalizedPosition(brick.position.y, dimensions.playfieldHeight);
        const rippleIntensity = Math.min(1, 0.28 + speedIntensity * 0.55 + comboIntensity * 0.45);
        const contactRadius = typeof ballBody.circleRadius === 'number' && Number.isFinite(ballBody.circleRadius)
            ? Math.max(2, ballBody.circleRadius)
            : ball.radius;
        const normalizedRadius = clampUnit(contactRadius / dimensions.playfieldSizeMax);
        fx.spawnHeatRipple({
            position: { x: normalizedX, y: normalizedY },
            intensity: rippleIntensity,
            startRadius: Math.max(0.015, normalizedRadius * 1.6),
            endRadius: Math.min(0.65, normalizedRadius * 1.6 + 0.22 + rippleIntensity * 0.3),
        });
    });

    const spawnChance = Math.min(1, 0.25 * fx.getPowerUpChanceMultiplier());
    if (shouldSpawnPowerUp({ spawnChance }, deps.random.random)) {
        const powerUpType = selectRandomPowerUpType(deps.random.random);
        levelRuntime.spawnPowerUp(powerUpType, { x: brick.position.x, y: brick.position.y });
    }

    const entropyState = ctx.session.getEntropyState();
    const entropyRatio = Math.max(0, Math.min(1, entropyState.charge / 100));
    const baseCoinChance = 0.18;
    const comboBonus = Math.min(0.3, scoringState.combo * 0.015);
    const entropyBonus = Math.min(0.25, entropyRatio * 0.4);
    const rewardBonus = fx.getActiveReward()?.type === 'double-points' ? 0.05 : 0;
    const coinChance = Math.min(0.75, baseCoinChance + comboBonus + entropyBonus + rewardBonus);
    if (deps.random.random() < coinChance) {
        const valueSeed = Math.round(coins.baseValue + scoringState.combo * 0.4 + entropyRatio * 12);
        const coinValue = Math.max(coins.minValue, Math.min(coins.maxValue, valueSeed));
        fx.spawnCoin({
            value: coinValue,
            position: { x: brick.position.x, y: brick.position.y },
        });
    }

    fx.clearGhostEffect(brick);

    ctx.physics.remove(brick);
    fx.removeBodyVisual(brick);
    brickHealth.delete(brick);
    brickMetadata.delete(brick);
    brickVisualState.delete(brick);

    if (ctx.session.snapshot().brickRemaining === 0) {
        ctx.session.completeRound();
        fx.handleLevelComplete();
    }
};

const handleBallPaddleCollision = (
    deps: CollisionRuntimeDeps,
    ctx: CollisionContext,
    frameTimestampMs: number,
    sessionId: string,
    ballBody: Body,
    paddleBody: Body,
): void => {
    const fx = ctx.functions;
    const reflectionData = calculateReflectionData(ballBody.position.x, paddleBody.position.x, {
        paddleWidth: ctx.paddle.width,
        minSpeed: fx.getCurrentBaseSpeed(),
    });
    const impactSpeed = MatterVector.magnitude(ballBody.velocity);

    if (ctx.powerUpManager.isActive('sticky-paddle') && ballBody === ctx.ball.physicsBody) {
        fx.releaseForeshadowForBall(ballBody.id, fx.getSessionElapsedSeconds());
        const offsetX = ctx.ball.physicsBody.position.x - ctx.paddle.physicsBody.position.x;
        const offsetY = -ctx.ball.radius - ctx.paddle.height / 2;
        const attachmentOffset = { x: offsetX, y: offsetY };
        ctx.physics.attachBallToPaddle(ctx.ball.physicsBody, ctx.paddle.physicsBody, attachmentOffset);
        ctx.ball.isAttached = true;
        ctx.ball.attachmentOffset = attachmentOffset;
        MatterBody.setVelocity(ctx.ball.physicsBody, { x: 0, y: 0 });
        ctx.inputManager.resetLaunchTrigger();
    } else {
        reflectOffPaddle(ballBody, paddleBody, {
            paddleWidth: ctx.paddle.width,
            minSpeed: fx.getCurrentBaseSpeed(),
        });
    }

    const scheduledTime = fx.computeScheduledAudioTime();
    fx.scheduleVisualEffect(scheduledTime, () => {
        fx.flashBallLight();
        fx.flashPaddleLight(0.3);
    });

    deps.bus.publish('PaddleHit', {
        sessionId,
        angle: reflectionData.angle,
        speed: impactSpeed,
        impactOffset: reflectionData.impactOffset,
        scheduledTime,
    }, frameTimestampMs);

    ctx.session.recordEntropyEvent({
        type: 'paddle-hit',
        speed: impactSpeed,
        comboHeat: ctx.scoring.state.combo,
    });
};

const handleBallWallCollision = (
    deps: CollisionRuntimeDeps,
    ctx: CollisionContext,
    frameTimestampMs: number,
    sessionId: string,
    ballBody: Body,
    wallBody: Body,
): void => {
    const side = WALL_LABEL_TO_SIDE[wallBody.label];
    if (!side) {
        return;
    }

    const wallSpeed = MatterVector.magnitude(ballBody.velocity);
    const scheduledTime = ctx.functions.computeScheduledAudioTime();
    deps.bus.publish('WallHit', {
        sessionId,
        side,
        speed: wallSpeed,
        scheduledTime,
    }, frameTimestampMs);

    deps.midiEngine.triggerWallHit({
        speed: wallSpeed,
        time: scheduledTime,
    });

    ctx.session.recordEntropyEvent({
        type: 'wall-hit',
        speed: wallSpeed,
    });
};

const handleBallBottomCollision = (
    deps: CollisionRuntimeDeps,
    ctx: CollisionContext,
    ballBody: Body,
): void => {
    const fx = ctx.functions;
    fx.releaseForeshadowForBall(ballBody.id, fx.getSessionElapsedSeconds());

    if (ctx.multiBallController.isExtraBallBody(ballBody)) {
        fx.removeExtraBallByBody(ballBody);
        return;
    }

    if (fx.promoteExtraBallToPrimary(ballBody)) {
        return;
    }

    const scoringState = ctx.scoring.state;
    const comboBeforeReset = scoringState.combo;
    ctx.session.recordLifeLost('ball-drop');
    ctx.session.recordEntropyEvent({ type: 'combo-reset', comboHeat: comboBeforeReset });
    ctx.scoring.lifeLost();
    fx.syncMomentum();

    if (ctx.session.snapshot().livesRemaining > 0) {
        fx.clearExtraBalls();
        fx.reattachBallToPaddle();
    } else {
        fx.handleGameOver();
    }
};

const handlePowerUpPaddleCollision = (
    deps: CollisionRuntimeDeps,
    ctx: CollisionContext,
    powerUpBody: Body,
): void => {
    const fx = ctx.functions;
    const entry = ctx.levelRuntime.findPowerUp(powerUpBody);
    if (!entry) {
        return;
    }

    const scheduledTime = fx.computeScheduledAudioTime();
    ctx.powerUpManager.activate(entry.type, { defaultDuration: ctx.thresholds.powerUpDuration });
    ctx.levelRuntime.removePowerUp(entry);
    fx.handlePowerUpActivation(entry.type);
    const sparkle = clampUnit(ctx.scoring.state.combo / Math.max(1, ctx.thresholds.multiplier));
    deps.midiEngine.triggerPowerUp({
        time: scheduledTime,
        sparkle,
    });
};

const handleCoinPaddleCollision = (
    ctx: CollisionContext,
    coinBody: Body,
): void => {
    const fx = ctx.functions;
    const entry = ctx.levelRuntime.findCoin(coinBody);
    if (!entry) {
        return;
    }

    ctx.session.collectCoins(entry.value);
    ctx.session.recordEntropyEvent({
        type: 'coin-collect',
        coinValue: entry.value,
        comboHeat: ctx.scoring.state.combo,
    });
    ctx.levelRuntime.removeCoin(entry);
    fx.hudPulseCombo(0.4);
};

const handlePowerUpMissed = (ctx: CollisionContext, powerUpBody: Body): void => {
    const entry = ctx.levelRuntime.findPowerUp(powerUpBody);
    if (entry) {
        ctx.levelRuntime.removePowerUp(entry);
    }
};

const handleCoinMissed = (ctx: CollisionContext, coinBody: Body): void => {
    const entry = ctx.levelRuntime.findCoin(coinBody);
    if (entry) {
        ctx.levelRuntime.removeCoin(entry);
    }
};

export const createCollisionRuntime = (deps: CollisionRuntimeDeps): CollisionRuntime => {
    const { engine, context: ctx } = deps;

    const handleCollisionStart = (event: IEventCollision<Engine>) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;
            const sessionSnapshot = ctx.session.snapshot();
            const frameTimestampMs = ctx.functions.getFrameTimestampMs();
            const sessionId = sessionSnapshot.sessionId;

            const ballBrick = toBallBrickPair(bodyA, bodyB);
            if (ballBrick) {
                handleBallBrickCollision(deps, ctx, sessionSnapshot, frameTimestampMs, sessionId, ballBrick.brickBody, ballBrick.ballBody);
                return;
            }

            const ballPaddle = toBallPaddlePair(bodyA, bodyB);
            if (ballPaddle) {
                handleBallPaddleCollision(deps, ctx, frameTimestampMs, sessionId, ballPaddle.ballBody, ballPaddle.paddleBody);
                return;
            }

            const ballWall = toBallWallPair(bodyA, bodyB);
            if (ballWall) {
                if (ballWall.wallBody.label === 'wall-bottom') {
                    handleBallBottomCollision(deps, ctx, ballWall.ballBody);
                } else {
                    handleBallWallCollision(deps, ctx, frameTimestampMs, sessionId, ballWall.ballBody, ballWall.wallBody);
                }
                return;
            }

            const powerUpPaddle = toPowerUpPaddlePair(bodyA, bodyB);
            if (powerUpPaddle) {
                handlePowerUpPaddleCollision(deps, ctx, powerUpPaddle.primary);
                return;
            }

            const coinPaddle = toCoinPaddlePair(bodyA, bodyB);
            if (coinPaddle) {
                handleCoinPaddleCollision(ctx, coinPaddle.primary);
                return;
            }

            const powerUpBottom = toPowerUpBottomPair(bodyA, bodyB);
            if (powerUpBottom) {
                handlePowerUpMissed(ctx, powerUpBottom.primary);
                return;
            }

            const coinBottom = toCoinBottomPair(bodyA, bodyB);
            if (coinBottom) {
                handleCoinMissed(ctx, coinBottom.primary);
            }
        });
    };

    const applyLaserStrike: CollisionRuntime['applyLaserStrike'] = ({ brick, origin, impactVelocity }) => {
        const sessionSnapshot = ctx.session.snapshot();
        const frameTimestampMs = ctx.functions.getFrameTimestampMs();
        const sessionId = sessionSnapshot.sessionId;
        const radius = Math.max(4, ctx.ball.radius * 0.9);
        const syntheticBall = Bodies.circle(origin.x, origin.y, radius, {
            label: 'ball',
            isSensor: true,
        });
        const velocity = Math.max(0, impactVelocity ?? ctx.functions.getCurrentMaxSpeed());
        MatterBody.setVelocity(syntheticBall, { x: 0, y: -velocity });
        handleBallBrickCollision(deps, ctx, sessionSnapshot, frameTimestampMs, sessionId, brick, syntheticBall);
    };

    return {
        wire: () => {
            Events.on(engine, 'collisionStart', handleCollisionStart);
        },
        unwire: () => {
            const candidate = Events as typeof Events & {
                off?: (engine: Engine, eventName: string, callback: (event: IEventCollision<Engine>) => void) => void;
            };
            if (typeof candidate.off === 'function') {
                candidate.off(engine, 'collisionStart', handleCollisionStart);
            }
        },
        applyLaserStrike,
    } satisfies CollisionRuntime;
};
