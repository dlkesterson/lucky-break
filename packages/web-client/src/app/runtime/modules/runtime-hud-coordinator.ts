import { buildHudScoreboard, type HudScoreboardPrompt, type HudScoreboardView } from 'render/hud';
import type { GambleBrickSummary } from 'game/gamble-brick-manager';
import type { GameSessionSnapshot } from 'app/state';
import type { RuntimePowerups } from '../powerups';
import type { RoundMachine } from '../round-machine';
import type { RuntimeRewardsHandle } from './runtime-rewards';
import type { ScoringViewProvider } from '../contracts';
import { hudSetters, type HudPhysicsSnapshot } from '../../../ui/state/game-bridge';

export interface RuntimeHudCoordinatorOptions {
    readonly scoring: ScoringViewProvider;
    readonly roundMachine: Pick<RoundMachine, 'getAutoCompleteState' | 'getLevelDifficultyMultiplier'>;
    readonly runtimeRewards: Pick<RuntimeRewardsHandle, 'getHudEntropyActions'>;
    readonly powerups: Pick<RuntimePowerups, 'collectHudPowerUps' | 'resolveRewardView'>;
    readonly getSessionSnapshot: () => GameSessionSnapshot;
    readonly getGambleStatus: () => GambleBrickSummary;
    readonly getPhysicsState: () => HudPhysicsSnapshot | null;
}

export interface RuntimeHudCoordinator {
    refresh(): void;
}

const AUTO_COMPLETE_PROMPT_ID = 'auto-complete-countdown';

const formatAutoCompletePrompt = (secondsRemaining: number): HudScoreboardPrompt => {
    const safeSeconds = Math.max(0, secondsRemaining);
    const formatted = safeSeconds >= 10
        ? `${Math.ceil(safeSeconds)}s`
        : `${safeSeconds.toFixed(1)}s`;
    const severity = safeSeconds <= 3 ? ('warning' as const) : ('info' as const);

    return {
        id: AUTO_COMPLETE_PROMPT_ID,
        severity,
        message: `Auto clear in ${formatted}`,
    } satisfies HudScoreboardPrompt;
};

const resolvePrompts = (view: HudScoreboardView): readonly HudScoreboardPrompt[] => {
    const prompts = view.prompts;
    return Array.isArray(prompts) ? (prompts as readonly HudScoreboardPrompt[]) : [];
};

const applyAutoCompletePrompt = (
    view: HudScoreboardView,
    autoState: ReturnType<RoundMachine['getAutoCompleteState']>,
): HudScoreboardView => {
    const existingPrompts = resolvePrompts(view);

    if (!autoState.enabled || !autoState.active) {
        if (!existingPrompts.some((prompt) => prompt.id === AUTO_COMPLETE_PROMPT_ID)) {
            return view;
        }
        const prompts = existingPrompts.filter((prompt) => prompt.id !== AUTO_COMPLETE_PROMPT_ID);
        return { ...view, prompts };
    }

    const prompt = formatAutoCompletePrompt(autoState.timer);
    const prompts = [prompt, ...existingPrompts.filter((entry) => entry.id !== AUTO_COMPLETE_PROMPT_ID)];
    return { ...view, prompts };
};

export const createRuntimeHudCoordinator = ({
    scoring,
    roundMachine,
    runtimeRewards,
    powerups,
    getSessionSnapshot,
    getGambleStatus,
    getPhysicsState,
}: RuntimeHudCoordinatorOptions): RuntimeHudCoordinator => {
    let lastComboCount = scoring.getScoringView().combo;

    hudSetters.reset();

    const refresh = () => {
        const sessionSnapshot = getSessionSnapshot();
        console.log('[runtime-hud-coordinator] refresh() - sessionSnapshot score:', sessionSnapshot.hud.score, 'brickRemaining:', sessionSnapshot.hud.brickRemaining);
        const gambleStatus = getGambleStatus();
        const entropyActions = runtimeRewards.getHudEntropyActions(sessionSnapshot.hud.entropy.stored);
        const baseView = buildHudScoreboard(sessionSnapshot, gambleStatus, { entropyActions });
        const viewWithCountdown = applyAutoCompletePrompt(baseView, roundMachine.getAutoCompleteState());
        const scoringView = scoring.getScoringView();
        const difficultyMultiplier = roundMachine.getLevelDifficultyMultiplier();
        const activePowerUps = powerups.collectHudPowerUps();
        const rewardView = powerups.resolveRewardView();
        const physicsState = getPhysicsState();

        hudSetters.updateFromRuntime({
            score: sessionSnapshot.hud.score,
            lives: sessionSnapshot.hud.lives,
            coins: sessionSnapshot.hud.coins,
            combo: scoringView.combo,
            difficultyMultiplier,
            comboTimer: scoringView.comboTimer,
            brickRemaining: sessionSnapshot.hud.brickRemaining,
            brickTotal: sessionSnapshot.hud.brickTotal,
            scoreboard: viewWithCountdown,
            activePowerUps,
            reward: rewardView,
            entropyActions,
            momentum: sessionSnapshot.hud.momentum,
            prompts: viewWithCountdown.prompts,
            settings: sessionSnapshot.hud.settings,
            physics: physicsState,
        });

        if (scoringView.combo > lastComboCount) {
            const pulseStrength = Math.min(1, 0.55 + scoringView.combo * 0.04);
            hudSetters.pulseCombo(pulseStrength);
        }

        lastComboCount = scoringView.combo;
    };

    return {
        refresh,
    } satisfies RuntimeHudCoordinator;
};
