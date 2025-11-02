import type { RuntimeInput } from '../input';
import type { ScoreState } from 'util/scoring';
import type { InputToPhysicsBridge, RewardsWorldBridge, ScoringViewProvider } from '../contracts';

export const createInputToPhysicsBridge = (runtimeInput: RuntimeInput): InputToPhysicsBridge => ({
    resolveTarget: () => runtimeInput.resolveTarget(),
    shouldLaunch: () => runtimeInput.shouldLaunch(),
    consumeLaunchIntent: () => runtimeInput.consumeLaunchIntent(),
    resetLaunchTrigger: () => {
        runtimeInput.resetLaunchTrigger();
    },
    syncPaddlePosition: (position) => {
        runtimeInput.syncPaddlePosition(position);
    },
    computeNextX: (context) => runtimeInput.computeNextX(context),
    consumeKeyPress: (code) => runtimeInput.consumeKeyPress(code),
});

export const createScoringViewProvider = (scoringState: ScoreState): ScoringViewProvider => ({
    getScoringView: () => ({
        combo: scoringState.combo,
        comboTimer: scoringState.comboTimer,
    }),
});

export interface RewardsWorldBridgeDeps {
    renderStageSoon: () => void;
    requestHudRefresh: () => void;
    pulseHudCombo: (intensity: number) => void;
    flashPaddleLight: (intensity: number) => void;
    clearExtraBalls: () => void;
    reattachBallToPaddle: () => void;
    resetAutoCompleteCountdown: () => void;
}

export const createRewardsWorldBridge = ({
    renderStageSoon: renderStageSoonFn,
    requestHudRefresh: requestHudRefreshFn,
    pulseHudCombo: pulseHudComboFn,
    flashPaddleLight: flashPaddleLightFn,
    clearExtraBalls: clearExtraBallsFn,
    reattachBallToPaddle: reattachBallToPaddleFn,
    resetAutoCompleteCountdown: resetAutoCompleteCountdownFn,
}: RewardsWorldBridgeDeps): RewardsWorldBridge => ({
    renderStageSoon: () => {
        renderStageSoonFn();
    },
    requestHudRefresh: () => {
        requestHudRefreshFn();
    },
    pulseHudCombo: (intensity) => {
        pulseHudComboFn(intensity);
    },
    flashPaddleLight: (intensity) => {
        flashPaddleLightFn(intensity);
    },
    clearExtraBalls: () => {
        clearExtraBallsFn();
    },
    reattachBallToPaddle: () => {
        reattachBallToPaddleFn();
    },
    resetAutoCompleteCountdown: () => {
        resetAutoCompleteCountdownFn();
    },
});
