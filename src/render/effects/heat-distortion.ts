import { Filter, defaultFilterVert } from 'pixi.js';

const clamp01 = (value: number): number => {
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
};

const lerp = (start: number, end: number, t: number): number => {
    return start + (end - start) * t;
};

export interface HeatDistortionSource {
    readonly position: { readonly x: number; readonly y: number };
    readonly intensity: number;
    readonly swirl: number;
}

export interface HeatDistortionUpdatePayload {
    readonly deltaSeconds: number;
    readonly comboEnergy: number;
    readonly sources: readonly HeatDistortionSource[];
}

export interface HeatDistortionEffect {
    readonly filter: Filter;
    update(payload: HeatDistortionUpdatePayload): void;
    destroy(): void;
}

export interface HeatDistortionOptions {
    readonly maxSources?: number;
    readonly baseStrength?: number;
    readonly strengthScale?: number;
    readonly comboContribution?: number;
    readonly responsiveness?: number;
    readonly padding?: number;
}

interface DistortionUniformGroup {
    uniforms: {
        uSourceCount: number;
        uStrength: number;
        uTime: number;
        uSources: Float32Array;
    };
    update(): void;
}

const DEFAULT_MAX_SOURCES = 4;
const DEFAULT_BASE_STRENGTH = 0.0025;
const DEFAULT_STRENGTH_SCALE = 0.026;
const DEFAULT_COMBO_CONTRIBUTION = 0.015;
const DEFAULT_RESPONSIVENESS = 4.5;
const DEFAULT_PADDING = 36;

const createFragmentSource = (maxSources: number): string => `
    in vec2 vTextureCoord;
    out vec4 finalColor;

    uniform sampler2D uTexture;
    uniform float uSourceCount;
    uniform vec4 uSources[${maxSources}];
    uniform float uStrength;
    uniform float uTime;
    uniform vec4 uInputClamp;

    vec2 accumulateDistortion(vec2 uv) {
        vec2 total = vec2(0.0);
        for (int index = 0; index < ${maxSources}; index++) {
            if (float(index) >= uSourceCount) {
                break;
            }
            vec4 data = uSources[index];
            vec2 center = data.xy;
            float energy = data.z;
            float swirl = data.w;
            vec2 delta = uv - center;
            float distance = length(delta);
            float envelope = exp(-distance * (18.0 + energy * 24.0));
            float wave = sin(distance * (32.0 + energy * 56.0) - uTime * swirl);
            vec2 direction = normalize(delta + 0.0001);
            total += direction * envelope * wave * energy;
        }
        return total;
    }

    void main(void) {
        vec2 offset = accumulateDistortion(vTextureCoord) * uStrength;
        vec2 samplePoint = clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw);
        finalColor = texture(uTexture, samplePoint);
    }
`;

export const createHeatDistortionEffect = (options: HeatDistortionOptions = {}): HeatDistortionEffect => {
    const maxSources = Math.max(1, Math.floor(options.maxSources ?? DEFAULT_MAX_SOURCES));
    const baseStrength = Math.max(0, options.baseStrength ?? DEFAULT_BASE_STRENGTH);
    const strengthScale = Math.max(0, options.strengthScale ?? DEFAULT_STRENGTH_SCALE);
    const comboContribution = Math.max(0, options.comboContribution ?? DEFAULT_COMBO_CONTRIBUTION);
    const responsiveness = Math.max(0.1, options.responsiveness ?? DEFAULT_RESPONSIVENESS);
    const padding = Math.max(0, options.padding ?? DEFAULT_PADDING);

    const filter = Filter.from({
        gl: {
            vertex: defaultFilterVert,
            fragment: createFragmentSource(maxSources),
            name: 'heat-distortion-filter',
        },
        resources: {
            distortionUniforms: {
                uSourceCount: { value: 0, type: 'f32' },
                uStrength: { value: 0, type: 'f32' },
                uTime: { value: 0, type: 'f32' },
                uSources: { value: new Float32Array(maxSources * 4), type: 'vec4<f32>', size: maxSources },
            },
        },
        padding,
        resolution: 'inherit',
        antialias: 'inherit',
    });

    const uniformGroup = filter.resources.distortionUniforms as DistortionUniformGroup | undefined;
    if (!uniformGroup) {
        throw new Error('Heat distortion filter missing uniform group.');
    }

    let elapsedTime = 0;
    let currentStrength = 0;
    const tempBuffer = uniformGroup.uniforms.uSources;

    const update = ({ deltaSeconds, comboEnergy, sources }: HeatDistortionUpdatePayload): void => {
        const safeDelta = Math.max(0, deltaSeconds);
        elapsedTime += safeDelta;
        if (elapsedTime > 512) {
            elapsedTime -= 512;
        }
        const uniforms = uniformGroup.uniforms;
        uniforms.uTime = elapsedTime;

        const boundedSources = Math.min(maxSources, Math.max(0, Math.floor(sources.length)));
        uniforms.uSourceCount = boundedSources;

        let aggregatedIntensity = 0;
        if (boundedSources > 0) {
            for (let index = 0; index < maxSources; index++) {
                const offset = index * 4;
                if (index < boundedSources) {
                    const source = sources[index];
                    const clampedX = clamp01(source.position.x);
                    const clampedY = clamp01(source.position.y);
                    const intensity = clamp01(source.intensity);
                    const swirl = Math.max(0.5, source.swirl);
                    tempBuffer[offset] = clampedX;
                    tempBuffer[offset + 1] = clampedY;
                    tempBuffer[offset + 2] = intensity;
                    tempBuffer[offset + 3] = swirl;
                    aggregatedIntensity = Math.max(aggregatedIntensity, intensity);
                } else {
                    tempBuffer[offset] = 0;
                    tempBuffer[offset + 1] = 0;
                    tempBuffer[offset + 2] = 0;
                    tempBuffer[offset + 3] = 0;
                }
            }
        } else if (tempBuffer.length > 0) {
            tempBuffer.fill(0);
        }

        const comboInfluence = clamp01(comboEnergy) * comboContribution;
        const targetStrength = boundedSources > 0
            ? baseStrength + aggregatedIntensity * strengthScale + comboInfluence
            : 0;
        const blend = clamp01(safeDelta * responsiveness);
        currentStrength = lerp(currentStrength, targetStrength, blend);

        uniforms.uStrength = currentStrength;
        uniformGroup.update();

        filter.enabled = currentStrength > 0.001 && boundedSources > 0;
    };

    const destroy = (): void => {
        filter.destroy();
    };

    return {
        filter,
        update,
        destroy,
    } satisfies HeatDistortionEffect;
};
