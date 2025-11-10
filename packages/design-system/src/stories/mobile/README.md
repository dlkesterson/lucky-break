# Mobile PixiJS Scene Stories

This directory contains Storybook v10 stories demonstrating Lucky Break's PixiJS-based game scenes optimized for mobile devices.

## Overview

These stories showcase how the game renders on mobile devices across various screen sizes, orientations, and device pixel ratios. They're built using PixiJS 8.14 and rendered through the `PixiMobileWrapper` component for accurate mobile viewport simulation.

## Stories

### 1. Mobile Gameplay (`MobileGameplay.stories.tsx`)
- **Portrait gameplay** with adaptive HUD layout
- **Touch input visualization** (tap to launch indicator)
- **Playfield scaling** for different screen sizes
- **HUD styles**: Compact and detailed layouts
- **Device variants**: iPhone, Android, tablets

### 2. Mobile Pause Menu (`MobilePauseMenu.stories.tsx`)
- **Modal pause overlay** with semi-transparent backdrop
- **Entropy action store** with touch-friendly buttons (56px min height)
- **Audio volume slider** with visual feedback
- **Score display** and navigation buttons
- **Portrait and landscape** layouts

### 3. Mobile Main Menu (`MobileMainMenu.stories.tsx`)
- **Game title and branding** with gradient backgrounds
- **Start button** optimized for thumb reach
- **High scores leaderboard** (top 3)
- **How-to-play instructions** with emoji icons
- **Settings controls** (sound, theme, help)
- **Configurable sections**: Toggle scores/instructions

### 4. Overview Documentation (`MobileScenes.stories.tsx`)
- **Technical documentation** for all mobile scenes
- **Viewport testing guide** with device dimensions
- **Implementation details** for PixiMobileWrapper

## PixiMobileWrapper Component

Reusable React component for rendering PixiJS applications in Storybook with accurate mobile viewport constraints:

```tsx
<PixiMobileWrapper
  viewport={{
    width: 393,
    height: 852,
    orientation: 'portrait',
    devicePixelRatio: 3,
  }}
  onSetup={(app, root) => {
    // Initialize PixiJS scene
    // Add graphics, text, containers, etc.
  }}
  onUpdate={(app, root, deltaMs) => {
    // Optional: Update loop for animations
  }}
  backgroundColor="#02030a"
/>
```

**Features**:
- Proper device pixel ratio (DPR) handling for retina displays
- Aspect ratio preservation with max-width constraints
- Automatic canvas cleanup on unmount
- Support for both portrait and landscape orientations
- Styled container with border radius and shadows

## Supported Viewports

Configured in `.storybook/preview.tsx`:

### Mobile Phones (Portrait)
- **iPhone 14 Pro**: 393×852 (3x DPR)
- **iPhone 14 Pro Max**: 430×932 (3x DPR)
- **iPhone SE**: 375×667 (2x DPR)
- **Galaxy S21**: 360×800 (2x DPR)
- **Pixel XL**: 411×731 (3x DPR)

### Tablets (Portrait)
- **iPad Mini**: 744×1133 (2x DPR)
- **iPad Pro 11"**: 834×1194 (2x DPR)

### Landscape Variants
- **iPhone 14 Pro**: 852×393
- **Galaxy S21**: 800×360

## Usage

### Running Storybook

```bash
cd packages/design-system
pnpm storybook
```

Navigate to **Mobile Scenes** in the sidebar to explore all variants.

### Switching Viewports

Use the **viewport toolbar** (top-right in Storybook) to test different device sizes.

### Creating New Mobile Stories

1. Import `PixiMobileWrapper` and PixiJS modules:
   ```tsx
   import { PixiMobileWrapper } from './PixiMobileWrapper';
   import { Graphics, Container, Text } from 'pixi.js';
   import type { Application } from 'pixi.js';
   ```

2. Define your viewport config and props:
   ```tsx
   interface MySceneProps {
     viewport: MobileViewportConfig;
     // ...custom props
   }
   ```

3. Implement scene setup:
   ```tsx
   const setupScene = async (app: Application, root: Container) => {
     // Create PixiJS graphics, text, containers
     const background = new Graphics();
     background.rect(0, 0, viewport.width, viewport.height);
     background.fill({ color: 0x02030a });
     root.addChild(background);
     
     // Add more scene elements...
   };
   ```

4. Create story variants with different viewport sizes and configurations

## Design Principles

### Touch Targets
- **Minimum size**: 44×44 CSS pixels (iOS), 48×48 (Android)
- **Buttons**: 56–64px height for comfortable thumb reach
- **Spacing**: 8–12px between interactive elements

### HUD Layout
- **Top-aligned**: Score, lives, combo counter
- **Right-aligned**: Brick progress, timers
- **Bottom-aligned**: Touch controls, action buttons
- **Compact mode**: Single-line labels and values
- **Detailed mode**: Stacked labels with larger text

### Typography
- **Headings**: 24–48px for readability on small screens
- **Body text**: 14–18px minimum for legibility
- **Labels**: 12–16px for HUD elements
- **Monospace**: Stats and numeric values

### Colors
- **Backgrounds**: Dark gradients (#02030a to #0f1729)
- **Text**: White (#ffffff) primary, gray (#94a3b8) secondary
- **Accents**: Blue (#3b82f6), green (#10b981), yellow (#fbbf24)
- **Borders**: Semi-transparent white (rgba(255,255,255,0.1))

## Related Files

- `packages/web-client/src/render/viewport.ts` - Viewport fit calculations
- `packages/web-client/src/app/main.ts` - Mobile detection and layout resolution
- `packages/web-client/src/input/` - Touch input handling
- `packages/design-system/.storybook/preview.tsx` - Viewport configuration
