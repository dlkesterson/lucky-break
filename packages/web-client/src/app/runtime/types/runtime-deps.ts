/**
 * Runtime Dependency Type Definitions
 *
 * This file contains interface definitions for all dependencies used across
 * the runtime module system, replacing `any` types with proper TypeScript contracts.
 */

import type { MatterBody as Body, MatterVector as Vector, MatterEngine as Engine } from 'physics/matter';
import type { PowerUpEffect, PowerUpType } from 'util/power-ups';
import type { Reward } from 'game/rewards';
export type { SpawnCoinOptions } from '../../level-runtime';
import type { AchievementUnlock } from '../../achievements';

// ============================================================================
// Core Services
// ============================================================================

export interface TimeService {
    markTime(): void;
    tick(delta: number): void;
}

export interface PhysicsService {
    step(delta: number): void;
    readonly world: Engine;
}

export interface BallEntity {
    readonly id: number;
    readonly physicsBody: Body;
    readonly position: { x: number; y: number };
    readonly velocity: Vector;
    readonly radius: number;
}

export interface BallLifecycleService {
    visitActiveBalls(callback: (ball: BallEntity) => void): void;
    count(): number;
    getCapacity(): number;
}

export interface PaddleService {
    readonly physicsBody: Body;
    readonly width: number;
    readonly height: number;
    readonly accentColor: number;
    getPaddleCenter(): { x: number; y: number };
}

export interface InputService {
    shouldLaunch(): boolean;
    consumeLaunchIntent(): { direction: Vector } | null;
    resetLaunchTrigger(): void;
    syncPaddlePosition(position: { x: number; y: number } | null): void;
}

// ============================================================================
// Power-Up & Effects
// ============================================================================

export interface PowerUpService {
    getEffect(): PowerUpEffect | null;
    getSlowTimeScale(): number;
    getSlowTimeRemaining(): number;
    getActiveEffects(): PowerUpEffect[];
    readonly lookAheadMs: number;
    next(): void;
}

export interface LaserControllerService {
    isActive(): boolean;
}

// ============================================================================
// Collision & Physics
// ============================================================================

export interface BallAttachmentController {
    attachBallToPaddle(ball: Body, paddle: Body): void;
    remove(ball: Body): void;
    isBallAttached(ball: Body): boolean;
}

export interface LaunchController {
    launch(ball: Body, direction: Vector): void;
}

export interface BrickGridService {
    readonly brickWidth: number;
    readonly brickHeight: number;
}

// ============================================================================
// Scoring & Progression
// ============================================================================

export interface ScoringService {
    readonly scoring: {
        readonly comboDecayWindow: number;
    };
    readonly powerUpDuration: number;
}

export interface RewardService {
    readonly coinBaseValue: number;
    readonly coinMinValue: number;
    readonly coinMaxValue: number;
    readonly combined: {
        getPowerUpChanceMultiplier(): number;
        getDoublePointsMultiplier(): number;
        getActiveReward(): Reward | null;
    };
}

export interface AchievementService {
    incrementLevelBricksBroken(): void;
    updateHighestCombos(combo: number): void;
    recordBrickBreak(combo: number): readonly AchievementUnlock[];
    enqueueAchievementUnlocks(unlocks: readonly AchievementUnlock[]): void;
}

export interface ComboService {
    releaseForeshadowForBall(ballId: number): void;
}

// ============================================================================
// Visual Effects
// ============================================================================

export interface VisualEffectsService {
    heatRippleEffect(options: {
        position: { x: number; y: number };
        intensity: number;
        startRadius: number;
        endRadius: number;
    }): void;
    brickParticles(options: {
        brick: Body;
        position: { x: number; y: number };
        baseColor: number;
        intensity: number;
        impactSpeed: number;
        chromaticColors?: readonly [number, number, number];
        isBreak?: boolean;
    }): void;
    pulseCombo(intensity: number): void;
    handlePowerUpActivation(type: PowerUpType): void;
}

// ============================================================================
// Session & State
// ============================================================================

export interface SessionService {
    snapshot(): {
        readonly sessionId: string;
        readonly livesRemaining: number;
        readonly status: string;
        readonly brickRemaining: number;
        readonly brickTotal: number;
        readonly score: number;
    };
    recordLifeLost(cause: string): void;
    completeRound(): void;
}

export interface RoundMachineService {
    resetAutoCompleteCountdown(): void;
    next(): void;
    setPowerUpChanceMultiplier(multiplier: number): void;
    setLevelDifficultyMultiplier(multiplier: number): void;
    getLevelDifficultyMultiplier(): number;
}

export interface EntropyService {
    recordEntropyEvent(event: unknown): void;
}

// ============================================================================
// Audio & Music
// ============================================================================

export interface AudioSchedulerService {
    tick(delta: number): void;
}

export interface MusicStateService {
    tick(delta: number): void;
}

export interface AudioStateObservable {
    snapshot(): {
        readonly scene: string;
        readonly primaryLayerActive: boolean;
    };
}

// ============================================================================
// Replay & Time
// ============================================================================

export interface ReplayBufferService {
    recordPaddleTarget(target: { x: number; y: number }, timestamp: number): void;
    recordLaunch(event: {
        sessionId: string;
        ballId: number;
        paddleId: number;
        launchVx: number;
        launchVy: number;
        timestamp: number;
    }): void;
}

export interface FrameTimeService {
    now(): number;
}

// ============================================================================
// Collision Context Dependencies
// ============================================================================

export interface CollisionContextDeps {
    readonly ballAttachment: BallAttachmentController;
    readonly launchController: LaunchController;
    readonly brickGrid: BrickGridService;
    readonly scoring: ScoringService;
    readonly rewards: RewardService;
    readonly achievements: AchievementService;
    readonly combo: ComboService;
    readonly visualEffects: VisualEffectsService;
    readonly session: SessionService;
    readonly roundMachine: RoundMachineService;
    readonly entropy: EntropyService;
}

// ============================================================================
// Gameplay Pipeline Dependencies
// ============================================================================

export interface GameplayPipelineDeps {
    readonly time: TimeService;
    readonly physics: PhysicsService;
    readonly ballLifecycle: BallLifecycleService;
    readonly paddle: PaddleService;
    readonly input: InputService;
    readonly powerUps: PowerUpService;
    readonly laser: LaserControllerService;
    readonly audioScheduler: AudioSchedulerService;
    readonly musicState: MusicStateService;
    readonly audioState$: AudioStateObservable;
    readonly replayBuffer: ReplayBufferService;
    readonly frameTime: FrameTimeService;
}

// ============================================================================
// Visual Effects Dependencies
// ============================================================================

export interface ColorFilter {
    reset(): void;
    hue(value: number, multiply: boolean): void;
    saturate(value: number, multiply?: boolean): void;
}

export interface GlowFilter {
    color: number;
    outerStrength: number;
}

export interface VisualEffectsFilterDeps {
    readonly chromaticFilter: ColorFilter;
    readonly ballGlow: GlowFilter;
    readonly speedIndicator: {
        updateSpeedIndicators(params: {
            baseSpeed: number;
            maxSpeed: number;
            deltaSeconds: number;
        }): void;
    };
}

// ============================================================================
// Runtime State Dependencies  
// ============================================================================

export interface RuntimeStateConfig {
    readonly sessionElapsedSeconds: number;
    readonly syncDriftHistory: number[];
    readonly syncDriftAverageMs: number;
}

export interface RuntimeStateDeps {
    readonly state: RuntimeStateConfig;
    readonly config: {
        readonly baseSpeed: number;
        readonly maxSpeed: number;
    };
    readonly loadout: {
        readonly baseSpeed: number;
        readonly maxSpeed: number;
    };
}
