import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import {
    GameTheme,
    getActiveThemeName,
    getThemeLabel,
    onThemeChange,
    toggleTheme,
} from 'render/theme';
import type { ThemeName } from 'render/theme';

export interface PauseScenePayload {
    readonly score: number;
    readonly legendTitle?: string;
    readonly legendLines?: readonly string[];
    readonly onResume: () => void | Promise<void>;
    readonly onQuit?: () => void | Promise<void>;
}

export interface PauseSceneOptions {
    readonly title?: string;
    readonly resumeLabel?: string;
    readonly quitLabel?: string;
}

const DEFAULT_TITLE = 'Paused';
const DEFAULT_RESUME_LABEL = 'Tap to resume';

const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16);

export const createPauseScene = (
    context: SceneContext<GameSceneServices>,
    options: PauseSceneOptions = {},
): Scene<PauseScenePayload, GameSceneServices> => {
    let container: Container | null = null;
    let resumeText: Text | null = null;
    let titleText: Text | null = null;
    let scoreText: Text | null = null;
    let legendTitleText: Text | null = null;
    let legendBodyText: Text | null = null;
    let quitText: Text | null = null;
    let themeToggleText: Text | null = null;
    let background: Graphics | null = null;
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

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'pause',
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

    const handleThemeTogglePointer = (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        toggleTheme();
    };

    const repaintPanel = () => {
        if (!layout || !panel || !background) {
            return;
        }

        background.clear();
        background.rect(0, 0, layout.width, layout.height);
        background.fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.78 });

        panel.clear();
        panel.roundRect(layout.panelX, layout.panelY, layout.panelWidth, layout.panelHeight, 28)
            .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.95 })
            .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 5, alignment: 0.5 });
    };

    const applyTheme = () => {
        repaintPanel();

        if (titleText) {
            titleText.style = {
                ...titleText.style,
                fill: hexToNumber(GameTheme.hud.accent),
                fontFamily: GameTheme.font,
            };
        }

        if (scoreText) {
            scoreText.style = {
                ...scoreText.style,
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (resumeText) {
            resumeText.style = {
                ...resumeText.style,
                fill: hexToNumber(GameTheme.accents.combo),
                fontFamily: GameTheme.font,
            };
        }

        if (legendTitleText) {
            legendTitleText.style = {
                ...legendTitleText.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.font,
            };
        }

        if (legendBodyText) {
            legendBodyText.style = {
                ...legendBodyText.style,
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (quitText) {
            quitText.style = {
                ...quitText.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (themeToggleText) {
            themeToggleText.style = {
                ...themeToggleText.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
            themeToggleText.text = formatThemeLabel(getActiveThemeName());
        }

        context.renderStageSoon();
    };

    const dispose = () => {
        if (!container) {
            return;
        }

        setInteraction(false);
        container.removeAllListeners();
        container.destroy({ children: true });
        context.removeFromLayer(container);
        container = null;
        resumeText = null;
        titleText = null;
        scoreText = null;
        legendTitleText = null;
        legendBodyText = null;
        quitText?.off('pointertap');
        quitText = null;
        themeToggleText?.off('pointertap', handleThemeTogglePointer);
        themeToggleText = null;
        background = null;
        panel = null;
        layout = null;
        unsubscribeTheme?.();
        unsubscribeTheme = null;
        elapsed = 0;
        context.renderStageSoon();
    };

    return {
        init(payload) {
            if (!payload) {
                throw new Error('PauseScene requires a payload');
            }

            container = new Container();
            setInteraction(true);

            const { width, height } = context.designSize;

            background = new Graphics();
            background.eventMode = 'none';

            const panelWidth = Math.min(width * 0.7, 760);
            const panelHeight = Math.min(height * 0.65, 520);
            const panelX = (width - panelWidth) / 2;
            const panelY = (height - panelHeight) / 2;
            layout = { width, height, panelWidth, panelHeight, panelX, panelY } satisfies LayoutMetrics;

            panel = new Graphics();
            panel.eventMode = 'none';

            const displayTitle = (options.title ?? DEFAULT_TITLE).toUpperCase();

            titleText = new Text({
                text: displayTitle,
                style: {
                    fill: hexToNumber(GameTheme.hud.accent),
                    fontFamily: GameTheme.font,
                    fontSize: 82,
                    fontWeight: '900',
                    align: 'center',
                },
            });
            titleText.anchor.set(0.5);
            titleText.position.set(width / 2, panelY + panelHeight * 0.2);

            scoreText = new Text({
                text: `Score: ${payload.score}`,
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 30,
                    align: 'center',
                },
            });
            scoreText.anchor.set(0.5);
            scoreText.position.set(width / 2, panelY + panelHeight * 0.38);

            const resumeCopy = (options.resumeLabel ?? DEFAULT_RESUME_LABEL).toUpperCase();

            resumeText = new Text({
                text: resumeCopy,
                style: {
                    fill: hexToNumber(GameTheme.accents.combo),
                    fontFamily: GameTheme.font,
                    fontSize: 34,
                    align: 'center',
                    letterSpacing: 1,
                },
            });
            resumeText.anchor.set(0.5);
            resumeText.position.set(width / 2, panelY + panelHeight * 0.52);

            const legendTitle = payload.legendTitle ?? null;
            const legendLines = payload.legendLines ?? [];

            legendTitleText = new Text({
                text: legendTitle ?? '',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.font,
                    fontSize: 26,
                    fontWeight: '700',
                    align: 'center',
                },
            });
            legendTitleText.anchor.set(0.5);
            legendTitleText.position.set(width / 2, panelY + panelHeight * 0.65);
            legendTitleText.visible = Boolean(legendTitle);

            legendBodyText = new Text({
                text: legendLines.join('\n'),
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 20,
                    align: 'center',
                    lineHeight: 30,
                },
            });
            legendBodyText.anchor.set(0.5, 0);
            legendBodyText.position.set(width / 2, panelY + panelHeight * 0.7);
            legendBodyText.visible = legendLines.length > 0;

            const quitLabel = options.quitLabel ?? 'Hold Q to quit to menu';
            quitText = new Text({
                text: payload.onQuit ? quitLabel : '',
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 18,
                    align: 'center',
                },
            });
            quitText.anchor.set(0.5);
            quitText.position.set(width / 2, panelY + panelHeight * 0.88);
            quitText.visible = Boolean(payload.onQuit);
            quitText.eventMode = payload.onQuit ? 'static' : 'none';
            if (payload.onQuit) {
                quitText.cursor = 'pointer';
                quitText.on('pointertap', (event) => {
                    event.stopPropagation();
                    void Promise.resolve(payload.onQuit?.());
                });
            }

            themeToggleText = new Text({
                text: formatThemeLabel(getActiveThemeName()),
                style: {
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 18,
                    align: 'center',
                },
            });
            themeToggleText.anchor.set(0.5, 1);
            themeToggleText.position.set(width / 2, panelY + panelHeight - 18);
            themeToggleText.cursor = 'pointer';
            themeToggleText.eventMode = 'static';
            themeToggleText.on('pointertap', handleThemeTogglePointer);

            container.addChild(
                background,
                panel,
                titleText,
                scoreText,
                resumeText,
                legendTitleText,
                legendBodyText,
                quitText,
                themeToggleText,
            );

            container.on('pointertap', () => {
                void Promise.resolve(payload.onResume());
            });

            context.addToLayer('hud', container);
            applyTheme();
            unsubscribeTheme = onThemeChange(() => {
                applyTheme();
            });
            pushIdleAudioState();
            emitSceneEvent('enter');
        },
        update(deltaSeconds) {
            if (!resumeText) {
                return;
            }

            elapsed += deltaSeconds;
            const pulse = (Math.sin(elapsed * 3) + 1) / 2;
            resumeText.alpha = 0.4 + pulse * 0.6;
        },
        destroy() {
            emitSceneEvent('exit');
            pushIdleAudioState();
            dispose();
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
