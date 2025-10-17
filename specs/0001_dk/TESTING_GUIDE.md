# Testing the Advanced Features

## How to Test Locally

1. **Start the dev server**:
   ```bash
   cd c:\Code\lucky-break
   pnpm dev
   ```

2. **Open in browser**: Navigate to `http://localhost:5173`

## Features to Test

### 1. Paddle Reflection
- **What to test**: Move paddle to hit ball at different positions
- **Expected behavior**: 
  - Center hits → ball bounces straight up
  - Left edge hits → ball bounces at angle to the left
  - Right edge hits → ball bounces at angle to the right
- **Visual feedback**: Ball trajectory should vary based on paddle position

### 2. Speed Regulation
- **What to test**: Watch ball speed during gameplay
- **Expected behavior**:
  - Ball never gets too slow (always maintains minimum 8 units/s)
  - Ball never gets too fast (capped at 14 units/s)
- **Visual feedback**: Ball maintains consistent visible speed

### 3. Combo Scoring
- **What to test**: Break bricks rapidly in succession
- **Expected behavior**:
  - Combo counter appears in yellow text at bottom of HUD
  - Shows "Combo: 8x (1.5s)" format
  - Timer counts down when no bricks are hit
  - Combo resets to 0 when timer reaches 0
  - Score multiplier increases at 8, 16, 24, etc.
- **Visual feedback**: Yellow combo text updates in real-time

### 4. Power-Ups
- **What to test**: Break multiple bricks
- **Expected behavior**:
  - ~25% chance to spawn power-up on brick break
  - Paddle width power-up: paddle grows wider and turns yellow
  - Shows "paddle-width: 2.3s" in cyan at bottom
  - Paddle shrinks back to normal when timer expires
- **Visual feedback**: 
  - Paddle changes color to yellow
  - Cyan power-up text with countdown

### 5. Level Progression
- **What to test**: Complete a level by breaking all bricks
- **Expected behavior**:
  - After 0.5 seconds, new level loads
  - Level 1: 3x6 grid (18 bricks)
  - Level 2: 4x6 grid (24 bricks) with some 2-HP bricks (orange)
  - Levels continue with increasing difficulty
- **Visual feedback**: 
  - Bricks color-coded by HP (gray=1, orange=2, red=3+)
  - New level appears after brief pause

### 6. Life Loss
- **What to test**: Let ball hit bottom wall
- **Expected behavior**:
  - Combo resets to 0
  - Life counter decreases
  - Ball reattaches to paddle
  - If lives = 0, "Game Over" in console
- **Visual feedback**: Lives counter updates in HUD

## Expected HUD Display

```
Status: Round in progress
Lives: 3 | Score: 150 | Round: 1
Bricks: 12/18 | Combo: 5 | Heat: 12

Combo: 12x (1.2s)           ← Yellow text (if active)
paddle-width: 1.8s          ← Cyan text (if active)
```

## Console Output

Watch for:
- `Power-up activated: paddle-width` when power-ups spawn
- `Game Over - Final Score: XXX` when all lives lost

## Known Behaviors

- Ball launches upward when paddle moves while attached
- Paddle clamped to screen boundaries
- Physics runs at 120 Hz for smooth motion
- All tests pass (162 tests ✓)

## Performance

- Build size: ~350 KB (111 KB gzipped)
- All features have minimal performance impact
- Speed regulation runs every frame with no lag
