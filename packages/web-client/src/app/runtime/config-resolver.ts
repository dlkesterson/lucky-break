/* eslint-disable @typescript-eslint/class-literal-property-style */
import type { GameConfig } from 'config/game';

/**
 * Centralizes runtime config resolution to avoid polluting facade.ts with 50+ constants.
 * Provides typed, lazy-access to game configuration values with intelligent defaults.
 */
export class RuntimeConfigResolver {
    constructor(private readonly config: GameConfig) { }

    // Playfield dimensions
    get playfieldDefault() {
        return this.config.playfield;
    }

    // Ball configuration
    get initialLives(): number {
        return 3; // Currently hardcoded in facade
    }

    get minSpeed(): number {
        return this.config.ball.baseSpeed * 0.5;
    }

    get baseSpeed(): number {
        return this.config.ball.baseSpeed;
    }

    get maxSpeed(): number {
        return this.config.ball.maxSpeed;
    }

    get launchSpeed(): number {
        return this.config.ball.launchSpeed;
    }

    get ballGravity(): number {
        return 0; // Matter default
    }

    readonly wallDeadzone: number = 0.5;

    /* eslint-enable @typescript-eslint/class-literal-property-style */

    readonly ballRadius = 10; // Currently hardcoded in facade, could move to config

    // Paddle configuration
    readonly paddleBaseWidth = 100; // Currently hardcoded

    readonly paddleBaseHeight = 20; // Currently hardcoded

    readonly paddleBaseSpeed = 300; // Currently hardcoded

    readonly paddleSpawnOffsetFromBottom = 70; // Currently hardcoded

    get paddleExpandedWidthMultiplier() {
        return this.config.paddle.expandedWidthMultiplier;
    }

    get paddleSmoothResponsiveness() {
        return this.config.paddle.control.smoothResponsiveness;
    }

    get paddleSnapThreshold() {
        return this.config.paddle.control.snapThreshold;
    }

    // Brick configuration
    get brickWidth() {
        return this.config.bricks.size.width;
    }

    get brickHeight() {
        return this.config.bricks.size.height;
    }

    get brickLightRadius() {
        return this.config.bricks.lighting.radius;
    }

    get brickRestAlpha() {
        return this.config.bricks.lighting.restAlpha;
    }

    // Scoring configuration
    get baseComboDecayWindow() {
        return this.config.scoring.comboDecayTime;
    }

    get scoringMultiplierThreshold() {
        return this.config.scoring.multiplierThreshold;
    }

    // Multi-ball configuration
    get multiBallSpawnMultiplier() {
        return this.config.multiBall.spawnMultiplier;
    }

    get multiBallMaxCapacity() {
        return this.config.multiBall.maxExtraBalls;
    }

    get multiBallMaxDuration() {
        return this.config.rewards.stackLimits.multiBallMaxDuration;
    }

    // Power-up configuration
    get powerUpRadius() {
        return this.config.powerUp.radius;
    }

    get powerUpFallSpeed() {
        return this.config.powerUp.fallSpeed;
    }

    get powerUpDuration() {
        return this.config.powerUp.rewardDuration;
    }

    // Coin configuration
    get coinRadius() {
        return this.config.coins.radius;
    }

    get coinFallSpeed() {
        return this.config.coins.fallSpeed;
    }

    get coinBaseValue() {
        return this.config.coins.baseValue;
    }

    get coinMinValue() {
        return this.config.coins.min;
    }

    get coinMaxValue() {
        return this.config.coins.max;
    }

    // Modifier ranges
    get modifierGravityRange(): GameConfig['modifiers']['gravity'] {
        return this.config.modifiers.gravity;
    }

    get modifierRestitutionRange(): GameConfig['modifiers']['restitution'] {
        return this.config.modifiers.restitution;
    }

    get modifierPaddleWidthRange(): GameConfig['modifiers']['paddleWidth'] {
        return this.config.modifiers.paddleWidth;
    }

    get modifierSpeedGovernorRange(): GameConfig['modifiers']['speedGovernor'] {
        return this.config.modifiers.speedGovernor;
    }

    // Derived modifier defaults
    get baseBallRestitution() {
        return this.modifierRestitutionRange.default;
    }

    // Gamble level configuration
    get gambleTimerSeconds() {
        return this.config.levels.gamble.timerSeconds;
    }

    get gambleRewardMultiplier() {
        return Math.max(1, this.config.levels.gamble.rewardMultiplier);
    }

    get gamblePrimeResetHp() {
        return Math.max(1, this.config.levels.gamble.primeResetHp);
    }

    get gambleFailPenaltyHp() {
        return Math.max(1, this.config.levels.gamble.failPenaltyHp);
    }

    get gambleTintArmed() {
        return this.config.levels.gamble.tintArmed;
    }

    get gambleTintPrimed() {
        return this.config.levels.gamble.tintPrimed;
    }

    get gambleCountdownAudioThreshold() {
        return Math.min(5, Math.max(1, Math.ceil(this.gambleTimerSeconds)));
    }

    // Auto-complete configuration
    get autoCompleteEnabled() {
        return this.config.levels.autoComplete.enabled;
    }

    get autoCompleteCountdown() {
        return Math.max(1, this.config.levels.autoComplete.countdownSeconds);
    }

    get autoCompleteTrigger() {
        return Math.max(1, this.config.levels.autoComplete.triggerRemainingBricks);
    }

    // Entropy costs
    get entropyRerollCost() {
        return Math.max(1, this.config.entropy.spend.rerollCost);
    }

    get entropyShieldCost() {
        return Math.max(1, this.config.entropy.spend.shieldCost);
    }

    get entropyBailoutCost() {
        return Math.max(1, this.config.entropy.spend.bailoutCost);
    }

    // Reward configuration
    get rewardLockCoinCost() {
        return Math.max(0, this.config.rewards.lockCoinCost);
    }

    get rewardWheelSegments(): GameConfig['rewards']['wheelSegments'] {
        return this.config.rewards.wheelSegments;
    }

    get slowTimeMaxDuration() {
        return this.config.rewards.stackLimits.slowTimeMaxDuration;
    }

    // Prestige configuration
    get prestigeConfig(): GameConfig['prestige'] {
        return this.config.prestige;
    }

    // Gameplay constants (not in config, but collected here for consistency)
    readonly baseLives = 3;

    readonly presetOffsetSalt = 0x1f123bb5;
}
