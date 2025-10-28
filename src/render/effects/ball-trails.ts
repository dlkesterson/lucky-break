import { Container, Graphics } from 'pixi.js';
import { mixColors } from 'render/playfield-visuals';
import { clampUnit, lerp } from 'util/math';

export interface BallTrailSource {
    readonly id: number;
    readonly position: { readonly x: number; readonly y: number };
    readonly radius: number;
    readonly normalizedSpeed: number;
    readonly isPrimary: boolean;
}

export interface BallTrailTheme {
    readonly coreColor: number;
    readonly auraColor: number;
    readonly accentColor: number;
}

export interface BallTrailEffect {
    readonly container: Container;
    update(payload: {
        readonly deltaSeconds: number;
        readonly comboEnergy: number;
        readonly sources: readonly BallTrailSource[];
    }): void;
    applyTheme(theme: BallTrailTheme): void;
    configure(options: BallTrailEffectOptions): void;
    reset(): void;
    destroy(): void;
}

export interface BallTrailEffectOptions {
    readonly maxPoints?: number;
    readonly fadeDuration?: number;
    readonly enabled?: boolean;
}

interface TrailPoint {
    x: number;
    y: number;
    age: number;
}

interface TrailEntry {
    readonly graphic: Graphics;
    points: TrailPoint[];
    latestSpeed: number;
    isPrimary: boolean;
    radius: number;
    active: boolean;
}

const DEFAULT_MAX_POINTS = 28;
const DEFAULT_FADE_DURATION = 0.65;
const INACTIVE_FADE_ACCELERATION = 1.4;

const createTrailGraphic = (): Graphics => {
    const graphic = new Graphics();
    graphic.eventMode = 'none';
    graphic.blendMode = 'add';
    return graphic;
};

export const createBallTrailsEffect = (theme: BallTrailTheme): BallTrailEffect => {
    const container = new Container();
    container.eventMode = 'none';
    container.sortableChildren = false;

    const trails = new Map<number, TrailEntry>();
    let activeTheme: BallTrailTheme = { ...theme };
    let maxPoints = DEFAULT_MAX_POINTS;
    let fadeDuration = DEFAULT_FADE_DURATION;
    let enabled = true;

    const ensureEntry = (source: BallTrailSource): TrailEntry => {
        const current = trails.get(source.id);
        if (current) {
            current.active = true;
            current.isPrimary = source.isPrimary;
            current.radius = source.radius;
            current.latestSpeed = source.normalizedSpeed;
            return current;
        }

        const graphic = createTrailGraphic();
        container.addChild(graphic);
        const entry: TrailEntry = {
            graphic,
            points: [],
            latestSpeed: source.normalizedSpeed,
            isPrimary: source.isPrimary,
            radius: source.radius,
            active: true,
        };
        trails.set(source.id, entry);
        return entry;
    };

    const pushPoint = (entry: TrailEntry, position: { x: number; y: number }) => {
        const head = entry.points[0];
        const minSpacing = Math.max(1.75, entry.radius * 0.28);
        if (head) {
            const dx = head.x - position.x;
            const dy = head.y - position.y;
            if (dx * dx + dy * dy < minSpacing * minSpacing) {
                head.age = 0;
                head.x = position.x;
                head.y = position.y;
                return;
            }
        }

        entry.points.unshift({ x: position.x, y: position.y, age: 0 });
        if (entry.points.length > maxPoints) {
            entry.points.length = maxPoints;
        }
    };

    const drawTrail = (entry: TrailEntry, comboEnergy: number) => {
        const { graphic, points } = entry;
        if (points.length < 2) {
            graphic.clear();
            return;
        }

        const speedFactor = clampUnit(entry.latestSpeed);
        const comboFactor = clampUnit(comboEnergy);
        const headAlpha = clampUnit(0.25 + speedFactor * 0.55 + comboFactor * 0.25 + (entry.isPrimary ? 0.1 : 0));
        const tailAlpha = headAlpha * 0.35;
        const baseWidth = Math.max(1.5, entry.radius * (entry.isPrimary ? 0.7 : 0.55));
        const headColor = mixColors(activeTheme.accentColor, activeTheme.coreColor, entry.isPrimary ? 0.3 : 0.5);
        const tailColor = mixColors(headColor, activeTheme.auraColor, 0.55);

        graphic.clear();
        for (let index = 1; index < points.length; index += 1) {
            const from = points[index];
            const to = points[index - 1];
            const t = points.length <= 1 ? 1 : 1 - index / (points.length - 1);
            const ageFactor = clampUnit(1 - to.age / fadeDuration);
            const width = lerp(baseWidth * 0.4, baseWidth, t);
            const alpha = clampUnit(lerp(tailAlpha, headAlpha, t) * ageFactor);
            if (alpha <= 0.01) {
                continue;
            }
            const color = mixColors(tailColor, headColor, clampUnit(t));
            graphic.moveTo(from.x, from.y);
            graphic.lineTo(to.x, to.y);
            graphic.stroke({ color, width, alpha });
        }
    };

    const removeEntry = (id: number) => {
        const entry = trails.get(id);
        if (!entry) {
            return;
        }
        if (entry.graphic.parent) {
            entry.graphic.parent.removeChild(entry.graphic);
        }
        entry.graphic.destroy();
        trails.delete(id);
    };

    const update: BallTrailEffect['update'] = ({ deltaSeconds, comboEnergy, sources }) => {
        trails.forEach((entry) => {
            entry.active = false;
        });

        if (enabled) {
            sources.forEach((source) => {
                const entry = ensureEntry(source);
                pushPoint(entry, source.position);
            });
        }

        trails.forEach((entry, id) => {
            const fadeAcceleration = entry.active ? 1 : INACTIVE_FADE_ACCELERATION;
            entry.points.forEach((point) => {
                point.age += deltaSeconds * fadeAcceleration;
            });
            entry.points = entry.points.filter((point) => point.age <= fadeDuration);

            if (!entry.active && entry.points.length === 0) {
                removeEntry(id);
                return;
            }

            drawTrail(entry, comboEnergy);
        });
    };

    const applyTheme: BallTrailEffect['applyTheme'] = (nextTheme) => {
        activeTheme = { ...nextTheme };
        trails.forEach((entry) => entry.graphic.clear());
    };

    const configure: BallTrailEffect['configure'] = (options) => {
        if (options.maxPoints !== undefined) {
            const candidate = Math.max(4, Math.floor(options.maxPoints));
            maxPoints = Number.isFinite(candidate) ? candidate : maxPoints;
            trails.forEach((entry) => {
                if (entry.points.length > maxPoints) {
                    entry.points.length = maxPoints;
                }
            });
        }
        if (options.fadeDuration !== undefined) {
            const candidate = Math.max(0.1, options.fadeDuration);
            fadeDuration = Number.isFinite(candidate) ? candidate : fadeDuration;
        }
        if (options.enabled !== undefined) {
            enabled = Boolean(options.enabled);
            if (!enabled) {
                trails.forEach((entry) => {
                    entry.active = false;
                });
            }
        }
    };

    const reset: BallTrailEffect['reset'] = () => {
        trails.forEach((entry) => {
            entry.points.length = 0;
            entry.graphic.clear();
            entry.active = false;
        });
    };

    const destroy: BallTrailEffect['destroy'] = () => {
        for (const id of Array.from(trails.keys())) {
            removeEntry(id);
        }
        trails.clear();
        container.removeChildren?.();
        container.destroy({ children: true });
    };

    return {
        container,
        update,
        applyTheme,
        configure,
        reset,
        destroy,
    };
};
