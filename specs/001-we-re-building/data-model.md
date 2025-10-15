# Data Model — Lucky Break Core Experience

## Overview
The Lucky Break runtime manages ephemeral gameplay state for a single player session. Data lives entirely in memory but is structured into well-defined entities so gameplay, audio, rendering, and tooling modules can coordinate reliably.

## Entities

### GameSession
- **Fields**:
  - `sessionId: string` — unique identifier for telemetry and automation.
  - `status: 'pending' | 'active' | 'paused' | 'completed' | 'failed'`
  - `score: number` — cumulative points for the current session.
  - `livesRemaining: number`
  - `round: number` — current level index.
  - `elapsedTimeMs: number` — wall-clock time since start (excludes pauses).
  - `brickLayout: BrickField` — snapshot of remaining bricks for render/audio logic.
  - `lastOutcome?: { result: 'win' | 'loss'; timestamp: number }`
- **Relationships**: Owns a `MomentumMetrics` aggregate, references `PlayerPreferences`, exposes `AudioState` for Tone.js.
- **State transitions**:
  - `pending → active` when player launches the ball.
  - `active ↔ paused` on visibility or menu events.
  - `active → completed` after clearing breakable bricks.
  - `active → failed` when lives drop to zero.

### BrickField
- **Fields**:
  - `rows: number`
  - `cols: number`
  - `bricks: BrickCell[][]` — remaining brick descriptors.
  - `totalBreakable: number`
  - `breakableRemaining: number`
- **Relationships**: Embedded within `GameSession`.
- **Validation**: `breakableRemaining` must equal count of cells whose `type` is breakable; grid dimensions must align with `rows` × `cols`.

### BrickCell
- **Fields**:
  - `type: 'standard' | 'multi-hit' | 'indestructible' | 'power-up'`
  - `hitsRemaining: number`
  - `row: number`
  - `col: number`
- **Validation**: `hitsRemaining` ≥ 0; indestructible bricks always report `hitsRemaining = Infinity` or a sentinel value.

### MomentumMetrics
- **Fields**:
  - `volleyLength: number`
  - `speedPressure: number` — exponential moving average of ball speed (0–1).
  - `brickDensity: number` — ratio of breakable bricks remaining (0–1).
  - `comboHeat: number`
  - `updatedAt: number` — timestamp of last evaluation.
- **Relationships**: Drives audio scene selection via `AudioState`, influences renderer VFX intensity.
- **Transitions**: Metrics update after each physics tick or event; decay functions ensure graceful fallback to baseline over time.

### AudioState
- **Fields**:
  - `scene: 'calm' | 'focused' | 'tense' | 'climax'`
  - `nextScene?: 'calm' | 'focused' | 'tense' | 'climax'`
  - `barCountdown: number` — beats until next scheduled transition.
  - `sends: { reverb: number; delay: number }`
  - `primaryLayerActive: boolean`
- **Relationships**: Consumes `MomentumMetrics` snapshots, informs Tone.js scheduling logic.
- **Transitions**: `scene` changes only on bar boundaries; `nextScene` resets after application.

### PlayerPreferences
- **Fields**:
  - `masterVolume: number` — 0.0–1.0.
  - `muted: boolean`
  - `reducedMotion: boolean`
  - `controlScheme: 'touch' | 'mouse' | 'keyboard'`
  - `controlSensitivity: number`
- **Relationships**: Referenced by HUD, input handling, and audio subsystems.
- **Validation**: Sensitivity constrained to configured min/max; volume changes propagate immediately to audio bus.

### CLIJob
- **Fields**:
  - `jobId: string`
  - `mode: 'simulate-round' | 'preload-audio' | 'export-metrics'`
  - `parameters: Record<string, unknown>` — scenario inputs (e.g., RNG seed, difficulty).
  - `startedAt: number`
  - `completedAt?: number`
  - `result?: { success: boolean; artifacts?: string[]; errors?: string[] }`
- **Relationships**: CLI flow instantiates `GameSession` instances headlessly; results feed automated reports.

## Derived Views
- **HUDSnapshot**: Aggregates `GameSession` score, lives, current scene, and top-level prompts for rendering.
- **TelemetryRecord**: Captures discrete events (`BrickBreak`, `PaddleHit`, `LifeLost`) with metadata for analytics and debugging.

## Validation Rules & Invariants
- Lives may never drop below zero; when zero, `status` becomes `failed` immediately.
- `volleyLength` resets to zero whenever the player loses a life or the ball is relaunched.
- Audio transitions must schedule at least one beat (≥250 ms) ahead to avoid race conditions.
- CLI jobs must resolve within predefined timeouts (default 30 seconds) or surface errors for observability.
