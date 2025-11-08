import { create } from "zustand";
import type { RewardEntropyAction } from "app/events";
import type { HudScoreboardView, HudEntropyActionDescriptor, HudScoreboardPrompt } from "render/hud";
import type { HudPowerUpView, HudRewardView } from "render/hud-display";
import type { HudSnapshot } from "app/state";

type HudMomentum = HudSnapshot["momentum"];

export interface HudPhysicsSnapshot {
    readonly currentSpeed: number;
    readonly baseSpeed: number;
    readonly maxSpeed: number;
    readonly gravity: number;
}

export interface HudSettings {
    readonly muted: boolean;
    readonly masterVolume: number;
    readonly reducedMotion: boolean;
}

type HudSettingsUpdate = Partial<Pick<HudSettings, "muted" | "masterVolume">>;

export type HudFlavorTone = 'info' | 'hype' | 'warning';

export interface HudFlavorMessage {
    readonly id: string;
    readonly text: string;
    readonly tone: HudFlavorTone;
}

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
    readonly settings: HudSettings;
    readonly physics: HudPhysicsSnapshot | null;
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
    readonly attemptEntropyAction?: (action: RewardEntropyAction) => void;
    readonly settings: HudSettings;
    readonly updateSettings?: (changes: HudSettingsUpdate) => void;
    readonly flavor: HudFlavorMessage | null;
    readonly physics: HudPhysicsSnapshot | null;
}

const createInitialSettings = (): HudSettings => ({
    muted: false,
    masterVolume: 1,
    reducedMotion: false,
});

const cloneSettings = (settings: HudSettings): HudSettings => ({
    muted: settings.muted,
    masterVolume: settings.masterVolume,
    reducedMotion: settings.reducedMotion,
});

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
    settings: createInitialSettings(),
    updateSettings: undefined,
    flavor: null,
    physics: null,
});

export const useHud = create<HudState>(createInitialState);

let comboPulseResetHandle: ReturnType<typeof setTimeout> | undefined;
let comboPulseRevision = 0;
let entropyActionHandler: ((action: RewardEntropyAction) => void) | undefined;
let settingsUpdateHandler: ((changes: HudSettingsUpdate) => void) | undefined;
let flavorResetHandle: ReturnType<typeof setTimeout> | undefined;
let lastSettings: HudSettings = createInitialSettings();

export const hudSetters = {
    setVisibility: (visible: boolean): void => {
        useHud.setState((previous) => (previous.visible === visible ? previous : { ...previous, visible }));
    },
    updateFromRuntime: (payload: RuntimeHudPayload): void => {
        const nextSettings = cloneSettings(payload.settings);
        lastSettings = nextSettings;
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
            settings: nextSettings,
            physics: payload.physics ?? null,
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
    setEntropyActionHandler: (handler: ((action: RewardEntropyAction) => void) | undefined): void => {
        entropyActionHandler = handler;
        useHud.setState((previous) => (previous.attemptEntropyAction === handler ? previous : { ...previous, attemptEntropyAction: handler }));
    },
    applySettings: (settings: HudSettings): void => {
        const nextSettings = cloneSettings(settings);
        lastSettings = nextSettings;
        useHud.setState((previous) => {
            if (
                previous.settings.masterVolume === nextSettings.masterVolume &&
                previous.settings.muted === nextSettings.muted &&
                previous.settings.reducedMotion === nextSettings.reducedMotion
            ) {
                return previous;
            }
            return { ...previous, settings: nextSettings };
        });
    },
    setSettingsUpdater: (handler: ((changes: HudSettingsUpdate) => void) | undefined): void => {
        settingsUpdateHandler = handler;
        useHud.setState((previous) => (previous.updateSettings === handler ? previous : { ...previous, updateSettings: handler }));
    },
    showFlavor: (flavor: HudFlavorMessage | null, options?: { readonly durationMs?: number }): void => {
        const durationMs = options?.durationMs;
        useHud.setState((previous) => {
            if (flavor === null) {
                return previous.flavor === null ? previous : { ...previous, flavor: null };
            }
            if (previous.flavor?.id === flavor.id) {
                return previous;
            }
            return { ...previous, flavor } satisfies HudState;
        });

        if (flavorResetHandle !== undefined) {
            clearTimeout(flavorResetHandle);
            flavorResetHandle = undefined;
        }

        if (flavor && Number.isFinite(durationMs) && durationMs !== undefined && durationMs > 0) {
            flavorResetHandle = setTimeout(() => {
                flavorResetHandle = undefined;
                useHud.setState((previous) => (previous.flavor === null ? previous : { ...previous, flavor: null }));
            }, durationMs);
        }
    },
    reset: (): void => {
        comboPulseRevision += 1;
        if (comboPulseResetHandle !== undefined) {
            clearTimeout(comboPulseResetHandle);
            comboPulseResetHandle = undefined;
        }
        if (flavorResetHandle !== undefined) {
            clearTimeout(flavorResetHandle);
            flavorResetHandle = undefined;
        }
        const baseline = createInitialState();
        const preservedSettings = cloneSettings(lastSettings);
        lastSettings = preservedSettings;
        const nextState: HudState = {
            ...baseline,
            settings: preservedSettings,
            ...(entropyActionHandler ? { attemptEntropyAction: entropyActionHandler } : {}),
            ...(settingsUpdateHandler ? { updateSettings: settingsUpdateHandler } : {}),
        };
        useHud.setState(nextState, true);
    },
} as const;
