import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import { GameTheme } from 'render/theme';

export interface GameOverPayload {
    readonly score: number;
}

export interface GameOverSceneOptions {
    readonly title?: (payload: GameOverPayload) => string;
    readonly scoreLabel?: (payload: GameOverPayload) => string;
    readonly prompt?: string;
    readonly onRestart: () => void | Promise<void>;
}

const DEFAULT_TITLE = 'Game Over';
const DEFAULT_PROMPT = 'Tap to try again';

const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16);

export const createGameOverScene = (
    context: SceneContext<GameSceneServices>,
    options: GameOverSceneOptions,
): Scene<GameOverPayload, GameSceneServices> => {
    let container: Container | null = null;
    let promptLabel: Text | null = null;
    let scoreLabel: Text | null = null;
    let elapsed = 0;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'game-over',
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

    const restart = () => {
        const result = options.onRestart();
        if (result) {
            void Promise.resolve(result);
        }
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

    return {
        init(payload) {
            container = new Container();
            setInteraction(true);
            container.on('pointertap', restart);

            const { width, height } = context.designSize;
            const effectivePayload = payload ?? { score: 0 };

            const overlay = new Graphics();
            overlay.rect(0, 0, width, height);
            overlay.fill({ color: hexToNumber(GameTheme.background.from), alpha: 0.8 });
            overlay.eventMode = 'none';

            const panelWidth = Math.min(width * 0.68, 720);
            const panelHeight = Math.min(height * 0.6, 460);
            const panelX = (width - panelWidth) / 2;
            const panelY = (height - panelHeight) / 2;

            const panel = new Graphics();
            panel.roundRect(panelX, panelY, panelWidth, panelHeight, 28)
                .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.96 })
                .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 5, alignment: 0.5 });
            panel.eventMode = 'none';

            const displayTitle = (options.title ? options.title(effectivePayload) : DEFAULT_TITLE).toUpperCase();

            const title = new Text({
                text: displayTitle,
                style: {
                    fill: hexToNumber(GameTheme.hud.danger),
                    fontFamily: GameTheme.font,
                    fontSize: 88,
                    fontWeight: '900',
                    align: 'center',
                    letterSpacing: 1,
                },
            });
            title.anchor.set(0.5);
            title.position.set(width / 2, panelY + panelHeight * 0.25);

            scoreLabel = new Text({
                text: options.scoreLabel
                    ? options.scoreLabel(effectivePayload)
                    : `Final Score: ${effectivePayload.score}`,
                style: {
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                    fontFamily: GameTheme.monoFont,
                    fontSize: 30,
                    align: 'center',
                },
            });
            scoreLabel.anchor.set(0.5);
            scoreLabel.position.set(width / 2, panelY + panelHeight * 0.48);

            promptLabel = new Text({
                text: (options.prompt ?? DEFAULT_PROMPT).toUpperCase(),
                style: {
                    fill: hexToNumber(GameTheme.accents.powerUp),
                    fontFamily: GameTheme.font,
                    fontSize: 36,
                    align: 'center',
                    letterSpacing: 1,
                },
            });
            promptLabel.anchor.set(0.5);
            promptLabel.position.set(width / 2, panelY + panelHeight * 0.7);

            container.addChild(overlay, panel, title, scoreLabel, promptLabel);
            context.addToLayer('hud', container);
            context.renderStageSoon();
            pushIdleAudioState();
            emitSceneEvent('enter');
        },
        update(deltaSeconds) {
            if (!promptLabel) {
                return;
            }

            elapsed += deltaSeconds;
            const pulse = (Math.sin(elapsed * 3) + 1) / 2;
            promptLabel.alpha = 0.4 + pulse * 0.6;
        },
        destroy() {
            if (container) {
                container.off('pointertap', restart);
                setInteraction(false);
                context.removeFromLayer(container);
                container.destroy({ children: true });
            }
            container = null;
            promptLabel = null;
            scoreLabel = null;
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
