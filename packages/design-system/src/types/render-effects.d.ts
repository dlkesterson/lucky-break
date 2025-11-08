declare module 'render/effects/chromatic-trail' {
    import type { Container } from 'pixi.js';

    export interface ChromaticTrailPalette {
        readonly red: number;
        readonly green: number;
        readonly blue: number;
    }

    export interface ChromaticTrailEffectOptions {
        readonly enabled?: boolean;
        readonly maxPoints?: number;
        readonly fadeDuration?: number;
        readonly emissionThreshold?: number;
        readonly offsetScale?: number;
        readonly trackAllSources?: boolean;
    }

    export interface ChromaticTrailUpdatePayload {
        readonly deltaSeconds: number;
        readonly comboEnergy: number;
        readonly sources: readonly {
            readonly id: number;
            readonly position: { readonly x: number; readonly y: number };
            readonly radius: number;
            readonly normalizedSpeed: number;
            readonly isPrimary: boolean;
        }[];
    }

    export interface ChromaticTrailEffect {
        readonly container: Container;
        update(payload: ChromaticTrailUpdatePayload): void;
        configure(options: ChromaticTrailEffectOptions): void;
        applyPalette(palette: ChromaticTrailPalette): void;
        reset(): void;
        destroy(): void;
    }

    export const createChromaticTrailEffect: (
        palette: ChromaticTrailPalette,
        options?: ChromaticTrailEffectOptions,
    ) => ChromaticTrailEffect;
}
