import type { GameSessionSnapshot, HudPromptSeverity } from 'app/state';

export interface HudScoreboardEntry {
    readonly id: 'score' | 'coins' | 'gamble' | 'lives' | 'bricks' | 'entropy' | 'momentum' | 'audio';
    readonly label: string;
    readonly value: string;
}

export interface HudScoreboardPrompt {
    readonly id: string;
    readonly severity: HudPromptSeverity;
    readonly message: string;
}

export interface HudScoreboardView {
    readonly statusText: string;
    readonly summaryLine: string;
    readonly entries: readonly HudScoreboardEntry[];
    readonly prompts: readonly HudScoreboardPrompt[];
}

export interface HudGambleStatus {
    readonly armedCount: number;
    readonly primedCount: number;
    readonly nextExpirationSeconds: number | null;
    readonly timerSeconds: number;
    readonly rewardMultiplier: number;
}

type NumberFormatter = Intl.NumberFormat;

const SCORE_FORMATTER: NumberFormatter = new Intl.NumberFormat('en-US');

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const formatScore = (score: number): string => SCORE_FORMATTER.format(Math.max(0, Math.floor(score)));

const formatCoins = (coins: number): string => {
    const safe = Math.max(0, Math.floor(coins));
    return `${SCORE_FORMATTER.format(safe)}c`;
};

const formatLives = (lives: number): string => {
    if (lives <= 0) {
        return '—';
    }

    return '❤'.repeat(Math.min(lives, 10));
};

const formatBrickProgress = (remaining: number, total: number): string => {
    if (total <= 0) {
        return `${remaining} / ${total} (0%)`;
    }

    const cleared = total - remaining;
    const percent = Math.round((cleared / total) * 100);
    return `${remaining} / ${total} (${percent}%)`;
};

const clampUnit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const formatPercent = (value: number): string => `${Math.round(clampUnit(value) * 100)}%`;

const formatSeconds = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) {
        return '0s';
    }
    if (value >= 10) {
        return `${Math.round(value)}s`;
    }
    return `${value.toFixed(1)}s`;
};

const formatMultiplier = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) {
        return '×1';
    }
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 0.01) {
        return `×${rounded}`;
    }
    const formatted = value.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
    return `×${formatted}`;
};

const formatGamble = (gamble: HudGambleStatus): string => {
    const parts: string[] = [];
    const primedCount = Math.max(0, gamble.primedCount);
    const armedCount = Math.max(0, gamble.armedCount);

    if (primedCount > 0) {
        parts.push(`Primed ${primedCount}`);
        if (armedCount > 0) {
            parts.push(`Armed ${armedCount}`);
        }
        if (gamble.nextExpirationSeconds !== null) {
            parts.push(`Next ${formatSeconds(gamble.nextExpirationSeconds)}`);
        }
    } else if (armedCount > 0) {
        parts.push(`Armed ${armedCount}`);
        if (gamble.timerSeconds > 0) {
            parts.push(`Window ${formatSeconds(gamble.timerSeconds)}`);
        }
    } else {
        parts.push('Idle');
        if (gamble.timerSeconds > 0) {
            parts.push(`Window ${formatSeconds(gamble.timerSeconds)}`);
        }
    }

    parts.push(formatMultiplier(gamble.rewardMultiplier));
    return parts.join(' · ');
};

const formatMomentum = (
    momentum: GameSessionSnapshot['hud']['momentum'],
): string => {
    const volley = Math.max(0, Math.round(momentum.volleyLength));
    const heat = formatPercent(momentum.comboHeat);
    const speed = formatPercent(momentum.speedPressure);
    const density = formatPercent(momentum.brickDensity);
    return `Heat ${heat} · Volley ${volley} · Speed ${speed} · Field ${density}`;
};

const formatEntropy = (
    entropy: GameSessionSnapshot['hud']['entropy'],
): string => {
    const charge = Math.round(entropy.charge);
    const stored = Math.round(entropy.stored);
    const indicator = entropy.trend === 'rising' ? '↑' : entropy.trend === 'falling' ? '↓' : '→';
    return `${charge}% ${indicator} bank ${stored}%`;
};

const formatAudio = (muted: boolean, masterVolume: number): string => {
    if (muted || masterVolume <= 0) {
        return 'Muted';
    }

    const pct = Math.round(masterVolume * 100);
    return `Master ${pct}%`;
};

const formatSummary = (snapshot: GameSessionSnapshot): string => {
    const outcome = snapshot.lastOutcome;
    if (!outcome) {
        if (snapshot.status === 'active') {
            const elapsedSeconds = Math.floor(snapshot.elapsedTimeMs / 1000);
            return `Elapsed ${elapsedSeconds}s`;
        }
        return '';
    }

    const seconds = Math.max(0, Math.round(outcome.durationMs / 1000));
    if (outcome.result === 'win') {
        const scoreDelta = SCORE_FORMATTER.format(outcome.scoreAwarded);
        return `Win in ${seconds}s · Score +${scoreDelta}`;
    }

    return `Loss in ${seconds}s`;
};

const toPromptView = (snapshot: GameSessionSnapshot): readonly HudScoreboardPrompt[] =>
    snapshot.hud.prompts.map((prompt) => ({
        id: prompt.id,
        severity: prompt.severity,
        message: prompt.message,
    }));

export const buildHudScoreboard = (
    snapshot: GameSessionSnapshot,
    gamble?: HudGambleStatus,
): HudScoreboardView => {
    const statusText = `Round ${snapshot.hud.round} — ${capitalize(snapshot.status)}`;

    const entries: HudScoreboardEntry[] = [];

    entries.push(
        {
            id: 'score',
            label: 'Score',
            value: formatScore(snapshot.hud.score),
        },
        {
            id: 'coins',
            label: 'Coins',
            value: formatCoins(snapshot.hud.coins),
        },
    );

    if (gamble && (gamble.armedCount > 0 || gamble.primedCount > 0)) {
        entries.push({
            id: 'gamble',
            label: 'Gamble',
            value: formatGamble(gamble),
        });
    }

    entries.push(
        {
            id: 'lives',
            label: 'Lives',
            value: formatLives(snapshot.hud.lives),
        },
        {
            id: 'bricks',
            label: 'Bricks',
            value: formatBrickProgress(snapshot.hud.brickRemaining, snapshot.hud.brickTotal),
        },
        {
            id: 'entropy',
            label: 'Entropy',
            value: formatEntropy(snapshot.hud.entropy),
        },
        {
            id: 'momentum',
            label: 'Momentum',
            value: formatMomentum(snapshot.hud.momentum),
        },
        {
            id: 'audio',
            label: 'Audio',
            value: formatAudio(snapshot.preferences.muted, snapshot.preferences.masterVolume),
        },
    );

    return {
        statusText,
        summaryLine: formatSummary(snapshot),
        entries,
        prompts: toPromptView(snapshot),
    };
};
