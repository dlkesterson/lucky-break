import { Filter, GlProgram, defaultFilterVert } from 'pixi.js';
import type { UniformGroup } from 'pixi.js';

export interface GradientWaveFilterOptions {
    readonly speed?: number;
    readonly gridDensity?: number;
    readonly lineWidth?: number;
    readonly waveFrequency?: number;
    readonly waveAmplitude?: number;
    readonly opacity?: number;
}

type GradientWaveUniformDefinitions = {
    [K in keyof GradientWaveUniforms]: {
        value: number;
        type: 'f32';
    };
};

interface GradientWaveUniforms {
    uTime: number;
    uGridDensity: number;
    uLineWidth: number;
    uWaveFrequency: number;
    uWaveAmplitude: number;
    uOpacity: number;
}

type GradientWaveUniformGroup = UniformGroup<GradientWaveUniformDefinitions>;

const fragmentSource = /* glsl */`
    precision mediump float;

    in vec2 vTextureCoord;

    uniform float uTime;
    uniform float uGridDensity;
    uniform float uLineWidth;
    uniform float uWaveFrequency;
    uniform float uWaveAmplitude;
    uniform float uOpacity;

    out vec4 finalColor;

    const vec3 COLOR_LEFT = vec3(0.145, 0.557, 0.996);
    const vec3 COLOR_CENTER = vec3(0.988, 0.776, 0.369);
    const vec3 COLOR_RIGHT = vec3(0.318, 0.792, 0.961);

    vec3 sampleGradient(float x) {
        float edgeCenter = smoothstep(0.0, 1.0, x);
        vec3 leftToMid = mix(COLOR_LEFT, COLOR_CENTER, smoothstep(0.0, 0.5, edgeCenter));
        vec3 midToRight = mix(COLOR_CENTER, COLOR_RIGHT, smoothstep(0.5, 1.0, edgeCenter));
        float blend = smoothstep(0.25, 0.75, edgeCenter);
        return mix(leftToMid, midToRight, blend);
    }

    void main(void) {
        vec2 uv = vTextureCoord;

        vec2 warped = uv;
        float waveY = sin((uv.y * uWaveFrequency) + uTime);
        float waveX = cos((uv.x * (uWaveFrequency * 0.75)) + uTime * 0.7);
        warped.x += waveY * uWaveAmplitude;
        warped.y += waveX * (uWaveAmplitude * 0.7);

        vec2 grid = abs(fract(warped * uGridDensity) - 0.5);
        float cellDistance = min(grid.x, grid.y);

        float lineMask = 1.0 - smoothstep(uLineWidth, uLineWidth + 0.015, cellDistance);

        vec2 radial = uv - 0.5;
        float distanceFromCenter = length(radial);
        float circleMask = smoothstep(0.5, 0.3, distanceFromCenter);

        float glow = smoothstep(0.35, 0.0, distanceFromCenter);

        vec3 gradientColor = sampleGradient(clamp(uv.x, 0.0, 1.0));
        vec3 lineColor = gradientColor * (0.35 + lineMask * 0.65);
        vec3 glowColor = gradientColor * glow * 0.45;
        vec3 color = lineColor + glowColor;

        float alpha = circleMask * max(lineMask * 0.85, glow * 0.65) * uOpacity;

        finalColor = vec4(color, alpha);
    }
`;

export class GradientWaveFilter extends Filter {
    private elapsed = 0;
    private speed: number;
    private readonly uniformGroup: GradientWaveUniformGroup;
    private readonly uniformsRef: GradientWaveUniforms;

    constructor(options: GradientWaveFilterOptions = {}) {
        const uniformDefinitions: GradientWaveUniformDefinitions = {
            uTime: { value: 0, type: 'f32' },
            uGridDensity: { value: options.gridDensity ?? 11, type: 'f32' },
            uLineWidth: { value: options.lineWidth ?? 0.02, type: 'f32' },
            uWaveFrequency: { value: options.waveFrequency ?? 7, type: 'f32' },
            uWaveAmplitude: { value: options.waveAmplitude ?? 0.045, type: 'f32' },
            uOpacity: { value: options.opacity ?? 0.9, type: 'f32' },
        };

        super({
            glProgram: GlProgram.from({
                vertex: defaultFilterVert,
                fragment: fragmentSource,
                name: 'gradient-wave-filter',
            }),
            resources: {
                gradientUniforms: uniformDefinitions,
            },
            resolution: 'inherit',
            antialias: 'inherit',
        });

        this.speed = options.speed ?? 1;
        const resourceBag = this.resources as { gradientUniforms?: GradientWaveUniformGroup };
        const uniformGroup = resourceBag.gradientUniforms;
        if (!uniformGroup) {
            throw new Error('GradientWaveFilter is missing its uniform group.');
        }
        this.uniformGroup = uniformGroup;
        this.uniformsRef = uniformGroup.uniforms;
        this.uniformGroup.update();
    }

    public setOpacity(opacity: number): void {
        this.uniformsRef.uOpacity = opacity;
        this.uniformGroup.update();
    }

    public update(deltaSeconds: number): void {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
            return;
        }
        this.elapsed += deltaSeconds * this.speed;
        this.uniformsRef.uTime = this.elapsed;
        this.uniformGroup.update();
    }
}
