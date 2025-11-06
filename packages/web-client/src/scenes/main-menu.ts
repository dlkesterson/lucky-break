import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import { toggleTheme } from 'render/theme';
import type { HighScoreEntry } from 'util/high-scores';
import { getSettings, subscribeSettings, updateSettings, type SettingsSnapshot } from 'util/settings';
import { mainMenuUiBridge, type MainMenuUiScore } from 'ui/state/main-menu-bridge';

export interface MainMenuSceneOptions {
    readonly title?: string;
    readonly prompt?: string;
    readonly helpText?: readonly string[];
    readonly onStart: () => void | Promise<void>;
    readonly highScoresProvider?: () => readonly HighScoreEntry[];
}

const DEFAULT_TITLE = 'Lucky Break';
const DEFAULT_PROMPT = 'Tap anywhere to begin';

const DEFAULT_HELP_LINES = [
    'Aim with the paddle to send the ball through the bricks.',
    'Launch with tap, click, or spacebar and ride the streaks.',
    'Snag power-ups to stack payouts and trigger lucky breaks!',
    'Press Shift+C any time for high-contrast colors.',
] as const;

const normalizeScore = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
};

const normalizeRound = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.max(1, Math.floor(value));
};

const mapScores = (entries: readonly HighScoreEntry[]): readonly MainMenuUiScore[] => {
    return entries.slice(0, 5).map((entry, index) => ({
        id: `${index}-${entry.name}-${entry.score}-${entry.achievedAt}`,
        rank: index + 1,
        name: entry.name,
        score: normalizeScore(entry.score),
        round: normalizeRound(entry.round),
        achievedAt: Number.isFinite(entry.achievedAt) ? Math.floor(entry.achievedAt) : Date.now(),
    } satisfies MainMenuUiScore));
};

export const createMainMenuScene = (
    context: SceneContext<GameSceneServices>,
    options: MainMenuSceneOptions,
): Scene<void, GameSceneServices> => {
    let destroyed = false;
    let currentSettings: SettingsSnapshot = getSettings();
    let unsubscribeSettings: (() => void) | null = null;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'main-menu',
            action,
        });
    };

    const pushIdleAudioState = () => {
        context.audioState$.next({
            combo: 0,
            activePowerUps: [],
            lookAheadMs: context.scheduler.lookAheadMs,
        });
    };

    const resolveScores = (): readonly MainMenuUiScore[] => {
        const provider = options.highScoresProvider;
        const entries = provider ? provider() : [];
        return mapScores(entries);
    };

    const publishScores = () => {
        if (destroyed) {
            return;
        }
        mainMenuUiBridge.updateScores(resolveScores());
        context.renderStageSoon();
    };

    const handleStart = async () => {
        if (destroyed) {
            return;
        }
        await Promise.resolve(options.onStart());
    };

    const handleOpenLedger = async () => {
        if (destroyed) {
            return;
        }
        try {
            await context.pushScene('fate-ledger');
        } catch (error) {
            console.error('Failed to open fate ledger from main menu scene', error);
        }
    };

    const handleTogglePerformance = () => {
        if (destroyed) {
            return;
        }
        const next = updateSettings({ performance: !currentSettings.performance });
        currentSettings = next;
        mainMenuUiBridge.updatePerformance(next.performance);
        context.renderStageSoon();
    };

    const attachSettingsSubscription = () => {
        unsubscribeSettings = subscribeSettings((nextSettings) => {
            currentSettings = nextSettings;
            mainMenuUiBridge.updatePerformance(nextSettings.performance);
            context.renderStageSoon();
        });
    };

    return {
        init() {
            destroyed = false;
            currentSettings = getSettings();
            const scores = resolveScores();
            const helpLines = options.helpText && options.helpText.length > 0
                ? [...options.helpText]
                : [...DEFAULT_HELP_LINES];

            mainMenuUiBridge.enter({
                title: options.title ?? DEFAULT_TITLE,
                prompt: options.prompt ?? DEFAULT_PROMPT,
                helpLines,
                scores,
                performanceEnabled: currentSettings.performance,
                onStart: handleStart,
                onOpenLedger: handleOpenLedger,
                onTogglePerformance: () => {
                    handleTogglePerformance();
                },
                onToggleTheme: () => {
                    toggleTheme();
                },
            });

            attachSettingsSubscription();
            pushIdleAudioState();
            emitSceneEvent('enter');
            context.renderStageSoon();
        },
        update(deltaSeconds) {
            void deltaSeconds;
        },
        destroy() {
            destroyed = true;
            unsubscribeSettings?.();
            unsubscribeSettings = null;
            mainMenuUiBridge.exit();
            pushIdleAudioState();
            emitSceneEvent('exit');
            context.renderStageSoon();
        },
        suspend() {
            pushIdleAudioState();
            mainMenuUiBridge.suspend();
            emitSceneEvent('suspend');
        },
        resume() {
            if (destroyed) {
                return;
            }
            pushIdleAudioState();
            mainMenuUiBridge.resume();
            emitSceneEvent('resume');
            publishScores();
        },
    } satisfies Scene<void, GameSceneServices>;
};
