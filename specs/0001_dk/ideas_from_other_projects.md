### Enhancing Lucky Break with Mechanics from Past Projects

Based on reviewing the codebases for Lucky Break, Banana Music Game, and Cloud Popper, I've identified several solid mechanics from the older projects that could elevate Lucky Break's gameplay. These focus on physics refinement, scoring dynamics, audio integration, level progression, and power-ups—areas where Lucky Break's current implementation is functional but could benefit from more depth and polish. I'll highlight key excerpts from Banana Music Game and Cloud Popper, explain why they're useful, and suggest how to adapt them into Lucky Break (e.g., integrating with your Matter.js physics, event bus, or state management).

#### 1. **Paddle-Hit Reflection and Bounce Control** (from Cloud Popper)
   - **Why it's good**: Cloud Popper's paddle reflection logic adds tactical depth by varying the ball's bounce angle based on where it hits the paddle (center for straight bounces, edges for sharper angles). This makes the game feel more skill-based and less predictable, encouraging precise paddle positioning. Lucky Break's current paddle hits (in `src/physics/ball-launch.ts` and `src/input/paddle-control.ts`) are basic and could use this to reduce repetitive straight-line bounces.
   - **Key Code from Cloud Popper** (`src/utils/paddleReflection.ts`):
     ```typescript
     import { Vec3, type Body } from 'cannon-es';

     const tmpDirection = new Vec3();

     export function reflectOffPaddle(ball: Body, paddle: Body, paddleWidth: number, minSpeed: number): void {
       const hitOffset = (ball.position.x - paddle.position.x) / (paddleWidth * 0.5);
       const clamped = Math.max(-1, Math.min(1, hitOffset));
       const angle = clamped * (Math.PI * 0.42);  // Max angle ~75 degrees
       const speed = Math.max(ball.velocity.length(), minSpeed);
       tmpDirection.set(Math.sin(angle), Math.abs(Math.cos(angle)), 0);
       tmpDirection.normalize();
       tmpDirection.scale(speed, tmpDirection);
       ball.velocity.copy(tmpDirection);
     }
     ```
   - **Adaptation for Lucky Break**: Integrate this into your `PaddleHit` event handler in `src/physics/world.ts` or `src/input/paddle-control.ts`. Use Matter.js equivalents (e.g., `Matter.Vector` instead of `CANNON.Vec3`). Trigger it on collision detection:
     ```typescript
     // In src/physics/world.ts, in afterStep hook or collision event
     if (collision.pairs.some(pair => pair.bodyA.label === 'ball' && pair.bodyB.label === 'paddle')) {
       const ball = pair.bodyA;  // Assuming bodyA is ball
       const paddle = pair.bodyB;
       const hitOffset = (ball.position.x - paddle.position.x) / (paddle.bounds.max.x - paddle.bounds.min.x);
       const clamped = Math.max(-1, Math.min(1, hitOffset));
       const angle = clamped * (Math.PI * 0.42);
       const speed = Matter.Vector.magnitude(ball.velocity) || GameConfig.ball.baseSpeed;  // Fallback to base speed
       const newVel = Matter.Vector.create(Math.sin(angle) * speed, Math.abs(Math.cos(angle)) * speed);
       Matter.Body.setVelocity(ball, newVel);
       // Emit PaddleHit event with { angle, speed, impactOffset: clamped }
     }
     ```
     This would tie into your `MomentumMetrics` for combo building and audio cues.

#### 2. **Speed Regulation and Velocity Clamping** (from Cloud Popper)
   - **Why it's good**: Prevents the ball from getting too slow (boring) or too fast (unplayable) by clamping velocity. Cloud Popper's regulator ensures consistent pacing, which Lucky Break lacks—your ball can tunnel or stall in long volleys (seen in `src/physics/world.spec.ts` tests).
   - **Key Code from Cloud Popper** (`src/utils/regulateSpeed.ts`):
     ```typescript
     import type { Body } from 'cannon-es';

     interface RegulateConfig { baseSpeed: number; maxSpeed: number; }
     const EPSILON = 1e-6;

     export function regulateSpeed(body: Body, config: RegulateConfig): void {
       const velocity = body.velocity;
       const speed = velocity.length();
       if (speed < EPSILON) {
         velocity.scale(config.baseSpeed / EPSILON, velocity);
         return;
       }
       if (speed < config.baseSpeed) {
         velocity.scale(config.baseSpeed / speed, velocity);
       } else if (speed > config.maxSpeed) {
         velocity.scale(config.maxSpeed / speed, velocity);
       }
     }
     ```
   - **Adaptation for Lucky Break**: Add this to your physics step in `src/physics/world.ts` (e.g., in `afterStep`). Use your `GameConfig` for base/max speeds:
     ```typescript
     // In src/physics/world.ts, afterStep
     visualBodies.forEach((visual, body) => {
       if (body.label === 'ball') {
         const speed = Matter.Vector.magnitude(body.velocity);
         if (speed < 1e-6) {
           Matter.Body.setVelocity(body, Matter.Vector.mult(body.velocity, GameConfig.ball.baseSpeed / 1e-6));
         } else if (speed < GameConfig.ball.baseSpeed) {
           Matter.Body.setVelocity(body, Matter.Vector.mult(body.velocity, GameConfig.ball.baseSpeed / speed));
         } else if (speed > GameConfig.ball.maxSpeed) {
           Matter.Body.setVelocity(body, Matter.Vector.mult(body.velocity, GameConfig.ball.maxSpeed / speed));
         }
       }
     });
     ```
     This complements your `volleyLength` and `speedPressure` metrics for smoother momentum tracking.

#### 3. **Combo-Based Scoring with Decay and Multipliers** (from Banana Music Game)
   - **Why it's good**: Banana Music Game's scoring rewards chains with multipliers and decays over time, adding tension and replayability. Lucky Break's scoring (in `specs/001-we-re-building/data-model.md`) is basic—integrating this could enhance `comboHeat` and tie into audio scenes for "tense" or "climax" transitions.
   - **Key Code from Banana Music Game** (`src/lib/gameplay/scoring.ts`):
     ```typescript
     export type ScoreState = { score: number; combo: number; comboTimer: number; lives: number; updateHUD: () => void; };

     export function createScoring(updateHUD: () => void): ScoreState {
       return { score: 0, combo: 0, comboTimer: 0, lives: 3, updateHUD };
     }

     export function brickPoints(state: ScoreState, base = 10, multiplierPer8 = 0.25) {
       const mult = 1 + Math.floor(state.combo / 8) * multiplierPer8;
       const pts = Math.round(base * mult);
       state.score += pts;
       state.combo += 1;
       state.comboTimer = 1.6;  // Reset decay timer
       if (state.combo > 0 && state.combo % 8 === 0) playComboFill();  // SFX hook
       state.updateHUD();
       return pts;
     }

     export function decayCombo(state: ScoreState, dt: number) {
       if (state.comboTimer > 0) {
         state.comboTimer -= dt;
         if (state.comboTimer <= 0) state.combo = 0;
       }
     }
     ```
   - **Adaptation for Lucky Break**: Update `MomentumMetrics` in `specs/001-we-re-building/data-model.md` to include a `comboTimer`. Call `decayCombo` in your game loop (`src/app/loop.ts`). On `BrickBreak` events, use `brickPoints` and emit to HUD/audio:
     ```typescript
     // In src/app/state.ts or data-model.ts
     interface MomentumMetrics { /* ... */ comboTimer: number; }

     // In src/app/loop.ts, after physics update
     decayCombo(state.momentum, deltaMs / 1000);

     // In BrickBreak handler
     brickPoints(state.momentum, 10, 0.25);
     // Update audio scene based on combo: if (state.combo >= 16) transition to 'climax'
     ```
     This would make your `RoundCompleted` events more rewarding.

#### 4. **Power-Up Spawning on Brick Breaks** (from Banana Music Game)
   - **Why it's good**: Random power-ups (e.g., paddle width boost) add variety and excitement. Banana Music Game spawns them on ~25% of breaks, with timed effects. Lucky Break mentions power-ups in `BrickCell` but lacks implementation— this could expand your `power-up` brick type.
   - **Key Code from Banana Music Game** (`src/main.ts`, in collision handler):
     ```typescript
     // In handleBananaBrickCollisions callback
     if (brick.hp <= 0 && Math.random() < 0.25) {
       paddlePowerTimer = Math.max(paddlePowerTimer, 2.5);
       ((paddle.mesh.material) as THREE.MeshBasicMaterial).color.set(0xffff66);  // Visual cue
       paddle.setWidthFactor(1.5);  // Temporary boost
     }

     // In main loop (decay)
     if (paddlePowerTimer > 0) {
       paddlePowerTimer -= dt;
       const f = 1 + 0.5 * Math.max(0, Math.min(1, paddlePowerTimer / 0.25));
       paddle.setWidthFactor(f);
       if (paddlePowerTimer <= 0) {
         ((paddle.mesh.material) as THREE.MeshBasicMaterial).color.set(0x00d1b2);  // Reset
         paddle.setWidthFactor(1);
       }
     }
     ```
   - **Adaptation for Lucky Break**: Add to `BrickBreak` in `src/physics/index.ts`. Use a timer in `GameSession` and update paddle visuals in `src/render/paddle-body.ts`:
     ```typescript
     // In src/physics/index.ts, on brick break
     if (brick.type === 'power-up' && Math.random() < 0.25) {
       state.powerUpTimer = 2.5;  // Add to GameSession
       emit('PowerUpActivated', { type: 'paddle-width', duration: 2.5 });
     }

     // In src/app/loop.ts
     if (state.powerUpTimer > 0) {
       state.powerUpTimer -= deltaMs / 1000;
       const scale = 1 + 0.5 * Math.max(0, state.powerUpTimer / 0.25);
       paddle.width = originalWidth * scale;  // Update physics body
       if (state.powerUpTimer <= 0) paddle.width = originalWidth;
     }
     ```
     Tie into your SFX for activation sounds.

#### 5. **Level Progression and Brick Layouts** (from Banana Music Game)
   - **Why it's good**: Preset level specs with increasing rows/HP create progression. Banana Music Game clears/reloads on completion, which could automate Lucky Break's `RoundCompleted` flow beyond basic brick clearing.
   - **Key Code from Banana Music Game** (`src/lib/gameplay/levels.ts` and `src/main.ts`):
     ```typescript
     export type LevelSpec = { rows: number; cols: number; hpPerRow?: (row: number) => number; };

     const presets: LevelSpec[] = [
       { rows: 4, cols: 8, hpPerRow: (r) => 1 + (r >= 2 ? 1 : 0) },
       { rows: 5, cols: 9, hpPerRow: (r) => 1 + Math.floor(r / 2) },
     ];

     export function getLevel(idx: number): LevelSpec {
       return presets[idx % presets.length];
     }

     // In main.ts, on all bricks cleared
     if (!alive) {
       playVictory();
       setTimeout(() => {
         field.clearAll();
         levelIndex = (levelIndex + 1);
         field = loadLevel(levelIndex);  // Rebuild bricks with getLevel(levelIndex)
       }, 400);
     }
     ```
   - **Adaptation for Lucky Break**: Expand `BrickField` in `data-model.md` with presets. On `RoundCompleted`, reload via CLI-like simulation or direct rebuild:
     ```typescript
     // In src/app/main.ts or round handler
     if (breakableRemaining === 0) {
       emit('RoundCompleted', { round: state.round, scoreAwarded: calculateBonus() });
       setTimeout(() => {
         state.round += 1;
         rebuildBrickField(getLevelSpec(state.round));  // Function to generate new layout
       }, 400);
     }
     ```
     This scales your game beyond a single round.

#### Additional Notes
- **Audio Integration**: Banana Music Game's Strudel/Tone.js hooks (in `src/main.ts`) for beat-synced SFX could inspire syncing Lucky Break's Tone.js scenes to gameplay events, enhancing your `AudioState` transitions.
- **Testing Alignment**: Both older projects have Playwright tests (e.g., Cloud Popper's `tests/cloud-popper.spec.ts` for bot-driven playthroughs). Mirror this in Lucky Break's Vitest setup for regression testing new mechanics.
- **Start Small**: Prioritize paddle reflection and speed regulation—they'll immediately improve feel. Test with your `tests/unit/physics/*` suite.
