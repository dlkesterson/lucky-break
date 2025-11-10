import type { LaunchIntent, Vector2 } from 'input/contracts';
import type { Reward } from 'game/rewards';
import type { PowerUpType } from 'util/power-ups';
import type { AchievementUnlock } from '../achievements';
import type { SpawnCoinOptions } from '../level-runtime';
import type { PaddleMovementContext, ResolvedInputTarget } from './input';
import type { MatterBody as Body } from 'physics/matter';

export interface InputToPhysicsBridge {
    resolveTarget(): ResolvedInputTarget;
    shouldLaunch(): boolean;
    consumeLaunchIntent(): LaunchIntent | null;
    resetLaunchTrigger(): void;
    syncPaddlePosition(position: Vector2 | null): void;
    computeNextX(context: PaddleMovementContext): number;
    consumeKeyPress(code: string): boolean;
}

export interface PhysicsToScoringBridge {
    incrementLevelBricksBroken(): void;
    updateHighestCombos(combo: number): void;
    recordBrickBreakAchievements(combo: number): readonly AchievementUnlock[];
    queueAchievementUnlocks(unlocks: readonly AchievementUnlock[]): void;
    syncMomentum(): void;
}

export interface CollisionEffectHooks extends PhysicsToScoringBridge {
    getSessionElapsedSeconds(): number;
    getFrameTimestampMs(): number;
    getComboDecayWindow(): number;
    getCurrentBaseSpeed(): number;
    getCurrentMaxSpeed(): number;
    getPowerUpChanceMultiplier(): number;
    getDoublePointsMultiplier(): number;
    getActiveReward(): Reward | null;
    getChromaticColors(): readonly [number, number, number];
    refreshAchievementUpgrades(): void;
    releaseForeshadowForBall(ballId: number, actualTimeSeconds?: number): void;
    computeScheduledAudioTime(offsetMs?: number): number;
    scheduleVisualEffect(scheduledTime: number | undefined, effect: () => void): void;
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
        chromaticColors?: readonly [number, number, number];
        isBreak?: boolean;
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

export interface ScoringView {
    readonly combo: number;
    readonly comboTimer: number;
}

export interface ScoringViewProvider {
    getScoringView(): ScoringView;
}

export interface RewardsWorldBridge {
    renderStageSoon(): void;
    requestHudRefresh(): void;
    pulseHudCombo(intensity: number): void;
    flashPaddleLight(intensity: number): void;
    clearExtraBalls(): void;
    reattachBallToPaddle(): void;
    resetAutoCompleteCountdown(): void;
}
