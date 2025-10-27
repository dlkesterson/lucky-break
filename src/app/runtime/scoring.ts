import type { BrickType, LuckyBreakEventBus } from '../events';
import { publishComboMilestoneIfNeeded } from '../combo-milestones';
import {
    awardBrickPoints as awardBrickPointsBase,
    createScoring as createBaseScoring,
    decayCombo as decayComboBase,
    resetCombo as resetComboBase,
    type BrickImpactContext,
    type ScoreState,
    type ScoringConfig,
} from 'util/scoring';

export interface RuntimeScoringOptions {
    readonly bus: LuckyBreakEventBus;
    readonly scoringConfig?: ScoringConfig;
}

export interface AwardBrickOptions {
    readonly sessionId: string;
    readonly row: number;
    readonly col: number;
    readonly impactVelocity: number;
    readonly brickType: BrickType;
    readonly initialHp: number;
    readonly bricksRemainingAfter: number;
    readonly brickTotal: number;
    readonly comboDecayWindow: number;
    readonly maxSpeed: number;
    readonly frameTimestampMs: number;
    readonly scheduledTime?: number;
    readonly gambleMultiplier?: number;
    readonly doublePointsMultiplier?: number;
    readonly impactContext?: BrickImpactContext;
}

export interface AwardBrickResult {
    readonly basePoints: number;
    readonly pointsAwarded: number;
    readonly previousCombo: number;
    readonly currentCombo: number;
    readonly milestone: boolean;
}

export interface RuntimeScoringHandle {
    readonly state: ScoreState;
    awardBrick(options: AwardBrickOptions): AwardBrickResult;
    decayCombo(deltaSeconds: number, config?: ScoringConfig): void;
    resetCombo(): void;
    resetAll(): void;
    lifeLost(): void;
    roundCompleted(): void;
    setHudUpdater(updater: (() => void) | null): void;
}

export const createRuntimeScoring = ({ bus, scoringConfig }: RuntimeScoringOptions): RuntimeScoringHandle => {
    const state = createBaseScoring();

    const awardBrick: RuntimeScoringHandle['awardBrick'] = ({
        sessionId,
        row,
        col,
        impactVelocity,
        brickType,
        initialHp,
        bricksRemainingAfter,
        brickTotal,
        comboDecayWindow,
        maxSpeed,
        frameTimestampMs,
        scheduledTime,
        gambleMultiplier,
        doublePointsMultiplier,
        impactContext,
    }) => {
        const previousCombo = state.combo;

        bus.publish(
            'BrickBreak',
            {
                sessionId,
                row,
                col,
                impactVelocity,
                brickType,
                initialHp,
                comboHeat: previousCombo,
                scheduledTime,
            },
            frameTimestampMs,
        );

        const scoringOverrides: ScoringConfig = {
            ...(scoringConfig ?? {}),
            comboDecayTime: comboDecayWindow,
        };

        const context: BrickImpactContext = impactContext ?? {
            bricksRemaining: bricksRemainingAfter,
            brickTotal,
            impactSpeed: impactVelocity,
            maxSpeed,
        };

        const basePoints = awardBrickPointsBase(state, scoringOverrides, context);

        let pointsAwarded = basePoints;
        if (gambleMultiplier !== undefined && Number.isFinite(gambleMultiplier) && gambleMultiplier > 1) {
            const boosted = Math.max(basePoints, Math.round(basePoints * gambleMultiplier));
            const bonus = Math.max(0, boosted - basePoints);
            pointsAwarded = boosted;
            if (bonus > 0) {
                state.score += bonus;
            }
        }

        const doubleMultiplier = Math.max(1, doublePointsMultiplier ?? 1);
        if (doubleMultiplier > 1) {
            const bonus = Math.round(pointsAwarded * (doubleMultiplier - 1));
            pointsAwarded += bonus;
            if (bonus > 0) {
                state.score += bonus;
            }
        }

        state.updateHUD?.();

        const milestone = publishComboMilestoneIfNeeded({
            bus,
            sessionId,
            previousCombo,
            currentCombo: state.combo,
            pointsAwarded,
            totalScore: state.score,
            config: scoringOverrides,
            timestampMs: frameTimestampMs,
        });

        return {
            basePoints,
            pointsAwarded,
            previousCombo,
            currentCombo: state.combo,
            milestone,
        } satisfies AwardBrickResult;
    };

    const decayCombo: RuntimeScoringHandle['decayCombo'] = (deltaSeconds, configOverrides) => {
        const overrides = configOverrides ?? scoringConfig;
        decayComboBase(state, deltaSeconds, overrides);
    };

    const resetCombo: RuntimeScoringHandle['resetCombo'] = () => {
        resetComboBase(state);
    };

    const resetAll: RuntimeScoringHandle['resetAll'] = () => {
        state.score = 0;
        state.combo = 0;
        state.comboTimer = 0;
        state.momentum.volleyLength = 0;
        state.momentum.speedPressure = 0;
        state.momentum.brickDensity = 1;
        state.momentum.comboHeat = 0;
        state.momentum.comboTimer = 0;
        state.updateHUD?.();
    };

    const lifeLost: RuntimeScoringHandle['lifeLost'] = () => {
        resetCombo();
        state.updateHUD?.();
    };

    const roundCompleted: RuntimeScoringHandle['roundCompleted'] = () => {
        state.updateHUD?.();
    };

    const setHudUpdater: RuntimeScoringHandle['setHudUpdater'] = (updater) => {
        state.updateHUD = updater ?? undefined;
    };

    return {
        state,
        awardBrick,
        decayCombo,
        resetCombo,
        resetAll,
        lifeLost,
        roundCompleted,
        setHudUpdater,
    } satisfies RuntimeScoringHandle;
};
