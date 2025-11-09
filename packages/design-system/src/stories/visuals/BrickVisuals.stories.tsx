import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import type { BrickForm } from '@lucky-break/core-domain/src/util/levels';
import { DEFAULT_THEME, COLOR_BLIND_THEME } from '../../lib/themes';
import { computeBrickFillColor, paintBrickVisual, toColorNumber } from './brick-rendering-utils';

interface BrickVisualStoryProps {
  baseColorHex: string;
  currentHp: number;
  maxHp: number;
  width: number;
  height: number;
  form: BrickForm;
  theme: 'default' | 'colorBlind';
}

interface PreviewState {
  app: Application;
  graphic: Graphics;
}

const CANVAS_SIZE = 240;

const BrickVisualPreview = ({
  baseColorHex,
  currentHp,
  maxHp,
  width,
  height,
  form,
  theme,
}: BrickVisualStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ baseColorHex, currentHp, maxHp, width, height, form, theme });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = { baseColorHex, currentHp, maxHp, width, height, form, theme };

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
      const { baseColorHex, currentHp, maxHp, width, height, form } = propsRef.current;
      const baseColor = toColorNumber(baseColorHex);
      const safeMaxHp = Math.max(1, Math.round(maxHp));
      const safeCurrentHp = Math.max(0, Math.min(safeMaxHp, Math.round(currentHp)));
      const damageLevel = safeMaxHp > 0 ? 1 - safeCurrentHp / safeMaxHp : 0;
      const fillColor = computeBrickFillColor(baseColor, safeCurrentHp, safeMaxHp);

      paintBrickVisual(graphic, width, height, fillColor, damageLevel, 1, form);
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

  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    const { baseColorHex, currentHp, maxHp, width, height, form } = propsRef.current;
    const baseColor = toColorNumber(baseColorHex);
    const safeMaxHp = Math.max(1, Math.round(maxHp));
    const safeCurrentHp = Math.max(0, Math.min(safeMaxHp, Math.round(currentHp)));
    const damageLevel = safeMaxHp > 0 ? 1 - safeCurrentHp / safeMaxHp : 0;
    const fillColor = computeBrickFillColor(baseColor, safeCurrentHp, safeMaxHp);

    paintBrickVisual(state.graphic, width, height, fillColor, damageLevel, 1, form);
  }, [baseColorHex, currentHp, maxHp, width, height, form, theme]);

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
  title: 'Game Systems/Brick Visuals',
  component: BrickVisualPreview,
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
    baseColorHex: {
      control: { type: 'color' },
      description: 'Base brick color (before damage tinting)',
    },
    currentHp: {
      control: { type: 'range', min: 0, max: 5, step: 1 },
      description: 'Current hit points remaining',
    },
    maxHp: {
      control: { type: 'range', min: 1, max: 5, step: 1 },
      description: 'Maximum hit points (damage = 1 - currentHp / maxHp)',
    },
    width: {
      control: { type: 'range', min: 40, max: 160, step: 5 },
      description: 'Brick width in pixels',
    },
    height: {
      control: { type: 'range', min: 20, max: 80, step: 5 },
      description: 'Brick height in pixels',
    },
    form: {
      control: { type: 'select' },
      options: ['rectangle', 'diamond', 'circle'],
      description: 'Visual and physics form of the brick',
    },
    theme: {
      control: { type: 'select' },
      options: ['default', 'colorBlind'],
      description: 'Active game theme',
    },
  },
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[0],
    currentHp: 1,
    maxHp: 1,
    width: 80,
    height: 32,
    form: 'rectangle' as BrickForm,
    theme: 'default' as const,
  },
} satisfies Meta<typeof BrickVisualPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * ## Rectangle - Red Brick (Full HP)
 *
 * Standard rectangular brick at full health with gradient fill.
 * This is the most common brick form in early levels.
 */
export const RectangleFullHp: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[0],
    currentHp: 1,
    maxHp: 1,
    width: 80,
    height: 32,
    form: 'rectangle',
  },
};

/**
 * ## Rectangle - Damaged (50% HP)
 *
 * Shows damage cracks and color warming as HP decreases.
 * Cracks become more prominent with higher damage.
 */
export const RectangleDamaged: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[1],
    currentHp: 2,
    maxHp: 4,
    width: 80,
    height: 32,
    form: 'rectangle',
  },
};

/**
 * ## Diamond - Orange Brick
 *
 * Diamond-shaped brick with angled geometry.
 * Used for decorative wall pieces in portrait layouts.
 */
export const DiamondOrange: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[1],
    currentHp: 1,
    maxHp: 1,
    width: 80,
    height: 32,
    form: 'diamond',
  },
};

/**
 * ## Circle - Yellow Brick
 *
 * Circular brick form with radial highlights.
 * Often used for wall pieces near corners.
 */
export const CircleYellow: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[2],
    currentHp: 1,
    maxHp: 1,
    width: 80,
    height: 32,
    form: 'circle',
  },
};

/**
 * ## Fortified Brick (3 HP)
 *
 * Green brick with increased HP from fortified trait.
 * Takes multiple hits to break, shows progressive damage.
 */
export const FortifiedBrick: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[3],
    currentHp: 3,
    maxHp: 3,
    width: 80,
    height: 32,
    form: 'rectangle',
  },
};

/**
 * ## Fortified Brick - Nearly Destroyed
 *
 * Fortified brick at 1 HP remaining (heavily damaged).
 * Visible cracks and warmed color indicate imminent destruction.
 */
export const FortifiedAlmostDestroyed: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[3],
    currentHp: 1,
    maxHp: 3,
    width: 80,
    height: 32,
    form: 'rectangle',
  },
};

/**
 * ## Wide Brick (Desktop)
 *
 * Standard desktop brick dimensions (100x40).
 * Used in 1280px playfield layouts.
 */
export const WideBrickDesktop: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[0],
    currentHp: 1,
    maxHp: 1,
    width: 80,
    height: 32,
    form: 'rectangle',
  },
};

/**
 * ## Narrow Brick (Mobile)
 *
 * Smaller brick for mobile/portrait layouts.
 * Maintains visual quality at reduced scale.
 */
export const NarrowBrickMobile: Story = {
  args: {
    baseColorHex: DEFAULT_THEME.brickColors[2],
    currentHp: 1,
    maxHp: 1,
    width: 60,
    height: 24,
    form: 'rectangle',
  },
};

/**
 * ## Color-Blind Theme - Blue Brick
 *
 * High-contrast color palette for accessibility.
 * Uses distinct hues optimized for color vision deficiency.
 */
export const ColorBlindBlue: Story = {
  args: {
    baseColorHex: COLOR_BLIND_THEME.brickColors[0],
    currentHp: 1,
    maxHp: 1,
    width: 80,
    height: 32,
    form: 'rectangle',
    theme: 'colorBlind',
  },
};

/**
 * ## Color-Blind Theme - Teal Fortified
 *
 * Fortified brick in color-blind safe palette.
 * Teal hue is easily distinguished from other colors.
 */
export const ColorBlindTealFortified: Story = {
  args: {
    baseColorHex: COLOR_BLIND_THEME.brickColors[3],
    currentHp: 2,
    maxHp: 2,
    width: 80,
    height: 32,
    form: 'rectangle',
    theme: 'colorBlind',
  },
};
