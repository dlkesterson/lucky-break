import { Container, Graphics } from 'pixi.js';
import { mixColors } from 'render/playfield-visuals';
import { clampUnit } from 'util/math';

export type AudioWaveKind = 'foreshadow' | 'sfx' | 'music';
export type AudioWaveAccent = 'schedule' | 'note' | 'cancel';

export interface AudioWaveBackdropOptions {
    readonly width: number;
    readonly height: number;
}

export interface AudioWaveBumpOptions {
    readonly intensity?: number;
    readonly accent?: AudioWaveAccent;
    readonly instrument?: 'melodic' | 'percussion';
}

export interface AudioWaveBackdrop {
    readonly container: Container;
    update(deltaSeconds: number): void;
    bump(kind: AudioWaveKind, options?: AudioWaveBumpOptions): void;
    setVisible(visible: boolean): void;
    destroy(): void;
}

interface WaveLayer {
    readonly baseline: number;
    readonly frequency: number;
    readonly speed: number;
    readonly baseColor: number;
    readonly weight: number;
    readonly baseAmplitude: number;
    readonly response: number;
    readonly decay: number;
    amplitude: number;
    targetAmplitude: number;
    phase: number;
    highlightTimer: number;
    highlightColor: number;
}

interface Spark {
    ttl: number;
    elapsed: number;
    color: number;
    strength: number;
}

const BASE_BACKGROUND_COLOR = 0x030914;
const FORESHADOW_COLOR = 0x46b4ff;
const FORESHADOW_SCHEDULE_COLOR = 0x7dd8ff;
const FORESHADOW_MELODIC_COLOR = 0x8bf9ff;
const FORESHADOW_PERCUSSION_COLOR = 0xffd997;
const FORESHADOW_CANCEL_COLOR = 0xff6b7a;
const SFX_COLOR = 0xff995f;
const SFX_HIGHLIGHT_COLOR = 0xffdb6e;
const MUSIC_COLOR = 0x8b7aff;
const MUSIC_HIGHLIGHT_COLOR = 0xafa2ff;

const clampIntensity = (value: number | undefined): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return clampUnit(value);
};

const resolveForeshadowHighlight = (
    accent: AudioWaveAccent,
    instrument: AudioWaveBumpOptions['instrument'],
): number => {
    if (accent === 'cancel') {
        return FORESHADOW_CANCEL_COLOR;
    }
    if (accent === 'schedule') {
        return FORESHADOW_SCHEDULE_COLOR;
    }
    if (instrument === 'percussion') {
        return FORESHADOW_PERCUSSION_COLOR;
    }
    return FORESHADOW_MELODIC_COLOR;
};

const resolveSfxHighlight = (accent: AudioWaveAccent): number => {
    if (accent === 'cancel') {
        return FORESHADOW_CANCEL_COLOR;
    }
    if (accent === 'schedule') {
        return SFX_HIGHLIGHT_COLOR;
    }
    return mixColors(SFX_HIGHLIGHT_COLOR, 0xffffff, 0.25);
};

const resolveMusicHighlight = (accent: AudioWaveAccent): number => {
    if (accent === 'cancel') {
        return FORESHADOW_CANCEL_COLOR;
    }
    if (accent === 'schedule') {
        return MUSIC_HIGHLIGHT_COLOR;
    }
    return mixColors(MUSIC_HIGHLIGHT_COLOR, 0xffffff, 0.2);
};

const SPARK_DURATION = 0.35;

export const createAudioWaveBackdrop = (options: AudioWaveBackdropOptions): AudioWaveBackdrop => {
    const width = Math.max(1, options.width);
    const height = Math.max(1, options.height);

    const container = new Container();
    container.label = 'audio-wave-backdrop';
    container.eventMode = 'none';
    container.sortableChildren = false;
    container.visible = false;
    container.zIndex = 1;

    const background = new Graphics();
    background.eventMode = 'none';
    const wavesGraphic = new Graphics();
    wavesGraphic.eventMode = 'none';

    container.addChild(background, wavesGraphic);

    const waves: WaveLayer[] = [
        {
            baseline: height * 0.28,
            frequency: 1.85,
            speed: 0.85,
            baseColor: FORESHADOW_COLOR,
            weight: 1.1,
            baseAmplitude: 0.06,
            response: 2.2,
            decay: 0.9,
            amplitude: 0.06,
            targetAmplitude: 0.06,
            phase: 0,
            highlightTimer: 0,
            highlightColor: FORESHADOW_MELODIC_COLOR,
        },
        {
            baseline: height * 0.5,
            frequency: 2.4,
            speed: 1.15,
            baseColor: SFX_COLOR,
            weight: 0.9,
            baseAmplitude: 0.05,
            response: 2.6,
            decay: 1.05,
            amplitude: 0.05,
            targetAmplitude: 0.05,
            phase: Math.PI / 2,
            highlightTimer: 0,
            highlightColor: SFX_HIGHLIGHT_COLOR,
        },
        {
            baseline: height * 0.72,
            frequency: 1.35,
            speed: 0.65,
            baseColor: MUSIC_COLOR,
            weight: 0.8,
            baseAmplitude: 0.04,
            response: 1.9,
            decay: 0.8,
            amplitude: 0.04,
            targetAmplitude: 0.04,
            phase: Math.PI,
            highlightTimer: 0,
            highlightColor: MUSIC_HIGHLIGHT_COLOR,
        },
    ];

    const sparks: Spark[] = [];

    let glowLevel = 0;
    let needsRedraw = true;

    const scheduleRedraw = () => {
        needsRedraw = true;
    };

    const drawBackground = () => {
        const alpha = 0.08 + glowLevel * 0.22;
        background.clear();
        background.rect(0, 0, width, height);
        background.fill({ color: BASE_BACKGROUND_COLOR, alpha });
    };

    const drawWaves = () => {
        wavesGraphic.clear();
        const stepCount = Math.max(16, Math.round(width / 32));

        waves.forEach((wave) => {
            const highlightRatio = clampUnit(wave.highlightTimer / 0.35);
            const color = highlightRatio > 0
                ? mixColors(wave.baseColor, wave.highlightColor, highlightRatio)
                : wave.baseColor;
            const amplitudePixels = wave.amplitude * height;
            if (amplitudePixels <= 0.5) {
                return;
            }

            wavesGraphic.moveTo(0, wave.baseline);
            for (let index = 0; index <= stepCount; index += 1) {
                const t = index / stepCount;
                const x = t * width;
                const angle = (t * wave.frequency + wave.phase) * Math.PI * 2;
                const y = wave.baseline + Math.sin(angle) * amplitudePixels;
                if (index === 0) {
                    wavesGraphic.moveTo(x, y);
                } else {
                    wavesGraphic.lineTo(x, y);
                }
            }
            wavesGraphic.stroke({ color, width: 2, alpha: 0.28 + wave.amplitude * 0.45 });
        });

        sparks.forEach((spark) => {
            const progress = clampUnit(spark.elapsed / spark.ttl);
            const radius = Math.max(width, height) * (0.15 + progress * 0.5);
            const alpha = spark.strength * (1 - progress) * 0.35;
            if (alpha <= 0.01) {
                return;
            }
            wavesGraphic.circle(width / 2, height / 2, radius);
            wavesGraphic.stroke({ color: spark.color, width: 3, alpha });
        });
    };

    const redraw = () => {
        drawBackground();
        drawWaves();
        needsRedraw = false;
    };

    const updateWaves = (deltaSeconds: number) => {
        let changed = false;
        waves.forEach((wave) => {
            wave.phase = (wave.phase + wave.speed * deltaSeconds) % (Math.PI * 2);
            const nextTarget = Math.max(wave.baseAmplitude, wave.targetAmplitude - wave.decay * deltaSeconds);
            if (Math.abs(nextTarget - wave.targetAmplitude) > 1e-4) {
                wave.targetAmplitude = nextTarget;
            }
            const delta = wave.targetAmplitude - wave.amplitude;
            if (Math.abs(delta) > 1e-4) {
                wave.amplitude += delta * Math.min(1, deltaSeconds * wave.response);
                changed = true;
            }
            if (wave.highlightTimer > 0) {
                wave.highlightTimer = Math.max(0, wave.highlightTimer - deltaSeconds);
                changed = true;
            }
        });
        if (changed) {
            scheduleRedraw();
        }
    };

    const updateSparks = (deltaSeconds: number) => {
        for (let index = sparks.length - 1; index >= 0; index -= 1) {
            const spark = sparks[index];
            spark.elapsed += deltaSeconds;
            if (spark.elapsed >= spark.ttl) {
                sparks.splice(index, 1);
                scheduleRedraw();
            }
        }
    };

    const updateGlow = (deltaSeconds: number) => {
        const previous = glowLevel;
        glowLevel = Math.max(0, glowLevel - deltaSeconds * 0.8);
        if (Math.abs(previous - glowLevel) > 1e-4) {
            scheduleRedraw();
        }
    };

    const pushSpark = (color: number, strength: number) => {
        sparks.push({ ttl: SPARK_DURATION, elapsed: 0, color, strength });
        scheduleRedraw();
    };

    const bump = (kind: AudioWaveKind, options: AudioWaveBumpOptions = {}) => {
        const intensity = clampIntensity(options.intensity ?? 0.6);
        if (intensity <= 0) {
            return;
        }

        let highlight: number;
        switch (kind) {
            case 'foreshadow':
                highlight = resolveForeshadowHighlight(options.accent ?? 'note', options.instrument);
                break;
            case 'sfx':
                highlight = resolveSfxHighlight(options.accent ?? 'note');
                break;
            case 'music':
                highlight = resolveMusicHighlight(options.accent ?? 'note');
                break;
            default:
                highlight = SFX_HIGHLIGHT_COLOR;
                break;
        }

        waves.forEach((wave) => {
            const weight = wave.weight;
            const boosted = wave.targetAmplitude + intensity * 0.4 * weight;
            wave.targetAmplitude = Math.min(0.5, boosted);
            wave.highlightColor = highlight;
            wave.highlightTimer = Math.max(wave.highlightTimer, 0.2 + intensity * 0.25);
        });

        glowLevel = clampUnit(glowLevel + intensity * 0.65);
        pushSpark(highlight, intensity);
    };

    const update = (deltaSeconds: number) => {
        if (deltaSeconds <= 0) {
            return;
        }
        updateWaves(deltaSeconds);
        updateGlow(deltaSeconds);
        updateSparks(deltaSeconds);
        if ((container.visible || glowLevel > 0.01 || sparks.length > 0) && needsRedraw) {
            redraw();
        }
    };

    const setVisible = (visible: boolean) => {
        if (container.visible === visible) {
            return;
        }
        container.visible = visible;
        if (visible) {
            scheduleRedraw();
            redraw();
        }
    };

    const destroy = () => {
        sparks.length = 0;
        wavesGraphic.destroy();
        background.destroy();
        container.destroy({ children: false });
    };

    return {
        container,
        update,
        bump,
        setVisible,
        destroy,
    } satisfies AudioWaveBackdrop;
};
