import { buildHudScoreboard, type HudScoreboardPrompt, type HudScoreboardView } from 'render/hud';
import type { HudDisplay } from 'render/hud-display';
import type { GambleBrickSummary } from 'game/gamble-brick-manager';
import type { GameSessionSnapshot } from 'app/state';
import type { RuntimePowerups } from '../powerups';
import type { RoundMachine } from '../round-machine';
import type { RuntimeRewardsHandle } from './runtime-rewards';
import type { ScoringViewProvider } from '../contracts';

export interface RuntimeHudCoordinatorOptions {
    readonly hudDisplay: HudDisplay;
    readonly scoring: ScoringViewProvider;
    readonly roundMachine: Pick<RoundMachine, 'getAutoCompleteState' | 'getLevelDifficultyMultiplier'>;
    readonly runtimeRewards: Pick<RuntimeRewardsHandle, 'getHudEntropyActions'>;
    readonly powerups: Pick<RuntimePowerups, 'collectHudPowerUps' | 'resolveRewardView'>;
    readonly getSessionSnapshot: () => GameSessionSnapshot;
    readonly getGambleStatus: () => GambleBrickSummary;
    readonly onLayout: () => void;
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
    hudDisplay,
    scoring,
    roundMachine,
    runtimeRewards,
    powerups,
    getSessionSnapshot,
    getGambleStatus,
    onLayout,
}: RuntimeHudCoordinatorOptions): RuntimeHudCoordinator => {
    let lastComboCount = scoring.getScoringView().combo;

    const refresh = () => {
        const sessionSnapshot = getSessionSnapshot();
        const gambleStatus = getGambleStatus();
        const entropyActions = runtimeRewards.getHudEntropyActions(sessionSnapshot.hud.entropy.stored);
        const baseView = buildHudScoreboard(sessionSnapshot, gambleStatus, { entropyActions });
        const viewWithCountdown = applyAutoCompletePrompt(baseView, roundMachine.getAutoCompleteState());
        const scoringView = scoring.getScoringView();

        hudDisplay.update({
            view: viewWithCountdown,
            difficultyMultiplier: roundMachine.getLevelDifficultyMultiplier(),
            comboCount: scoringView.combo,
            comboTimer: scoringView.comboTimer,
            activePowerUps: powerups.collectHudPowerUps(),
            reward: powerups.resolveRewardView(),
            momentum: sessionSnapshot.hud.momentum,
            entropyActions,
        });

        if (scoringView.combo > lastComboCount) {
            const pulseStrength = Math.min(1, 0.55 + scoringView.combo * 0.04);
            hudDisplay.pulseCombo(pulseStrength);
        }

        lastComboCount = scoringView.combo;
        onLayout();
    };

    return {
        refresh,
    } satisfies RuntimeHudCoordinator;
};
