
The cursor/paddle **offset** comes from mixing **canvas-space** mouse coordinates with a **letterboxed, scaled, and translated** playfield. You already normalize the mouse to the canvas via `getBoundingClientRect()` (great), but then you pass that x directly to the paddle while your playfield lives under a container that’s scaled & offset to preserve aspect ratio. 

### Do these two fixes

#### 1) Map mouse → playfield coordinates before updating the paddle

Right before you call `updatePaddle`, convert the normalized canvas coordinate into the playfield’s local space by **inverting the root transform** (subtract the letterbox offset, then divide by scale). In your main game loop where you handle input:

```ts
// main.ts (inside your beforeStep/beforeRender section)
const target = inputManager.getPaddleTarget();
if (target) {
  // root is the letterboxed container returned from createStage()
  // (you destructure it as { layers: { root, playfield } } in main.ts)
  const xPlayfield =
    (target.x - root.position.x) / (root.scale.x || 1);

  paddleController.updatePaddle(paddle, deltaSec, {
    leftPressed: false,
    rightPressed: false,
    mouseX: xPlayfield,  // <- use playfield coords, not canvas coords
    touchX: undefined,
    launchRequested: false,
  });
}
```

This keeps the paddle’s center **exactly under the mouse** no matter how the stage is scaled/letterboxed.

> Why this works: you size the canvas to the window and then scale/offset `root` to fit the 1280×720 scene. The input manager gives you **canvas** pixels; the paddle expects **scene/playfield** pixels. One subtraction + one divide makes them match. (The canvas CSS isn’t the problem; the gray strips are walls, not borders.) 

#### 2) Don’t mark “pressed” on mousemove (prevents accidental “tap-to-start”)

Your mouse normalization currently sets `pressed: event.type === 'mousedown' || event.type === 'mousemove'`. That can make a plain move look like a click and trigger your launch logic. Change it to only treat **actual presses** as pressed:

```ts
// src/util/input-helpers.ts
export function normalizeMouseEvent(event: MouseEvent, canvas: HTMLCanvasElement): MouseEventData {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
    button: getMouseButton(event.button),
    pressed: event.type === 'mousedown', // ← was also true on mousemove
  };
}
```

This aligns with how you compute `screenTapped` in `eventsToInputState` and avoids any “jump + auto-launch” surprises. 

---

If you make both changes:

* The paddle will stay locked to the cursor (no bottom-right drift).
* Clicking “Tap to Start” won’t be faked by a mere mousemove.

