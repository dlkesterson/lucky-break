import {
    type BrickType,
    type LifeLostCause,
    type LuckyBreakEventBus,
    createScoringEventEmitter,
} from './events';

export type GameStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed';

export interface MomentumMetrics {
    readonly volleyLength: number;
    readonly speedPressure: number;
    readonly brickDensity: number;
    readonly comboHeat: number;
    readonly comboTimer: number; // Time remaining before combo resets (in seconds)
    readonly updatedAt: number;
}

export interface AudioState {
    readonly scene: 'calm' | 'focused' | 'tense' | 'climax';
    readonly nextScene: 'calm' | 'focused' | 'tense' | 'climax' | null;
    readonly barCountdown: number;
    readonly sends: {
        readonly reverb: number;
        readonly delay: number;
    };
    readonly primaryLayerActive: boolean;
}

export interface PlayerPreferences {
    readonly masterVolume: number;
    readonly muted: boolean;
    readonly reducedMotion: boolean;
    readonly controlScheme: 'touch' | 'mouse' | 'keyboard';
    readonly controlSensitivity: number;
}

export type HudPromptSeverity = 'info' | 'warning' | 'error';

export interface HudPrompt {
    readonly id: string;
    readonly severity: HudPromptSeverity;
    readonly message: string;
}

export interface HudSnapshot {
    readonly score: number;
    readonly lives: number;
    readonly round: number;
    readonly brickRemaining: number;
    readonly brickTotal: number;
    readonly momentum: Omit<MomentumMetrics, 'updatedAt'>;
    readonly audio: Pick<AudioState, 'scene' | 'nextScene' | 'barCountdown'>;
    readonly prompts: readonly HudPrompt[];
    readonly settings: {
        readonly muted: boolean;
        readonly masterVolume: number;
        readonly reducedMotion: boolean;
    };
}

export interface RoundOutcome {
    readonly result: 'win' | 'loss';
    readonly round: number;
    readonly scoreAwarded: number;
    readonly durationMs: number;
    readonly timestamp: number;
    readonly cause?: LifeLostCause;
}

export interface GameSessionSnapshot {
    readonly sessionId: string;
    readonly status: GameStatus;
    readonly score: number;
    readonly livesRemaining: number;
    readonly round: number;
    readonly elapsedTimeMs: number;
    readonly brickTotal: number;
    readonly brickRemaining: number;
    readonly lastOutcome?: RoundOutcome;
    readonly momentum: MomentumMetrics;
    readonly audio: AudioState;
    readonly preferences: PlayerPreferences;
    readonly hud: HudSnapshot;
    readonly updatedAt: number;
}

interface StartRoundConfig {
    readonly breakableBricks: number;
}

interface BrickBreakDetails {
    readonly points: number;
    readonly event?: {
        readonly row: number;
        readonly col: number;
        readonly impactVelocity: number;
        readonly brickType: BrickType;
        readonly initialHp: number;
    };
}

export interface GameSessionManager {
    readonly snapshot: () => GameSessionSnapshot;
    readonly startRound: (config: StartRoundConfig) => void;
    readonly recordBrickBreak: (details: BrickBreakDetails) => void;
    readonly recordLifeLost: (cause: LifeLostCause) => void;
    readonly completeRound: () => void;
}

export interface GameSessionOptions {
    readonly sessionId?: string;
    readonly initialLives?: number;
    readonly now?: () => number;
    readonly preferences?: Partial<PlayerPreferences>;
    readonly eventBus?: LuckyBreakEventBus;
}

const DEFAULT_LIVES = 3;

const INITIAL_PREFERENCES: PlayerPreferences = {
    masterVolume: 1,
    muted: false,
    reducedMotion: false,
    controlScheme: 'keyboard',
    controlSensitivity: 0.5,
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

const createPrompts = (status: GameStatus): readonly HudPrompt[] => {
    switch (status) {
        case 'pending':
            return [
                {
                    id: 'round-pending',
                    severity: 'info',
                    message: 'Tap to start the round',
                },
            ];
        case 'active':
            return [
                {
                    id: 'round-active',
                    severity: 'info',
                    message: 'Round in progress',
                },
            ];
        case 'paused':
            return [
                {
                    id: 'round-paused',
                    severity: 'warning',
                    message: 'Paused — resume when ready',
                },
            ];
        case 'completed':
            return [
                {
                    id: 'round-complete',
                    severity: 'info',
                    message: 'Round complete — tap to continue',
                },
            ];
        case 'failed':
            return [
                {
                    id: 'round-failed',
                    severity: 'error',
                    message: 'All lives lost — press retry',
                },
            ];
        default:
            return [];
    }
};

const cloneMomentum = (momentum: MomentumMetrics): MomentumMetrics => ({ ...momentum });

const cloneAudio = (audio: AudioState): AudioState => ({
    scene: audio.scene,
    nextScene: audio.nextScene,
    barCountdown: audio.barCountdown,
    sends: { ...audio.sends },
    primaryLayerActive: audio.primaryLayerActive,
});

const clonePreferences = (preferences: PlayerPreferences): PlayerPreferences => ({ ...preferences });

const toHudSnapshot = (
    state: Omit<GameSessionSnapshot, 'hud' | 'elapsedTimeMs' | 'updatedAt'>,
): HudSnapshot => ({
    score: state.score,
    lives: state.livesRemaining,
    round: state.round,
    brickRemaining: state.brickRemaining,
    brickTotal: state.brickTotal,
    momentum: {
        volleyLength: state.momentum.volleyLength,
        speedPressure: state.momentum.speedPressure,
        brickDensity: state.momentum.brickDensity,
        comboHeat: state.momentum.comboHeat,
        comboTimer: state.momentum.comboTimer,
    },
    audio: {
        scene: state.audio.scene,
        nextScene: state.audio.nextScene,
        barCountdown: state.audio.barCountdown,
    },
    prompts: createPrompts(state.status),
    settings: {
        muted: state.preferences.muted,
        masterVolume: state.preferences.masterVolume,
        reducedMotion: state.preferences.reducedMotion,
    },
});

export const createGameSessionManager = (options: GameSessionOptions = {}): GameSessionManager => {
    const now = options.now ?? Date.now;
    const sessionId = options.sessionId ?? `session-${Math.random().toString(16).slice(2)}`;
    const preferences: PlayerPreferences = { ...INITIAL_PREFERENCES, ...options.preferences };
    const scoringEvents = options.eventBus ? createScoringEventEmitter(options.eventBus) : undefined;

    let status: GameStatus = 'pending';
    let score = 0;
    const initialLives = Math.max(0, options.initialLives ?? DEFAULT_LIVES);
    let livesRemaining = initialLives;
    let round = 1;
    let brickTotal = 0;
    let brickRemaining = 0;
    let lastOutcome: RoundOutcome | undefined;
    let startedAt: number | undefined;
    let elapsedMs = 0;

    const momentum: Mutable<MomentumMetrics> = {
        volleyLength: 0,
        speedPressure: 0,
        brickDensity: 1,
        comboHeat: 0,
        comboTimer: 0,
        updatedAt: now(),
    };

    const audio: AudioState = {
        scene: 'calm',
        nextScene: null,
        barCountdown: 0,
        sends: {
            reverb: 0,
            delay: 0,
        },
        primaryLayerActive: false,
    };

    const computeElapsed = (timestamp: number): number => {
        if (status === 'active' && startedAt !== undefined) {
            return timestamp - startedAt;
        }

        return elapsedMs;
    };

    const snapshot: GameSessionManager['snapshot'] = () => {
        const timestamp = now();
        const currentElapsed = computeElapsed(timestamp);

        const base: Omit<GameSessionSnapshot, 'hud' | 'updatedAt' | 'elapsedTimeMs'> = {
            sessionId,
            status,
            score,
            livesRemaining,
            round,
            brickTotal,
            brickRemaining,
            lastOutcome,
            momentum: cloneMomentum(momentum),
            audio: cloneAudio(audio),
            preferences: clonePreferences(preferences),
        };

        const hud = toHudSnapshot(base);

        return {
            ...base,
            elapsedTimeMs: currentElapsed,
            hud,
            updatedAt: timestamp,
        };
    };

    const startRound: GameSessionManager['startRound'] = ({ breakableBricks }) => {
        const timestamp = now();
        status = 'active';
        round = Math.max(1, round);
        brickTotal = Math.max(0, breakableBricks);
        brickRemaining = brickTotal;
        startedAt = timestamp;
        elapsedMs = 0;
        momentum.volleyLength = 0;
        momentum.comboHeat = 0;
        momentum.comboTimer = 0;
        momentum.speedPressure = 0;
        momentum.brickDensity = brickTotal === 0 ? 0 : 1;
        momentum.updatedAt = timestamp;
        lastOutcome = undefined;
    };

    const recordBrickBreak: GameSessionManager['recordBrickBreak'] = ({ points, event }) => {
        if (status !== 'active') {
            return;
        }

        const timestamp = now();
        score = Math.max(0, score + points);
        if (brickRemaining > 0) {
            brickRemaining = Math.max(0, brickRemaining - 1);
        }

        momentum.volleyLength += 1;
        momentum.comboHeat = Math.min(99, momentum.comboHeat + 1);
        momentum.speedPressure = clamp01(momentum.speedPressure + 0.08);
        momentum.brickDensity = brickTotal === 0 ? 0 : brickRemaining / brickTotal;
        momentum.updatedAt = timestamp;

        if (scoringEvents && event) {
            scoringEvents.brickBreak({
                sessionId,
                row: event.row,
                col: event.col,
                impactVelocity: event.impactVelocity,
                brickType: event.brickType,
                comboHeat: momentum.comboHeat,
                initialHp: event.initialHp,
                timestamp,
            });
        }
    };

    const recordLifeLost: GameSessionManager['recordLifeLost'] = (cause) => {
        if (status !== 'active') {
            return;
        }

        const timestamp = now();
        if (livesRemaining > 0) {
            livesRemaining -= 1;
        }

        momentum.volleyLength = 0;
        momentum.comboHeat = 0;
        momentum.comboTimer = 0;
        momentum.speedPressure = clamp01(momentum.speedPressure * 0.5);
        momentum.updatedAt = timestamp;

        if (livesRemaining <= 0) {
            status = 'failed';
            elapsedMs = startedAt !== undefined ? timestamp - startedAt : 0;
            lastOutcome = {
                result: 'loss',
                round,
                scoreAwarded: score,
                durationMs: elapsedMs,
                timestamp,
                cause,
            };
        }
    };

    const completeRound: GameSessionManager['completeRound'] = () => {
        if (status !== 'active') {
            return;
        }

        const timestamp = now();
        status = 'completed';
        brickRemaining = 0;
        elapsedMs = startedAt !== undefined ? timestamp - startedAt : 0;
        lastOutcome = {
            result: 'win',
            round,
            scoreAwarded: score,
            durationMs: elapsedMs,
            timestamp,
        };

        scoringEvents?.roundCompleted({
            sessionId,
            round,
            scoreAwarded: score,
            durationMs: elapsedMs,
            timestamp,
        });
    }; // Round outcome stored for HUD summary

    return {
        snapshot,
        startRound,
        recordBrickBreak,
        recordLifeLost,
        completeRound,
    };
};
