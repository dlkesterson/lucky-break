import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import type { HighScoreEntry } from 'util/high-scores';
import {
    GameTheme,
    getActiveThemeName,
    getThemeLabel,
    onThemeChange,
    toggleTheme,
} from 'render/theme';
import type { ThemeName } from 'render/theme';

export interface MainMenuSceneOptions {
    readonly title?: string;
    readonly prompt?: string;
    readonly helpText?: readonly string[];
    readonly onStart: () => void | Promise<void>;
    readonly highScoresProvider?: () => readonly HighScoreEntry[];
}

const DEFAULT_TITLE = 'Lucky Break';
const DEFAULT_PROMPT = 'Tap anywhere to begin';

const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16);

export const createMainMenuScene = (
    context: SceneContext<GameSceneServices>,
    options: MainMenuSceneOptions,
): Scene<unknown, GameSceneServices> => {
    let container: Container | null = null;
    let promptLabel: Text | null = null;
    let helpLabel: Text | null = null;
    let scoreboardLabel: Text | null = null;
    let title: Text | null = null;
    let themeToggleLabel: Text | null = null;
    let overlay: Graphics | null = null;
    let panel: Graphics | null = null;
    let elapsed = 0;
    let unsubscribeTheme: (() => void) | null = null;

    interface LayoutMetrics {
        readonly width: number;
        readonly height: number;
        readonly panelWidth: number;
        readonly panelHeight: number;
        readonly panelX: number;
        readonly panelY: number;
    }

    let layout: LayoutMetrics | null = null;

    const handleStart = () => {
        const result = options.onStart();
        if (result) {
            void Promise.resolve(result);
        }
    };

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

    const setInteraction = (enabled: boolean) => {
        if (!container) {
            return;
        }

        container.eventMode = enabled ? 'static' : 'none';
        container.interactiveChildren = enabled;
        container.cursor = enabled ? 'pointer' : 'default';
        context.renderStageSoon();
    };

    const formatThemeLabel = (name: ThemeName): string => `COLOR MODE: ${getThemeLabel(name).toUpperCase()} (SHIFT+C)`;

    const repaintPanel = () => {
        if (!layout || !panel || !overlay) {
            return;
        }

        overlay.clear();
        overlay.rect(0, 0, layout.width, layout.height);
        overlay.fill({ color: hexToNumber(GameTheme.background.to), alpha: 0.78 });

        panel.clear();
        panel.roundRect(layout.panelX, layout.panelY, layout.panelWidth, layout.panelHeight, 36)
            .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.94 })
            .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 6, alignment: 0.5 });
    };

    const applyTheme = () => {
        repaintPanel();

        if (title) {
            title.style = {
                ...title.style,
                fill: hexToNumber(GameTheme.hud.accent),
                fontFamily: GameTheme.font,
            };
        }

        if (promptLabel) {
            promptLabel.style = {
                ...promptLabel.style,
                fill: hexToNumber(GameTheme.accents.powerUp),
                fontFamily: GameTheme.font,
            };
        }

        if (helpLabel) {
            helpLabel.style = {
                ...helpLabel.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (scoreboardLabel) {
            scoreboardLabel.style = {
                ...scoreboardLabel.style,
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (themeToggleLabel) {
            const current = getActiveThemeName();
            themeToggleLabel.text = formatThemeLabel(current);
            themeToggleLabel.style = {
                ...themeToggleLabel.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
        }

        context.renderStageSoon();
    };

    const handleThemeToggle = (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        toggleTheme();
    };

    return {
        init() {
            container = new Container();
            setInteraction(true);
            container.on('pointertap', handleStart);

            const { width, height } = context.designSize;
            const panelWidth = Math.min(width * 0.72, 820);
            const panelHeight = Math.min(height * 0.7, 540);
            const panelX = (width - panelWidth) / 2;
            const panelY = (height - panelHeight) / 2;
            layout = { width, height, panelWidth, panelHeight, panelX, panelY } satisfies LayoutMetrics;

            overlay = new Graphics();
            overlay.eventMode = 'none';

            panel = new Graphics();
            panel.eventMode = 'none';

            const displayTitle = (options.title ?? DEFAULT_TITLE).toUpperCase();

            title = new Text({
                text: displayTitle,
                style: {
                    fill: hexToNumber(GameTheme.hud.accent),
                    fontFamily: GameTheme.font,
                    fontSize: 96,
                    fontWeight: '900',
                    align: 'center',
                    letterSpacing: 2,
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, panelY + panelHeight * 0.28);

            promptLabel = new Text({
                text: (options.prompt ?? DEFAULT_PROMPT).toUpperCase(),
                style: {
                    fill: hexToNumber(GameTheme.accents.powerUp),
                    fontFamily: GameTheme.font,
                    fontSize: 40,
                    align: 'center',
                    letterSpacing: 1,
                },
            });
            promptLabel.anchor.set(0.5);
            promptLabel.position.set(width / 2, panelY + panelHeight * 0.48);

            const helpLines = options.helpText ?? [
                'Aim with the paddle to send the ball through the bricks.',
                'Launch with tap, click, or spacebar and ride the streaks.',
                'Snag power-ups to stack payouts and trigger lucky breaks!',
                'Press SHIFT+C any time for high-contrast colors.',
            ];

            helpLabel = new Text({
                text: helpLines.join('\n'),
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 22,
                    align: 'center',
                    lineHeight: 32,
                },
            });
            helpLabel.anchor.set(0.5, 0);
            helpLabel.position.set(width / 2, panelY + panelHeight * 0.58);

            const highScores = options.highScoresProvider?.() ?? [];
            const topScores = highScores.slice(0, 5);
            const scoreboardLines =
                topScores.length === 0
                    ? ['HIGH SCORES', 'No runs recorded yet']
                    : [
                        'HIGH SCORES',
                        ...topScores.map((entry, index) => {
                            const rank = `${index + 1}.`.padStart(2, ' ');
                            const scoreText = entry.score.toLocaleString();
                            const paddedScore = scoreText.padStart(7, ' ');
                            const roundLabel = `R${entry.round}`;
                            const name = entry.name;
                            return `${rank} ${paddedScore} — ${roundLabel} ${name}`;
                        }),
                    ];

            scoreboardLabel = new Text({
                text: scoreboardLines.join('\n'),
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 20,
                    align: 'center',
                    lineHeight: 28,
                },
            });
            scoreboardLabel.anchor.set(0.5, 0);
            scoreboardLabel.position.set(width / 2, panelY + panelHeight * 0.7);

            themeToggleLabel = new Text({
                text: formatThemeLabel(getActiveThemeName()),
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 18,
                    align: 'center',
                },
            });
            themeToggleLabel.anchor.set(0.5, 1);
            themeToggleLabel.position.set(width / 2, panelY + panelHeight - 24);
            themeToggleLabel.eventMode = 'static';
            themeToggleLabel.cursor = 'pointer';
            themeToggleLabel.on('pointertap', handleThemeToggle);

            container.addChild(overlay, panel, title, promptLabel, helpLabel, scoreboardLabel, themeToggleLabel);
            context.addToLayer('hud', container);
            applyTheme();
            unsubscribeTheme = onThemeChange(() => {
                applyTheme();
            });
            pushIdleAudioState();
            emitSceneEvent('enter');
        },
        update(deltaSeconds) {
            if (!promptLabel) {
                return;
            }

            elapsed += deltaSeconds;
            const pulse = (Math.sin(elapsed * 2.5) + 1) / 2;
            promptLabel.alpha = 0.5 + pulse * 0.5;
        },
        destroy() {
            if (container) {
                container.off('pointertap', handleStart);
                setInteraction(false);
                context.removeFromLayer(container);
                container.destroy({ children: true });
            }
            container = null;
            promptLabel = null;
            helpLabel = null;
            scoreboardLabel = null;
            title = null;
            themeToggleLabel?.off('pointertap', handleThemeToggle);
            themeToggleLabel = null;
            overlay = null;
            panel = null;
            layout = null;
            unsubscribeTheme?.();
            unsubscribeTheme = null;
            pushIdleAudioState();
            emitSceneEvent('exit');
            context.renderStageSoon();
        },
        suspend() {
            setInteraction(false);
            pushIdleAudioState();
            emitSceneEvent('suspend');
        },
        resume() {
            setInteraction(true);
            pushIdleAudioState();
            emitSceneEvent('resume');
        },
    };
};
