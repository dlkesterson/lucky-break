import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import { createRoundCountdown } from '@lucky-break/web-client/src/render/effects/round-countdown';
import { THEME_OPTIONS, THEME_REGISTRY, type ThemeName } from '@lucky-break/design-system';

type CountdownHandle = ReturnType<typeof createRoundCountdown>;

type CountdownMode = 'animated' | 'static';

interface RoundCountdownStoryProps {
  mode: CountdownMode;
  initialSeconds: number;
  totalSeconds: number;
  manualSeconds: number;
  countdownSpeed: number;
  loopAnimation: boolean;
  themeName: ThemeName;
}

interface PreviewState {
  app: Application;
  backdrop: Graphics;
  countdown: CountdownHandle;
  ticker?: (ticker: { deltaMS: number }) => void;
  remaining: number;
  lastInitialSeconds: number;
  lastMode: CountdownMode;
  completed: boolean;
}

const PLAYFIELD_SIZE = 900;

const clampPositive = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, value);
};

const safeTotal = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, value);
};

const RoundCountdownPreview = ({
  mode,
  initialSeconds,
  totalSeconds,
  manualSeconds,
  countdownSpeed,
  loopAnimation,
  themeName,
}: RoundCountdownStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({
    mode,
    initialSeconds,
    totalSeconds,
    manualSeconds,
    countdownSpeed,
    loopAnimation,
    themeName,
  });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = {
    mode,
    initialSeconds,
    totalSeconds,
    manualSeconds,
    countdownSpeed,
    loopAnimation,
    themeName,
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const app = new Application();
    let disposed = false;

    const setup = async () => {
      await app.init({
        width: PLAYFIELD_SIZE,
        height: PLAYFIELD_SIZE,
        backgroundAlpha: 0,
        antialias: true,
        resolution: 1,
      });

      if (disposed) {
        app.destroy(true);
        return;
      }

      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';

      host.appendChild(app.canvas);
      app.stage.sortableChildren = true;

      const backdrop = new Graphics();
      backdrop.eventMode = 'none';
      backdrop.zIndex = 0;
      backdrop.rect(0, 0, PLAYFIELD_SIZE, PLAYFIELD_SIZE);
      backdrop.fill({ color: 0x05040d, alpha: 0.94 });
      const ringRadius = PLAYFIELD_SIZE * 0.45;
      backdrop.circle(PLAYFIELD_SIZE / 2, PLAYFIELD_SIZE / 2, ringRadius);
      backdrop.fill({ color: 0x130c23, alpha: 0.75 });
      backdrop.stroke({ color: 0x2c1c42, width: 18, alpha: 0.48 });

      const countdown = createRoundCountdown({
        playfieldSize: { width: PLAYFIELD_SIZE, height: PLAYFIELD_SIZE },
        theme: THEME_REGISTRY[propsRef.current.themeName],
      });
      countdown.container.zIndex = 10;

      app.stage.addChild(backdrop);
      app.stage.addChild(countdown.container);

      const previewState: PreviewState = {
        app,
        backdrop,
        countdown,
        remaining: clampPositive(propsRef.current.initialSeconds, 3),
        lastInitialSeconds: propsRef.current.initialSeconds,
        lastMode: propsRef.current.mode,
        completed: false,
      };

      stateRef.current = previewState;

      const { totalSeconds: initialTotal } = propsRef.current;
      countdown.show(clampPositive(propsRef.current.initialSeconds, 3), safeTotal(initialTotal, 3));

      const tick = (ticker: { deltaMS: number }) => {
        const state = stateRef.current;
        if (!state) {
          return;
        }

        const {
          mode: activeMode,
          manualSeconds: manualValue,
          totalSeconds: activeTotal,
          countdownSpeed: activeSpeed,
          loopAnimation: shouldLoop,
          initialSeconds: activeInitial,
        } = propsRef.current;

        const total = safeTotal(activeTotal, 3);

        if (activeMode === 'static') {
          const nextValue = clampPositive(manualValue, 0);
          state.remaining = nextValue;
          state.completed = nextValue <= 0;
          if (state.completed) {
            state.countdown.hide();
            return;
          }
          state.countdown.show(nextValue, total);
          return;
        }

        if (state.lastMode !== activeMode) {
          state.lastMode = activeMode;
          state.completed = false;
          state.remaining = clampPositive(activeInitial, 3);
          state.lastInitialSeconds = activeInitial;
        }

        if (state.lastInitialSeconds !== activeInitial) {
          state.remaining = clampPositive(activeInitial, 3);
          state.lastInitialSeconds = activeInitial;
          state.completed = false;
        }

        const deltaSeconds = Math.max(0, activeSpeed) * Math.max(0.0001, ticker.deltaMS / 1000);

        if (!state.completed) {
          state.remaining = clampPositive(state.remaining - deltaSeconds, 0);
        }

        if (state.remaining <= 0) {
          if (shouldLoop && activeInitial > 0) {
            state.remaining = clampPositive(activeInitial, 3);
          } else {
            if (!state.completed) {
              state.countdown.hide();
              state.completed = true;
            }
            return;
          }
        } else {
          state.completed = false;
        }

        state.countdown.show(state.remaining, total);
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
      state.app.stage.removeChild(state.countdown.container);
      state.countdown.hide();
      state.countdown.container.destroy({ children: true });
      state.backdrop.destroy();
      state.app.destroy(true);
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    const theme = THEME_REGISTRY[themeName];
    state.countdown.setTheme(theme);
  }, [themeName]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }

    const { mode: activeMode } = propsRef.current;
    const total = safeTotal(propsRef.current.totalSeconds, 3);

    if (activeMode === 'static') {
      const value = clampPositive(propsRef.current.manualSeconds, 0);
      state.remaining = value;
      state.completed = value <= 0;
      if (state.completed) {
        state.countdown.hide();
        return;
      }
      state.countdown.show(value, total);
      return;
    }

    state.remaining = clampPositive(propsRef.current.initialSeconds, 3);
    state.lastInitialSeconds = propsRef.current.initialSeconds;
    state.completed = false;
    state.countdown.show(state.remaining, total);
  }, [mode, initialSeconds, manualSeconds, totalSeconds]);

  return (
    <div
      ref={hostRef}
      style={{
        width: 'min(680px, 95vw)',
        aspectRatio: '1 / 1',
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

const THEME_NAMES = THEME_OPTIONS.map((option) => option.name);

const meta = {
  title: 'Effects/Round Countdown',
  component: RoundCountdownPreview,
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
    mode: {
      control: { type: 'inline-radio' },
      options: ['animated', 'static'],
      description: 'Select animated playback or a static showcase value.',
    },
    initialSeconds: {
      control: { type: 'range', min: 1, max: 12, step: 0.1 },
      description: 'Starting seconds for the animation loop.',
    },
    totalSeconds: {
      control: { type: 'range', min: 1, max: 15, step: 0.1 },
      description: 'Total countdown window used for normalization and fade in/out.',
    },
    manualSeconds: {
      control: { type: 'range', min: 0, max: 12, step: 0.1 },
      description: 'Displayed value when mode is set to static.',
    },
    countdownSpeed: {
      control: { type: 'range', min: 0, max: 4, step: 0.1 },
      description: 'Seconds consumed per real-time second when animated.',
    },
    loopAnimation: {
      control: { type: 'boolean' },
      description: 'Restart the countdown automatically when it reaches zero.',
    },
    themeName: {
      control: { type: 'radio' },
      options: THEME_NAMES,
      description: 'Theme palette applied to the countdown typography and halo.',
    },
  },
  args: {
    mode: 'animated',
    initialSeconds: 9,
    totalSeconds: 9,
    manualSeconds: 3,
    countdownSpeed: 1,
    loopAnimation: true,
    themeName: 'default',
  },
} satisfies Meta<typeof RoundCountdownPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AnimatedLoop: Story = {
  args: {
    mode: 'animated',
    initialSeconds: 9,
    totalSeconds: 9,
    countdownSpeed: 1,
    loopAnimation: true,
  },
};

export const FastFinish: Story = {
  name: 'Fast Finish Burst',
  args: {
    mode: 'animated',
    initialSeconds: 4.5,
    totalSeconds: 4.5,
    countdownSpeed: 1.75,
    loopAnimation: true,
  },
};

export const SlowBuild: Story = {
  name: 'Slow Build-Up',
  args: {
    mode: 'animated',
    initialSeconds: 12,
    totalSeconds: 12,
    countdownSpeed: 0.4,
    loopAnimation: false,
  },
};

export const StaticCaution: Story = {
  name: 'Static - Caution Tone',
  args: {
    mode: 'static',
    manualSeconds: 4.5,
    totalSeconds: 9,
  },
};

export const StaticFinalSecond: Story = {
  name: 'Static - Final Second',
  args: {
    mode: 'static',
    manualSeconds: 1,
    totalSeconds: 9,
  },
};

export const ColorBlindTheme: Story = {
  name: 'Animated - Color Blind Theme',
  args: {
    mode: 'animated',
    themeName: 'colorBlind',
    initialSeconds: 8,
    totalSeconds: 8,
    countdownSpeed: 0.9,
    loopAnimation: true,
  },
};
