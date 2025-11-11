import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { Application, Graphics, Container } from 'pixi.js';
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

interface ComparisonStoryProps {
  comparisonType: 'shapes' | 'hp-progression' | 'special-types' | 'theme-comparison';
}

interface PreviewState {
  app: Application;
}

const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 340;
const BRICK_WIDTH = 80;
const BRICK_HEIGHT = 32;

const BrickComparisonPreview = ({ comparisonType }: ComparisonStoryProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ comparisonType });
  const stateRef = useRef<PreviewState | null>(null);

  propsRef.current = { comparisonType };

  useEffect(() => {
    const container = hostRef.current;
    if (!container) {
      return;
    }

    const app = new Application();
    let disposed = false;

    const setup = async () => {
      await app.init({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundAlpha: 0,
        antialias: true,
        resolution: 1,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);
      stateRef.current = { app };

      renderComparison();
    };

    void setup();

    return () => {
      disposed = true;
      const state = stateRef.current;
      stateRef.current = null;
      if (!state) {
        return;
      }
      state.app.destroy(true);
    };
  }, []);

  const renderComparison = () => {
    const state = stateRef.current;
    if (!state) {
      return;
    }

    state.app.stage.removeChildren();

    const { comparisonType } = propsRef.current;

    if (comparisonType === 'shapes') {
      renderShapeComparison(state.app);
    } else if (comparisonType === 'hp-progression') {
      renderHpProgression(state.app);
    } else if (comparisonType === 'special-types') {
      renderSpecialTypes(state.app);
    } else if (comparisonType === 'theme-comparison') {
      renderThemeComparison(state.app);
    }
  };

  const renderShapeComparison = (app: Application) => {
    const forms: BrickForm[] = ['rectangle', 'diamond', 'circle'];
    const baseColor = toColorNumber(DEFAULT_THEME.brickColors[0]);
    const spacing = 180;
    const startX = 130;
    const centerY = CANVAS_HEIGHT / 2;

    forms.forEach((form, index) => {
      const graphic = new Graphics();
      graphic.position.set(startX + index * spacing, centerY);
      app.stage.addChild(graphic);

      const fillColor = computeBrickFillColor(baseColor, 1, 1);
      paintBrickVisual(graphic, BRICK_WIDTH, BRICK_HEIGHT, fillColor, 0, 1, form);

      addLabel(app.stage, form.toUpperCase(), startX + index * spacing, centerY + 40);
    });
  };

  const renderHpProgression = (app: Application) => {
    const baseColor = toColorNumber(DEFAULT_THEME.brickColors[2]);
    const maxHp = 4;
    const spacing = 130;
    const startX = 70;
    const centerY = CANVAS_HEIGHT / 2;

    for (let currentHp = maxHp; currentHp >= 0; currentHp--) {
      const index = maxHp - currentHp;
      const graphic = new Graphics();
      graphic.position.set(startX + index * spacing, centerY);
      app.stage.addChild(graphic);

      const fillColor = computeBrickFillColor(baseColor, currentHp, maxHp);
      const damageLevel = currentHp === 0 ? 1 : 1 - currentHp / maxHp;
      paintBrickVisual(
        graphic,
        BRICK_WIDTH,
        BRICK_HEIGHT,
        fillColor,
        damageLevel,
        currentHp === 0 ? 0.3 : 1,
        'rectangle',
      );

      const hpText = currentHp === 0 ? 'DESTROYED' : `${currentHp}/${maxHp} HP`;
      addLabel(app.stage, hpText, startX + index * spacing, centerY + 40);
    }
  };

  const renderSpecialTypes = (app: Application) => {
    const config = gameConfig;
    const spacing = 140;
    const startX = 90;
    const centerY = CANVAS_HEIGHT / 2;

    const standardGraphic = new Graphics();
    standardGraphic.position.set(startX, centerY);
    app.stage.addChild(standardGraphic);
    const standardColor = toColorNumber(DEFAULT_THEME.brickColors[0]);
    const standardFill = computeBrickFillColor(standardColor, 1, 1);
    paintBrickVisual(standardGraphic, BRICK_WIDTH, BRICK_HEIGHT, standardFill, 0, 1, 'rectangle');
    addLabel(app.stage, 'STANDARD', startX, centerY + 40);

    const fortifiedGraphic = new Graphics();
    fortifiedGraphic.position.set(startX + spacing, centerY);
    app.stage.addChild(fortifiedGraphic);
    const fortifiedColor = toColorNumber(DEFAULT_THEME.brickColors[3]);
    const fortifiedFill = computeBrickFillColor(fortifiedColor, 3, 3);
    paintBrickVisual(fortifiedGraphic, BRICK_WIDTH, BRICK_HEIGHT, fortifiedFill, 0, 1, 'rectangle');
    addLabel(app.stage, 'FORTIFIED', startX + spacing, centerY + 40);

    const gambleGraphic = new Graphics();
    gambleGraphic.position.set(startX + spacing * 2, centerY);
    app.stage.addChild(gambleGraphic);
    const gambleColor = toColorNumber(config.levels.gamble.tintArmed);
    const gambleFill = computeBrickFillColor(
      gambleColor,
      config.levels.gamble.primeResetHp,
      config.levels.gamble.primeResetHp,
    );
    paintBrickVisual(gambleGraphic, BRICK_WIDTH, BRICK_HEIGHT, gambleFill, 0, 1, 'rectangle');
    gambleGraphic.tint = gambleColor;
    addLabel(app.stage, 'GAMBLE', startX + spacing * 2, centerY + 40);

    const wallGraphic = new Graphics();
    wallGraphic.position.set(startX + spacing * 3, centerY);
    app.stage.addChild(wallGraphic);
    const wallFill = computeBrickFillColor(WALL_BRICK_COLOR, 1, 1);
    paintBrickVisual(wallGraphic, BRICK_WIDTH, BRICK_HEIGHT, wallFill, 0, 1, 'circle', {
      fillColor: WALL_BRICK_COLOR,
      strokeColor: WALL_STROKE_COLOR,
      useFlatFill: true,
    });
    addLabel(app.stage, 'WALL', startX + spacing * 3, centerY + 40);
  };

  const renderThemeComparison = (app: Application) => {
    const rowSpacing = 90;
    const colSpacing = 130;
    const startX = 90;
    const startY = 90;

    addLabel(app.stage, 'VIBRANT THEME', startX - 50, startY - 40);
    DEFAULT_THEME.brickColors.forEach((colorHex, index) => {
      const graphic = new Graphics();
      graphic.position.set(startX + index * colSpacing, startY);
      app.stage.addChild(graphic);

      const color = toColorNumber(colorHex);
      const fillColor = computeBrickFillColor(color, 1, 1);
      paintBrickVisual(graphic, BRICK_WIDTH, BRICK_HEIGHT, fillColor, 0, 1, 'rectangle');
    });

    addLabel(app.stage, 'HIGH CONTRAST', startX - 50, startY + rowSpacing - 40);
    COLOR_BLIND_THEME.brickColors.forEach((colorHex, index) => {
      const graphic = new Graphics();
      graphic.position.set(startX + index * colSpacing, startY + rowSpacing);
      app.stage.addChild(graphic);

      const color = toColorNumber(colorHex);
      const fillColor = computeBrickFillColor(color, 1, 1);
      paintBrickVisual(graphic, BRICK_WIDTH, BRICK_HEIGHT, fillColor, 0, 1, 'rectangle');
    });
  };

  const addLabel = (parent: Container, text: string, x: number, y: number) => {
    const labelBg = new Graphics();
    labelBg.rect(x - text.length * 3, y, text.length * 6, 16);
    labelBg.fill({ color: 0x000000, alpha: 0.5 });
    labelBg.position.set(0, 0);
    parent.addChild(labelBg);
  };

  useEffect(() => {
    renderComparison();
  }, [comparisonType]);

  const bgGradient = `radial-gradient(circle at center, ${DEFAULT_THEME.background.from}, ${DEFAULT_THEME.background.to})`;

  return (
    <div
      ref={hostRef}
      style={{
        width: 'min(700px, 95vw)',
        height: 'min(340px, 50vw)',
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
  title: 'Game Systems/Brick Comparisons',
  component: BrickComparisonPreview,
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
    comparisonType: {
      control: { type: 'select' },
      options: ['shapes', 'hp-progression', 'special-types', 'theme-comparison'],
      description: 'Type of brick comparison to display',
    },
  },
  args: {
    comparisonType: 'shapes' as const,
  },
} satisfies Meta<typeof BrickComparisonPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * ## Shape Comparison
 *
 * Side-by-side view of all three brick forms:
 * - Rectangle (standard)
 * - Diamond (angled geometry)
 * - Circle (radial highlights)
 */
export const ShapeComparison: Story = {
  args: {
    comparisonType: 'shapes',
  },
};

/**
 * ## HP Damage Progression
 *
 * Shows how a brick's appearance changes as it takes damage.
 * From full HP (4/4) to destroyed (0/4) with progressive:
 * - Color warming
 * - Crack visibility increase
 * - Opacity reduction when destroyed
 */
export const HpDamageProgression: Story = {
  args: {
    comparisonType: 'hp-progression',
  },
};

/**
 * ## Special Brick Types
 *
 * Comparison of all special brick types:
 * - **Standard**: Regular breakable brick
 * - **Fortified**: High HP (3), center-biased placement
 * - **Gamble**: Armed state with teal tint
 * - **Wall**: Indestructible obstacle (circle form)
 */
export const SpecialBrickTypes: Story = {
  args: {
    comparisonType: 'special-types',
  },
};

/**
 * ## Theme Palette Comparison
 *
 * Compares brick colors across game themes:
 * - **Vibrant Theme**: High-energy colors (red, orange, yellow, green)
 * - **High Contrast**: Color-blind accessible palette (blue, orange, yellow, teal)
 *
 * All themes use identical rendering logic with different base colors.
 */
export const ThemePaletteComparison: Story = {
  args: {
    comparisonType: 'theme-comparison',
  },
};
