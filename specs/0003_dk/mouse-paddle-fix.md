You’re seeing that offset because your mouse is being read in **canvas pixels** while the actual game “playfield” is drawn inside a **scaled & letterboxed root container (1280×720)**. After you tap to start, the stage sets `root.scale` and `root.position` to center the 1280×720 playfield inside the window, so the paddle is tracking the wrong coordinate space and ends up “stuck” bottom-right relative to your cursor. You can see the scale/letterbox here: `root.scale.set(scale)` and `root.position.set((w - 1280 * scale)/2, (h - 720 * scale)/2)`. 

Also, your paddle controller clamps X against a **hardcoded 800px width** in tests/impl, which can further desync it from a 1280-wide playfield. (Physics/world is 1280×720.) 

Here’s a tight fix that keeps the paddle perfectly under the cursor:

# 1) Convert canvas coords → playfield coords before moving the paddle

Add a tiny helper where you process input (where you already call `getPaddleTarget()`):

```ts
// helper near where you have `stage` available (main.ts)
const toPlayfield = (canvasPt: {x:number,y:number}) => {
  // root is the 1280×720 playfield container that's being scaled/centered
  const root = stage.layers.root;
  const s = root.scale.x; // uniform scale
  return {
    x: (canvasPt.x - root.position.x) / s,
    y: (canvasPt.y - root.position.y) / s,
  };
};
```

Then, in your loop/update where you currently do something like:

```ts
const target = inputManager.getPaddleTarget();
if (target) {
  // BEFORE: using canvas-space directly
  // paddleController.updatePaddle(paddle, dt, { mouseX: target.x, ... });

  // AFTER: map to 1280×720 playfield space
  const pf = toPlayfield(target);
  paddleController.updatePaddle(paddle, deltaSeconds, {
    leftPressed: false,
    rightPressed: false,
    mouseX: pf.x,
    touchX: undefined,
    launchRequested: inputManager.shouldLaunch(),
  });
  inputManager.resetLaunchTrigger();
}
```

Why this works: `normalizeMouseEvent` gives you coordinates in the canvas’ pixel space; after resize your stage draws the 1280×720 playfield scaled/centered inside that canvas. Converting with `(x - root.position.x)/root.scale.x` re-aligns the pointer to **game-space (1280×720)**, eliminating the offset. The letterbox math is exactly what you set in `handleResize`.  

# 2) Stop clamping against 800px

If your paddle controller (or tests) assume width 800, swap that to your world width (1280) or, better, read from the physics/world bounds:

```ts
// wherever you clamp X (inside PaddleBodyController)
const screenWidth = 1280; // or get from world.engine.world.bounds.max.x
const half = paddle.width / 2;
const clampedX = Math.max(half, Math.min(screenWidth - half, desiredX));
```

Your physics world is explicitly created with `dimensions: { width: 1280, height: 720 }`, so using 1280 keeps clamping consistent.  

# 3) (Optional) Centralize the mapping

If you’d rather keep `GameInputManager` dumb (canvas-space only), the above is enough. If you want it cleaner, let `GameInputManager` accept a mapper:

```ts
// signature idea
constructor(private toGameSpace?: (p: {x:number,y:number}) => {x:number,y:number}) {}
// then inside getPaddleTarget():
const p = this.mousePosition ?? this.touchPosition;
return p ? (this.toGameSpace ? this.toGameSpace(p) : p) : null;
```

…but the one-liner `toPlayfield()` in `main.ts` is perfectly fine.

---
