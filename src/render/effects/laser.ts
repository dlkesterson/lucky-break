import { Container, Graphics } from 'pixi.js';

export interface LaserEffectOptions {
    readonly playfieldTop?: number;
    readonly playfieldBottom?: number;
    readonly beamColor?: number;
    readonly hitColor?: number;
    readonly beamWidth?: number;
    readonly fadeDuration?: number;
}

export interface LaserBeamPayload {
    readonly origin: { readonly x: number; readonly y: number };
    readonly hitY: number;
    readonly hits: readonly { readonly x: number; readonly y: number }[];
}

export interface LaserFirePayload {
    readonly beams: readonly LaserBeamPayload[];
    readonly duration: number;
}

interface ActiveBeam {
    readonly graphics: Graphics;
    readonly hits: readonly Graphics[];
    remaining: number;
    readonly duration: number;
}

export interface LaserEffect {
    readonly container: Container;
    fire(payload: LaserFirePayload): void;
    update(deltaSeconds: number): void;
    destroy(): void;
}

const DEFAULT_BEAM_COLOR = 0xff4477;
const DEFAULT_HIT_COLOR = 0xffffff;
const DEFAULT_BEAM_WIDTH = 6;
const DEFAULT_FADE_DURATION = 0.18;

const clamp = (value: number, min: number, max: number): number => {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

export const createLaserEffect = ({
    playfieldTop = 0,
    playfieldBottom: playfieldBottom = 0,
    beamColor = DEFAULT_BEAM_COLOR,
    hitColor = DEFAULT_HIT_COLOR,
    beamWidth = DEFAULT_BEAM_WIDTH,
    fadeDuration = DEFAULT_FADE_DURATION,
}: LaserEffectOptions = {}): LaserEffect => {
    const container = new Container();
    container.eventMode = 'none';
    const activeBeams: ActiveBeam[] = [];

    const cleanupBeam = (beam: ActiveBeam) => {
        beam.graphics.removeFromParent();
        beam.graphics.destroy();
        beam.hits.forEach((graphic) => {
            graphic.removeFromParent();
            graphic.destroy();
        });
    };

    const drawBeam = ({ origin, hitY, hits }: LaserBeamPayload, duration: number) => {
        const graphics = new Graphics();
        const clampedOriginY = clamp(origin.y, playfieldTop, playfieldBottom);
        const clampedTargetY = clamp(hitY, playfieldTop, playfieldBottom);
        graphics.moveTo(origin.x, clampedOriginY);
        graphics.lineTo(origin.x, clampedTargetY);
        graphics.stroke({
            width: beamWidth,
            color: beamColor,
            alpha: 0.94,
        });

        const hitGraphics: Graphics[] = hits.map((impact) => {
            const circle = new Graphics();
            circle.circle(impact.x, impact.y, clamp(beamWidth * 0.75, 3, 10));
            circle.fill({ color: hitColor, alpha: 0.65 });
            return circle;
        });

        container.addChild(graphics);
        hitGraphics.forEach((graphic) => {
            container.addChild(graphic);
        });

        activeBeams.push({
            graphics,
            hits: hitGraphics,
            remaining: Math.max(fadeDuration, duration),
            duration: Math.max(fadeDuration, duration),
        });
    };

    const fire = ({ beams, duration }: LaserFirePayload) => {
        if (beams.length === 0) {
            return;
        }
        const safeDuration = Math.max(fadeDuration, duration);
        beams.forEach((beam) => drawBeam(beam, safeDuration));
    };

    const update = (deltaSeconds: number) => {
        const toRemove: ActiveBeam[] = [];
        activeBeams.forEach((beam) => {
            beam.remaining = Math.max(0, beam.remaining - deltaSeconds);
            const t = beam.duration <= 0 ? 0 : beam.remaining / beam.duration;
            const alpha = clamp(t, 0, 1);
            beam.graphics.alpha = alpha;
            beam.hits.forEach((graphic) => {
                graphic.alpha = alpha;
            });
            if (beam.remaining === 0) {
                toRemove.push(beam);
            }
        });
        if (toRemove.length > 0) {
            toRemove.forEach((beam) => {
                const index = activeBeams.indexOf(beam);
                if (index >= 0) {
                    activeBeams.splice(index, 1);
                }
                cleanupBeam(beam);
            });
        }
    };

    const destroy = () => {
        while (activeBeams.length > 0) {
            const beam = activeBeams.pop();
            if (!beam) {
                continue;
            }
            cleanupBeam(beam);
        }
        container.removeFromParent();
        container.destroy({ children: true });
    };

    return {
        container,
        fire,
        update,
        destroy,
    } satisfies LaserEffect;
};
