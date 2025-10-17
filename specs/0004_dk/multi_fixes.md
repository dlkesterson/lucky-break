
### 1. Removing the Left Grey/Black Border (Fill the Viewport Fully)
**Likely Cause:** 
- The screenshot shows a black background with HUD text on the left, followed by game elements (grey/orange bricks, green paddle, red ball) that don't start from the absolute left edge. This "border" is likely due to the game's aspect ratio preservation in `handleResize`. The playfield (1280x720) is scaled with `Math.min(scaleX, scaleY)` and centered, creating black bars on the sides (or top/bottom) when the window aspect ratio doesn't match 16:9. If your window is wider than tall, you'll see left/right black bars. The HUD is overlaid on the canvas (not scaled/positioned with the root layer), so it appears on the left black area.
- It's not a true CSS border—it's unused canvas space. The grey/black appearance comes from the canvas background and graphics fills.

**Fix:** To fully fill the viewport without black bars, we can stretch the root layer to match the window dimensions (even if it slightly distorts the aspect ratio). This is common for simple games like Breakout where perfect circles aren't critical. We'll also move the HUD inside the root layer and use relative positioning so it scales appropriately and stays in the top-left corner without overlapping the "border."

Update `src/app/main.ts` (in the `onStart` callback, around the `handleResize` function and HUD setup):

```typescript
// ... (existing code)

// In handleResize:
const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    stage.resize({ width: w, height: h });

    // Change to stretch-fill instead of aspect-preserved scale
    const scaleX = w / 1280;
    const scaleY = h / 720;
    stage.layers.root.scale.set(scaleX, scaleY);
    stage.layers.root.position.set(0, 0);  // No centering—fill from top-left
};

// ... (later, after creating hudContainer)

// Move hudContainer into the scaled root layer so it fills properly
stage.layers.root.addChild(hudContainer);  // Instead of stage.addToLayer('hud', hudContainer);

// In the afterRender hook, update HUD positions to be relative (percent-based for scaling)
hudContainer.position.set(0, 0);  // Anchor to top-left of root

// Update text positions to be fixed relative to 1280x720 playfield
const statusText = new Text({
    text: hudView.statusText,
    style: { fill: 0xffffff, fontSize: 16 }
});
statusText.x = 20 / 1280 * 1280;  // Relative, but simplifies to 20
statusText.y = 20 / 720 * 720;    // Relative, simplifies to 20
hudContainer.addChild(statusText);

// Similarly for summaryText:
if (hudView.summaryLine) {
    const summaryText = new Text({
        text: hudView.summaryLine,
        style: { fill: 0xcccccc, fontSize: 14 }
    });
    summaryText.x = 20;
    summaryText.y = 50;
    hudContainer.addChild(summaryText);
}

// For entries:
hudView.entries.forEach((entry, index) => {
    const entryText = new Text({
        text: `${entry.label}: ${entry.value}`,
        style: { fill: 0xffffff, fontSize: 12 }
    });
    entryText.x = 20;
    entryText.y = 80 + index * 20;
    hudContainer.addChild(entryText);
});

// Combo text:
if (scoringState.combo > 0) {
    const comboText = new Text({
        text: `Combo: ${scoringState.combo}x (${scoringState.comboTimer.toFixed(1)}s)`,
        style: { fill: 0xffff00, fontSize: 14, fontWeight: 'bold' }
    });
    comboText.x = 20;
    comboText.y = 80 + hudView.entries.length * 20 + 10;
    hudContainer.addChild(comboText);
}

// Active power-ups:
const activePowerUps = powerUpManager.getActiveEffects();
activePowerUps.forEach((effect, index) => {
    const powerUpText = new Text({
        text: `${effect.type}: ${effect.remainingTime.toFixed(1)}s`,
        style: { fill: 0x00ffff, fontSize: 12 }
    });
    powerUpText.x = 20;
    powerUpText.y = 80 + hudView.entries.length * 20 + 35 + index * 18;
    hudContainer.addChild(powerUpText);
});
```

- **Additional CSS Fix:** Add this to your `index.html` or a stylesheet to remove any default browser margins/padding that might contribute to offsets:
  ```html
  <style>
      body { margin: 0; padding: 0; overflow: hidden; }
  </style>
  ```
- **Test:** Resize the window after applying. The game should now stretch to fill without black bars. If you prefer preserving aspect ratio but eliminating only the left bar (e.g., align left), change `position.set(0, (h - 720 * scaleY) / 2);` using `scaleY = Math.min(scaleX, scaleY)`.

### 2. Paddle Offset from Mouse (Center Paddle Under Cursor)
**Likely Cause:** 
- The paddle's center is set to the mouse's x-position in playfield space, which should align it under the cursor. However, the offset to the right suggests an issue with mouse coordinate calculation in `toPlayfield` or `inputManager.getPaddleTarget()`. Common culprits: not accounting for canvas bounding rect (e.g., if using `pageX` instead of `clientX - rect.left`), default body margins shifting the canvas, or scaling/positioning mismatches after resize.
- From the screenshot, the green paddle is offset left of center, but you describe it as "off to the right" relative to the mouse—likely a coord mismatch.

**Fix:** Ensure mouse positions are correctly relative to the canvas. Update `src/app/main.ts` (in the `beforeStep` hook):

```typescript
// ... (existing code in beforeStep)

// Process input
const paddleTarget = inputManager.getPaddleTarget();
if (paddleTarget) {
    const rect = stage.canvas.getBoundingClientRect();  // Ensure relative to canvas
    const canvasX = paddleTarget.x - rect.left;  // Explicitly correct for any offset
    const canvasY = paddleTarget.y - rect.top;

    const pf = toPlayfield({ x: canvasX, y: canvasY });  // Use corrected canvas coords

    const targetX = pf.x;
    const halfPaddleWidth = paddle.width / 2;
    const clampedX = Math.max(halfPaddleWidth, Math.min(targetX, 1280 - halfPaddleWidth));
    MatterBody.setPosition(paddle.physicsBody, { x: clampedX, y: paddle.physicsBody.position.y });
}
```

- If `src/input/input-manager.ts` uses `event.pageX`/`pageY` (absolute to page), change it to `event.clientX`/`clientY` (relative to viewport) and subtract `rect.left`/`top` as above.
- Combined with the margin:0 fix from issue 1, this should center the paddle exactly under the cursor. Test by logging `clampedX` vs. mouse x—if still offset, your `input-manager.ts` might need similar rect subtraction.

### 3. No Sounds
**Likely Cause:** 
- The codebase has audio infrastructure (`src/audio/sfx.ts` for SFX routing on `BrickBreak` events, `src/audio/scheduler.ts` for Tone.js scheduling), but it's not wired up in `src/app/main.ts`. The `defaultTrigger` in `sfx.ts` is a no-op, and there's no event bus, Tone.js startup, or actual sound playback. Audio is mentioned in `agents.md` (e.g., AudioMaestro), but not implemented in the bootstrap.

**Fix:** Add event bus, scheduler, and SFX router. For playback, we'll use a simple Tone.js Synth as a placeholder (replace with samples later via Tone.Sampler). Update `src/app/main.ts`:

```typescript
// At top, add imports:
import { createEventBus } from '@app/events';
import { createToneScheduler } from '@audio/scheduler';
import { createSfxRouter } from '@audio/sfx';
import { Synth, start as toneStart } from 'tone';  // Assume Tone.js is in package.json

// In onStart, after creating physics/session:
await toneStart();  // Start Tone.js audio context (call once)

const bus = createEventBus();  // Create event bus

const scheduler = createToneScheduler({ lookAheadMs: 120 });

const synth = new Synth().toDestination();  // Simple synth for testing (replace with Sampler for real SFX)

const router = createSfxRouter({
    bus,
    scheduler,
    brickSampleId: 'brick-hit',  // Placeholder ID
    trigger: (descriptor) => {
        // Play sound based on descriptor (e.g., pan/detune from brick hit)
        synth.triggerAttackRelease(
            'C4',  // Note (tune based on detune)
            '8n',  // Duration
            descriptor.time,
            descriptor.gain
        );
        synth.set({ pan: descriptor.pan, detune: descriptor.detune });
    },
});

// In collisionStart event (when brick breaks):
bus.publish('BrickBreak', {
    row: Math.floor((brick.position.y - 100) / BRICK_HEIGHT),  // Estimate row/col from position
    col: Math.floor((brick.position.x - 50) / BRICK_WIDTH),
    velocity: ball.physicsBody.speed,  // From ball
    comboHeat: scoringState.combo,
});

// At end of onStart, before loop.start():
// Add dispose on unload (optional):
window.addEventListener('beforeunload', () => {
    router.dispose();
    scheduler.dispose();
});
```

- **Add Dependencies:** If not present, run `pnpm add tone`.
- **Test:** Break a brick—the synth should play a tone on `BrickBreak`. For real samples, replace `Synth` with `Sampler` (load URLs in `new Sampler({ urls: { C4: 'path/to/brick-hit.wav' } })`).
- **Enhance:** Add more events (e.g., `PaddleHit`) to `bus.publish` in collisions.
