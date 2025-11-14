# Observation Space Documentation

## Overview

The RL environment uses a 19-dimensional observation vector representing the current game state. This document explains each component, rationale for inclusion, and notes on excluded features.

## Observation Vector Layout

The observation is a flat `np.float32` array with 19 elements:

```python
[
    0:  frame                    # Current simulation frame number
    1:  timeMs                   # Elapsed time in milliseconds
    2:  ball.position.x          # Ball X coordinate
    3:  ball.position.y          # Ball Y coordinate
    4:  ball.velocity.x          # Ball X velocity
    5:  ball.velocity.y          # Ball Y velocity
    6:  ball.speed               # Ball speed magnitude
    7:  ball.attached            # 1.0 if attached to paddle, 0.0 otherwise
    8:  paddle.position.x        # Paddle X coordinate
    9:  paddle.position.y        # Paddle Y coordinate
    10: paddle.targetX           # Paddle target X position
    11: paddle.width             # Current paddle width
    12: paddle.velocityX         # Paddle X velocity
    13: session.score            # Current score
    14: session.livesRemaining   # Lives remaining
    15: session.bricksRemaining  # Bricks remaining
    16: session.bricksTotal      # Total bricks at start
    17: session.comboHeat        # Current combo heat value
    18: session.volleyLength     # Current volley length
]
```

## Component Descriptions

### Time & Frame (0-1)
- **frame**: Sequential frame counter for temporal tracking
- **timeMs**: Elapsed simulation time in milliseconds
- **Rationale**: Enables temporal reasoning and time-based strategies

### Ball State (2-7)
- **position**: 2D coordinates in playfield space
- **velocity**: 2D velocity vector for trajectory prediction
- **speed**: Magnitude of velocity (derived but included for convenience)
- **attached**: Binary flag indicating if ball is waiting for launch
- **Rationale**: Core state for reactive control and trajectory planning

### Paddle State (8-12)
- **position**: 2D coordinates (Y is constant but included for consistency)
- **targetX**: The X position the paddle is moving toward
- **width**: Current paddle width (can change via power-ups)
- **velocityX**: Current paddle velocity for momentum awareness
- **Rationale**: Essential for positioning decisions and power-up tracking

### Session State (13-18)
- **score**: Current accumulated score
- **livesRemaining**: Number of lives left
- **bricksRemaining**: Count of breakable bricks still active
- **bricksTotal**: Total bricks at round start (for progress ratio)
- **comboHeat**: Combo meter value (decays over time)
- **volleyLength**: Current consecutive hits without losing ball
- **Rationale**: High-level strategic information for reward shaping and goal tracking

## Excluded Features & Rationale

### Hazard Descriptors
**Status**: Included in full observation dict but NOT in the 19-element vector

**Rationale**:
- Hazards are static or predictable (positions don't change randomly)
- Agent can learn hazard locations through experience on seed 1337
- Including all hazard details would significantly expand vector size
- Variable-length hazard lists don't fit fixed-size vector space cleanly

**Future Consideration**:
- Could add hazard proximity features (e.g., distance to nearest hazard)
- Could encode hazard count or types as categorical features
- For multi-seed training, hazard encoding becomes more valuable

### Multi-Ball State
**Status**: Currently excluded (game has multi-ball power-up but not tracked)

**Rationale**:
- Observation tracks the primary ball only
- Multi-ball is a temporary power-up effect, not a persistent state
- Complexity of tracking N balls with variable N is high
- For single-agent control, focusing on one ball simplifies action space

**Implementation Notes**:
- If multi-ball becomes critical, could add:
  - `activeBallCount`: Number of balls currently in play
  - Additional position/velocity pairs for secondary balls
  - Or, treat each ball independently in separate rollouts

### Brick Layout/Grid
**Status**: Not included in observation vector

**Rationale**:
- Brick grid would require 50-200+ values (depending on encoding)
- On seed 1337, layout is deterministic and learnable through memory
- Bricks are indirectly observable through collision events
- Including grid would make observation space massive

**Alternative Approaches**:
- Use `bricksRemaining` as summary statistic
- Agent learns spatial patterns from repeated episodes
- Could add convolutional or attention-based policy network for visual grid

### Power-Up State
**Status**: Partially tracked via `paddle.width` changes

**Rationale**:
- Active power-ups affect observable state (e.g., paddle size)
- Power-up inventory/timers not directly exposed
- Agent can infer effects from state changes
- Explicit power-up flags would add 5-10 dimensions

**Future Consideration**:
- Add binary flags for active power-ups (wide paddle, multi-ball, etc.)
- Add remaining duration counters for timed effects
- Trade-off: increases obs dim but improves sample efficiency

### Detailed Brick Types
**Status**: Not included

**Rationale**:
- Brick HP and types are spatial information (part of layout)
- Agent learns through experience which bricks are high-value
- For seed 1337, brick distribution is fixed
- `bricksRemaining` provides aggregate progress metric

## Design Philosophy

The observation space prioritizes:

1. **Compactness**: 19 dimensions keeps policy network lightweight
2. **Markov Property**: Sufficient information to infer dynamics
3. **Sample Efficiency**: Essential features enable faster learning
4. **Determinism**: On seed 1337, missing spatial info is learnable

## Extension Points

If generalization beyond seed 1337 is desired:

- **Add**: Hazard proximity features (3-5 dims)
- **Add**: Power-up status flags (5-10 dims)
- **Add**: Downsampled brick grid (e.g., 10x10 binary grid = 100 dims)
- **Consider**: Image-based observation (render playfield as pixels)

For now, the compact 19-element vector is optimized for single-seed deterministic training.

## Accessing Full Observation

The full structured observation (including hazards array) is available in the `info` dict returned by `step()`:

```python
obs_vector, reward, done, truncated, info = env.step(action)
full_observation = info.get("observation")  # Contains hazards, events, etc.
```

This allows post-hoc analysis and trajectory logging without inflating the RL observation space.
