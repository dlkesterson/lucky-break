import { GlowFilter } from '@pixi/filter-glow';
import type { Filter } from 'pixi.js';
import { clampUnit, lerp } from 'util/math';

export interface ComboBloomOptions {
    readonly baseColor: number;
    readonly minStrength?: number;
    readonly maxStrength?: number;
    readonly responsiveness?: number;
    readonly distance?: number;
    readonly quality?: number;
}

export interface ComboBloomUpdatePayload {
    readonly comboEnergy: number;
    readonly deltaSeconds: number;
    readonly accentColor?: number;
}

export interface ComboBloomEffect {
    readonly filter: Filter;
    update(payload: ComboBloomUpdatePayload): void;
    applyTheme(color: number): void;
    destroy(): void;
}

const DEFAULT_MIN_STRENGTH = 0.18;
const DEFAULT_MAX_STRENGTH = 2.8;
const DEFAULT_RESPONSIVENESS = 5.5;
const DEFAULT_DISTANCE = 32;
const DEFAULT_QUALITY = 0.45;

export const createComboBloomEffect = (options: ComboBloomOptions): ComboBloomEffect => {
    const baseColor = options.baseColor;
    const minStrength = options.minStrength ?? DEFAULT_MIN_STRENGTH;
    const maxStrength = Math.max(minStrength, options.maxStrength ?? DEFAULT_MAX_STRENGTH);
    const responsiveness = Math.max(0.1, options.responsiveness ?? DEFAULT_RESPONSIVENESS);
    const distance = Math.max(0, options.distance ?? DEFAULT_DISTANCE);
    const quality = options.quality ?? DEFAULT_QUALITY;

    const glow = new GlowFilter({
        distance,
        outerStrength: minStrength,
        innerStrength: 0,
        color: baseColor,
        quality,
    });

    let currentStrength = minStrength;
    let targetStrength = minStrength;
    let themeColor = baseColor;

    const update = (payload: ComboBloomUpdatePayload): void => {
        const comboEnergy = clampUnit(payload.comboEnergy);
        if (payload.accentColor !== undefined && payload.accentColor !== themeColor) {
            themeColor = payload.accentColor;
            glow.color = themeColor;
        }

        const comboBias = comboEnergy ** 1.35;
        targetStrength = minStrength + (maxStrength - minStrength) * comboBias;
        const blend = clampUnit(payload.deltaSeconds * responsiveness);
        currentStrength = lerp(currentStrength, targetStrength, blend);
        const enabled = currentStrength > minStrength * 0.15;

        glow.outerStrength = currentStrength;
        glow.enabled = enabled;
    };

    const applyTheme = (color: number): void => {
        themeColor = color;
        glow.color = color;
    };

    const destroy = (): void => {
        glow.destroy();
    };

    return {
        filter: glow as unknown as Filter,
        update,
        applyTheme,
        destroy,
    } satisfies ComboBloomEffect;
};
