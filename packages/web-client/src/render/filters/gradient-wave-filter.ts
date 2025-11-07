import { Filter } from 'pixi.js';

export interface GradientWaveFilterOptions {
    readonly speed?: number;
    readonly gridDensity?: number;
    readonly lineWidth?: number;
    readonly waveFrequency?: number;
    readonly waveAmplitude?: number;
    readonly opacity?: number;
}

interface GradientWaveUniforms {
    uTime: number;
    uGridDensity: number;
    uLineWidth: number;
    uWaveFrequency: number;
    uWaveAmplitude: number;
    uOpacity: number;
}

const vertexSource = /* glsl */`
    in vec2 aPosition;
    in vec2 aUV;

    uniform mat3 uProjectionMatrix;

    out vec2 vTextureCoord;

    void main(void) {
        vTextureCoord = aUV;
        gl_Position = vec4((uProjectionMatrix * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    }
`;

const fragmentSource = /* glsl */`
    precision mediump float;

    in vec2 vTextureCoord;
    uniform float uTime;
    uniform float uGridDensity;
    uniform float uLineWidth;
    uniform float uWaveFrequency;
    uniform float uWaveAmplitude;
    uniform float uOpacity;

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

        if (alpha <= 0.0) {
            discard;
        }

        gl_FragColor = vec4(color, alpha);
    }
`;

export class GradientWaveFilter extends Filter {
    private elapsed = 0;
    private speed: number;
    private readonly uniformsRef: GradientWaveUniforms;

    constructor(options: GradientWaveFilterOptions = {}) {
        const uniforms: GradientWaveUniforms = {
            uTime: 0,
            uGridDensity: options.gridDensity ?? 11,
            uLineWidth: options.lineWidth ?? 0.02,
            uWaveFrequency: options.waveFrequency ?? 7,
            uWaveAmplitude: options.waveAmplitude ?? 0.045,
            uOpacity: options.opacity ?? 0.9,
        };

        super({
            vertex: vertexSource,
            fragment: fragmentSource,
            uniforms,
        });

        this.speed = options.speed ?? 1;
        this.uniformsRef = this.uniforms as GradientWaveUniforms;
    }

    public setOpacity(opacity: number): void {
        this.uniformsRef.uOpacity = opacity;
    }

    public update(deltaSeconds: number): void {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
            return;
        }
        this.elapsed += deltaSeconds * this.speed;
        this.uniformsRef.uTime = this.elapsed;
    }
}
