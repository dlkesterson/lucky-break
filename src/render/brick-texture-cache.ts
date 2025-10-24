import { Graphics, Texture } from 'pixi.js';
import type { BrickForm } from 'util/levels';
import { computeBrickFillColor, paintBrickVisual, type BrickVisualOverrides } from './playfield-visuals';

export type { BrickVisualOverrides as BrickTextureOverrides };

export interface BrickTextureRequest {
    readonly baseColor: number;
    readonly maxHp: number;
    readonly currentHp: number;
    readonly width: number;
    readonly height: number;
    readonly form?: BrickForm;
    readonly override?: BrickVisualOverrides;
}

interface TextureRenderer {
    readonly generateTexture: (displayObject: Graphics) => Texture;
    readonly resolution?: number;
}

export interface BrickTextureCache {
    readonly get: (request: BrickTextureRequest) => Texture;
    readonly clear: () => void;
}

const clamp = (value: number, min: number, max: number): number => {
    if (value <= min) {
        return min;
    }
    if (value >= max) {
        return max;
    }
    return value;
};

const createCacheKey = ({ baseColor, maxHp, currentHp, width, height, form, override }: BrickTextureRequest): string => {
    const safeMaxHp = Math.max(1, Math.round(maxHp));
    const safeCurrentHp = clamp(Math.round(currentHp), 0, safeMaxHp);
    const resolvedForm: BrickForm = form ?? 'rectangle';
    const overrideKey = override
        ? [
            override.strokeColor ?? 'null',
            override.fillColor ?? 'null',
            override.useFlatFill ? 'flat' : 'grad',
        ].join(',')
        : '';
    return [baseColor, safeMaxHp, safeCurrentHp, width, height, resolvedForm, overrideKey].join(':');
};

export const createBrickTextureCache = (renderer: TextureRenderer): BrickTextureCache => {
    const textures = new Map<string, Texture>();

    const get = (request: BrickTextureRequest): Texture => {
        const key = createCacheKey(request);
        const cached = textures.get(key);
        if (cached) {
            return cached;
        }

        const safeMaxHp = Math.max(1, Math.round(request.maxHp));
        const safeCurrentHp = clamp(Math.round(request.currentHp), 0, safeMaxHp);
        const damageLevel = safeMaxHp > 0 ? 1 - safeCurrentHp / safeMaxHp : 0;
        const fillColor = computeBrickFillColor(request.baseColor, safeCurrentHp, safeMaxHp);

        const graphics = new Graphics();
        graphics.eventMode = 'none';
        const resolvedForm: BrickForm = request.form ?? 'rectangle';
        paintBrickVisual(graphics, request.width, request.height, fillColor, damageLevel, 1, resolvedForm, request.override);

        const texture = renderer.generateTexture(graphics);
        graphics.destroy();

        textures.set(key, texture);
        return texture;
    };

    const clear = () => {
        textures.forEach((texture) => {
            texture.destroy(true);
        });
        textures.clear();
    };

    return { get, clear } satisfies BrickTextureCache;
};
