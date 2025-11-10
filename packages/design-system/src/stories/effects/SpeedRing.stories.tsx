import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import { createSpeedRing } from '@lucky-break/web-client/src/render/effects/speed-ring';
import {
  drawBallVisual,
  toColorNumber,
} from '@lucky-break/web-client/src/render/playfield-visuals';
import type { BallVisualDefaults } from '@lucky-break/web-client/src/render/playfield-visuals';

interface SpeedRingStoryProps {
  ballRadius: number;
  ballColor: string;
  ringColor: string;
  haloColor: string;
  minRadius: number;
  maxRadius: number;
  haloRadiusOffset: number;
  ringThickness: number;
  minAlpha: number;
  maxAlpha: number;
  activationSpeedMultiplier: number;
  radiusLerpSpeed: number;
  alphaLerpSpeed: number;
  speedMultiplier: number;
  enableChromaticHalo: boolean;
  chromaticRed: string;
  chromaticGreen: string;
  chromaticBlue: string;
  chromaticRotationSpeed: number;
  chromaticOffsetScale: number;
}

interface PreviewState {
  app: Application;
  ball: Graphics;
  speedRingHandle: ReturnType<typeof createSpeedRing>;
  ticker?: (ticker: { deltaMS: number }) => void;
}

const CANVAS_SIZE = 600;
const BASE_SPEED = 400;
const MAX_SPEED = 1200;

const SpeedRingPreview = ({
  ballRadius,
  ballColor,
  ringColor,
  haloColor,
  minRadius,
  maxRadius,
  haloRadiusOffset,
  ringThickness,
  minAlpha,
  maxAlpha,
  activationSpeedMultiplier,
  radiusLerpSpeed,
  alphaLerpSpeed,
  speedMultiplier,
  enableChromaticHalo,
  chromaticRed,
  chromaticGreen,
  chromaticBlue,
  chromaticRotationSpeed,
  chromaticOffsetScale,
}: SpeedRingStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({
    ballRadius,
    ballColor,
    ringColor,
    haloColor,
    minRadius,
    maxRadius,
    haloRadiusOffset,
    ringThickness,
    minAlpha,
    maxAlpha,
    activationSpeedMultiplier,
    radiusLerpSpeed,
    alphaLerpSpeed,
    speedMultiplier,
    enableChromaticHalo,
    chromaticRed,
    chromaticGreen,
    chromaticBlue,
    chromaticRotationSpeed,
    chromaticOffsetScale,
  });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = {
    ballRadius,
    ballColor,
    ringColor,
    haloColor,
    minRadius,
    maxRadius,
    haloRadiusOffset,
    ringThickness,
    minAlpha,
    maxAlpha,
    activationSpeedMultiplier,
    radiusLerpSpeed,
    alphaLerpSpeed,
    speedMultiplier,
    enableChromaticHalo,
    chromaticRed,
    chromaticGreen,
    chromaticBlue,
    chromaticRotationSpeed,
    chromaticOffsetScale,
  };

  useEffect(() => {
    const container = hostRef.current;
    if (!container) {
      return;
    }

    const app = new Application();
    let disposed = false;

    const setup = async () => {
      await app.init({
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        backgroundAlpha: 0,
        antialias: true,
        resolution: 1,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);
      app.stage.sortableChildren = true;

      const center = CANVAS_SIZE / 2;

      // Create speed ring effect
      const speedRingHandle = createSpeedRing({
        minRadius: propsRef.current.minRadius,
        maxRadius: propsRef.current.maxRadius,
        haloRadiusOffset: propsRef.current.haloRadiusOffset,
        ringThickness: propsRef.current.ringThickness,
        minAlpha: propsRef.current.minAlpha,
        maxAlpha: propsRef.current.maxAlpha,
        activationSpeedMultiplier: propsRef.current.activationSpeedMultiplier,
        radiusLerpSpeed: propsRef.current.radiusLerpSpeed,
        alphaLerpSpeed: propsRef.current.alphaLerpSpeed,
        enableChromaticHalo: propsRef.current.enableChromaticHalo,
        chromaticRotationSpeed: propsRef.current.chromaticRotationSpeed,
        chromaticOffsetScale: propsRef.current.chromaticOffsetScale,
        palette: {
          ringColor: toColorNumber(propsRef.current.ringColor),
          haloColor: toColorNumber(propsRef.current.haloColor),
          chromaticColors: propsRef.current.enableChromaticHalo
            ? [
                toColorNumber(propsRef.current.chromaticRed),
                toColorNumber(propsRef.current.chromaticGreen),
                toColorNumber(propsRef.current.chromaticBlue),
              ]
            : undefined,
        },
      });

      speedRingHandle.container.position.set(center, center);
      speedRingHandle.container.zIndex = 1;
      app.stage.addChild(speedRingHandle.container);

      // Create ball visual
      const ball = new Graphics();
      ball.eventMode = 'none';
      ball.position.set(center, center);
      ball.zIndex = 2;

      const ballColorNum = toColorNumber(propsRef.current.ballColor);
      const ballDefaults: BallVisualDefaults = {
        baseColor: ballColorNum,
        auraColor: ballColorNum,
        highlightColor: 0xffffff,
        baseAlpha: 0.85,
        rimAlpha: 0.45,
        innerAlpha: 0.35,
        innerScale: 0.5,
        shape: 'sphere',
      };

      drawBallVisual(ball, propsRef.current.ballRadius, ballDefaults, {
        baseColor: ballColorNum,
      });

      app.stage.addChild(ball);

      const previewState: PreviewState = {
        app,
        ball,
        speedRingHandle,
      };
      stateRef.current = previewState;

      // Animation ticker - simulate oscillating speed
      let elapsedTime = 0;
      const tick = (ticker: { deltaMS: number }) => {
        const deltaSeconds = Math.max(0.0001, ticker.deltaMS / 1000);
        elapsedTime += deltaSeconds;

        // Create smooth oscillating speed using sine wave
        const cycle = elapsedTime * propsRef.current.speedMultiplier * 0.5;
        const speedFactor = (Math.sin(cycle) + 1) * 0.5; // 0 to 1
        const currentSpeed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * speedFactor;

        speedRingHandle.update({
          position: { x: center, y: center },
          speed: currentSpeed,
          baseSpeed: BASE_SPEED,
          maxSpeed: MAX_SPEED,
          deltaSeconds,
        });
      };

      previewState.ticker = tick;
      app.ticker.add(tick);
    };

    void setup();

    return () => {
      disposed = true;
      const state = stateRef.current;
      stateRef.current = null;
      if (!state) {
        return;
      }
      if (state.ticker) {
        state.app.ticker.remove(state.ticker);
      }
      state.speedRingHandle.destroy();
      state.ball.destroy();
      state.app.destroy(true);
    };
  }, []);

  // Update visual properties when controls change
  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }

    // Update speed ring palette
    state.speedRingHandle.setPalette({
      ringColor: toColorNumber(propsRef.current.ringColor),
      haloColor: toColorNumber(propsRef.current.haloColor),
    });

    // Redraw ball with new color
    const ballColorNum = toColorNumber(propsRef.current.ballColor);
    const ballDefaults: BallVisualDefaults = {
      baseColor: ballColorNum,
      auraColor: ballColorNum,
      highlightColor: 0xffffff,
      baseAlpha: 0.85,
      rimAlpha: 0.45,
      innerAlpha: 0.35,
      innerScale: 0.5,
      shape: 'sphere',
    };

    drawBallVisual(state.ball, propsRef.current.ballRadius, ballDefaults, {
      baseColor: ballColorNum,
    });
  }, [ballRadius, ballColor, ringColor, haloColor]);

  return (
    <div
      ref={hostRef}
      style={{
        width: 'min(600px, 95vw)',
        height: 'min(600px, 95vw)',
        margin: '0 auto',
        borderRadius: '24px',
        background: 'radial-gradient(circle at center, rgba(8, 10, 18, 0.95), rgba(3, 4, 9, 1))',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};

const meta = {
  title: 'Effects/Speed Ring',
  component: SpeedRingPreview,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'Deep Space',
      values: [
        { name: 'Deep Space', value: '#01020a' },
        { name: 'Dark Void', value: '#0a0c14' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    ballRadius: {
      control: { type: 'range', min: 8, max: 20, step: 1 },
      description: 'Radius of the ball in pixels',
    },
    ballColor: {
      control: { type: 'color' },
      description: 'Color of the ball',
    },
    ringColor: {
      control: { type: 'color' },
      description: 'Color of the speed ring stroke',
    },
    haloColor: {
      control: { type: 'color' },
      description: 'Color of the speed ring halo glow',
    },
    minRadius: {
      control: { type: 'range', min: 10, max: 40, step: 1 },
      description: 'Minimum radius of the speed ring (at low speed)',
    },
    maxRadius: {
      control: { type: 'range', min: 20, max: 80, step: 1 },
      description: 'Maximum radius of the speed ring (at high speed)',
    },
    haloRadiusOffset: {
      control: { type: 'range', min: 0, max: 30, step: 1 },
      description: 'Additional radius for the halo glow beyond the ring',
    },
    ringThickness: {
      control: { type: 'range', min: 1, max: 8, step: 0.5 },
      description: 'Thickness of the ring stroke',
    },
    minAlpha: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
      description: 'Minimum opacity (at low speed)',
    },
    maxAlpha: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
      description: 'Maximum opacity (at high speed)',
    },
    activationSpeedMultiplier: {
      control: { type: 'range', min: 0.1, max: 1, step: 0.05 },
      description: 'Fraction of base speed where ring starts to activate',
    },
    radiusLerpSpeed: {
      control: { type: 'range', min: 1, max: 20, step: 0.5 },
      description: 'Speed of radius interpolation (higher = snappier)',
    },
    alphaLerpSpeed: {
      control: { type: 'range', min: 1, max: 20, step: 0.5 },
      description: 'Speed of alpha interpolation (higher = snappier)',
    },
    speedMultiplier: {
      control: { type: 'range', min: 0.1, max: 3, step: 0.1 },
      description: 'Speed of the animation cycle (for demo only)',
    },
    enableChromaticHalo: {
      control: { type: 'boolean' },
      description: 'Enable chromatic aberration effect on halo (RGB color separation)',
    },
    chromaticRed: {
      control: { type: 'color' },
      description: 'Red channel color for chromatic effect',
    },
    chromaticGreen: {
      control: { type: 'color' },
      description: 'Green channel color for chromatic effect',
    },
    chromaticBlue: {
      control: { type: 'color' },
      description: 'Blue channel color for chromatic effect',
    },
    chromaticRotationSpeed: {
      control: { type: 'range', min: 0, max: 10, step: 0.5 },
      description: 'Speed of chromatic channel rotation/movement',
    },
    chromaticOffsetScale: {
      control: { type: 'range', min: 0, max: 20, step: 1 },
      description: 'Scale of RGB channel offset distance',
    },
  },
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    ringColor: '#00d4ff',
    haloColor: '#0088ff',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 10,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 1,
    enableChromaticHalo: false,
    chromaticRed: '#ff0044',
    chromaticGreen: '#00ff88',
    chromaticBlue: '#0088ff',
    chromaticRotationSpeed: 2.5,
    chromaticOffsetScale: 8,
  },
} satisfies Meta<typeof SpeedRingPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    ringColor: '#00d4ff',
    haloColor: '#0088ff',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 10,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 1,
  },
};

export const SubtleRing: Story = {
  name: 'Subtle Speed Indicator',
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    ringColor: '#ffffff',
    haloColor: '#00d4ff',
    minRadius: 16,
    maxRadius: 26,
    haloRadiusOffset: 8,
    ringThickness: 2,
    minAlpha: 0,
    maxAlpha: 0.4,
    activationSpeedMultiplier: 0.7,
    radiusLerpSpeed: 8,
    alphaLerpSpeed: 10,
    speedMultiplier: 1,
  },
};

export const IntenseRing: Story = {
  name: 'Intense High-Speed Ring',
  args: {
    ballRadius: 12,
    ballColor: '#ff4400',
    ringColor: '#ffaa00',
    haloColor: '#ff6600',
    minRadius: 14,
    maxRadius: 38,
    haloRadiusOffset: 14,
    ringThickness: 4,
    minAlpha: 0,
    maxAlpha: 0.85,
    activationSpeedMultiplier: 0.5,
    radiusLerpSpeed: 12,
    alphaLerpSpeed: 14,
    speedMultiplier: 1,
  },
};

export const SlowAnimation: Story = {
  name: 'Slow Animation Cycle',
  args: {
    ballRadius: 12,
    ballColor: '#00ff88',
    ringColor: '#00ff88',
    haloColor: '#00ffdd',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 10,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 0.3,
  },
};

export const FastResponse: Story = {
  name: 'Fast Response (Snappy)',
  args: {
    ballRadius: 12,
    ballColor: '#ff00ff',
    ringColor: '#ff00ff',
    haloColor: '#ff88ff',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 10,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 18,
    alphaLerpSpeed: 20,
    speedMultiplier: 1.5,
  },
};

export const ThickRing: Story = {
  name: 'Thick Bold Ring',
  args: {
    ballRadius: 14,
    ballColor: '#ffdd00',
    ringColor: '#ffdd00',
    haloColor: '#ff9900',
    minRadius: 18,
    maxRadius: 34,
    haloRadiusOffset: 12,
    ringThickness: 6,
    minAlpha: 0.1,
    maxAlpha: 0.75,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 1,
  },
};

export const NoHalo: Story = {
  name: 'Ring Only (No Halo)',
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    ringColor: '#00d4ff',
    haloColor: '#00d4ff',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 0,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 1,
  },
};

export const EarlyActivation: Story = {
  name: 'Early Activation (Low Threshold)',
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    ringColor: '#00d4ff',
    haloColor: '#0088ff',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 10,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.3,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 1,
  },
};

export const ChromaticHalo: Story = {
  name: 'Chromatic Aberration Halo',
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    ringColor: '#00d4ff',
    haloColor: '#0088ff',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 10,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 1,
    enableChromaticHalo: true,
    chromaticRed: '#ff0044',
    chromaticGreen: '#00ff88',
    chromaticBlue: '#0088ff',
    chromaticRotationSpeed: 2.5,
    chromaticOffsetScale: 8,
  },
};

export const ChromaticIntense: Story = {
  name: 'Intense Chromatic (High Speed)',
  args: {
    ballRadius: 12,
    ballColor: '#ff4400',
    ringColor: '#ffaa00',
    haloColor: '#ff6600',
    minRadius: 14,
    maxRadius: 38,
    haloRadiusOffset: 14,
    ringThickness: 4,
    minAlpha: 0,
    maxAlpha: 0.85,
    activationSpeedMultiplier: 0.5,
    radiusLerpSpeed: 12,
    alphaLerpSpeed: 14,
    speedMultiplier: 1.5,
    enableChromaticHalo: true,
    chromaticRed: '#ff0000',
    chromaticGreen: '#ffff00',
    chromaticBlue: '#ff8800',
    chromaticRotationSpeed: 4,
    chromaticOffsetScale: 12,
  },
};

export const ChromaticSlow: Story = {
  name: 'Slow Chromatic Rotation',
  args: {
    ballRadius: 12,
    ballColor: '#ff00ff',
    ringColor: '#ff00ff',
    haloColor: '#ff88ff',
    minRadius: 14,
    maxRadius: 30,
    haloRadiusOffset: 10,
    ringThickness: 3,
    minAlpha: 0,
    maxAlpha: 0.65,
    activationSpeedMultiplier: 0.6,
    radiusLerpSpeed: 10,
    alphaLerpSpeed: 12,
    speedMultiplier: 0.5,
    enableChromaticHalo: true,
    chromaticRed: '#ff0088',
    chromaticGreen: '#00ff88',
    chromaticBlue: '#0088ff',
    chromaticRotationSpeed: 1,
    chromaticOffsetScale: 10,
  },
};
