import type { Container } from 'pixi.js';

type Destructor = () => void;

interface MaybeDisposable {
    destroy?: () => void;
    dispose?: () => void;
}

type ContainerDestroyOptions = Parameters<Container['destroy']>[0];

const detachContainer = (container: Container) => {
    if (typeof container.removeFromParent === 'function') {
        container.removeFromParent();
    } else if (container.parent && typeof container.parent.removeChild === 'function') {
        container.parent.removeChild(container);
    }
};

const resolveDestructor = <T extends MaybeDisposable>(handle: T, disposer?: (handle: T) => void): Destructor | null => {
    if (typeof disposer === 'function') {
        return () => disposer(handle);
    }
    if (typeof handle?.destroy === 'function') {
        return () => handle.destroy!();
    }
    if (typeof handle?.dispose === 'function') {
        return () => handle.dispose!();
    }
    return null;
};

export interface TrackContainerOptions {
    readonly remove?: boolean;
    readonly destroy?: ContainerDestroyOptions;
}

export interface EffectRegistry {
    track<T extends MaybeDisposable>(handle: T, disposer?: (handle: T) => void): T;
    trackContainer<T extends Container>(container: T, options?: TrackContainerOptions): T;
    addDisposer(disposer: Destructor): void;
    disposeAll(): void;
    readonly size: number;
}

export const createEffectRegistry = (): EffectRegistry => {
    const disposers: Destructor[] = [];

    const registerDisposer = (disposer: Destructor | null) => {
        if (disposer) {
            disposers.push(disposer);
        }
    };

    const track: EffectRegistry['track'] = (handle, disposer) => {
        const resolved = resolveDestructor(handle, disposer);
        registerDisposer(resolved);
        return handle;
    };

    const trackContainer: EffectRegistry['trackContainer'] = (container, options = {}) => {
        const { remove = true, destroy } = options;
        const cleanup = () => {
            if (remove) {
                detachContainer(container);
            }
            if (destroy !== undefined && typeof container.destroy === 'function') {
                container.destroy(destroy as never);
            }
        };
        registerDisposer(cleanup);
        return container;
    };

    const addDisposer: EffectRegistry['addDisposer'] = (disposer) => {
        registerDisposer(typeof disposer === 'function' ? disposer : null);
    };

    const disposeAll: EffectRegistry['disposeAll'] = () => {
        while (disposers.length > 0) {
            const dispose = disposers.pop();
            if (!dispose) {
                continue;
            }
            try {
                dispose();
            } catch {
                // Swallow cleanup errors to avoid interrupting cascade.
            }
        }
    };

    return {
        track,
        trackContainer,
        addDisposer,
        disposeAll,
        get size() {
            return disposers.length;
        },
    } satisfies EffectRegistry;
};

export { createAudioWaveBackdrop } from './audio-waves';
export type { AudioWaveBackdrop, AudioWaveBackdropOptions, AudioWaveBumpOptions, AudioWaveKind } from './audio-waves';
export { createBallTrailsEffect } from './ball-trails';
export type { BallTrailEffect, BallTrailSource, BallTrailTheme, BallTrailEffectOptions } from './ball-trails';
export { createBrickParticleSystem } from './brick-particles';
export type { BrickParticleSystem, BrickParticleSystemOptions } from './brick-particles';
export { createComboBloomEffect } from './combo-bloom';
export type { ComboBloomEffect, ComboBloomOptions } from './combo-bloom';
export { createGambleHighlightEffect } from './gamble-highlight';
export type { GambleHighlightEffect } from './gamble-highlight';
export { createDynamicLight } from './dynamic-light';
export type { DynamicLight, DynamicLightOptions, DynamicLightUpdate } from './dynamic-light';
export { createHeatDistortionEffect } from './heat-distortion';
export type { HeatDistortionEffect, HeatDistortionOptions, HeatDistortionSource, HeatDistortionUpdatePayload } from './heat-distortion';
export { createHeatRippleEffect } from './heat-ripple';
export type { HeatRippleEffectHandle, HeatRippleOptions, HeatRippleSpawnOptions } from './heat-ripple';
export { createRoundCountdown } from './round-countdown';
export type { RoundCountdownDisplay } from './round-countdown';
export { createSpeedRing } from './speed-ring';
export type { SpeedRingHandle, SpeedRingOptions, SpeedRingPalette, SpeedRingUpdate } from './speed-ring';
export { createLaserEffect } from './laser';
export type { LaserEffect, LaserEffectOptions, LaserFirePayload, LaserBeamPayload } from './laser';
