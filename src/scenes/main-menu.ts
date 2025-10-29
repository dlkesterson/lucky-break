import { Container, Graphics, Text } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import type { HighScoreEntry } from 'util/high-scores';
import { getSettings, subscribeSettings, updateSettings } from 'util/settings';
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
    let helpHeading: Text | null = null;
    let scoreboardLabel: Text | null = null;
    let scoreboardHeading: Text | null = null;
    let title: Text | null = null;
    let themeToggleLabel: Text | null = null;
    let performanceToggleLabel: Text | null = null;
    let ledgerLabel: Text | null = null;
    let overlay: Graphics | null = null;
    let panel: Graphics | null = null;
    let columnDivider: Graphics | null = null;
    let elapsed = 0;
    let unsubscribeTheme: (() => void) | null = null;
    let unsubscribeSettings: (() => void) | null = null;
    let layoutMode: 'stacked' | 'columns' = 'stacked';

    interface ColumnDividerMetrics {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }

    interface LayoutMetrics {
        readonly width: number;
        readonly height: number;
        readonly panelWidth: number;
        readonly panelHeight: number;
        readonly panelX: number;
        readonly panelY: number;
    }

    let layout: LayoutMetrics | null = null;
    let columnDividerMetrics: ColumnDividerMetrics | null = null;

    const createTextNode = (text: string, style: TextStyleOptions): Text => {
        return new Text({ text, style });
    };

    const formatPerformanceLabel = (enabled: boolean): string => `PERFORMANCE MODE: ${enabled ? 'ON' : 'OFF'} (CLICK TO TOGGLE)`;

    let currentSettings = getSettings();

    const refreshPerformanceLabel = () => {
        const label = performanceToggleLabel;
        if (label) {
            label.text = formatPerformanceLabel(currentSettings.performance);
        }
    };

    const handlePerformanceToggle = (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        updateSettings({ performance: !currentSettings.performance });
    };

    const handleOpenFateLedger = (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        void context.pushScene('fate-ledger').catch(() => undefined);
    };

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

        if (helpHeading) {
            helpHeading.style = {
                ...helpHeading.style,
                fill: hexToNumber(GameTheme.hud.accent),
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

        if (scoreboardHeading) {
            scoreboardHeading.style = {
                ...scoreboardHeading.style,
                fill: hexToNumber(GameTheme.hud.accent),
                fontFamily: GameTheme.font,
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

        if (performanceToggleLabel) {
            performanceToggleLabel.style = {
                ...performanceToggleLabel.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
            refreshPerformanceLabel();
        }

        if (ledgerLabel) {
            const label = ledgerLabel;
            label.style = {
                ...label.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (columnDivider && columnDividerMetrics && layoutMode === 'columns') {
            columnDivider.clear();
            columnDivider.rect(
                columnDividerMetrics.x,
                columnDividerMetrics.y,
                columnDividerMetrics.width,
                columnDividerMetrics.height,
            ).fill({ color: hexToNumber(GameTheme.hud.panelLine), alpha: 0.22 });
        } else if (columnDivider) {
            columnDivider.clear();
        }

        context.renderStageSoon();
    };

    const handleThemeToggle = (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        toggleTheme();
    };

    const updateLayout = () => {
        if (!layout || !title || !promptLabel || !themeToggleLabel || !performanceToggleLabel || !ledgerLabel) {
            return;
        }

        const { width, panelWidth, panelHeight, panelX, panelY } = layout;
        const panelPadding = Math.max(32, Math.min(panelWidth, panelHeight) * 0.06);
        const contentCenterX = width / 2;

        title.position.set(contentCenterX, panelY + panelHeight * 0.26);
        promptLabel.position.set(contentCenterX, panelY + panelHeight * 0.41);

        const stacked = panelWidth < 720;
        layoutMode = stacked ? 'stacked' : 'columns';

        const columnTop = panelY + panelHeight * 0.52;
        const columnSpacing = Math.max(24, panelHeight * 0.04);
        const columnGap = stacked ? columnSpacing : Math.max(72, panelWidth * 0.12);
        const columnAvailableWidth = Math.max(220, panelWidth - panelPadding * 2);
        const columnWidth = stacked
            ? columnAvailableWidth
            : Math.max(220, (columnAvailableWidth - columnGap) / 2);

        columnDividerMetrics = null;

        if (helpHeading && helpLabel) {
            const helpAlign = stacked ? 'center' : 'left';
            helpHeading.style = { ...helpHeading.style, align: helpAlign };
            helpLabel.style = {
                ...helpLabel.style,
                align: helpAlign,
                wordWrap: true,
                wordWrapWidth: stacked ? columnWidth : Math.max(200, columnWidth - 18),
            };
        }

        if (scoreboardHeading && scoreboardLabel) {
            const scoreboardAlign = stacked ? 'center' : 'left';
            scoreboardHeading.style = { ...scoreboardHeading.style, align: scoreboardAlign };
            scoreboardLabel.style = {
                ...scoreboardLabel.style,
                align: scoreboardAlign,
                wordWrap: true,
                wordWrapWidth: columnWidth,
            };
        }

        if (stacked) {
            if (helpHeading && helpLabel) {
                helpHeading.anchor.set(0.5, 0);
                helpLabel.anchor.set(0.5, 0);
                helpHeading.position.set(contentCenterX, columnTop);
                helpLabel.position.set(contentCenterX, columnTop + helpHeading.height + 12);
            }

            if (scoreboardHeading && scoreboardLabel && helpLabel) {
                scoreboardHeading.anchor.set(0.5, 0);
                scoreboardLabel.anchor.set(0.5, 0);
                const scoreboardTop = helpLabel.position.y + helpLabel.height + columnSpacing;
                scoreboardHeading.position.set(contentCenterX, scoreboardTop);
                scoreboardLabel.position.set(contentCenterX, scoreboardTop + scoreboardHeading.height + 12);
            }

            if (columnDivider) {
                columnDivider.clear();
            }
        } else {
            const leftX = panelX + panelPadding;
            const rightX = leftX + columnWidth + columnGap;

            if (helpHeading && helpLabel) {
                helpHeading.anchor.set(0, 0);
                helpLabel.anchor.set(0, 0);
                helpHeading.position.set(leftX, columnTop);
                helpLabel.position.set(leftX, columnTop + helpHeading.height + 12);
            }

            if (scoreboardHeading && scoreboardLabel) {
                scoreboardHeading.anchor.set(0, 0);
                scoreboardLabel.anchor.set(0, 0);
                scoreboardHeading.position.set(rightX, columnTop);
                scoreboardLabel.position.set(rightX, columnTop + scoreboardHeading.height + 12);
            }

            if (columnDivider && helpLabel && scoreboardLabel) {
                const dividerX = rightX - (columnGap / 2) - 1;
                const columnBottom = Math.max(
                    helpLabel.position.y + helpLabel.height,
                    scoreboardLabel.position.y + scoreboardLabel.height,
                );
                const dividerTop = columnTop - 16;
                const dividerHeight = (columnBottom - columnTop) + 32;
                columnDividerMetrics = {
                    x: dividerX,
                    y: dividerTop,
                    width: Math.max(2, columnGap * 0.05),
                    height: dividerHeight,
                };
            }
        }

        const footerBaseline = panelY + panelHeight - Math.max(24, panelPadding / 2);
        const footerSpacing = Math.max(16, panelPadding / 3);
        const themeLabel = themeToggleLabel;
        const ledger = ledgerLabel;
        const perfLabel = performanceToggleLabel;

        themeLabel.anchor.set(0.5, 1);
        themeLabel.position.set(contentCenterX, footerBaseline);

        ledger.anchor.set(0.5, 1);
        ledger.position.set(contentCenterX, footerBaseline - footerSpacing - themeLabel.height);

        perfLabel.anchor.set(0.5, 1);
        perfLabel.position.set(contentCenterX, ledger.position.y - footerSpacing - ledger.height);

        if (columnDivider && columnDividerMetrics && layoutMode === 'columns') {
            columnDivider.clear();
            columnDivider.rect(
                columnDividerMetrics.x,
                columnDividerMetrics.y,
                columnDividerMetrics.width,
                columnDividerMetrics.height,
            ).fill({ color: hexToNumber(GameTheme.hud.panelLine), alpha: 0.22 });
        }
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

            columnDivider = new Graphics();
            columnDivider.eventMode = 'none';

            const displayTitle = (options.title ?? DEFAULT_TITLE).toUpperCase();

            title = createTextNode(displayTitle, {
                fill: hexToNumber(GameTheme.hud.accent),
                fontFamily: GameTheme.font,
                fontSize: 96,
                fontWeight: '900',
                align: 'center',
                letterSpacing: 2,
                dropShadow: true,
            });
            title.anchor.set(0.5);

            promptLabel = createTextNode((options.prompt ?? DEFAULT_PROMPT).toUpperCase(), {
                fill: hexToNumber(GameTheme.accents.powerUp),
                fontFamily: GameTheme.font,
                fontSize: 40,
                align: 'center',
                letterSpacing: 1,
                dropShadow: true,
            });
            promptLabel.anchor.set(0.5);

            const helpLines = options.helpText ?? [
                'Aim with the paddle to send the ball through the bricks.',
                'Launch with tap, click, or spacebar and ride the streaks.',
                'Snag power-ups to stack payouts and trigger lucky breaks!',
                'Press SHIFT+C any time for high-contrast colors.',
            ];

            helpHeading = createTextNode('HOW TO PLAY', {
                fill: hexToNumber(GameTheme.hud.accent),
                fontFamily: GameTheme.font,
                fontSize: 28,
                fontWeight: '700',
                align: 'center',
                letterSpacing: 1,
            });

            helpLabel = createTextNode(helpLines.map((line) => `• ${line}`).join('\n'), {
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
                fontSize: 22,
                align: 'left',
                lineHeight: 32,
                wordWrap: true,
                wordWrapWidth: panelWidth * 0.7,
            });

            const highScores = options.highScoresProvider?.() ?? [];
            const topScores = highScores.slice(0, 5);
            const scoreboardLines =
                topScores.length === 0
                    ? ['No runs recorded yet']
                    : topScores.map((entry, index) => {
                        const rank = `${index + 1}.`.padStart(2, ' ');
                        const scoreText = entry.score.toLocaleString();
                        const paddedScore = scoreText.padStart(7, ' ');
                        const roundLabel = `R${entry.round}`;
                        const name = entry.name;
                        return `${rank} ${paddedScore} — ${roundLabel} ${name}`;
                    });

            scoreboardHeading = createTextNode('HIGH SCORES', {
                fill: hexToNumber(GameTheme.hud.accent),
                fontFamily: GameTheme.font,
                fontSize: 28,
                fontWeight: '700',
                align: 'center',
                letterSpacing: 1,
            });

            scoreboardLabel = createTextNode(scoreboardLines.join('\n'), {
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
                fontSize: 20,
                align: 'left',
                lineHeight: 28,
                wordWrap: true,
                wordWrapWidth: panelWidth * 0.7,
            });

            themeToggleLabel = createTextNode(formatThemeLabel(getActiveThemeName()), {
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
                fontSize: 18,
                align: 'center',
            });
            themeToggleLabel.anchor.set(0.5, 1);
            themeToggleLabel.position.set(width / 2, panelY + panelHeight - 24);
            themeToggleLabel.eventMode = 'static';
            themeToggleLabel.cursor = 'pointer';
            themeToggleLabel.on('pointertap', handleThemeToggle);

            performanceToggleLabel = createTextNode(formatPerformanceLabel(currentSettings.performance), {
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
                fontSize: 18,
                align: 'center',
            });
            performanceToggleLabel.anchor.set(0.5, 1);
            performanceToggleLabel.position.set(width / 2, panelY + panelHeight - 60);
            performanceToggleLabel.eventMode = 'static';
            performanceToggleLabel.cursor = 'pointer';
            performanceToggleLabel.on('pointertap', handlePerformanceToggle);

            ledgerLabel = createTextNode('VIEW FATE LEDGER', {
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
                fontSize: 18,
                align: 'center',
                letterSpacing: 0.5,
            });
            ledgerLabel.anchor.set(0.5, 1);
            ledgerLabel.position.set(width / 2, panelY + panelHeight - 88);
            ledgerLabel.eventMode = 'static';
            ledgerLabel.cursor = 'pointer';
            ledgerLabel.on('pointertap', handleOpenFateLedger);

            unsubscribeSettings = subscribeSettings((nextSettings) => {
                currentSettings = nextSettings;
                refreshPerformanceLabel();
                context.renderStageSoon();
            });

            container.addChild(
                overlay,
                panel,
                title,
                promptLabel,
                columnDivider,
                helpHeading,
                helpLabel,
                scoreboardHeading,
                scoreboardLabel,
                performanceToggleLabel,
                ledgerLabel,
                themeToggleLabel,
            );
            context.addToLayer('hud', container);
            updateLayout();
            applyTheme();
            unsubscribeTheme = onThemeChange(() => {
                applyTheme();
                updateLayout();
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
            helpHeading = null;
            scoreboardLabel = null;
            scoreboardHeading = null;
            title = null;
            themeToggleLabel?.off('pointertap', handleThemeToggle);
            themeToggleLabel = null;
            performanceToggleLabel?.off('pointertap', handlePerformanceToggle);
            performanceToggleLabel = null;
            ledgerLabel?.off('pointertap', handleOpenFateLedger);
            ledgerLabel = null;
            overlay = null;
            panel = null;
            columnDivider = null;
            layout = null;
            columnDividerMetrics = null;
            unsubscribeTheme?.();
            unsubscribeTheme = null;
            unsubscribeSettings?.();
            unsubscribeSettings = null;
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
