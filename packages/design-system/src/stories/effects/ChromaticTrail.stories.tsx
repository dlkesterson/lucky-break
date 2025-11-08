import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import {
  createStoryChromaticTrailEffect,
  type ChromaticTrailEffect,
  type ChromaticTrailPalette,
  type TrailSource,
} from './chromatic-trail-effect';

interface ChromaticTrailStoryProps {
  comboEnergy: number;
  loopSpeed: number;
  radius: number;
  followerLag: number;
  activeSources: number;
}

interface PreviewState {
  app: Application;
  effect: ChromaticTrailEffect;
  sources: TrailSource[];
  time: number;
  sourceStates: SourceState[];
  ballOverlay: Graphics;
  ticker?: (ticker: { deltaMS: number }) => void;
}

const CANVAS_SIZE = 460;

interface SourceBlueprint {
  readonly id: number;
  readonly trailRadius: number;
  readonly visualRadius: number;
  readonly color: number;
  readonly alpha: number;
  readonly isPrimary: boolean;
}

interface SourceState {
  readonly blueprint: SourceBlueprint;
  readonly graphic: Graphics;
  prevPosition: { x: number; y: number };
}

const SOURCE_BLUEPRINTS: readonly SourceBlueprint[] = [
  { id: 1, trailRadius: 13, visualRadius: 12, color: 0xffffff, alpha: 0.34, isPrimary: true },
  { id: 2, trailRadius: 9.5, visualRadius: 9, color: 0xc5d8ff, alpha: 0.26, isPrimary: false },
  { id: 3, trailRadius: 7.2, visualRadius: 7, color: 0xffd8cc, alpha: 0.24, isPrimary: false },
  { id: 4, trailRadius: 6, visualRadius: 6, color: 0xaef6ea, alpha: 0.22, isPrimary: false },
  { id: 5, trailRadius: 5, visualRadius: 5, color: 0xffb7e7, alpha: 0.2, isPrimary: false },
];

const palette: ChromaticTrailPalette = {
  red: 0xff4f88,
  green: 0x48ffd7,
  blue: 0x4c7fff,
} as const;

const MAX_SOURCE_COUNT = SOURCE_BLUEPRINTS.length;

const clampActiveSources = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const rounded = Math.round(value);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > MAX_SOURCE_COUNT) {
    return MAX_SOURCE_COUNT;
  }
  return rounded;
};

interface OrbitSample {
  readonly x: number;
  readonly y: number;
  readonly radiusScale: number;
}

const BASE_VERTICAL_RATIO = 0.55;
const FOLLOWER_RADIUS_DECAY = 0.18;
const FOLLOWER_VERTICAL_DECAY = 0.06;
const MIN_RADIUS_SCALE = 0.35;

const computeOrbitPosition = (
  index: number,
  time: number,
  motionRadius: number,
  lagPerFollower: number,
  center: number,
): OrbitSample => {
  const lag = index === 0 ? 0 : lagPerFollower * index;
  const sampleTime = time - lag;
  const radiusScale =
    index === 0 ? 1 : Math.max(MIN_RADIUS_SCALE, 1 - index * FOLLOWER_RADIUS_DECAY);
  const verticalScale = Math.max(0.28, BASE_VERTICAL_RATIO - index * FOLLOWER_VERTICAL_DECAY);
  const radius = motionRadius * radiusScale;

  return {
    x: center + Math.sin(sampleTime) * radius,
    y: center + Math.sin(sampleTime * 0.58) * radius * verticalScale,
    radiusScale,
  };
};

const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const ChromaticTrailPreview = ({
  comboEnergy,
  loopSpeed,
  radius,
  followerLag,
  activeSources,
}: ChromaticTrailStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ comboEnergy, loopSpeed, radius, followerLag, activeSources });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = { comboEnergy, loopSpeed, radius, followerLag, activeSources };

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

      const effect = createStoryChromaticTrailEffect(palette, {
        maxPoints: 36,
        fadeDuration: 0.62,
        emissionThreshold: 0,
        offsetScale: 14,
        trackAllSources: true,
      });
      effect.container.zIndex = 1;
      app.stage.addChild(effect.container);

      const center = CANVAS_SIZE / 2;
      const ballOverlay = new Graphics();
      ballOverlay.circle(0, 0, SOURCE_BLUEPRINTS[0]?.visualRadius ?? 12);
      ballOverlay.fill({ color: 0xfdfdff, alpha: 0.96 });
      ballOverlay.stroke({ color: 0x91a4ff, width: 1.6, alpha: 0.55 });
      ballOverlay.zIndex = 3;
      ballOverlay.visible = false;
      app.stage.addChild(ballOverlay);

      const sourceStates: SourceState[] = SOURCE_BLUEPRINTS.map((blueprint) => {
        const graphic = new Graphics();
        graphic.circle(0, 0, blueprint.visualRadius);
        graphic.fill({ color: blueprint.color, alpha: blueprint.alpha });
        graphic.zIndex = 2;
        graphic.visible = false;
        app.stage.addChild(graphic);
        return {
          blueprint,
          graphic,
          prevPosition: { x: center, y: center },
        } satisfies SourceState;
      });

      const previewState: PreviewState = {
        app,
        effect,
        sources: [],
        time: 0,
        sourceStates,
        ballOverlay,
      };
      stateRef.current = previewState;

      const tick = (ticker: { deltaMS: number }) => {
        const current = propsRef.current;
        const deltaSeconds = Math.max(0.0001, ticker.deltaMS / 1000);
        const {
          comboEnergy: combo,
          loopSpeed: speed,
          radius: loopRadius,
          followerLag: lag,
          activeSources: requestedSources,
        } = current;

        previewState.time += deltaSeconds * speed;
        const center = CANVAS_SIZE / 2;
        const motionRadius = Math.max(36, loopRadius);

        const activeCount = clampActiveSources(requestedSources);
        const activeSourcesList: TrailSource[] = [];

        let primaryPosition: { x: number; y: number } | null = null;

        previewState.sourceStates.forEach((sourceState, index) => {
          const wasVisible = sourceState.graphic.visible;
          const isActive = index < activeCount;
          if (!isActive) {
            sourceState.graphic.visible = false;
            return;
          }

          const sample = computeOrbitPosition(index, previewState.time, motionRadius, lag, center);
          const { x, y, radiusScale } = sample;
          const prev = wasVisible ? sourceState.prevPosition : { x, y };
          const vx = x - prev.x;
          const vy = y - prev.y;
          const effectiveRadius = motionRadius * radiusScale;
          const speedBudget = Math.max(18, effectiveRadius * (1.15 + index * 0.08));
          const normalizedSpeed = clampUnit(Math.hypot(vx, vy) / speedBudget);

          sourceState.graphic.position.set(x, y);
          sourceState.prevPosition = { x, y };
          sourceState.graphic.visible = true;

          if (sourceState.blueprint.isPrimary && primaryPosition === null) {
            primaryPosition = { x, y };
          }

          activeSourcesList.push({
            id: sourceState.blueprint.id,
            position: { x, y },
            radius: sourceState.blueprint.trailRadius,
            normalizedSpeed,
            isPrimary: sourceState.blueprint.isPrimary,
          });
        });

        previewState.sources = activeSourcesList;
        previewState.effect.update({
          deltaSeconds,
          comboEnergy: combo,
          sources: previewState.sources,
        });

        if (primaryPosition !== null) {
          const { x: primaryX, y: primaryY } = primaryPosition;
          previewState.ballOverlay.position.set(primaryX, primaryY);
          previewState.ballOverlay.visible = true;
        } else {
          previewState.ballOverlay.visible = false;
        }
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
      state.effect.destroy();
      state.sourceStates.forEach(({ graphic }) => {
        graphic.destroy();
      });
      state.ballOverlay.destroy();
      state.app.destroy(true);
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    state.effect.configure({
      enabled: true,
      trackAllSources: true,
      emissionThreshold: 0,
    });
  }, [comboEnergy, followerLag, activeSources]);

  return (
    <div
      ref={hostRef}
      style={{
        width: 'min(460px, 90vw)',
        height: 'min(460px, 90vw)',
        margin: '0 auto',
        borderRadius: '24px',
        background: 'radial-gradient(circle at center, rgba(12, 15, 24, 0.92), rgba(5, 6, 12, 1))',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.45)',
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};

const meta = {
  title: 'Effects/Chromatic Aberration Trail',
  component: ChromaticTrailPreview,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'Night',
      values: [
        { name: 'Night', value: '#02030a' },
        { name: 'Slate', value: '#0f1729' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    comboEnergy: {
      control: { type: 'range', min: 0, max: 1.2, step: 0.05 },
    },
    loopSpeed: {
      control: { type: 'range', min: 0.5, max: 3.5, step: 0.1 },
    },
    radius: {
      control: { type: 'range', min: 40, max: 180, step: 5 },
    },
    followerLag: {
      control: { type: 'range', min: 0, max: 1.2, step: 0.05 },
    },
    activeSources: {
      control: { type: 'range', min: 1, max: MAX_SOURCE_COUNT, step: 1 },
    },
  },
  args: {
    comboEnergy: 0.6,
    loopSpeed: 1.4,
    radius: 110,
    followerLag: 0.4,
    activeSources: 3,
  },
} satisfies Meta<typeof ChromaticTrailPreview>;

export default meta;

type Story = StoryObj<typeof meta>;
export const Combo1: Story = {
  args: {
    comboEnergy: 0.25,
    loopSpeed: 0.95,
    radius: 82,
    followerLag: 0.32,
    activeSources: 1,
  },
};

export const Combo2: Story = {
  args: {
    comboEnergy: 0.45,
    loopSpeed: 1.2,
    radius: 94,
    followerLag: 0.36,
    activeSources: 2,
  },
};

export const Combo3: Story = {
  args: {
    comboEnergy: 0.65,
    loopSpeed: 1.4,
    radius: 108,
    followerLag: 0.42,
    activeSources: 3,
  },
};

export const Combo4: Story = {
  args: {
    comboEnergy: 0.82,
    loopSpeed: 1.7,
    radius: 124,
    followerLag: 0.48,
    activeSources: 4,
  },
};

export const Combo5: Story = {
  args: {
    comboEnergy: 1.05,
    loopSpeed: 2.1,
    radius: 138,
    followerLag: 0.54,
    activeSources: 5,
  },
};
