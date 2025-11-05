import type { HudEntropyActionDescriptor, HudScoreboardView } from './hud';
import type { HudSnapshot } from 'app/state';

export interface HudPowerUpView {
    readonly label: string;
    readonly remaining: string;
}

export interface HudRewardView {
    readonly label: string;
    readonly remaining?: string;
}

export interface LegacyHudDisplayPayload {
    readonly view: HudScoreboardView;
    readonly difficultyMultiplier: number;
    readonly comboCount: number;
    readonly comboTimer: number;
    readonly activePowerUps: readonly HudPowerUpView[];
    readonly reward?: HudRewardView | null;
    readonly momentum: HudSnapshot['momentum'];
    readonly entropyActions?: readonly HudEntropyActionDescriptor[];
}
