import {
    type BrickType,
    type LifeLostCause,
    type LuckyBreakEventBus,
    createScoringEventEmitter,
} from './events';
import type { RandomSource } from 'util/random';
import type { MomentumSnapshot } from 'util/scoring';

export type GameStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed';

export interface MomentumMetrics {
    readonly volleyLength: number;
    readonly speedPressure: number;
    readonly brickDensity: number;
    readonly comboHeat: number;
    readonly comboTimer: number; // Time remaining before combo resets (in seconds)
    readonly updatedAt: number;
}

export type EntropyTrend = 'rising' | 'falling' | 'stable';

export type EntropyEventType =
    | 'round-start'
    | 'brick-hit'
    | 'brick-break'
    | 'paddle-hit'
    | 'wall-hit'
    | 'life-loss'
    | 'round-complete'
    | 'combo-reset'
    | 'coin-collect';

export interface EntropyEvent {
    readonly type: EntropyEventType;
    readonly comboHeat?: number;
    readonly speed?: number;
    readonly impactVelocity?: number;
    readonly coinValue?: number;
}

export interface EntropySnapshot {
    readonly charge: number;
    readonly stored: number;
    readonly trend: EntropyTrend;
    readonly lastEvent: EntropyEventType | null;
    readonly updatedAt: number;
}

export interface HudEntropySnapshot {
    readonly charge: number;
    readonly stored: number;
    readonly trend: EntropyTrend;
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
    readonly coins: number;
    readonly lives: number;
    readonly round: number;
    readonly brickRemaining: number;
    readonly brickTotal: number;
    readonly momentum: Omit<MomentumMetrics, 'updatedAt'>;
    readonly entropy: HudEntropySnapshot;
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
    readonly coins: number;
    readonly livesRemaining: number;
    readonly round: number;
    readonly elapsedTimeMs: number;
    readonly brickTotal: number;
    readonly brickRemaining: number;
    readonly lastOutcome?: RoundOutcome;
    readonly momentum: MomentumMetrics;
    readonly audio: AudioState;
    readonly entropy: EntropySnapshot;
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
        readonly comboHeat?: number;
    };
    readonly momentum?: MomentumSnapshot;
}

export interface GameSessionManager {
    readonly snapshot: () => GameSessionSnapshot;
    readonly startRound: (config: StartRoundConfig) => void;
    readonly recordBrickBreak: (details: BrickBreakDetails) => void;
    readonly recordLifeLost: (cause: LifeLostCause) => void;
    readonly completeRound: () => void;
    readonly recordEntropyEvent: (event: EntropyEvent) => void;
    readonly collectCoins: (amount: number) => void;
    readonly getEntropyState: () => EntropySnapshot;
}

export interface GameSessionOptions {
    readonly sessionId?: string;
    readonly initialLives?: number;
    readonly now?: () => number;
    readonly preferences?: Partial<PlayerPreferences>;
    readonly eventBus?: LuckyBreakEventBus;
    readonly random?: RandomSource;
}

const DEFAULT_LIVES = 3;
const ENTROPY_MAX_CHARGE = 100;
const ENTROPY_MAX_STORED = 100;

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

const cloneEntropy = (entropy: EntropySnapshot): EntropySnapshot => ({ ...entropy });

const toHudSnapshot = (
    state: Omit<GameSessionSnapshot, 'hud' | 'elapsedTimeMs' | 'updatedAt'>,
): HudSnapshot => ({
    score: state.score,
    coins: state.coins,
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
    entropy: {
        charge: state.entropy.charge,
        stored: state.entropy.stored,
        trend: state.entropy.trend,
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
    const randomSource = options.random ?? Math.random;
    const sessionId = options.sessionId ?? (() => {
        const value = Math.floor(randomSource() * 0xffffffff);
        const suffix = value.toString(16).padStart(8, '0');
        return `session-${suffix}`;
    })();
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

    let coins = 0;

    const entropy: Mutable<EntropySnapshot> = {
        charge: 0,
        stored: 0,
        trend: 'stable',
        lastEvent: null,
        updatedAt: now(),
    };

    const clampToRange = (value: number, max: number): number => {
        if (!Number.isFinite(value) || max <= 0) {
            return 0;
        }
        return Math.max(0, Math.min(max, value));
    };

    const normalizeRatio = (value: number | undefined, max: number): number => {
        if (value === undefined || !Number.isFinite(value) || max <= 0) {
            return 0;
        }
        return Math.max(0, Math.min(1, value / max));
    };

    const applyStoredDelta = (delta: number, timestamp: number) => {
        const nextStored = clampToRange(entropy.stored + delta, ENTROPY_MAX_STORED);
        entropy.stored = nextStored;
        entropy.updatedAt = timestamp;
    };

    const applyChargeDelta = (delta: number, timestamp: number, eventType: EntropyEventType) => {
        const safeDelta = Number.isFinite(delta) ? delta : 0;
        const previousCharge = entropy.charge;
        const target = previousCharge + safeDelta;
        const nextCharge = clampToRange(target, ENTROPY_MAX_CHARGE);
        const overflow = Math.max(0, target - ENTROPY_MAX_CHARGE);

        entropy.charge = nextCharge;
        entropy.trend = nextCharge > previousCharge ? 'rising' : nextCharge < previousCharge ? 'falling' : 'stable';
        entropy.lastEvent = eventType;
        entropy.updatedAt = timestamp;

        if (overflow > 0) {
            applyStoredDelta(overflow * 0.45, timestamp);
        }
    };

    const handleEntropyEvent = (event: EntropyEvent): void => {
        const timestamp = now();
        switch (event.type) {
            case 'round-start': {
                const carryOver = Math.min(ENTROPY_MAX_CHARGE, entropy.stored * 0.4);
                if (carryOver > 0) {
                    entropy.charge = Math.max(entropy.charge, carryOver);
                    applyStoredDelta(-carryOver * 0.25, timestamp);
                }
                entropy.trend = 'stable';
                entropy.lastEvent = event.type;
                entropy.updatedAt = timestamp;
                return;
            }
            case 'brick-hit': {
                const comboFactor = normalizeRatio(event.comboHeat, 20);
                const speedFactor = normalizeRatio(event.speed ?? event.impactVelocity, 24);
                const delta = 0.8 + comboFactor * 0.7 + speedFactor * 0.4;
                applyChargeDelta(delta, timestamp, event.type);
                return;
            }
            case 'brick-break': {
                const comboFactor = normalizeRatio(event.comboHeat, 24);
                const speedFactor = normalizeRatio(event.speed ?? event.impactVelocity, 26);
                const delta = 2.5 + comboFactor * 1.6 + speedFactor * 0.8;
                applyChargeDelta(delta, timestamp, event.type);
                return;
            }
            case 'paddle-hit': {
                const speedFactor = normalizeRatio(event.speed, 24);
                const delta = 0.35 + speedFactor * 0.55;
                applyChargeDelta(delta, timestamp, event.type);
                return;
            }
            case 'wall-hit': {
                const speedFactor = normalizeRatio(event.speed, 24);
                const delta = 0.2 + speedFactor * 0.35;
                applyChargeDelta(delta, timestamp, event.type);
                return;
            }
            case 'life-loss': {
                const comboFactor = normalizeRatio(event.comboHeat, 24);
                applyStoredDelta(-12 - comboFactor * 18, timestamp);
                const delta = -(28 + comboFactor * 24);
                applyChargeDelta(delta, timestamp, event.type);
                return;
            }
            case 'round-complete': {
                const bankable = Math.min(entropy.charge, 80);
                if (bankable > 0) {
                    applyStoredDelta(bankable * 0.6, timestamp);
                }
                const previousCharge = entropy.charge;
                const residual = Math.max(5, entropy.charge * 0.4);
                entropy.charge = clampToRange(residual, ENTROPY_MAX_CHARGE);
                entropy.trend = residual > previousCharge ? 'rising' : residual < previousCharge ? 'falling' : 'stable';
                entropy.lastEvent = event.type;
                entropy.updatedAt = timestamp;
                return;
            }
            case 'combo-reset': {
                const comboFactor = normalizeRatio(event.comboHeat, 18);
                const delta = -(8 + comboFactor * 18);
                applyChargeDelta(delta, timestamp, event.type);
                return;
            }
            case 'coin-collect': {
                const valueFactor = normalizeRatio(event.coinValue, 25);
                const delta = 1.2 + valueFactor * 2.8;
                applyChargeDelta(delta, timestamp, event.type);
                return;
            }
        }
    };

    const emitEntropyEvent = (event: EntropyEvent): void => {
        handleEntropyEvent(event);
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
            coins,
            livesRemaining,
            round,
            brickTotal,
            brickRemaining,
            lastOutcome,
            momentum: cloneMomentum(momentum),
            audio: cloneAudio(audio),
            entropy: cloneEntropy(entropy),
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

        emitEntropyEvent({ type: 'round-start' });
    };

    const recordBrickBreak: GameSessionManager['recordBrickBreak'] = ({ points, event, momentum: snapshot }) => {
        if (status !== 'active') {
            return;
        }

        const timestamp = now();
        score = Math.max(0, score + points);
        if (brickRemaining > 0) {
            brickRemaining = Math.max(0, brickRemaining - 1);
        }

        if (snapshot) {
            momentum.volleyLength = snapshot.volleyLength;
            momentum.speedPressure = clamp01(snapshot.speedPressure);
            momentum.brickDensity = clamp01(snapshot.brickDensity);
            momentum.comboHeat = clamp01(snapshot.comboHeat);
            momentum.comboTimer = Math.max(0, snapshot.comboTimer);
        } else {
            momentum.volleyLength += 1;
            momentum.comboHeat = Math.min(99, momentum.comboHeat + 1);
            momentum.speedPressure = clamp01(momentum.speedPressure + 0.08);
            momentum.brickDensity = brickTotal === 0 ? 0 : brickRemaining / brickTotal;
        }
        momentum.updatedAt = timestamp;

        const comboHeat = event?.comboHeat ?? momentum.comboHeat;
        const impactVelocity = event?.impactVelocity;

        emitEntropyEvent({
            type: 'brick-break',
            comboHeat,
            impactVelocity,
            speed: impactVelocity,
        });

        if (scoringEvents && event) {
            scoringEvents.brickBreak({
                sessionId,
                row: event.row,
                col: event.col,
                impactVelocity: event.impactVelocity,
                brickType: event.brickType,
                comboHeat,
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
        const comboBeforeLoss = momentum.comboHeat;
        if (livesRemaining > 0) {
            livesRemaining -= 1;
        }

        momentum.volleyLength = 0;
        momentum.comboHeat = 0;
        momentum.comboTimer = 0;
        momentum.speedPressure = clamp01(momentum.speedPressure * 0.5);
        momentum.updatedAt = timestamp;

        emitEntropyEvent({ type: 'life-loss', comboHeat: comboBeforeLoss });

        scoringEvents?.lifeLost({
            sessionId,
            livesRemaining,
            cause,
            timestamp,
        });

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

        emitEntropyEvent({ type: 'round-complete' });
    }; // Round outcome stored for HUD summary

    const collectCoins: GameSessionManager['collectCoins'] = (amount) => {
        if (!Number.isFinite(amount)) {
            return;
        }

        const safeAmount = Math.floor(amount);
        if (safeAmount <= 0) {
            return;
        }

        coins = Math.max(0, coins + safeAmount);
        score = Math.max(0, score + safeAmount);
    };

    const recordEntropyEvent: GameSessionManager['recordEntropyEvent'] = (event) => {
        emitEntropyEvent(event);
    };

    const getEntropyState: GameSessionManager['getEntropyState'] = () => cloneEntropy(entropy);

    return {
        snapshot,
        startRound,
        recordBrickBreak,
        recordLifeLost,
        completeRound,
        recordEntropyEvent,
        collectCoins,
        getEntropyState,
    };
};
