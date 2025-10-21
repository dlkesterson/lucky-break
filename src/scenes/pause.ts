import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import { GameTheme } from 'render/theme';

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
    let elapsed = 0;

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

            const background = new Graphics();
            background.rect(0, 0, width, height);
            background.fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.78 });
            background.eventMode = 'none';

            const panelWidth = Math.min(width * 0.7, 760);
            const panelHeight = Math.min(height * 0.65, 520);
            const panelX = (width - panelWidth) / 2;
            const panelY = (height - panelHeight) / 2;

            const panel = new Graphics();
            panel.roundRect(panelX, panelY, panelWidth, panelHeight, 28)
                .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.95 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 5, alignment: 0.5 });
            panel.eventMode = 'none';

            const displayTitle = (options.title ?? DEFAULT_TITLE).toUpperCase();

            const title = new Text({
                text: displayTitle,
                style: {
                    fill: hexToNumber(GameTheme.hud.accent),
                    fontFamily: GameTheme.font,
                    fontSize: 82,
                    fontWeight: '900',
                    align: 'center',
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, panelY + panelHeight * 0.2);

            const score = new Text({
                text: `Score: ${payload.score}`,
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 30,
                    align: 'center',
                },
            });
            score.anchor.set(0.5);
            score.position.set(width / 2, panelY + panelHeight * 0.38);

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

            const legendTitleText = new Text({
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

            const legendBodyText = new Text({
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
            const quitText = new Text({
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

            container.addChild(
                background,
                panel,
                title,
                score,
                resumeText,
                legendTitleText,
                legendBodyText,
                quitText,
            );

            container.on('pointertap', () => {
                void Promise.resolve(payload.onResume());
            });

            context.addToLayer('hud', container);
            context.renderStageSoon();
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
