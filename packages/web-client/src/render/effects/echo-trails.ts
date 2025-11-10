import { Container, Graphics } from 'pixi.js';
import type { EchoTrailSnapshot } from 'game/echo-trails';

export interface EchoTrailTheme {
    readonly echoColor: number;
    readonly fadeColor: number;
}

export interface EchoTrailEffect {
    readonly container: Container;
    update(payload: {
        readonly deltaSeconds: number;
        readonly echoes: readonly EchoTrailSnapshot[];
    }): void;
    applyTheme(theme: EchoTrailTheme): void;
    reset(): void;
    destroy(): void;
}

interface EchoVisual {
    readonly graphic: Graphics;
    position: { x: number; y: number };
    alpha: number;
    scale: number;
}

const DEFAULT_ECHO_COLOR = 0x9f6fff;
const DEFAULT_FADE_COLOR = 0x6b3f9f;
const ECHO_RADIUS = 12;
const FADE_SPEED = 2.5;

export const createEchoTrailEffect = (): EchoTrailEffect => {
    const container = new Container();
    container.label = 'echo-trails';
    container.sortableChildren = false;

    let echoColor = DEFAULT_ECHO_COLOR;
    let fadeColor = DEFAULT_FADE_COLOR;

    const activeEchoes: EchoVisual[] = [];
    const pooledGraphics: Graphics[] = [];

    const getOrCreateGraphic = (): Graphics => {
        const pooled = pooledGraphics.pop();
        if (pooled) {
            pooled.visible = true;
            return pooled;
        }

        const graphic = new Graphics();
        graphic.alpha = 0;
        container.addChild(graphic);
        return graphic;
    };

    const releaseGraphic = (graphic: Graphics): void => {
        graphic.visible = false;
        graphic.alpha = 0;
        graphic.clear();
        pooledGraphics.push(graphic);
    };

    const drawEcho = (graphic: Graphics, color: number, alpha: number, scale: number): void => {
        graphic.clear();
        graphic.circle(0, 0, ECHO_RADIUS * scale);
        graphic.fill({ color, alpha: alpha * 0.4 });
        graphic.circle(0, 0, ECHO_RADIUS * scale * 0.6);
        graphic.fill({ color: fadeColor, alpha: alpha * 0.6 });
    };

    const update: EchoTrailEffect['update'] = ({ deltaSeconds, echoes }) => {
        for (let i = activeEchoes.length - 1; i >= 0; i--) {
            const echo = activeEchoes[i];
            if (!echo) continue;

            echo.alpha -= FADE_SPEED * deltaSeconds;
            echo.scale = Math.max(0.5, echo.scale - deltaSeconds * 0.3);

            if (echo.alpha <= 0) {
                releaseGraphic(echo.graphic);
                activeEchoes.splice(i, 1);
                continue;
            }

            echo.graphic.x = echo.position.x;
            echo.graphic.y = echo.position.y;
            drawEcho(echo.graphic, echoColor, echo.alpha, echo.scale);
        }

        for (const echoSnapshot of echoes) {
            const normalizedLife = echoSnapshot.remainingSeconds / 4;
            const existingEcho = activeEchoes.find(
                (e) => Math.abs(e.position.x - echoSnapshot.position.x) < 5 &&
                    Math.abs(e.position.y - echoSnapshot.position.y) < 5,
            );

            if (existingEcho) {
                existingEcho.alpha = Math.min(1, normalizedLife);
                continue;
            }

            if (normalizedLife > 0.1) {
                const graphic = getOrCreateGraphic();
                const newEcho: EchoVisual = {
                    graphic,
                    position: { x: echoSnapshot.position.x, y: echoSnapshot.position.y },
                    alpha: normalizedLife,
                    scale: 1.0,
                };
                activeEchoes.push(newEcho);
            }
        }
    };

    const applyTheme: EchoTrailEffect['applyTheme'] = (theme) => {
        echoColor = theme.echoColor;
        fadeColor = theme.fadeColor;
    };

    const reset: EchoTrailEffect['reset'] = () => {
        for (const echo of activeEchoes) {
            releaseGraphic(echo.graphic);
        }
        activeEchoes.length = 0;
    };

    const destroy: EchoTrailEffect['destroy'] = () => {
        reset();
        for (const graphic of pooledGraphics) {
            graphic.destroy();
        }
        pooledGraphics.length = 0;
        container.destroy({ children: true });
    };

    return {
        container,
        update,
        applyTheme,
        reset,
        destroy,
    };
};
