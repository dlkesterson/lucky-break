import { Filter } from 'pixi.js';
import { clampUnit } from 'util/math';

export interface HeatRippleOptions {
    readonly maxRipples?: number;
    readonly minDuration?: number;
    readonly maxDuration?: number;
    readonly minAmplitude?: number;
    readonly maxAmplitude?: number;
}

export interface HeatRippleSpawnOptions {
    readonly position: { readonly x: number; readonly y: number };
    readonly intensity: number;
    readonly startRadius: number;
    readonly endRadius: number;
}

interface RippleState {
    readonly id: number;
    readonly duration: number;
    elapsed: number;
    readonly centerX: number;
    readonly centerY: number;
    readonly startRadius: number;
    readonly endRadius: number;
    readonly maxAmplitude: number;
}

interface RippleUniforms {
    uRippleCount: number;
    uRipples: Float32Array;
    uRippleParams: Float32Array;
}

export interface HeatRippleEffect {
    readonly filter: Filter & { resources?: Record<string, unknown> };
    readonly spawnRipple: (options: HeatRippleSpawnOptions) => void;
    readonly update: (elapsedSeconds: number) => void;
    readonly clear: () => void;
    readonly destroy: () => void;
    readonly getActiveRippleCount: () => number;
}

const DEFAULT_OPTIONS: Required<HeatRippleOptions> = {
    maxRipples: 4,
    minDuration: 0.2,
    maxDuration: 0.6,
    minAmplitude: 0.01,
    maxAmplitude: 0.05,
};

let rippleId = 0;

const createUniformGroup = (maxRipples: number): RippleUniforms => ({
    uRippleCount: 0,
    uRipples: new Float32Array(maxRipples * 4),
    uRippleParams: new Float32Array(maxRipples * 4),
});

const updateUniformEntry = (uniforms: RippleUniforms, index: number, ripple: RippleState): void => {
    const offset = index * 4;
    const t = ripple.elapsed / ripple.duration;
    const amplitude = ripple.maxAmplitude * Math.max(0, 1 - t);
    const radius = ripple.startRadius + (ripple.endRadius - ripple.startRadius) * clampUnit(t);

    uniforms.uRipples[offset + 0] = ripple.centerX;
    uniforms.uRipples[offset + 1] = ripple.centerY;
    uniforms.uRipples[offset + 2] = radius;
    uniforms.uRipples[offset + 3] = amplitude;

    uniforms.uRippleParams[offset + 0] = ripple.startRadius;
    uniforms.uRippleParams[offset + 1] = ripple.endRadius;
    uniforms.uRippleParams[offset + 2] = ripple.elapsed;
    uniforms.uRippleParams[offset + 3] = ripple.duration;
};

const assignUniforms = (filter: Filter, uniforms: RippleUniforms) => {
    const resources = (filter.resources ??= {});
    resources.rippleUniforms = { uniforms };
};

const PASS_THROUGH_VERTEX = /* glsl */ `#version 300 es
in vec2 aVertexPosition;
in vec2 aTextureCoord;

uniform mat3 projectionMatrix;

out vec2 vTextureCoord;

void main(void) {
	vTextureCoord = aTextureCoord;
	vec3 position = projectionMatrix * vec3(aVertexPosition, 1.0);
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PASS_THROUGH_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;

uniform sampler2D uTexture;

in vec2 vTextureCoord;
out vec4 finalColor;

void main(void) {
	finalColor = texture(uTexture, vTextureCoord);
}
`;

export const createHeatRippleEffect = (options: HeatRippleOptions = {}): HeatRippleEffect => {
    const merged: Required<HeatRippleOptions> = {
        ...DEFAULT_OPTIONS,
        ...options,
    };

    const uniforms = createUniformGroup(Math.max(1, Math.floor(merged.maxRipples)));
    const filter = Filter.from({
        gl: {
            vertex: PASS_THROUGH_VERTEX,
            fragment: PASS_THROUGH_FRAGMENT,
        },
        resources: {},
    }) as HeatRippleEffect['filter'];
    filter.enabled = false;
    assignUniforms(filter, uniforms);

    const activeRipples: RippleState[] = [];
    const capacity = uniforms.uRipples.length / 4;

    const syncUniforms = () => {
        const count = activeRipples.length;
        uniforms.uRippleCount = count;

        for (let index = 0; index < count; index += 1) {
            updateUniformEntry(uniforms, index, activeRipples[index]);
        }

        if (count === 0) {
            filter.enabled = false;
        }
    };

    const spawnRipple: HeatRippleEffect['spawnRipple'] = ({
        position,
        intensity,
        startRadius,
        endRadius,
    }) => {
        const clampedIntensity = clampUnit(intensity);
        const amplitudeRange = merged.maxAmplitude - merged.minAmplitude;
        const durationRange = merged.maxDuration - merged.minDuration;

        const rippleDuration = merged.minDuration + durationRange * (1 - clampedIntensity);
        const rippleAmplitude = merged.minAmplitude + amplitudeRange * clampedIntensity;

        const nextRipple: RippleState = {
            id: ++rippleId,
            duration: Math.max(0.05, rippleDuration),
            elapsed: 0,
            centerX: clampUnit(position.x),
            centerY: clampUnit(position.y),
            startRadius: Math.max(0, startRadius),
            endRadius: Math.max(Math.max(0, startRadius), endRadius),
            maxAmplitude: Math.max(0, rippleAmplitude),
        };

        if (activeRipples.length >= capacity) {
            let replaceIndex = 0;
            let maxProgress = -Infinity;
            for (let index = 0; index < activeRipples.length; index += 1) {
                const ripple = activeRipples[index];
                const progress = ripple.duration <= 0 ? Number.POSITIVE_INFINITY : ripple.elapsed / ripple.duration;
                if (progress >= maxProgress) {
                    maxProgress = progress;
                    replaceIndex = index;
                }
            }
            activeRipples.splice(replaceIndex, 1);
        }

        activeRipples.push(nextRipple);
        filter.enabled = true;
        syncUniforms();
    };

    const update: HeatRippleEffect['update'] = (elapsedSeconds) => {
        if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
            return;
        }

        for (const ripple of activeRipples) {
            ripple.elapsed += elapsedSeconds;
        }

        let index = activeRipples.length;
        while (index--) {
            const ripple = activeRipples[index];
            if (ripple.elapsed >= ripple.duration) {
                activeRipples.splice(index, 1);
            }
        }

        if (activeRipples.length === 0) {
            uniforms.uRippleCount = 0;
            filter.enabled = false;
            return;
        }

        syncUniforms();
    };

    const clear: HeatRippleEffect['clear'] = () => {
        if (activeRipples.length === 0 && uniforms.uRippleCount === 0) {
            filter.enabled = false;
            return;
        }
        activeRipples.length = 0;
        uniforms.uRippleCount = 0;
        uniforms.uRipples.fill(0);
        uniforms.uRippleParams.fill(0);
        filter.enabled = false;
    };

    const destroy: HeatRippleEffect['destroy'] = () => {
        clear();
        filter.destroy();
    };

    const getActiveRippleCount: HeatRippleEffect['getActiveRippleCount'] = () => activeRipples.length;

    return {
        filter,
        spawnRipple,
        update,
        clear,
        destroy,
        getActiveRippleCount,
    };
};

export type { HeatRippleEffect as HeatRippleEffectHandle };
