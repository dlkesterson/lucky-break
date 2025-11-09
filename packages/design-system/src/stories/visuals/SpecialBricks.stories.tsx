import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import type { BrickForm } from '@lucky-break/core-domain/src/util/levels';
import { DEFAULT_THEME, COLOR_BLIND_THEME } from '../../lib/themes';
import { gameConfig } from '@lucky-break/core-domain/src/config/game';
import {
  computeBrickFillColor,
  paintBrickVisual,
  toColorNumber,
  WALL_BRICK_COLOR,
  WALL_STROKE_COLOR,
} from './brick-rendering-utils';

interface SpecialBrickStoryProps {
  brickType: 'gamble-armed' | 'gamble-primed' | 'wall' | 'fortified';
  form: BrickForm;
  theme: 'default' | 'colorBlind';
}

interface PreviewState {
  app: Application;
  graphic: Graphics;
}

const CANVAS_SIZE = 240;

const SpecialBrickPreview = ({ brickType, form, theme }: SpecialBrickStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ brickType, form, theme });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = { brickType, form, theme };

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

      const graphic = new Graphics();
      graphic.position.set(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      app.stage.addChild(graphic);

      stateRef.current = { app, graphic };

      // Initial render
      renderBrick();
    };

    void setup();

    return () => {
      disposed = true;
      const state = stateRef.current;
      stateRef.current = null;
      if (!state) {
        return;
      }
      state.graphic.destroy();
      state.app.destroy(true);
    };
  }, []);

  const renderBrick = () => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    const { brickType, form } = propsRef.current;
    const selectedTheme = theme === 'colorBlind' ? COLOR_BLIND_THEME : DEFAULT_THEME;
    const config = gameConfig;

    const width = 80;
    const height = 32;

    if (brickType === 'wall') {
      // Wall bricks use flat white fill with gray stroke
      const fillColor = computeBrickFillColor(WALL_BRICK_COLOR, 1, 1);
      paintBrickVisual(state.graphic, width, height, fillColor, 0, 1, form, {
        fillColor: WALL_BRICK_COLOR,
        strokeColor: WALL_STROKE_COLOR,
        useFlatFill: true,
      });
    } else if (brickType === 'gamble-armed') {
      // Armed gamble bricks use the tint from config
      const tintArmed = toColorNumber(config.levels.gamble.tintArmed);
      const fillColor = computeBrickFillColor(
        tintArmed,
        config.levels.gamble.primeResetHp,
        config.levels.gamble.primeResetHp,
      );
      paintBrickVisual(state.graphic, width, height, fillColor, 0, 1, form);
      state.graphic.tint = tintArmed;
    } else if (brickType === 'gamble-primed') {
      // Primed gamble bricks use the primed tint
      const tintPrimed = toColorNumber(config.levels.gamble.tintPrimed);
      const fillColor = computeBrickFillColor(
        tintPrimed,
        config.levels.gamble.primeResetHp,
        config.levels.gamble.primeResetHp,
      );
      paintBrickVisual(state.graphic, width, height, fillColor, 0, 1, form);
      state.graphic.tint = tintPrimed;
    } else if (brickType === 'fortified') {
      // Fortified bricks use green from theme and have higher HP
      const baseColor = toColorNumber(selectedTheme.brickColors[3]);
      const maxHp = 3;
      const fillColor = computeBrickFillColor(baseColor, maxHp, maxHp);
      paintBrickVisual(state.graphic, width, height, fillColor, 0, 1, form);
    }
  };

  useEffect(() => {
    renderBrick();
  }, [brickType, form, theme]);

  const selectedTheme = theme === 'colorBlind' ? COLOR_BLIND_THEME : DEFAULT_THEME;
  const bgGradient = `radial-gradient(circle at center, ${selectedTheme.background.from}, ${selectedTheme.background.to})`;

  return (
    <div
      ref={hostRef}
      style={{
        width: 'min(240px, 90vw)',
        height: 'min(240px, 90vw)',
        margin: '0 auto',
        borderRadius: '16px',
        background: bgGradient,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};

const meta = {
  title: 'Game Systems/Special Bricks',
  component: SpecialBrickPreview,
  parameters: {
    layout: 'centered',
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
    brickType: {
      control: { type: 'select' },
      options: ['gamble-armed', 'gamble-primed', 'wall', 'fortified'],
      description: 'Type of special brick to display',
    },
    form: {
      control: { type: 'select' },
      options: ['rectangle', 'diamond', 'circle'],
      description: 'Visual and physics form',
    },
    theme: {
      control: { type: 'select' },
      options: ['default', 'colorBlind'],
      description: 'Active game theme',
    },
  },
  args: {
    brickType: 'gamble-armed' as const,
    form: 'rectangle' as BrickForm,
    theme: 'default' as const,
  },
} satisfies Meta<typeof SpecialBrickPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * ## Gamble Brick - Armed (Golden)
 *
 * Gamble brick in "armed" state - waiting to be hit.
 * Uses teal/cyan tint from `gameConfig.levels.gamble.tintArmed`.
 * When hit, becomes "primed" and starts a countdown timer.
 */
export const GambleArmed: Story = {
  args: {
    brickType: 'gamble-armed',
    form: 'rectangle',
  },
};

/**
 * ## Gamble Brick - Primed (Countdown Active)
 *
 * Gamble brick in "primed" state - countdown timer active.
 * Uses golden yellow tint from `gameConfig.levels.gamble.tintPrimed`.
 * Must be hit again before timer expires to win reward multiplier.
 */
export const GamblePrimed: Story = {
  args: {
    brickType: 'gamble-primed',
    form: 'rectangle',
  },
};

/**
 * ## Wall Brick - Indestructible
 *
 * Wall bricks never break and act as obstacles.
 * Uses flat white fill with gray stroke (`WALL_BRICK_COLOR`).
 * HP is set to 9999 and `breakable` is false.
 */
export const WallBrick: Story = {
  args: {
    brickType: 'wall',
    form: 'rectangle',
  },
};

/**
 * ## Wall Brick - Circle Form
 *
 * Circular wall brick used for decorative corners.
 * Common in portrait layouts near extreme slots (top corners).
 */
export const WallBrickCircle: Story = {
  args: {
    brickType: 'wall',
    form: 'circle',
  },
};

/**
 * ## Wall Brick - Diamond Form
 *
 * Diamond-shaped wall brick for visual variety.
 * Used in portrait layouts when `wallCount < WALL_MAX`.
 */
export const WallBrickDiamond: Story = {
  args: {
    brickType: 'wall',
    form: 'diamond',
  },
};

/**
 * ## Fortified Brick - High HP
 *
 * Fortified bricks have increased HP (typically 3+).
 * Uses green color from theme's `brickColors[3]`.
 * Center-biased placement controlled by `centerFortifiedBias`.
 */
export const FortifiedBrick: Story = {
  args: {
    brickType: 'fortified',
    form: 'rectangle',
  },
};

/**
 * ## Fortified Brick - Diamond Form
 *
 * Diamond-shaped fortified brick.
 * Combines high HP with decorative geometry.
 */
export const FortifiedDiamond: Story = {
  args: {
    brickType: 'fortified',
    form: 'diamond',
  },
};

/**
 * ## Gamble Armed - Color-Blind Theme
 *
 * Gamble brick armed state in high-contrast palette.
 * Tint values remain the same across themes.
 */
export const GambleArmedColorBlind: Story = {
  args: {
    brickType: 'gamble-armed',
    form: 'rectangle',
    theme: 'colorBlind',
  },
};

/**
 * ## Wall Brick - Color-Blind Theme
 *
 * Wall brick in color-blind accessible theme.
 * White fill and gray stroke ensure visibility.
 */
export const WallBrickColorBlind: Story = {
  args: {
    brickType: 'wall',
    form: 'rectangle',
    theme: 'colorBlind',
  },
};

/**
 * ## Fortified - Color-Blind Theme
 *
 * Fortified brick using color-blind safe teal color.
 * High-contrast hue easily distinguished from other types.
 */
export const FortifiedColorBlind: Story = {
  args: {
    brickType: 'fortified',
    form: 'rectangle',
    theme: 'colorBlind',
  },
};
