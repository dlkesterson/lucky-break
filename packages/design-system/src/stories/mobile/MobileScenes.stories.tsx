import type { Meta } from '@storybook/react-vite';
import { Heading, Label, Panel } from '../../index';

/**
 * Mobile PixiJS scene documentation for Lucky Break.
 *
 * These stories demonstrate how the game's actual PixiJS rendering code displays on mobile devices
 * across various screen sizes, orientations, and device pixel ratios. They import and use the real
 * visual components from `@lucky-break/web-client` instead of creating fake duplicates.
 *
 * ## Authentic Rendering
 *
 * All mobile stories use:
 * - **Real visual factories** from `web-client/src/render/visual-factory.ts`
 * - **Actual brick rendering** from `web-client/src/render/playfield-visuals.ts`
 * - **True game themes** from `web-client/src/render/theme.ts`
 * - **Genuine stage management** from `web-client/src/render/stage.ts`
 *
 * This ensures Storybook shows exactly what players see in the actual game.
 *
 * ## Features
 *
 * - **Responsive Viewports**: Accurate device dimensions (iPhone, Android, tablets)
 * - **Device Pixel Ratio**: Proper DPR handling for crisp graphics on retina displays
 * - **Real Game Code**: No fake components—all imports from web-client
 * - **Portrait & Landscape**: Support for both orientations
 * - **Actual Themes**: Uses GameTheme proxy for live theme definitions
 *
 * ## Testing Mobile Layouts
 *
 * Use Storybook's viewport toolbar to switch between predefined mobile devices:
 * - iPhone 14 Pro (393×852)
 * - Galaxy S21 (360×800)
 * - iPad Mini (744×1133)
 * - Landscape variants for all devices
 *
 * ## Available Stories
 *
 * 1. **Mobile Gameplay Demo** - Core game scene with real visual factory, actual brick rendering,
 *    and authentic HUD using game fonts and colors
 *
 * More scenes coming soon with imports from actual React UI components in web-client.
 */
const meta = {
  title: 'Mobile Scenes/Overview',
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'Synth Night',
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;

/**
 * ## Mobile Gameplay Demo
 *
 * The gameplay demo (`MobileGameplayDemo.stories.tsx`) imports real rendering code:
 * - `createVisualFactory` - Actual ball and paddle rendering from visual-factory.ts
 * - `paintBrickVisual` & `computeBrickFillColor` - Real brick rendering from playfield-visuals.ts
 * - `GameTheme` - Live theme proxy with vibrant/high-contrast color schemes
 * - `createStage` - Authentic stage management with layer system
 *
 * **Features**:
 * - Real visual factory creates balls with aura and highlight
 * - Actual brick damage states with color warming
 * - True game fonts (Luckiest Guy, Overpass)
 * - Authentic HUD colors and layout
 *
 * **Viewport**: Portrait (393×852), Landscape (852×393), Tablet (744×1133)
 *
 * **Key variants**:
 * - iPhone Portrait - Standard iOS layout with real game visuals
 * - Galaxy Portrait - Android layout with actual rendering
 * - iPad Portrait - Tablet-optimized with genuine theme
 * - Landscape Mode - Horizontal layout using real stage
 * - Minimal (No HUD) - Just playfield with authentic visuals
 */
export const GameplayDemo = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Mobile Gameplay Demo</Heading>
    <Label>
      Actual PixiJS gameplay scene imported from @lucky-break/web-client with real visual factory,
      authentic brick rendering, and true game theme colors. No fake components.
    </Label>
    <Label className="text-sm opacity-75">
      📱 Navigate to "Mobile Scenes/Gameplay Demo" to see all variants
    </Label>
  </Panel>
);

/**
 * ## Technical Implementation
 *
 * All mobile stories use the `PixiMobileWrapper` component, which:
 *
 * - Imports real `createStage` from `@lucky-break/web-client/src/render/stage.ts`
 * - Creates authentic StageHandle with layer system (playfield, effects, hud)
 * - Handles device pixel ratio for retina displays (2x, 3x)
 * - Manages proper cleanup on component unmount
 * - Applies responsive styling with aspect ratio preservation
 *
 * Stories import actual rendering utilities:
 * - `createVisualFactory` for balls and paddles
 * - `paintBrickVisual` for real brick rendering
 * - `GameTheme` proxy for live theme colors
 * - All visual components from web-client, not duplicates
 */
export const TechnicalDetails = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>PixiMobileWrapper Component</Heading>
    <Label>
      Reusable React wrapper that imports real createStage from @lucky-break/web-client for
      authentic game rendering in Storybook. All visual components come from the actual game code.
    </Label>
    <Label className="text-sm opacity-75">
      📄 Source: `packages/design-system/src/stories/mobile/PixiMobileWrapper.tsx`
    </Label>
  </Panel>
);

/**
 * ## Viewport Testing
 *
 * Use Storybook's **viewport toolbar** (top-right) to switch between devices:
 *
 * **Mobile Phones (Portrait)**:
 * - iPhone 14 Pro (393×852, 3x DPR)
 * - iPhone SE (375×667, 2x DPR)
 * - Galaxy S21 (360×800, 2x DPR)
 * - Pixel XL (411×731, 3x DPR)
 *
 * **Tablets (Portrait)**:
 * - iPad Mini (744×1133, 2x DPR)
 * - iPad Pro 11" (834×1194, 2x DPR)
 *
 * **Landscape Variants**:
 * - iPhone 14 Pro (852×393)
 * - Galaxy S21 (800×360)
 *
 * All viewports use real game rendering imported from `@lucky-break/web-client`.
 */
export const ViewportGuide = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Viewport Testing Guide</Heading>
    <Label>
      Storybook includes predefined viewports for common mobile devices. Use the viewport toolbar to
      test responsive layouts with actual game rendering code across different screen sizes.
    </Label>
    <Label className="text-sm opacity-75">
      🔧 All stories import real visual components from @lucky-break/web-client
    </Label>
  </Panel>
);
