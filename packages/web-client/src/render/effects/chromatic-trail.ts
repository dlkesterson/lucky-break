import { Container, Graphics } from 'pixi.js';
import type { BallTrailSource } from './ball-trails';
import { clampUnit, lerp } from 'util/math';

export interface ChromaticTrailPalette {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
}

export interface ChromaticTrailUpdatePayload {
    readonly deltaSeconds: number;
    readonly comboEnergy: number;
    readonly sources: readonly BallTrailSource[];
}

export interface ChromaticTrailEffectOptions {
    readonly enabled?: boolean;
    readonly maxPoints?: number;
    readonly fadeDuration?: number;
    readonly emissionThreshold?: number;
    readonly offsetScale?: number;
    readonly trackAllSources?: boolean;
}

export interface ChromaticTrailEffect {
    readonly container: Container;
    update(payload: ChromaticTrailUpdatePayload): void;
    configure(options: ChromaticTrailEffectOptions): void;
    applyPalette(palette: ChromaticTrailPalette): void;
    reset(): void;
    destroy(): void;
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
    lastDirX: number;
    lastDirY: number;
}

type ChannelKey = 'red' | 'green' | 'blue';

type ChannelBlueprint = Pick<ChannelState, 'key' | 'dirShift' | 'perpShift' | 'alphaScale'>;

const CHANNEL_BLUEPRINTS: readonly ChannelBlueprint[] = [
    { key: 'red', dirShift: 1.05, perpShift: 0.18, alphaScale: 0.56 },
    { key: 'green', dirShift: 0.16, perpShift: -0.32, alphaScale: 0.46 },
    { key: 'blue', dirShift: -0.98, perpShift: 0.12, alphaScale: 0.5 },
];

const DEFAULT_MAX_POINTS = 10;
const DEFAULT_FADE_DURATION = 0.36;
const DEFAULT_EMISSION_THRESHOLD = 0.12;
const DEFAULT_OFFSET_SCALE = 14;
const INACTIVE_FADE_ACCELERATION = 1.9;

const createChannelGraphic = (): Graphics => {
    const graphic = new Graphics();
    graphic.eventMode = 'none';
    graphic.blendMode = 'add';
    return graphic;
};

export const createChromaticTrailEffect = (
    palette: ChromaticTrailPalette,
    options: ChromaticTrailEffectOptions = {},
): ChromaticTrailEffect => {
    const container = new Container();
    container.eventMode = 'none';
    container.sortableChildren = false;
    container.visible = false;

    let enabled = options.enabled ?? true;
    let maxPoints = Math.max(4, Math.floor(options.maxPoints ?? DEFAULT_MAX_POINTS));
    let fadeDuration = Math.max(0.1, options.fadeDuration ?? DEFAULT_FADE_DURATION);
    let emissionThreshold = clampUnit(options.emissionThreshold ?? DEFAULT_EMISSION_THRESHOLD);
    let offsetScale = Math.max(2, options.offsetScale ?? DEFAULT_OFFSET_SCALE);
    let trackAllSources = Boolean(options.trackAllSources);

    let activePalette: ChromaticTrailPalette = { ...palette };

    const trails = new Map<number, TrailEntry>();

    const applyPaletteInternal = (next: ChromaticTrailPalette) => {
        activePalette = { ...next };
        trails.forEach((entry) => {
            entry.channels.forEach((channel) => {
                channel.color = activePalette[channel.key];
            });
        });
    };

    const createChannels = (): ChannelState[] => {
        return CHANNEL_BLUEPRINTS.map((blueprint) => {
            const graphic = createChannelGraphic();
            container.addChild(graphic);
            return {
                ...blueprint,
                graphic,
                color: activePalette[blueprint.key],
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
            return existing;
        }

        const entry: TrailEntry = {
            channels: createChannels(),
            points: [],
            radius: source.radius,
            active: true,
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
        if (!Number.isFinite(dirX) || Math.abs(dirX) < 0.0001 && Math.abs(dirY) < 0.0001) {
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
                // Keep additive layers faint so overlapping trails do not blow out to white.
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

    const update: ChromaticTrailEffect['update'] = ({ deltaSeconds, comboEnergy, sources }) => {
        const safeDelta = Math.max(0, deltaSeconds);
        trails.forEach((entry) => {
            entry.active = false;
        });

        const intensity = clampUnit(comboEnergy);
        const shouldEmit = enabled && intensity >= emissionThreshold;

        if (shouldEmit) {
            sources.forEach((source) => {
                if (!trackAllSources && !source.isPrimary) {
                    return;
                }
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

    const configure: ChromaticTrailEffect['configure'] = (config) => {
        if (config.enabled !== undefined) {
            enabled = Boolean(config.enabled);
            if (!enabled) {
                container.visible = false;
            }
        }
        if (config.maxPoints !== undefined) {
            const candidate = Math.max(4, Math.floor(config.maxPoints));
            maxPoints = Number.isFinite(candidate) ? candidate : maxPoints;
            trails.forEach((entry) => {
                if (entry.points.length > maxPoints) {
                    entry.points.length = maxPoints;
                }
            });
        }
        if (config.fadeDuration !== undefined) {
            const candidate = Math.max(0.1, config.fadeDuration);
            fadeDuration = Number.isFinite(candidate) ? candidate : fadeDuration;
        }
        if (config.emissionThreshold !== undefined) {
            emissionThreshold = clampUnit(config.emissionThreshold);
        }
        if (config.offsetScale !== undefined) {
            const candidate = Math.max(2, config.offsetScale);
            offsetScale = Number.isFinite(candidate) ? candidate : offsetScale;
        }
        if (config.trackAllSources !== undefined) {
            trackAllSources = Boolean(config.trackAllSources);
        }
    };

    const reset: ChromaticTrailEffect['reset'] = () => {
        trails.forEach((entry) => {
            entry.points.length = 0;
            entry.channels.forEach((channel) => channel.graphic.clear());
        });
        container.visible = false;
    };

    const destroy: ChromaticTrailEffect['destroy'] = () => {
        for (const id of Array.from(trails.keys())) {
            removeEntry(id);
        }
        trails.clear();
        container.removeChildren?.();
        container.destroy({ children: true });
    };

    applyPaletteInternal(activePalette);

    return {
        container,
        update,
        configure,
        applyPalette: applyPaletteInternal,
        reset,
        destroy,
    } satisfies ChromaticTrailEffect;
};
