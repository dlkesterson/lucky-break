import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics, Sprite, Texture } from 'pixi.js';
import { GradientWaveFilter } from '@lucky-break/web-client/src/render/filters/gradient-wave-filter';

interface GravityWellStoryProps {
  radius: number;
  opacity: number;
  gridDensity: number;
  lineWidth: number;
  waveFrequency: number;
  waveAmplitude: number;
  speed: number;
  rimAlpha: number;
  rimWidth: number;
}

interface PreviewState {
  app: Application;
  waveContainer: Graphics;
  waveSprite: Sprite;
  maskGraphic: Graphics;
  waveFilter: GradientWaveFilter;
  rim: Graphics;
  ticker?: (ticker: { deltaMS: number }) => void;
}

const CANVAS_SIZE = 600;

const GravityWellPreview = ({
  radius,
  opacity,
  gridDensity,
  lineWidth,
  waveFrequency,
  waveAmplitude,
  speed,
  rimAlpha,
  rimWidth,
}: GravityWellStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({
    radius,
    opacity,
    gridDensity,
    lineWidth,
    waveFrequency,
    waveAmplitude,
    speed,
    rimAlpha,
    rimWidth,
  });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = {
    radius,
    opacity,
    gridDensity,
    lineWidth,
    waveFrequency,
    waveAmplitude,
    speed,
    rimAlpha,
    rimWidth,
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
      const currentRadius = propsRef.current.radius;

      const waveSprite = new Sprite(Texture.WHITE);
      waveSprite.anchor.set(0.5);
      waveSprite.position.set(0, 0);
      waveSprite.width = currentRadius * 2;
      waveSprite.height = currentRadius * 2;
      waveSprite.alpha = 1;
      waveSprite.eventMode = 'none';
      waveSprite.blendMode = 'add';

      const waveFilter = new GradientWaveFilter({
        opacity: propsRef.current.opacity,
        gridDensity: propsRef.current.gridDensity,
        lineWidth: propsRef.current.lineWidth,
        waveFrequency: propsRef.current.waveFrequency,
        waveAmplitude: propsRef.current.waveAmplitude,
        speed: propsRef.current.speed,
      });
      waveSprite.filters = [waveFilter];

      const maskGraphic = new Graphics();
      maskGraphic.circle(0, 0, currentRadius);
      maskGraphic.fill({ color: 0xffffff });

      const waveContainer = new Graphics();
      waveContainer.position.set(center, center);
      waveContainer.zIndex = 1;
      waveContainer.eventMode = 'none';
      waveContainer.addChild(waveSprite);
      waveContainer.addChild(maskGraphic);
      waveSprite.mask = maskGraphic;

      app.stage.addChild(waveContainer);

      const rim = new Graphics();
      rim.circle(0, 0, currentRadius);
      rim.stroke({
        color: 0x9fdcff,
        width: propsRef.current.rimWidth,
        alpha: propsRef.current.rimAlpha,
      });
      rim.position.set(center, center);
      rim.zIndex = 2;
      rim.eventMode = 'none';
      app.stage.addChild(rim);

      const previewState: PreviewState = {
        app,
        waveContainer,
        waveSprite,
        maskGraphic,
        waveFilter,
        rim,
      };
      stateRef.current = previewState;

      const tick = (ticker: { deltaMS: number }) => {
        const deltaSeconds = Math.max(0.0001, ticker.deltaMS / 1000);
        waveFilter.update(deltaSeconds);
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
      state.waveSprite.filters = null;
      state.waveFilter.destroy();
      state.maskGraphic.destroy();
      state.waveSprite.destroy();
      state.waveContainer.destroy();
      state.rim.destroy();
      state.app.destroy(true);
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }

    const currentRadius = propsRef.current.radius;

    state.waveSprite.width = currentRadius * 2;
    state.waveSprite.height = currentRadius * 2;

    state.maskGraphic.clear();
    state.maskGraphic.circle(0, 0, currentRadius);
    state.maskGraphic.fill({ color: 0xffffff });

    state.waveFilter.setOpacity(propsRef.current.opacity);

    state.rim.clear();
    state.rim.circle(0, 0, currentRadius);
    state.rim.stroke({
      color: 0x9fdcff,
      width: propsRef.current.rimWidth,
      alpha: propsRef.current.rimAlpha,
    });
  }, [radius, opacity, rimAlpha, rimWidth]);

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
  title: 'Effects/Gravity Well Hazard',
  component: GravityWellPreview,
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
    radius: {
      control: { type: 'range', min: 60, max: 260, step: 5 },
      description: 'Radius of the gravity well effect in pixels',
    },
    opacity: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
      description: 'Opacity of the gradient wave effect',
    },
    gridDensity: {
      control: { type: 'range', min: 5, max: 20, step: 1 },
      description: 'Density of the grid pattern',
    },
    lineWidth: {
      control: { type: 'range', min: 0.005, max: 0.05, step: 0.001 },
      description: 'Width of the grid lines',
    },
    waveFrequency: {
      control: { type: 'range', min: 3, max: 15, step: 0.5 },
      description: 'Frequency of the wave distortion',
    },
    waveAmplitude: {
      control: { type: 'range', min: 0, max: 0.12, step: 0.005 },
      description: 'Amplitude of the wave distortion',
    },
    speed: {
      control: { type: 'range', min: 0, max: 3, step: 0.1 },
      description: 'Animation speed multiplier',
    },
    rimAlpha: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
      description: 'Opacity of the rim circle',
    },
    rimWidth: {
      control: { type: 'range', min: 1, max: 8, step: 0.5 },
      description: 'Width of the rim stroke',
    },
  },
  args: {
    radius: 150,
    opacity: 0.9,
    gridDensity: 13,
    lineWidth: 0.018,
    waveFrequency: 8,
    waveAmplitude: 0.06,
    speed: 1.2,
    rimAlpha: 0.65,
    rimWidth: 4,
  },
} satisfies Meta<typeof GravityWellPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    radius: 150,
    opacity: 0.9,
    gridDensity: 13,
    lineWidth: 0.018,
    waveFrequency: 8,
    waveAmplitude: 0.06,
    speed: 1.2,
    rimAlpha: 0.65,
    rimWidth: 4,
  },
};

export const SmallWell: Story = {
  name: 'Small Gravity Well',
  args: {
    radius: 90,
    opacity: 0.85,
    gridDensity: 11,
    lineWidth: 0.022,
    waveFrequency: 7,
    waveAmplitude: 0.05,
    speed: 1.0,
    rimAlpha: 0.7,
    rimWidth: 3,
  },
};

export const LargeWell: Story = {
  name: 'Large Gravity Well',
  args: {
    radius: 220,
    opacity: 0.92,
    gridDensity: 15,
    lineWidth: 0.015,
    waveFrequency: 9,
    waveAmplitude: 0.07,
    speed: 1.5,
    rimAlpha: 0.6,
    rimWidth: 5,
  },
};

export const IntenseWell: Story = {
  name: 'Intense High-Loop',
  args: {
    radius: 180,
    opacity: 0.95,
    gridDensity: 16,
    lineWidth: 0.012,
    waveFrequency: 10,
    waveAmplitude: 0.08,
    speed: 2.0,
    rimAlpha: 0.8,
    rimWidth: 4.5,
  },
};

export const SubtleWell: Story = {
  name: 'Subtle Background Well',
  args: {
    radius: 140,
    opacity: 0.6,
    gridDensity: 10,
    lineWidth: 0.025,
    waveFrequency: 6,
    waveAmplitude: 0.04,
    speed: 0.8,
    rimAlpha: 0.4,
    rimWidth: 2.5,
  },
};

export const NoRim: Story = {
  name: 'No Rim Circle',
  args: {
    radius: 150,
    opacity: 0.9,
    gridDensity: 13,
    lineWidth: 0.018,
    waveFrequency: 8,
    waveAmplitude: 0.06,
    speed: 1.2,
    rimAlpha: 0,
    rimWidth: 0,
  },
};

export const StaticWave: Story = {
  name: 'Static (No Animation)',
  args: {
    radius: 150,
    opacity: 0.9,
    gridDensity: 13,
    lineWidth: 0.018,
    waveFrequency: 8,
    waveAmplitude: 0.06,
    speed: 0,
    rimAlpha: 0.65,
    rimWidth: 4,
  },
};
