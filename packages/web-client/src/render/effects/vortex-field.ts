import { Container, Graphics } from 'pixi.js';
import type { VortexInstance } from 'physics/field-effects';

export interface VortexFieldTheme {
    readonly vortexColor: number;
    readonly portalColor: number;
}

export interface VortexFieldEffect {
    readonly container: Container;
    update(payload: {
        readonly deltaSeconds: number;
        readonly vortices: readonly VortexInstance[];
    }): void;
    applyTheme(theme: VortexFieldTheme): void;
    reset(): void;
    destroy(): void;
}

interface VortexVisual {
    readonly graphic: Graphics;
    readonly pulseGraphic: Graphics;
    position: { x: number; y: number };
    radius: number;
    rotation: number;
    alpha: number;
    pulsePhase: number;
}

const DEFAULT_VORTEX_COLOR = 0x5ddaff;
const DEFAULT_PORTAL_COLOR = 0x2fb8d9;
const ROTATION_SPEED = 2.5;
const PULSE_SPEED = 3.0;

export const createVortexFieldEffect = (): VortexFieldEffect => {
    const container = new Container();
    container.label = 'vortex-fields';
    container.sortableChildren = false;

    let vortexColor = DEFAULT_VORTEX_COLOR;
    let portalColor = DEFAULT_PORTAL_COLOR;

    const activeVortices: VortexVisual[] = [];
    const pooledGraphics: Graphics[] = [];
    const pooledPulseGraphics: Graphics[] = [];

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

    const getOrCreatePulseGraphic = (): Graphics => {
        const pooled = pooledPulseGraphics.pop();
        if (pooled) {
            pooled.visible = true;
            return pooled;
        }

        const graphic = new Graphics();
        graphic.alpha = 0;
        container.addChild(graphic);
        return graphic;
    };

    const releaseGraphic = (graphic: Graphics, pool: Graphics[]): void => {
        graphic.visible = false;
        graphic.alpha = 0;
        graphic.clear();
        pool.push(graphic);
    };

    const drawVortex = (
        graphic: Graphics,
        pulseGraphic: Graphics,
        radius: number,
        rotation: number,
        alpha: number,
        pulsePhase: number,
    ): void => {
        graphic.clear();

        const spiralSegments = 32;
        const spiralTurns = 2;

        for (let i = 0; i < spiralSegments; i++) {
            const t = i / spiralSegments;
            const angle = t * Math.PI * 2 * spiralTurns + rotation;
            const r = radius * t;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            const segmentAlpha = alpha * (1 - t) * 0.6;

            if (i === 0) {
                graphic.moveTo(x, y);
            } else {
                graphic.lineTo(x, y);
            }

            graphic.stroke({ width: 3 * (1 - t * 0.5), color: vortexColor, alpha: segmentAlpha });
        }

        pulseGraphic.clear();
        const pulseRadius = radius * (0.3 + Math.sin(pulsePhase) * 0.15);
        pulseGraphic.circle(0, 0, pulseRadius);
        pulseGraphic.fill({ color: portalColor, alpha: alpha * 0.3 });
        pulseGraphic.circle(0, 0, pulseRadius * 0.6);
        pulseGraphic.fill({ color: vortexColor, alpha: alpha * 0.5 });
    };

    const update: VortexFieldEffect['update'] = ({ deltaSeconds, vortices }) => {
        for (let i = activeVortices.length - 1; i >= 0; i--) {
            const vortex = activeVortices[i];
            if (!vortex) continue;

            const matchingVortex = vortices.find(
                (v) => Math.abs(v.position.x - vortex.position.x) < 5 &&
                    Math.abs(v.position.y - vortex.position.y) < 5,
            );

            if (!matchingVortex || matchingVortex.remainingSeconds <= 0) {
                vortex.alpha -= deltaSeconds * 2;
                if (vortex.alpha <= 0) {
                    releaseGraphic(vortex.graphic, pooledGraphics);
                    releaseGraphic(vortex.pulseGraphic, pooledPulseGraphics);
                    activeVortices.splice(i, 1);
                    continue;
                }
            } else {
                const normalizedLife = matchingVortex.remainingSeconds / 6;
                vortex.alpha = Math.min(1, normalizedLife);
            }

            vortex.rotation += ROTATION_SPEED * deltaSeconds;
            vortex.pulsePhase += PULSE_SPEED * deltaSeconds;

            vortex.graphic.x = vortex.position.x;
            vortex.graphic.y = vortex.position.y;
            vortex.pulseGraphic.x = vortex.position.x;
            vortex.pulseGraphic.y = vortex.position.y;

            drawVortex(
                vortex.graphic,
                vortex.pulseGraphic,
                vortex.radius,
                vortex.rotation,
                vortex.alpha,
                vortex.pulsePhase,
            );
        }

        for (const vortexInstance of vortices) {
            const existing = activeVortices.find(
                (v) => Math.abs(v.position.x - vortexInstance.position.x) < 5 &&
                    Math.abs(v.position.y - vortexInstance.position.y) < 5,
            );

            if (!existing && vortexInstance.remainingSeconds > 0) {
                const graphic = getOrCreateGraphic();
                const pulseGraphic = getOrCreatePulseGraphic();
                const newVortex: VortexVisual = {
                    graphic,
                    pulseGraphic,
                    position: { x: vortexInstance.position.x, y: vortexInstance.position.y },
                    radius: vortexInstance.radius,
                    rotation: 0,
                    alpha: 1,
                    pulsePhase: 0,
                };
                activeVortices.push(newVortex);
            }
        }
    };

    const applyTheme: VortexFieldEffect['applyTheme'] = (theme) => {
        vortexColor = theme.vortexColor;
        portalColor = theme.portalColor;
    };

    const reset: VortexFieldEffect['reset'] = () => {
        for (const vortex of activeVortices) {
            releaseGraphic(vortex.graphic, pooledGraphics);
            releaseGraphic(vortex.pulseGraphic, pooledPulseGraphics);
        }
        activeVortices.length = 0;
    };

    const destroy: VortexFieldEffect['destroy'] = () => {
        reset();
        for (const graphic of pooledGraphics) {
            graphic.destroy();
        }
        for (const graphic of pooledPulseGraphics) {
            graphic.destroy();
        }
        pooledGraphics.length = 0;
        pooledPulseGraphics.length = 0;
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
