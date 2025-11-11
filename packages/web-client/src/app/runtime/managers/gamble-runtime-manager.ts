/**
 * Gamble Runtime Manager
 *
 * Manages lazy initialization and lifecycle of the gamble runtime system.
 * Eliminates the need for Proxy patterns by providing a clean manager interface.
 */

import type { MatterBody as Body } from 'physics/matter';
import type { Container } from 'pixi.js';
import { createGambleRuntime } from '../gamble';
import type { RuntimeConfigResolver } from '../config-resolver';
import type { MusicDirector } from 'audio/music-director';
import type { MidiEngine } from 'audio/midi-engine';
import type { LevelRuntimeHandle } from 'app/level-runtime';

/**
 * Gamble runtime manager options.
 */
export interface GambleRuntimeManagerOptions {
    readonly configResolver: RuntimeConfigResolver;
    readonly gambleTintArmed: number;
    readonly gambleTintPrimed: number;
    readonly visualBodies: Map<Body, Container>;
    readonly brickMetadata: LevelRuntimeHandle['brickMetadata'];
    readonly brickHealth: LevelRuntimeHandle['brickHealth'];
    readonly brickVisualState: LevelRuntimeHandle['brickVisualState'];
    readonly maxBrickHp: number;
    readonly updateBrickDamage: (brick: Body, hp: number) => void;
    readonly getMidiEngine: () => MidiEngine;
    readonly musicDirector: MusicDirector;
}

/**
 * Gamble runtime manager for lazy initialization and delegation.
 *
 * This manager defers creation of the gamble runtime until it's first needed,
 * typically when a gamble level is loaded. Once created, it delegates calls
 * to the underlying runtime instance.
 *
 * @example
 * ```typescript
 * const gambleManager = new GambleRuntimeManager({
 *   configResolver,
 *   gambleTintArmed,
 *   gambleTintPrimed,
 *   visualBodies,
 *   brickMetadata,
 *   brickHealth,
 *   brickVisualState,
 *   maxBrickHp: MAX_LEVEL_BRICK_HP,
 *   updateBrickDamage: (brick, hp) => levelRuntime.updateBrickDamage(brick, hp),
 *   getMidiEngine: () => midiEngine,
 *   musicDirector,
 * });
 *
 * // Lazily creates runtime on first access
 * gambleManager.applyAppearance(brickBody);
 * ```
 */
export class GambleRuntimeManager {
    private runtime: ReturnType<typeof createGambleRuntime> | null = null;
    private readonly options: GambleRuntimeManagerOptions;

    constructor(options: GambleRuntimeManagerOptions) {
        this.options = options;
    }

    /**
     * Gets or creates the underlying gamble runtime instance.
     */
    private getRuntime(): ReturnType<typeof createGambleRuntime> {
        if (!this.runtime) {
            const {
                configResolver,
                gambleTintArmed,
                gambleTintPrimed,
                visualBodies,
                brickMetadata,
                brickHealth,
                brickVisualState,
                maxBrickHp,
                updateBrickDamage,
                getMidiEngine,
                musicDirector,
            } = this.options;

            this.runtime = createGambleRuntime({
                managerOptions: {
                    timerSeconds: configResolver.gambleTimerSeconds,
                    rewardMultiplier: configResolver.gambleRewardMultiplier,
                    primeResetHp: configResolver.gamblePrimeResetHp,
                    failPenaltyHp: configResolver.gambleFailPenaltyHp,
                },
                countdownAudioThreshold: configResolver.gambleCountdownAudioThreshold,
                tintArmed: gambleTintArmed,
                tintPrimed: gambleTintPrimed,
                visualBodies,
                brickMetadata,
                brickHealth,
                brickVisualState,
                maxBrickHp,
                updateBrickDamage,
                getMidiEngine,
                musicDirector,
            });
        }
        return this.runtime;
    }

    /**
     * Gets the gamble manager for state queries.
     */
    get manager() {
        return this.getRuntime().manager;
    }

    /**
     * Handles removal of a brick visual.
     */
    handleBrickRemoved(body: Body, visual: Container): void {
        this.getRuntime().handleBrickRemoved(body, visual);
    }

    /**
     * Applies gamble-specific visual appearance to a brick.
     */
    applyAppearance(body: Body): void {
        this.getRuntime().applyAppearance(body);
    }

    /**
     * Reapplies gamble appearances to all relevant bricks.
     */
    reapplyAppearances(): void {
        this.getRuntime().reapplyAppearances();
    }

    /**
     * Registers bricks for gamble tracking.
     */
    registerBricks(): void {
        this.getRuntime().registerBricks();
    }

    /**
     * Prepares the gamble system for a new level.
     */
    prepareLevel(): void {
        this.getRuntime().prepareLevel();
    }

    /**
     * Updates gamble state per frame.
     */
    tick(deltaSeconds: number): void {
        this.getRuntime().tick(deltaSeconds);
    }

    /**
     * Clears all active gamble state.
     */
    clearAll(): void {
        this.getRuntime().clearAll();
    }

    /**
     * Disposes of the gamble runtime and cleans up resources.
     */
    dispose(): void {
        if (this.runtime) {
            this.runtime.dispose();
            this.runtime = null;
        }
    }
}
