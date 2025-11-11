import { Sprite, type Container } from 'pixi.js';
import type { MatterBody as Body } from 'physics/matter';
import type { BrickSpec } from 'util/levels';
import { clampUnit } from 'util/math';
import { createGambleHighlightEffect, type GambleHighlightEffect } from 'render/effects';
import { createGambleBrickManager, type GambleBrickManager } from 'game/gamble-brick-manager';
import type { MidiEngine } from 'audio/midi-engine';
import type { MusicDirector } from 'audio/music-director';

const DEFAULT_TINT = 0xffffff;

interface BrickVisualStateEntry {
    maxHp: number;
    isBreakable: boolean;
    [key: string]: unknown;
}

export interface GambleRuntimeDeps {
    readonly managerOptions: Parameters<typeof createGambleBrickManager>[0];
    readonly countdownAudioThreshold: number;
    readonly tintArmed: number;
    readonly tintPrimed: number;
    readonly visualBodies: Map<Body, Container>;
    readonly brickMetadata: Map<Body, BrickSpec | undefined>;
    readonly brickHealth: Map<Body, number>;
    readonly brickVisualState: Map<Body, BrickVisualStateEntry>;
    readonly maxBrickHp: number;
    readonly updateBrickDamage: (brick: Body, nextHp: number) => void;
    readonly getMidiEngine: () => Pick<MidiEngine, 'triggerGambleCountdown'>;
    readonly musicDirector: Pick<MusicDirector, 'triggerGambleCountdown'>;
    readonly highlightFactory?: () => GambleHighlightEffect;
}

export interface GambleRuntime {
    readonly manager: GambleBrickManager;
    prepareLevel(): void;
    registerBricks(): void;
    reapplyAppearances(): void;
    applyAppearance(brick: Body): void;
    handleBrickRemoved(brick: Body, visual: Container | null): void;
    tick(deltaSeconds: number): void;
    clearAll(): void;
    dispose(): void;
}

const isGambleBrick = (metadata: BrickSpec | undefined): boolean => metadata?.traits?.includes('gamble') ?? false;

export const createGambleRuntime = ({
    managerOptions,
    countdownAudioThreshold,
    tintArmed,
    tintPrimed,
    visualBodies,
    brickMetadata,
    brickHealth,
    brickVisualState,
    maxBrickHp,
    updateBrickDamage,
    getMidiEngine,
    musicDirector,
    highlightFactory,
}: GambleRuntimeDeps): GambleRuntime => {
    const manager = createGambleBrickManager(managerOptions);
    let highlight: GambleHighlightEffect | null = highlightFactory?.() ?? createGambleHighlightEffect();
    let countdownLastSecond: number | null = null;

    const timerSeconds = Math.max(0.001, managerOptions.timerSeconds);

    const resetVisual = (brick: Body, visualOverride?: Container | null): void => {
        const visual = (visualOverride ?? visualBodies.get(brick)) ?? null;
        if (!(visual instanceof Sprite)) {
            return;
        }
        visual.tint = DEFAULT_TINT;
        highlight?.reset(visual);
    };

    const applyAppearance = (brick: Body): void => {
        const visual = visualBodies.get(brick);
        if (!(visual instanceof Sprite)) {
            return;
        }

        const state = manager.getState(brick);
        if (state === 'primed') {
            visual.tint = tintPrimed;
            const remaining = manager.getRemainingTimer(brick);
            const urgency = remaining !== null && Number.isFinite(remaining)
                ? clampUnit(1 - remaining / timerSeconds)
                : 0;
            highlight?.apply(visual, 'primed', urgency);
            return;
        }

        if (state === 'armed') {
            visual.tint = tintArmed;
            highlight?.apply(visual, 'armed', 0);
            return;
        }

        resetVisual(brick, visual);
    };

    const updateCountdownAudio = (nextExpirationSeconds: number | null): void => {
        if (nextExpirationSeconds === null || !Number.isFinite(nextExpirationSeconds)) {
            countdownLastSecond = null;
            return;
        }

        const remaining = Math.max(0, nextExpirationSeconds);
        if (remaining > countdownAudioThreshold) {
            countdownLastSecond = null;
            return;
        }

        const marker = Math.max(0, Math.ceil(remaining));
        if (countdownLastSecond === marker) {
            return;
        }
        countdownLastSecond = marker;
        const urgency = clampUnit(1 - remaining / timerSeconds);

        const midi = getMidiEngine();
        midi?.triggerGambleCountdown({
            second: marker,
            urgency,
        });
        musicDirector.triggerGambleCountdown({
            urgency,
        });
    };

    const applyFailurePenalty = (brick: Body, penaltyHp: number): void => {
        if (!brickHealth.has(brick)) {
            return;
        }
        const normalizedPenalty = Math.max(1, Math.round(penaltyHp));
        const clampedPenalty = Math.min(maxBrickHp, normalizedPenalty);
        brickHealth.set(brick, clampedPenalty);
        const visualState = brickVisualState.get(brick);
        if (visualState) {
            const nextMax = visualState.isBreakable
                ? Math.min(maxBrickHp, Math.max(visualState.maxHp, clampedPenalty))
                : Math.max(visualState.maxHp, clampedPenalty);
            visualState.maxHp = nextMax;
        }
        updateBrickDamage(brick, clampedPenalty);
        applyAppearance(brick);
    };

    const registerBricks = (): void => {
        brickMetadata.forEach((metadata, brick) => {
            if (!isGambleBrick(metadata)) {
                return;
            }
            manager.register(brick);
            applyAppearance(brick);
        });
    };

    const reapplyAppearances = (): void => {
        manager.forEach((brick) => {
            applyAppearance(brick);
        });
    };

    const clearAll = (): void => {
        const tracked: Body[] = [];
        manager.forEach((brick) => {
            tracked.push(brick);
        });
        manager.clear();
        tracked.forEach((brick) => {
            resetVisual(brick);
        });
        countdownLastSecond = null;
    };

    const prepareLevel = (): void => {
        clearAll();
    };

    const tick = (deltaSeconds: number): void => {
        highlight?.update(deltaSeconds);
        const expirations = manager.tick(deltaSeconds);
        const summary = manager.snapshot();
        updateCountdownAudio(summary.nextExpirationSeconds);
        if (expirations.length === 0) {
            return;
        }
        expirations.forEach(({ brick, penaltyHp }) => {
            applyFailurePenalty(brick, penaltyHp);
        });
    };

    const handleBrickRemoved = (brick: Body, visual: Container | null): void => {
        resetVisual(brick, visual ?? undefined);
        manager.unregister(brick);
    };

    const dispose = (): void => {
        clearAll();
        highlight?.dispose();
        highlight = null;
    };

    return {
        manager,
        prepareLevel,
        registerBricks,
        reapplyAppearances,
        applyAppearance,
        handleBrickRemoved,
        tick,
        clearAll,
        dispose,
    } satisfies GambleRuntime;
};
