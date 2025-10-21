import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';

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
            background.fill({ color: 0x000000, alpha: 0.7 });
            background.eventMode = 'none';

            const title = new Text({
                text: options.title ?? DEFAULT_TITLE,
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Overpass, "Overpass Mono", sans-serif',
                    fontSize: 60,
                    fontWeight: 'bold',
                    align: 'center',
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, height / 2 - 120);

            const score = new Text({
                text: `Score: ${payload.score}`,
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Overpass Mono',
                    fontSize: 28,
                    align: 'center',
                },
            });
            score.anchor.set(0.5);
            score.position.set(width / 2, height / 2 - 40);

            resumeText = new Text({
                text: options.resumeLabel ?? DEFAULT_RESUME_LABEL,
                style: {
                    fill: 0xffe066,
                    fontFamily: 'Overpass Mono',
                    fontSize: 26,
                    align: 'center',
                },
            });
            resumeText.anchor.set(0.5);
            resumeText.position.set(width / 2, height / 2 + 20);

            const legendTitle = payload.legendTitle ?? null;
            const legendLines = payload.legendLines ?? [];

            const legendTitleText = new Text({
                text: legendTitle ?? '',
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Overpass, "Overpass Mono", sans-serif',
                    fontSize: 24,
                    fontWeight: 'bold',
                    align: 'center',
                },
            });
            legendTitleText.anchor.set(0.5);
            legendTitleText.position.set(width / 2, height / 2 + 90);
            legendTitleText.visible = Boolean(legendTitle);

            const legendBodyText = new Text({
                text: legendLines.join('\n'),
                style: {
                    fill: 0xffffff,
                    fontFamily: 'Overpass Mono',
                    fontSize: 18,
                    align: 'center',
                    lineHeight: 26,
                },
            });
            legendBodyText.anchor.set(0.5, 0);
            legendBodyText.position.set(width / 2, height / 2 + 130);
            legendBodyText.visible = legendLines.length > 0;

            const quitLabel = options.quitLabel ?? 'Hold Q to quit to menu';
            const quitText = new Text({
                text: payload.onQuit ? quitLabel : '',
                style: {
                    fill: 0xb0b0b0,
                    fontFamily: 'Overpass Mono',
                    fontSize: 18,
                    align: 'center',
                },
            });
            quitText.anchor.set(0.5);
            quitText.position.set(width / 2, height / 2 + 220);
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
