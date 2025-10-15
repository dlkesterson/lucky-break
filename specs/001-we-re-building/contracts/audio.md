# Audio Contract — Lucky Break Core Experience

The audio subsystem exposes deterministic hooks so gameplay and tests can validate tone scheduling.

## Scene Transition API
```json
{
  "scene": "tense",
  "scheduledAt": 1739582402.125,
  "appliesAtBar": 128,
  "parameters": {
    "pad": "airy_F3",
    "drumDensity": 0.7,
    "reverbSend": 0.32,
    "delaySend": 0.18,
    "filters": {
      "cutoffHz": 3200,
      "resonance": 0.45
    }
  }
}
```
- **Guarantees**: `scheduledAt` is in AudioContext seconds. `appliesAtBar` increments monotonically. Parameters must describe the entire scene state.

## SFX Trigger Contract
```json
{
  "id": "brick/snare-01",
  "time": 1739582401.732,
  "gain": 0.86,
  "detune": 75,
  "pan": -0.15,
  "source": {
    "event": "BrickBreak",
    "row": 4,
    "velocity": 9.4
  }
}
```
- **Guarantees**: `time` is absolute Tone clock time; triggers must be scheduled no later than 20 ms before playback to avoid glitches.

## Offline Render Contract
```json
{
  "scene": "focus",
  "bars": 4,
  "outputPath": "artifacts/audio/focus-bar.wav",
  "expectedRmsRange": [ -18, -12 ]
}
```
- **Behavior**: CLI-driven offline renders produce WAV files for analysis; RMS range ensures mix consistency.
