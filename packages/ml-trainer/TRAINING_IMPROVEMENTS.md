# Training Improvements Guide

## Problem Diagnosis

Your trained agent has learned to do almost nothing (96.4% no-op actions) because:

1. **Sparse Rewards**: Only get points when bricks break (rare event)
2. **No Penalties**: No punishment for inaction or long episodes
3. **Local Minimum**: Agent found "doing nothing" avoids losing lives
4. **Poor Exploration**: Not enough variation to discover brick-breaking strategies

## Recommended Solutions

### 1. **Reward Shaping** (Highest Impact)

Modify `rl-simulator.ts` to provide denser, more informative rewards:

```typescript
// Current: Only reward on score increase
const reward = snapshot.score - this.lastScore;

// Better: Shape rewards to guide learning
let reward = snapshot.score - this.lastScore;  // Base score reward

// Add paddle-ball contact reward (encourages keeping ball alive)
if (paddleHitThisFrame) {
    reward += 0.5;
}

// Add brick proximity/hit reward (even without breaking)
if (brickHitThisFrame) {
    reward += 1.0;  // Partial credit for hitting bricks
}

// Penalize time without progress
if (this.frame % 100 === 0 && this.metrics.brickBreaks === 0) {
    reward -= 0.1;  // Small penalty for inactivity
}

// Penalize losing lives heavily
if (livesLost) {
    reward -= 10.0;
}

// Bonus for clearing level
if (this.bricksRemaining === 0) {
    reward += 50.0;
}
```

### 2. **Curriculum Learning** (Medium Impact)

Start with easier scenarios and gradually increase difficulty:

**Phase 1: Learn to Launch & Hit Paddle (Rounds 1-500k steps)**
- Simple brick layouts
- Wider paddle
- Slower ball

**Phase 2: Learn to Break Bricks (Rounds 500k-1M steps)**  
- Normal difficulty
- Standard paddle
- Normal ball speed

**Phase 3: Master Advanced Play (Rounds 1M+ steps)**
- Complex layouts with hazards
- Standard gameplay

### 3. **Action Masking & Penalties** (Medium Impact)

Discourage useless actions:

```python
# In lucky_break_env.py step() method
# Penalize excessive no-op
if action == 0:
    self._consecutive_noops += 1
    if self._consecutive_noops > 10:
        reward -= 0.1  # Penalty for doing nothing
else:
    self._consecutive_noops = 0

# Penalize launch when ball already launched
if action in [3, 4, 5] and not ball_attached:
    reward -= 0.05  # Wasteful action
```

### 4. **Observation Space Improvements** (Low-Medium Impact)

Add more useful information to help the agent:

```python
# Current observation has 19 elements
# Add these to help agent understand what to do:

# Distance from paddle to ball (when ball is falling)
distance_x = ball_x - paddle_x
distance_y = ball_y - paddle_y

# Nearest brick position (gives target to aim for)
nearest_brick_x = ...
nearest_brick_y = ...

# Time since last brick break (urgency signal)
time_since_break = frames_since_last_break / 100.0

# Paddle hitting zone indicator (-1 to 1, where ball will land)
predicted_landing_x = ...
```

### 5. **Training Hyperparameter Tuning** (Medium Impact)

Adjust these in `train_agent.py`:

```python
model = PPO(
    policy="MlpPolicy",
    env=vec_env,
    verbose=1,
    # EXPLORATION
    learning_rate=3e-4,      # Try 1e-3 for faster early learning
    ent_coef=0.01,           # Add entropy bonus to encourage exploration
    
    # EXPERIENCE COLLECTION
    n_steps=4096,            # Increase for more diverse experience
    batch_size=256,          # Increase for GPU efficiency
    n_epochs=20,             # More gradient steps per batch
    
    # POLICY NETWORK
    policy_kwargs=dict(
        net_arch=dict(
            pi=[256, 256, 128],  # Larger policy network
            vf=[256, 256, 128],  # Larger value network
        ),
        activation_fn=torch.nn.ReLU,
    ),
)
```

### 6. **Episode Timeout & Early Stopping** (Low Impact)

Prevent infinite boring episodes:

```python
# In lucky_break_env.py
MAX_STEPS = 5000  # End episode after 5000 steps

if self._step_count >= MAX_STEPS:
    truncated = True
    reward -= 5.0  # Penalty for timeout
```

### 7. **Better Initialization** (Low Impact)

Start with ball already launched to skip boring waiting:

```typescript
// In rl-simulator.ts initialize()
// Auto-launch ball at start
this.pendingLaunch = true;
```

## Implementation Priority

**Start here (Highest ROI):**

1. **Reward Shaping** - Add paddle hits, brick hits, and life-loss penalties
2. **Episode Timeout** - Limit to 3000-5000 steps max
3. **Exploration Bonus** - Set `ent_coef=0.01` in PPO

**Then add:**

4. **Observation Improvements** - Add distance-to-ball and nearest-brick
5. **Hyperparameter Tuning** - Larger networks, more training steps
6. **Action Penalties** - Discourage no-op spam

**Advanced (later):**

7. **Curriculum Learning** - Progressive difficulty
8. **Intrinsic Motivation** - Curiosity-driven exploration

## Quick Start: Minimal Changes for Immediate Improvement

### File 1: `packages/cli-sim/src/rl-simulator.ts`

Find the `advanceFrame()` method and modify reward calculation:

```typescript
// Around line 300-310, change from:
const reward = snapshot.score - this.lastScore;

// To:
let reward = snapshot.score - this.lastScore;

// Add small paddle-hit reward
if (this.metrics.paddleHits > lastPaddleHits) {
    reward += 0.5;
}

// Add brick-hit reward (even without breaking)
if (this.metrics.brickHits > lastBrickHits) {
    reward += 1.0;
}

// Heavy penalty for losing life
if (snapshot.livesRemaining < lastLives) {
    reward -= 10.0;
}

// Bonus for level completion
if (this.bricksRemaining === 0 && done) {
    reward += 50.0;
}

// Small time penalty to encourage urgency
if (this.frame % 100 === 0) {
    reward -= 0.05;
}

// Update tracking variables
lastPaddleHits = this.metrics.paddleHits;
lastBrickHits = this.metrics.brickHits;
lastLives = snapshot.livesRemaining;
```

### File 2: `packages/ml-trainer/train_agent.py`

Change PPO initialization to encourage exploration:

```python
model = PPO(
    policy="MlpPolicy",
    env=vec_env,
    verbose=1,
    tensorboard_log=str(args.tensorboard_log),
    seed=args.seed,
    device=device,
    n_steps=args.n_steps,
    batch_size=args.batch_size,
    ent_coef=0.01,  # ADD THIS: Entropy coefficient for exploration
    learning_rate=0.0005,  # ADD THIS: Slightly higher learning rate
    policy_kwargs=dict(
        net_arch=dict(pi=[256, 256], vf=[256, 256]),
    ),
)
```

## Expected Improvements

After implementing minimal changes:

- **Before**: 96% no-op, 1 brick in 1000 steps, score 10
- **After**: <20% no-op, consistent brick breaking, scores 100+

Full implementation should achieve:
- **Target**: Complete level in 2000-3000 steps
- **Score**: 80+ (all bricks cleared)
- **Strategy**: Active paddle movement, deliberate ball control

## Monitoring Progress

```bash
# Terminal 1: Train with new rewards
pnpm train:fresh

# Terminal 2: Watch TensorBoard
pnpm train:monitor

# Look for these metrics improving:
# - ep_rew_mean: Should increase from 80 to 200+
# - ep_len_mean: Should decrease from 5569 to 2000-3000
# - entropy_loss: Should be positive (exploration happening)
```

## Testing Your Changes

```bash
# After 1M training steps, evaluate:
pnpm train:evaluate

# Run diagnostic:
cd packages/ml-trainer
python diagnose_agent.py

# Should see:
# - Lower % of no-op actions (<20%)
# - Higher scores (100+)
# - Bricks breaking consistently
```
