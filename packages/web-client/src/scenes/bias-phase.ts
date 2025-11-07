import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { NebulaSlotsSpinOutcome } from 'app/runtime/casino-games';
import type { BiasOptionRisk, BiasPhaseWager } from 'app/runtime/round-machine';
import type { UiSceneTransitionAction } from 'app/events';
import type { Reward } from 'game/rewards';
import type { AchievementUnlock } from 'app/achievements';
import { biasPhaseUiBridge } from 'ui/state/bias-phase-bridge';

export interface BiasPhaseSceneOption {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly risk: BiasOptionRisk;
    readonly wager: BiasPhaseWager;
    readonly effectSummary: readonly string[];
    readonly affordable: boolean;
}

export interface RoundRecapMetrics {
    readonly roundScore: number;
    readonly totalScore: number;
    readonly bricksBroken: number;
    readonly brickTotal: number;
    readonly bestCombo: number;
    readonly volleyLength: number;
    readonly speedPressure: number;
    readonly coinsCollected: number;
    readonly durationMs: number;
}

export interface BiasPhaseSessionSummary {
    readonly nextLevel: number;
    readonly score: number;
    readonly coins: number;
    readonly lives: number;
    readonly highestCombo: number;
    readonly entropyDelta: number;
    readonly gravity: number;
    readonly gravityDelta: number;
    readonly speedGovernor: number;
    readonly speedDelta: number;
    readonly coinsRuleLocked: boolean;
    readonly seed: number | null;
    readonly entropyStored: number;
    readonly levelCompleteRecap?: RoundRecapMetrics;
    readonly reward?: Reward;
    readonly achievements?: readonly AchievementUnlock[];
    readonly milestones?: readonly string[];
}

export interface NebulaSlotsSpinResult extends NebulaSlotsSpinOutcome {
    readonly entropyRemaining: number;
}

export interface NebulaSlotsPayload {
    readonly cost: number;
    readonly spinsAvailable: number;
    readonly onSpin: () => Promise<NebulaSlotsSpinResult>;
}

export interface BiasPhasePayload {
    readonly session: BiasPhaseSessionSummary;
    readonly options: readonly BiasPhaseSceneOption[];
    readonly onSelect: (optionId: string) => void | Promise<void>;
    readonly onSkip?: () => void | Promise<void>;
    readonly slots?: NebulaSlotsPayload;
}

export const createBiasPhaseScene = (
    context: SceneContext<GameSceneServices>,
): Scene<BiasPhasePayload, GameSceneServices> => {
    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'bias-phase',
            action,
        });
    };

    return {
        init(payload) {
            if (!payload) {
                throw new Error('BiasPhaseScene requires payload');
            }

            emitSceneEvent('enter');
            biasPhaseUiBridge.enter(payload);
            context.renderStageSoon();
        },
        update() {
            /* no-op */
        },
        destroy() {
            emitSceneEvent('exit');
            biasPhaseUiBridge.exit();
            context.renderStageSoon();
        },
        suspend() {
            emitSceneEvent('suspend');
            biasPhaseUiBridge.suspend();
        },
        resume() {
            emitSceneEvent('resume');
            biasPhaseUiBridge.resume();
            context.renderStageSoon();
        },
    } satisfies Scene<BiasPhasePayload, GameSceneServices>;
};
