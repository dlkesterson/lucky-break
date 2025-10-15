# Event Contracts — Lucky Break Core Experience

Lucky Break exposes gameplay interactions through an internal event bus as well as CLI automation hooks. The contracts below define the shape and sequencing guarantees required by the specification.

## Gameplay Event Bus

Events are emitted from physics/audio subsystems via a publish/subscribe interface. Payloads must remain stable for integration consumers (rendering, audio, analytics, CLI).

### `BrickBreak`
```json
{
  "type": "BrickBreak",
  "timestamp": 1739582400000,
  "payload": {
    "sessionId": "abc123",
    "row": 4,
    "col": 7,
    "velocity": 9.4,
    "brickType": "standard",
    "comboHeat": 6
  }
}
```
- **Guarantees**: Emitted once per destroyed brick. `velocity` is the ball speed (units/second). `comboHeat` reflects the post-hit metric.
- **Consumers**: Audio (SFX detune), HUD score updates, analytics.

### `PaddleHit`
```json
{
  "type": "PaddleHit",
  "timestamp": 1739582400123,
  "payload": {
    "sessionId": "abc123",
    "angle": -18.5,
    "speed": 7.1,
    "impactOffset": -0.35
  }
}
```
- **Guarantees**: Fired on every paddle collision. `impactOffset` is normalized (-1 left edge to 1 right edge).
- **Consumers**: Audio SFX, volley metric updates, renderer VFX cues.

### `WallHit`
```json
{
  "type": "WallHit",
  "timestamp": 1739582400188,
  "payload": {
    "sessionId": "abc123",
    "side": "left",
    "speed": 6.8
  }
}
```
- **Guarantees**: Emitted for top/left/right contacts (not bottom). Side enumerations: `top`, `left`, `right`.
- **Consumers**: Minimal SFX, combo decay when repetitive.

### `LifeLost`
```json
{
  "type": "LifeLost",
  "timestamp": 1739582400500,
  "payload": {
    "sessionId": "abc123",
    "livesRemaining": 2,
    "cause": "ball-drop"
  }
}
```
- **Guarantees**: Fired once per lost life. Causes: `ball-drop`, `timeout`, `forced-reset`.
- **Consumers**: HUD messaging, audio reset cues, analytics.

### `RoundCompleted`
```json
{
  "type": "RoundCompleted",
  "timestamp": 1739582402000,
  "payload": {
    "sessionId": "abc123",
    "round": 1,
    "scoreAwarded": 2500,
    "durationMs": 182000
  }
}
```
- **Guarantees**: Only emitted after all breakable bricks are cleared.
- **Consumers**: Level progression, celebration effects, CLI metrics.

## CLI Command Contracts

CLI commands wrap library modules to enable automation. Commands must accept JSON via stdin and emit structured JSON responses to stdout, with human-readable logs routed to stderr.

### `lucky-break simulate`
**Input**
```json
{
  "mode": "simulate",
  "seed": 42,
  "round": 1,
  "durationSec": 180,
  "options": {
    "audio": false,
    "visual": false,
    "telemetry": true
  }
}
```
**Output**
```json
{
  "ok": true,
  "sessionId": "sim-42-r1",
  "score": 3200,
  "volleyStats": {
    "longestVolley": 18,
    "averageSpeed": 7.4
  },
  "events": 512
}
```
- **Behavior**: Runs the physics loop with deterministically seeded RNG. Audio and visual subsystems may be stubbed when disabled.

### `lucky-break preload`
**Input**
```json
{
  "mode": "preload",
  "manifestPath": "assets/samples/manifest.json"
}
```
**Output**
```json
{
  "ok": true,
  "manifestEntries": 30,
  "durationMs": 5400
}
```
- **Behavior**: Validates sample manifest, reports counts, and warms caches for offline use.

### `lucky-break export-metrics`
**Input**
```json
{
  "mode": "export-metrics",
  "sessionId": "abc123",
  "output": "reports/session-abc123.json"
}
```
**Output**
```json
{
  "ok": true,
  "written": "reports/session-abc123.json"
}
```
- **Behavior**: Serializes telemetry captured during gameplay for QA review.
