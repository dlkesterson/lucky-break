import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import { createComboBloomEffect } from '@lucky-break/web-client/src/render/effects/combo-bloom';
import {
  drawBallVisual,
  toColorNumber,
} from '@lucky-break/web-client/src/render/playfield-visuals';
import type { BallVisualDefaults } from '@lucky-break/web-client/src/render/playfield-visuals';

interface ComboBloomStoryProps {
  ballRadius: number;
  ballColor: string;
  baseColor: string;
  accentColor: string;
  minStrength: number;
  maxStrength: number;
  responsiveness: number;
  distance: number;
  quality: number;
  comboSpeed: number;
  useAccentColor: boolean;
}

interface PreviewState {
  app: Application;
  ball: Graphics;
  comboBloom: ReturnType<typeof createComboBloomEffect>;
  ticker?: (ticker: { deltaMS: number }) => void;
}

const CANVAS_SIZE = 600;

const ComboBloomPreview = ({
  ballRadius,
  ballColor,
  baseColor,
  accentColor,
  minStrength,
  maxStrength,
  responsiveness,
  distance,
  quality,
  comboSpeed,
  useAccentColor,
}: ComboBloomStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({
    ballRadius,
    ballColor,
    baseColor,
    accentColor,
    minStrength,
    maxStrength,
    responsiveness,
    distance,
    quality,
    comboSpeed,
    useAccentColor,
  });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = {
    ballRadius,
    ballColor,
    baseColor,
    accentColor,
    minStrength,
    maxStrength,
    responsiveness,
    distance,
    quality,
    comboSpeed,
    useAccentColor,
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

      // Create ball visual
      const ball = new Graphics();
      ball.eventMode = 'none';
      ball.position.set(center, center);
      ball.zIndex = 1;

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

      // Create combo bloom effect
      const baseColorNum = toColorNumber(propsRef.current.baseColor);
      const comboBloom = createComboBloomEffect({
        baseColor: baseColorNum,
        minStrength: propsRef.current.minStrength,
        maxStrength: propsRef.current.maxStrength,
        responsiveness: propsRef.current.responsiveness,
        distance: propsRef.current.distance,
        quality: propsRef.current.quality,
      });

      ball.filters = [comboBloom.filter];
      app.stage.addChild(ball);

      const previewState: PreviewState = {
        app,
        ball,
        comboBloom,
      };
      stateRef.current = previewState;

      // Animation ticker - simulate oscillating combo energy
      let elapsedTime = 0;
      const tick = (ticker: { deltaMS: number }) => {
        const deltaSeconds = Math.max(0.0001, ticker.deltaMS / 1000);
        elapsedTime += deltaSeconds;

        // Create smooth oscillating combo energy using sine wave
        const cycle = elapsedTime * propsRef.current.comboSpeed * 0.5;
        const comboEnergy = (Math.sin(cycle) + 1) * 0.5; // 0 to 1

        const accentColorNum = propsRef.current.useAccentColor
          ? toColorNumber(propsRef.current.accentColor)
          : undefined;

        comboBloom.update({
          comboEnergy,
          deltaSeconds,
          accentColor: accentColorNum,
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
      state.ball.filters = null;
      state.comboBloom.destroy();
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

    // Apply new theme color
    const baseColorNum = toColorNumber(propsRef.current.baseColor);
    state.comboBloom.applyTheme(baseColorNum);

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
  }, [ballRadius, ballColor, baseColor]);

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
  title: 'Effects/Combo Bloom',
  component: ComboBloomPreview,
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
    baseColor: {
      control: { type: 'color' },
      description: 'Base color of the combo bloom glow',
    },
    accentColor: {
      control: { type: 'color' },
      description: 'Accent color when high combo energy (requires "Use Accent Color" enabled)',
    },
    minStrength: {
      control: { type: 'range', min: 0, max: 2, step: 0.05 },
      description: 'Minimum bloom strength (at zero combo energy)',
    },
    maxStrength: {
      control: { type: 'range', min: 0.5, max: 5, step: 0.1 },
      description: 'Maximum bloom strength (at full combo energy)',
    },
    responsiveness: {
      control: { type: 'range', min: 0.5, max: 15, step: 0.5 },
      description: 'Speed of bloom response to combo changes (higher = snappier)',
    },
    distance: {
      control: { type: 'range', min: 10, max: 60, step: 2 },
      description: 'Distance/radius of the glow effect',
    },
    quality: {
      control: { type: 'range', min: 0.1, max: 1, step: 0.05 },
      description: 'Quality of the glow filter (higher = smoother but more expensive)',
    },
    comboSpeed: {
      control: { type: 'range', min: 0.1, max: 3, step: 0.1 },
      description: 'Speed of the combo energy oscillation (for demo only)',
    },
    useAccentColor: {
      control: { type: 'boolean' },
      description: 'Whether to use accent color for high combo energy',
    },
  },
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    baseColor: '#00d4ff',
    accentColor: '#ff6600',
    minStrength: 0.18,
    maxStrength: 2.8,
    responsiveness: 5.5,
    distance: 32,
    quality: 0.45,
    comboSpeed: 1,
    useAccentColor: false,
  },
} satisfies Meta<typeof ComboBloomPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    baseColor: '#00d4ff',
    accentColor: '#ff6600',
    minStrength: 0.18,
    maxStrength: 2.8,
    responsiveness: 5.5,
    distance: 32,
    quality: 0.45,
    comboSpeed: 1,
    useAccentColor: false,
  },
};

export const SubtleBloom: Story = {
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    baseColor: '#00d4ff',
    accentColor: '#ff6600',
    minStrength: 0.1,
    maxStrength: 1.5,
    responsiveness: 4,
    distance: 24,
    quality: 0.4,
    comboSpeed: 1,
    useAccentColor: false,
  },
};

export const IntenseBloom: Story = {
  name: 'Intense High-Combo Bloom',
  args: {
    ballRadius: 12,
    ballColor: '#ff4400',
    baseColor: '#ff4400',
    accentColor: '#ffaa00',
    minStrength: 0.3,
    maxStrength: 4.2,
    responsiveness: 7,
    distance: 42,
    quality: 0.5,
    comboSpeed: 1,
    useAccentColor: false,
  },
};

export const WithAccentColor: Story = {
  name: 'With Accent Color Transition',
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    baseColor: '#00d4ff',
    accentColor: '#ff00ff',
    minStrength: 0.18,
    maxStrength: 2.8,
    responsiveness: 5.5,
    distance: 32,
    quality: 0.45,
    comboSpeed: 1,
    useAccentColor: true,
  },
};

export const FastResponse: Story = {
  name: 'Fast Response (Snappy)',
  args: {
    ballRadius: 12,
    ballColor: '#00ff88',
    baseColor: '#00ff88',
    accentColor: '#ff6600',
    minStrength: 0.18,
    maxStrength: 2.8,
    responsiveness: 12,
    distance: 32,
    quality: 0.45,
    comboSpeed: 1.5,
    useAccentColor: false,
  },
};

export const SlowAnimation: Story = {
  name: 'Slow Animation Cycle',
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    baseColor: '#00d4ff',
    accentColor: '#ff6600',
    minStrength: 0.18,
    maxStrength: 2.8,
    responsiveness: 5.5,
    distance: 32,
    quality: 0.45,
    comboSpeed: 0.3,
    useAccentColor: false,
  },
};

export const HighQuality: Story = {
  name: 'High Quality Render',
  args: {
    ballRadius: 12,
    ballColor: '#ffdd00',
    baseColor: '#ffdd00',
    accentColor: '#ff6600',
    minStrength: 0.2,
    maxStrength: 3.0,
    responsiveness: 5.5,
    distance: 38,
    quality: 0.8,
    comboSpeed: 1,
    useAccentColor: false,
  },
};

export const WideGlow: Story = {
  name: 'Wide Glow Radius',
  args: {
    ballRadius: 12,
    ballColor: '#ff00ff',
    baseColor: '#ff00ff',
    accentColor: '#00ffff',
    minStrength: 0.15,
    maxStrength: 2.5,
    responsiveness: 5.5,
    distance: 52,
    quality: 0.45,
    comboSpeed: 1,
    useAccentColor: false,
  },
};

export const TightGlow: Story = {
  name: 'Tight Glow Radius',
  args: {
    ballRadius: 12,
    ballColor: '#00d4ff',
    baseColor: '#00d4ff',
    accentColor: '#ff6600',
    minStrength: 0.2,
    maxStrength: 3.2,
    responsiveness: 5.5,
    distance: 18,
    quality: 0.45,
    comboSpeed: 1,
    useAccentColor: false,
  },
};

export const OrangeToYellow: Story = {
  name: 'Orange to Yellow Transition',
  args: {
    ballRadius: 14,
    ballColor: '#ff6600',
    baseColor: '#ff6600',
    accentColor: '#ffdd00',
    minStrength: 0.18,
    maxStrength: 2.8,
    responsiveness: 5.5,
    distance: 32,
    quality: 0.45,
    comboSpeed: 1,
    useAccentColor: true,
  },
};

export const BlueToRed: Story = {
  name: 'Blue to Red Transition',
  args: {
    ballRadius: 14,
    ballColor: '#0088ff',
    baseColor: '#0088ff',
    accentColor: '#ff0044',
    minStrength: 0.18,
    maxStrength: 2.8,
    responsiveness: 5.5,
    distance: 32,
    quality: 0.45,
    comboSpeed: 1,
    useAccentColor: true,
  },
};
