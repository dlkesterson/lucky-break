import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiMobileWrapper, type MobileViewportConfig } from './PixiMobileWrapper';
import type { StageHandle } from '@lucky-break/web-client/src/render/stage';

/**
 * Mobile Gameplay Demo uses real PixiJS rendering code from @lucky-break/web-client
 * to show how the actual game appears on mobile devices.
 *
 * This imports and uses:
 * - Real visual factory for balls and paddles
 * - Actual brick rendering with game theme colors
 * - True game fonts and styling
 * - Authentic HUD layout from web-client
 */

interface GameplayDemoProps {
  viewport: MobileViewportConfig;
  showHud: boolean;
}

const GameplayDemo = ({ viewport, showHud }: GameplayDemoProps) => {
  const setupGameplay = async (stage: StageHandle) => {
    // Import real game rendering utilities
    const { createVisualFactory } = await import(
      '@lucky-break/web-client/src/render/visual-factory'
    );
    const { toColorNumber, computeBrickFillColor, paintBrickVisual } = await import(
      '@lucky-break/web-client/src/render/playfield-visuals'
    );
    const { GameTheme } = await import('@lucky-break/web-client/src/render/theme');
    const { Container, Graphics, Text, FillGradient } = await import('pixi.js');

    const playfieldLayer = stage.layers.playfield;
    const hudLayer = stage.layers.hud;

    // Background gradient matching actual game
    const background = new Graphics();
    const bgGradient = new FillGradient(0, 0, 0, stage.designSize.height);
    bgGradient.addColorStop(0, toColorNumber('#0c172f'));
    bgGradient.addColorStop(1, toColorNumber('#04070f'));
    background.rect(0, 0, stage.designSize.width, stage.designSize.height);
    background.fill(bgGradient);
    background.zIndex = -100;
    playfieldLayer.addChild(background);

    // Create real visual factory with game theme
    const visualFactory = createVisualFactory({
      ball: {
        baseColor: toColorNumber(GameTheme.ball.core),
        auraColor: toColorNumber(GameTheme.ball.aura),
        highlightColor: toColorNumber(GameTheme.ball.highlight),
      },
      paddle: {
        gradient: GameTheme.paddle.gradient.map(toColorNumber),
        accentColor: toColorNumber(GameTheme.paddle.gradient[0]),
      },
    });

    // Playfield setup - centered horizontally, positioned similar to actual game
    const playfieldWidth = Math.min(stage.designSize.width * 0.92, 520);
    const playfieldHeight = stage.designSize.height * 0.62;
    const playfieldX = (stage.designSize.width - playfieldWidth) / 2;
    const playfieldY = stage.designSize.height * 0.2;

    const playfield = new Container();
    playfield.position.set(playfieldX, playfieldY);
    playfieldLayer.addChild(playfield);

    // Border using game colors with subtle glow
    const border = new Graphics();
    border.rect(0, 0, playfieldWidth, playfieldHeight);
    border.stroke({ width: 2, color: toColorNumber(GameTheme.hud.panelLine), alpha: 0.6 });
    playfield.addChild(border);

    // Real bricks with game theme colors - positioned at top of playfield
    const brickCols = 6;
    const brickRows = 4;
    const brickWidth = Math.floor((playfieldWidth - (brickCols + 1) * 8) / brickCols);
    const brickHeight = 28;
    const brickPadding = 8;
    const brickColors = GameTheme.brickColors.map(toColorNumber);

    const brickStartY = 24;
    for (let row = 0; row < brickRows; row++) {
      for (let col = 0; col < brickCols; col++) {
        const brick = new Graphics();
        const x = col * (brickWidth + brickPadding) + brickPadding;
        const y = row * (brickHeight + brickPadding) + brickStartY;

        const baseColor = brickColors[row % brickColors.length];
        const fillColor = computeBrickFillColor(baseColor, 1, 1);

        brick.position.set(x, y);
        paintBrickVisual(brick, brickWidth, brickHeight, fillColor, 0, 1, 'rectangle');
        playfield.addChild(brick);
      }
    }

    // Real paddle using visual factory - positioned at bottom
    const paddleWidth = playfieldWidth * 0.24;
    const paddleHeight = 16;
    const paddle = visualFactory.paddle.create({
      width: paddleWidth,
      height: paddleHeight,
    });
    paddle.position.set((playfieldWidth - paddleWidth) / 2, playfieldHeight - 55);
    playfield.addChild(paddle);

    // Real ball using visual factory - positioned above paddle
    const ballRadius = 10;
    const ball = visualFactory.ball.create({ radius: ballRadius });
    ball.position.set(playfieldWidth / 2, playfieldHeight - 85);
    playfield.addChild(ball);

    // HUD using game fonts - matching actual game layout
    if (showHud) {
      const hudColor = toColorNumber(GameTheme.hud.textPrimary);
      const hudSecondary = toColorNumber(GameTheme.hud.textSecondary);
      const accentColor = toColorNumber(GameTheme.accents.combo);

      const createLabel = (
        text: string,
        x: number,
        y: number,
        size: number,
        color: number,
        weight: '400' | '600' | '700' = '600',
      ) => {
        const label = new Text({
          text,
          style: {
            fontFamily: GameTheme.font,
            fontSize: size,
            fill: color,
            fontWeight: weight,
          },
        });
        label.position.set(x, y);
        return label;
      };

      // Top bar - Round and Score on same line
      const topY = 20;
      const roundStatus = createLabel('ROUND 1 — ACTIVE', 24, topY, 14, hudSecondary);
      hudLayer.addChild(roundStatus);

      const scoreLabel = createLabel('SCORE 0', stage.designSize.width / 2, topY, 18, hudColor);
      scoreLabel.anchor.set(0.5, 0);
      hudLayer.addChild(scoreLabel);

      const bricksLabel = createLabel(
        '12 BRICKS LEFT',
        stage.designSize.width - 24,
        topY,
        14,
        accentColor,
      );
      bricksLabel.anchor.set(1, 0);
      hudLayer.addChild(bricksLabel);

      // Bottom bar - Speed and Lives
      const bottomY = stage.designSize.height - 80;
      const speedLabel = createLabel(
        'SPEED',
        stage.designSize.width / 2,
        bottomY,
        12,
        hudSecondary,
      );
      speedLabel.anchor.set(0.5, 0);
      hudLayer.addChild(speedLabel);

      const speedValue = createLabel(
        '9.00',
        stage.designSize.width / 2,
        bottomY + 20,
        28,
        hudColor,
        '700',
      );
      speedValue.anchor.set(0.5, 0);
      hudLayer.addChild(speedValue);

      const speedUnits = createLabel(
        'u/s',
        stage.designSize.width / 2,
        bottomY + 52,
        12,
        hudSecondary,
      );
      speedUnits.anchor.set(0.5, 0);
      hudLayer.addChild(speedUnits);

      // Lives indicator bottom left
      const livesIcon = createLabel(
        '❤',
        42,
        stage.designSize.height - 50,
        32,
        toColorNumber('#ffed4e'),
        '400',
      );
      livesIcon.anchor.set(0.5);
      hudLayer.addChild(livesIcon);
    }
  };

  return <PixiMobileWrapper viewport={viewport} onSetup={setupGameplay} />;
};

const meta = {
  title: 'Mobile Scenes/Gameplay Demo',
  component: GameplayDemo,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'Dark',
    },
  },
  tags: ['autodocs'],
  argTypes: {
    viewport: {
      control: false,
      description: 'Mobile viewport configuration',
    },
    showHud: {
      control: 'boolean',
      description: 'Show HUD elements using real game fonts and colors',
    },
  },
} satisfies Meta<typeof GameplayDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * ## iPhone 14 Pro Portrait
 *
 * Real game rendering on iPhone 14 Pro (393×852, 3x DPR).
 * Uses actual visual factory, brick rendering, and game theme.
 */
export const IPhonePortrait: Story = {
  args: {
    viewport: {
      width: 393,
      height: 852,
      orientation: 'portrait',
      devicePixelRatio: 3,
    },
    showHud: true,
  },
};

/**
 * ## Galaxy S21 Portrait
 *
 * Standard Android layout (360×800, 2x DPR) with real game visuals.
 */
export const GalaxyPortrait: Story = {
  args: {
    viewport: {
      width: 360,
      height: 800,
      orientation: 'portrait',
      devicePixelRatio: 2,
    },
    showHud: true,
  },
};

/**
 * ## iPad Mini Portrait
 *
 * Tablet layout (744×1133) showing more breathing room for visuals.
 */
export const IPadPortrait: Story = {
  args: {
    viewport: {
      width: 744,
      height: 1133,
      orientation: 'portrait',
      devicePixelRatio: 2,
    },
    showHud: true,
  },
};

/**
 * ## Landscape Mode
 *
 * iPhone in landscape (852×393) with actual game rendering.
 */
export const LandscapeMode: Story = {
  args: {
    viewport: {
      width: 852,
      height: 393,
      orientation: 'landscape',
      devicePixelRatio: 3,
    },
    showHud: true,
  },
};

/**
 * ## Minimal (No HUD)
 *
 * Shows just the playfield rendering without HUD overlay.
 */
export const MinimalNoHUD: Story = {
  args: {
    viewport: {
      width: 393,
      height: 852,
      orientation: 'portrait',
      devicePixelRatio: 3,
    },
    showHud: false,
  },
};
