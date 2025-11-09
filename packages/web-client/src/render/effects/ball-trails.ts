import { Container, Graphics } from 'pixi.js';
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
    dirX: number;
    dirY: number;
    speed: number;
}

interface ChannelState {
    readonly key: ChannelKey;
    readonly dirShift: number;
    readonly perpShift: number;
    readonly alphaScale: number;
    readonly graphic: Graphics;
    color: number;
}

interface TrailEntry {
    readonly channels: ChannelState[];
    points: TrailPoint[];
    radius: number;
    active: boolean;
    isPrimary: boolean;
    lastDirX: number;
    lastDirY: number;
}

type ChannelKey = 'red' | 'green' | 'blue';

type ChannelBlueprint = Pick<ChannelState, 'key' | 'dirShift' | 'perpShift' | 'alphaScale'>;

const CHANNEL_BLUEPRINTS: readonly ChannelBlueprint[] = [
    { key: 'red', dirShift: 1.04, perpShift: 0.18, alphaScale: 0.58 },
    { key: 'green', dirShift: 0.16, perpShift: -0.3, alphaScale: 0.48 },
    { key: 'blue', dirShift: -0.96, perpShift: 0.12, alphaScale: 0.52 },
];

const DEFAULT_MAX_POINTS = 12;
const DEFAULT_FADE_DURATION = 0.44;
const DEFAULT_OFFSET_SCALE = 15;
const INACTIVE_FADE_ACCELERATION = 1.8;

const createChannelGraphic = (): Graphics => {
    const graphic = new Graphics();
    graphic.eventMode = 'none';
    graphic.blendMode = 'add';
    return graphic;
};

const rgbToHex = (rgb: { r: number; g: number; b: number }): number => {
    const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
    return (r << 16) | (g << 8) | b;
};

const hexToRgb = (hex: number): { r: number; g: number; b: number } => {
    return {
        r: (hex >> 16) & 0xff,
        g: (hex >> 8) & 0xff,
        b: hex & 0xff,
    };
};

const mixHexColors = (color1: number, color2: number, t: number): number => {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    return rgbToHex({
        r: lerp(rgb1.r, rgb2.r, t),
        g: lerp(rgb1.g, rgb2.g, t),
        b: lerp(rgb1.b, rgb2.b, t),
    });
};

export const createBallTrailsEffect = (theme: BallTrailTheme): BallTrailEffect => {
    const container = new Container();
    container.eventMode = 'none';
    container.sortableChildren = false;
    container.visible = false;

    let maxPoints = DEFAULT_MAX_POINTS;
    let fadeDuration = DEFAULT_FADE_DURATION;
    const offsetScale = DEFAULT_OFFSET_SCALE;
    let enabled = true;

    let activeTheme: BallTrailTheme = { ...theme };

    const trails = new Map<number, TrailEntry>();

    const applyThemeInternal = (next: BallTrailTheme) => {
        activeTheme = { ...next };
        // Convert theme colors to RGB channels
        const headColor = mixHexColors(activeTheme.accentColor, activeTheme.coreColor, 0.3);
        const rgb = hexToRgb(headColor);
        trails.forEach((entry) => {
            entry.channels.forEach((channel) => {
                if (channel.key === 'red') {
                    channel.color = rgbToHex({ r: rgb.r, g: 0, b: 0 });
                } else if (channel.key === 'green') {
                    channel.color = rgbToHex({ r: 0, g: rgb.g, b: 0 });
                } else {
                    channel.color = rgbToHex({ r: 0, g: 0, b: rgb.b });
                }
            });
        });
    };

    const createChannels = (): ChannelState[] => {
        const headColor = mixHexColors(activeTheme.accentColor, activeTheme.coreColor, 0.3);
        const rgb = hexToRgb(headColor);
        return CHANNEL_BLUEPRINTS.map((blueprint) => {
            const graphic = createChannelGraphic();
            container.addChild(graphic);
            let channelColor = 0;
            if (blueprint.key === 'red') {
                channelColor = rgbToHex({ r: rgb.r, g: 0, b: 0 });
            } else if (blueprint.key === 'green') {
                channelColor = rgbToHex({ r: 0, g: rgb.g, b: 0 });
            } else {
                channelColor = rgbToHex({ r: 0, g: 0, b: rgb.b });
            }
            return {
                ...blueprint,
                graphic,
                color: channelColor,
            } satisfies ChannelState;
        });
    };

    const removeEntry = (id: number) => {
        const entry = trails.get(id);
        if (!entry) {
            return;
        }
        entry.channels.forEach((channel) => {
            channel.graphic.clear();
            if (channel.graphic.parent) {
                channel.graphic.parent.removeChild(channel.graphic);
            }
            channel.graphic.destroy();
        });
        trails.delete(id);
    };

    const ensureEntry = (source: BallTrailSource): TrailEntry => {
        const existing = trails.get(source.id);
        if (existing) {
            existing.active = true;
            existing.radius = source.radius;
            existing.isPrimary = source.isPrimary;
            return existing;
        }

        const entry: TrailEntry = {
            channels: createChannels(),
            points: [],
            radius: source.radius,
            active: true,
            isPrimary: source.isPrimary,
            lastDirX: 1,
            lastDirY: 0,
        };
        trails.set(source.id, entry);
        return entry;
    };

    const pushPoint = (entry: TrailEntry, source: BallTrailSource) => {
        const head = entry.points[0];
        let dirX = entry.lastDirX;
        let dirY = entry.lastDirY;
        if (head) {
            const dx = source.position.x - head.x;
            const dy = source.position.y - head.y;
            const length = Math.hypot(dx, dy);
            if (length > 0.0001) {
                dirX = dx / length;
                dirY = dy / length;
            }
        }
        if (!Number.isFinite(dirX) || (Math.abs(dirX) < 0.0001 && Math.abs(dirY) < 0.0001)) {
            dirX = 1;
            dirY = 0;
        }
        entry.lastDirX = dirX;
        entry.lastDirY = dirY;

        entry.points.unshift({
            x: source.position.x,
            y: source.position.y,
            age: 0,
            dirX,
            dirY,
            speed: clampUnit(source.normalizedSpeed),
        });
        if (entry.points.length > maxPoints) {
            entry.points.length = maxPoints;
        }
    };

    const drawTrail = (entry: TrailEntry, comboEnergy: number) => {
        const points = entry.points;
        if (points.length < 2) {
            entry.channels.forEach((channel) => channel.graphic.clear());
            return;
        }

        const comboIntensity = clampUnit(comboEnergy);
        const radius = Math.max(1, entry.radius);
        const baseWidth = Math.max(1, radius * 0.42);
        const headRadiusBase = radius * (0.78 + comboIntensity * 0.72);

        entry.channels.forEach((channel) => channel.graphic.clear());

        for (let index = points.length - 1; index > 0; index -= 1) {
            const from = points[index];
            const to = points[index - 1];
            const ageFactor = clampUnit(1 - to.age / fadeDuration);
            const energy = clampUnit(comboIntensity * 0.5 + ageFactor * 0.3 + to.speed * 0.22);
            if (energy <= 0.01) {
                continue;
            }

            let dirX = to.dirX;
            let dirY = to.dirY;
            const magnitude = Math.hypot(dirX, dirY);
            if (magnitude <= 0.0001) {
                dirX = entry.lastDirX;
                dirY = entry.lastDirY;
            }
            if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) {
                dirX = 1;
                dirY = 0;
            }
            const perpX = -dirY;
            const perpY = dirX;

            const t = points.length <= 1 ? 1 : 1 - index / (points.length - 1);
            const width = lerp(baseWidth * 0.5, baseWidth, energy);
            const offsetMagnitude = offsetScale * (0.2 + t * 0.5) * energy;
            const alphaBase = 0.14 + energy * 0.22;

            entry.channels.forEach((channel) => {
                const dirOffset = offsetMagnitude * channel.dirShift;
                const perpOffset = offsetMagnitude * 0.45 * channel.perpShift;
                const offsetX = dirX * dirOffset + perpX * perpOffset;
                const offsetY = dirY * dirOffset + perpY * perpOffset;

                const startX = from.x - offsetX;
                const startY = from.y - offsetY;
                const endX = to.x - offsetX;
                const endY = to.y - offsetY;

                channel.graphic.moveTo(startX, startY);
                channel.graphic.lineTo(endX, endY);
                // Mirror runtime transparency so multiple stories do not bloom into solid white.
                const strokeAlpha = clampUnit(alphaBase * channel.alphaScale * (0.34 + energy * 0.28));
                channel.graphic.stroke({
                    color: channel.color,
                    width,
                    alpha: strokeAlpha,
                });

                const lobeDistance = radius * (0.62 + energy * 0.74) + offsetMagnitude * 0.2;
                const lobeCurl = radius * (0.12 + energy * 0.34);
                const ringWidth = Math.max(0.95, (radius * 0.22 + energy * radius * 0.32) * channel.alphaScale);
                const centers = [
                    { scale: 0.86, alpha: 0.45, dx: 0, dy: 0 },
                    {
                        scale: 0.64,
                        alpha: 0.32,
                        dx: dirX * lobeDistance + perpX * lobeCurl,
                        dy: dirY * lobeDistance + perpY * lobeCurl,
                    },
                    {
                        scale: 0.64,
                        alpha: 0.32,
                        dx: -dirX * lobeDistance + perpX * -lobeCurl,
                        dy: -dirY * lobeDistance + perpY * -lobeCurl,
                    },
                ] as const;

                centers.forEach((center) => {
                    const circleX = endX + center.dx;
                    const circleY = endY + center.dy;
                    channel.graphic.circle(circleX, circleY, headRadiusBase * center.scale);
                    channel.graphic.stroke({
                        color: channel.color,
                        width: ringWidth,
                        alpha: clampUnit(strokeAlpha * center.alpha * 0.8),
                    });
                });
            });
        }
    };

    const update: BallTrailEffect['update'] = ({ deltaSeconds, comboEnergy, sources }) => {
        const safeDelta = Math.max(0, deltaSeconds);
        trails.forEach((entry) => {
            entry.active = false;
        });

        if (enabled) {
            sources.forEach((source) => {
                const entry = ensureEntry(source);
                entry.radius = source.radius;
                pushPoint(entry, source);
            });
        }

        let anyVisible = false;
        trails.forEach((entry, id) => {
            const fadeAcceleration = entry.active ? 1 : INACTIVE_FADE_ACCELERATION;
            entry.points.forEach((point) => {
                point.age += safeDelta * fadeAcceleration;
            });
            entry.points = entry.points.filter((point) => point.age <= fadeDuration);
            if (entry.points.length === 0) {
                removeEntry(id);
                return;
            }
            drawTrail(entry, comboEnergy);
            anyVisible = true;
        });

        container.visible = enabled && anyVisible;
    };

    const applyTheme: BallTrailEffect['applyTheme'] = (nextTheme) => {
        applyThemeInternal(nextTheme);
    };

    const configure: BallTrailEffect['configure'] = (options) => {
        if (options.enabled !== undefined) {
            enabled = Boolean(options.enabled);
            if (!enabled) {
                container.visible = false;
            }
        }
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
    };

    const reset: BallTrailEffect['reset'] = () => {
        trails.forEach((entry) => {
            entry.points.length = 0;
            entry.channels.forEach((channel) => channel.graphic.clear());
        });
        container.visible = false;
    };

    const destroy: BallTrailEffect['destroy'] = () => {
        for (const id of Array.from(trails.keys())) {
            removeEntry(id);
        }
        trails.clear();
        container.removeChildren?.();
        container.destroy({ children: true });
    };

    applyThemeInternal(activeTheme);

    return {
        container,
        update,
        applyTheme,
        configure,
        reset,
        destroy,
    } satisfies BallTrailEffect;
};
