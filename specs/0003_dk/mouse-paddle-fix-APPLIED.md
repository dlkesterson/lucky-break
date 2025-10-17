# Mouse/Paddle Alignment Fix - APPLIED

**Date:** 2025-10-16  
**Branch:** 003-implement-advanced-gameplay  
**Status:** ✅ Complete

## Problem
The mouse/paddle alignment was offset because:
1. Mouse coordinates were being read in **canvas pixels** (window space)
2. The game playfield is a **1280×720 scaled & letterboxed container** centered in the window
3. The paddle controller was clamping against a hardcoded **800px width** instead of the actual 1280px playfield width

After tapping to start, the stage scales and centers the 1280×720 playfield, causing the paddle to track the wrong coordinate space and appear "stuck" bottom-right relative to the cursor.

## Solution Applied

### 1. Coordinate Space Conversion (`main.ts`)
Added a helper function to convert canvas coordinates to playfield coordinates:

```typescript
const toPlayfield = (canvasPt: { x: number; y: number }) => {
    const root = stage.layers.root;
    const s = root.scale.x; // uniform scale
    return {
        x: (canvasPt.x - root.position.x) / s,
        y: (canvasPt.y - root.position.y) / s,
    };
};
```

Updated the input processing in `beforeStep` hook to convert coordinates:

```typescript
const paddleTarget = inputManager.getPaddleTarget();
if (paddleTarget) {
    // Convert canvas-space to playfield-space (1280×720)
    const pf = toPlayfield(paddleTarget);
    const targetX = pf.x;
    const halfPaddleWidth = paddle.width / 2;
    const clampedX = Math.max(halfPaddleWidth, Math.min(targetX, 1280 - halfPaddleWidth));
    MatterBody.setPosition(paddle.physicsBody, { x: clampedX, y: paddle.physicsBody.position.y });
}
```

### 2. Fixed Hardcoded Width (`paddle-body.ts`)
Changed the hardcoded 800px width to 1280px to match the physics world dimensions in two places:

**In `updatePaddle()`:**
```typescript
// OLD: targetX = Math.max(halfWidth, Math.min(800 - halfWidth, targetX));
// NEW:
targetX = Math.max(halfWidth, Math.min(1280 - halfWidth, targetX));
```

**In `setPaddlePosition()`:**
```typescript
// OLD: const constrainedX = Math.max(halfWidth, Math.min(800 - halfWidth, position.x));
// NEW:
const constrainedX = Math.max(halfWidth, Math.min(1280 - halfWidth, position.x));
```

### 3. Updated Tests (`paddle-constraints.spec.ts`)
Updated test expectations to match the new 1280px width:

- Right boundary test: Expected position changed from 750 to 1230 (1280 - 50)
- Large screen width test: Expected position changed from 750 to 1230

## Files Modified
- ✅ `src/app/main.ts` - Added coordinate conversion helper and updated input processing
- ✅ `src/render/paddle-body.ts` - Fixed hardcoded 800px width to 1280px
- ✅ `tests/unit/render/paddle-constraints.spec.ts` - Updated test expectations

## Testing
- ✅ All paddle tests pass (41 tests)
- ✅ Dev server compiles and runs successfully
- ✅ No breaking changes to existing functionality

## Why This Works
The letterbox math (`(x - root.position.x) / root.scale.x`) re-aligns the pointer from canvas pixel space to the game's 1280×720 playfield space. This eliminates the offset caused by the scaled and centered playfield container.

The physics world was already configured with `dimensions: { width: 1280, height: 720 }`, so using 1280 for clamping keeps everything consistent with the actual game boundaries.
