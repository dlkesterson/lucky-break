import { create } from "zustand";
import type { EntropyActionType } from "app/events";
import type { HudScoreboardView, HudEntropyActionDescriptor, HudScoreboardPrompt } from "render/hud";
import type { HudPowerUpView, HudRewardView } from "render/hud-display";
import type { HudSnapshot } from "app/state";

type HudMomentum = HudSnapshot["momentum"];

export interface RuntimeHudPayload {
    readonly score: number;
    readonly lives: number;
    readonly coins: number;
    readonly combo: number;
    readonly difficultyMultiplier: number;
    readonly comboTimer: number;
    readonly brickRemaining: number;
    readonly brickTotal: number;
    readonly scoreboard: HudScoreboardView;
    readonly activePowerUps: readonly HudPowerUpView[];
    readonly reward: HudRewardView | null;
    readonly entropyActions: readonly HudEntropyActionDescriptor[];
    readonly momentum: HudMomentum;
    readonly prompts: readonly HudScoreboardPrompt[];
}

export interface HudState {
    readonly score: number;
    readonly lives: number;
    readonly coins: number;
    readonly combo: number;
    readonly comboPulse: number;
    readonly fps?: number;
    readonly difficultyMultiplier: number;
    readonly comboTimer: number;
    readonly brickRemaining: number;
    readonly brickTotal: number;
    readonly scoreboard: HudScoreboardView | null;
    readonly activePowerUps: readonly HudPowerUpView[];
    readonly reward: HudRewardView | null;
    readonly entropyActions: readonly HudEntropyActionDescriptor[];
    readonly momentum: HudMomentum | null;
    readonly prompts: readonly HudScoreboardPrompt[];
    readonly visible: boolean;
    readonly attemptEntropyAction?: (action: EntropyActionType) => void;
}

const createInitialState = (): HudState => ({
    score: 0,
    lives: 3,
    coins: 0,
    combo: 0,
    comboPulse: 0,
    fps: undefined,
    difficultyMultiplier: 1,
    comboTimer: 0,
    brickRemaining: 0,
    brickTotal: 0,
    scoreboard: null,
    activePowerUps: [],
    reward: null,
    entropyActions: [],
    momentum: null,
    prompts: [],
    visible: false,
    attemptEntropyAction: undefined,
});

export const useHud = create<HudState>(createInitialState);

let comboPulseResetHandle: ReturnType<typeof setTimeout> | undefined;
let comboPulseRevision = 0;
let entropyActionHandler: ((action: EntropyActionType) => void) | undefined;

export const hudSetters = {
    setVisibility: (visible: boolean): void => {
        useHud.setState((previous) => (previous.visible === visible ? previous : { ...previous, visible }));
    },
    updateFromRuntime: (payload: RuntimeHudPayload): void => {
        useHud.setState((previous) => ({
            ...previous,
            score: payload.score,
            lives: payload.lives,
            coins: payload.coins,
            combo: payload.combo,
            comboPulse: previous.comboPulse,
            difficultyMultiplier: payload.difficultyMultiplier,
            comboTimer: payload.comboTimer,
            brickRemaining: payload.brickRemaining,
            brickTotal: payload.brickTotal,
            scoreboard: payload.scoreboard,
            activePowerUps: payload.activePowerUps,
            reward: payload.reward ?? null,
            entropyActions: payload.entropyActions,
            momentum: payload.momentum,
            prompts: payload.prompts,
        }));
    },
    pulseCombo: (intensity: number): void => {
        const bounded = Number.isFinite(intensity) ? Math.max(0, Math.min(intensity, 1.6)) : 0;
        if (bounded <= 0) {
            return;
        }

        comboPulseRevision += 1;
        const currentRevision = comboPulseRevision;

        useHud.setState((previous) => {
            const nextPulse = Math.max(previous.comboPulse, bounded);
            if (nextPulse === previous.comboPulse) {
                return previous;
            }
            return { ...previous, comboPulse: nextPulse };
        });

        if (comboPulseResetHandle !== undefined) {
            clearTimeout(comboPulseResetHandle);
        }

        comboPulseResetHandle = setTimeout(() => {
            useHud.setState((previous) => {
                if (currentRevision !== comboPulseRevision || previous.comboPulse === 0) {
                    return previous;
                }
                return { ...previous, comboPulse: 0 };
            });
        }, 220);
    },
    setFps: (fps: number | undefined): void => {
        useHud.setState((previous) => (previous.fps === fps ? previous : { ...previous, fps }));
    },
    setEntropyActionHandler: (handler: ((action: EntropyActionType) => void) | undefined): void => {
        entropyActionHandler = handler;
        useHud.setState((previous) => (previous.attemptEntropyAction === handler ? previous : { ...previous, attemptEntropyAction: handler }));
    },
    reset: (): void => {
        comboPulseRevision += 1;
        if (comboPulseResetHandle !== undefined) {
            clearTimeout(comboPulseResetHandle);
            comboPulseResetHandle = undefined;
        }
        const baseline = createInitialState();
        const nextState = entropyActionHandler ? { ...baseline, attemptEntropyAction: entropyActionHandler } : baseline;
        useHud.setState(nextState, true);
    },
} as const;
