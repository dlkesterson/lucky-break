import type { GameSessionSnapshot, HudPromptSeverity } from 'app/state';

export interface HudScoreboardEntry {
    readonly id: 'score' | 'coins' | 'lives' | 'bricks' | 'entropy' | 'momentum' | 'audio';
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

export const buildHudScoreboard = (snapshot: GameSessionSnapshot): HudScoreboardView => {
    const statusText = `Round ${snapshot.hud.round} — ${capitalize(snapshot.status)}`;

    const entries: HudScoreboardEntry[] = [
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
    ];

    return {
        statusText,
        summaryLine: formatSummary(snapshot),
        entries,
        prompts: toPromptView(snapshot),
    };
};
