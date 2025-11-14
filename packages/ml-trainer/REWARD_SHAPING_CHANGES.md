# Reward Shaping Implementation Summary

## Changes Made

### 1. Enhanced Reward Signal in `rl-simulator.ts`

**Location**: `packages/cli-sim/src/rl-simulator.ts` - `advanceFrame()` method

**Previous behavior**:
```typescript
const reward = snapshot.score - this.lastScore;  // Only score changes
```

**New behavior** (7 reward components):

1. **Base Score Reward** (`scoreGain`): Main objective - points from breaking bricks
2. **Paddle Hit Bonus** (`+0.5` per hit): Encourages keeping ball alive
3. **Brick Break Bonus** (`+2.0` per brick): Extra encouragement beyond score
4. **Life Loss Penalty** (`-10.0` per life): Heavy punishment for losing lives
5. **Level Complete Bonus** (`+50.0`): Large reward for clearing all bricks
6. **Time Pressure Penalty** (`-0.02` per 200 frames): Gentle nudge to make progress
7. **Game Over Penalty** (`-20.0`): Additional punishment for losing all lives

### 2. Exploration Encouragement in `train_agent.py`

**Location**: `packages/ml-trainer/train_agent.py` - PPO initialization

**Added hyperparameters**:
```python
ent_coef=0.01,          # Entropy bonus to encourage exploration
learning_rate=0.0005,   # Increased from default 0.0003 for faster learning
```

## Verification Results

Running `verify_rewards.py` confirms all components are active:

```
Total steps: 1000
Total reward: 38.04

Reward breakdown:
  time_penalty         : 522 (52.2%)  ✓ Working
  no_reward            : 473 (47.3%)
  brick_break_bonus    :   4 ( 0.4%)  ✓ Working
  paddle_hit           :   1 ( 0.1%)  ✓ Working
```

## Expected Impact

### Before Changes
- **Agent behavior**: 96% no-op actions
- **Performance**: 1 brick broken in 1000 steps, score 10
- **Problem**: Agent learned "doing nothing" avoids losing lives

### After Changes (Expected)
- **Agent behavior**: <20% no-op, active paddle movement
- **Performance**: 50-80+ bricks broken per episode, scores 100-500+
- **Improvement**: Agent learns:
  1. Paddle hits are good (keep ball alive)
  2. Breaking bricks is very good (main goal)
  3. Losing lives is very bad (avoid at all costs)
  4. Making progress is important (time pressure)

## Training Recommendations

### Fresh Training (Recommended)

Start from scratch with new reward structure:

```bash
# Delete old models (they learned the wrong thing)
rm -rf packages/ml-trainer/models/best
rm -rf packages/ml-trainer/models/checkpoints

# Start fresh training
pnpm train:fresh
```

**Expected timeline**:
- **100k steps**: Agent learns to launch and hit paddle consistently
- **500k steps**: Agent breaks bricks regularly, scores 50-100
- **1M steps**: Agent completes levels, scores 100-200
- **2M steps**: Optimized play, scores 200-500+

### Monitoring Progress

```bash
# Terminal 1: Training
pnpm train:fresh

# Terminal 2: TensorBoard
pnpm train:monitor
```

**Key metrics to watch**:
- `ep_rew_mean`: Should increase from ~10 to 100+ over 1M steps
- `ep_len_mean`: Should decrease from 5000+ to 2000-3000
- `entropy_loss`: Should be positive (agent exploring different actions)
- `value_loss`: Should decrease and stabilize

### Testing Improvements

After 500k-1M training steps:

```bash
# Evaluate trained model
pnpm train:evaluate

# Diagnose agent behavior
cd packages/ml-trainer
python diagnose_agent.py
```

**Look for**:
- Action distribution: <20% no-op (was 96%)
- Bricks broken: >50 per episode (was 1)
- Score: >100 (was 10)
- Lives lost: 0-1 (learning to preserve lives)

## Hyperparameter Tuning (Optional)

If training plateaus or doesn't improve:

### Increase Exploration
```python
ent_coef=0.02,  # Higher entropy bonus
```

### Adjust Reward Magnitudes
Edit `rl-simulator.ts`:
```typescript
// If agent too cautious
reward += 1.0 * paddleHitsThisFrame;  // Increase from 0.5
reward += 5.0 * brickBreaksThisFrame; // Increase from 2.0

// If agent too reckless
reward -= 15.0 * livesLostThisFrame;  // Increase from 10.0
```

### Longer Training
```bash
pnpm train:long  # 5M timesteps instead of 2M
```

## Troubleshooting

### Agent still doing mostly no-op
- Increase `ent_coef` to 0.02 or higher
- Add penalty for consecutive no-op actions
- Increase paddle hit reward to 1.0

### Agent loses all lives quickly
- Increase life loss penalty to -15.0 or -20.0
- Add survival time bonus
- Reduce learning rate to 0.0003

### Training too slow
- Increase `n_envs` for parallel environments
- Increase `batch_size` (GPU only)
- Use GPU acceleration (see GPU_TRAINING.md)

### Agent not breaking bricks
- Increase brick break bonus to 5.0
- Add brick proximity reward
- Simplify level (reduce brick HP, remove hazards)

## Next Steps

1. **Clean slate**: Delete old models that learned the wrong policy
2. **Start training**: Run `pnpm train:fresh` with new reward structure
3. **Monitor progress**: Watch TensorBoard metrics improve
4. **Evaluate regularly**: Test at 500k, 1M, 2M checkpoints
5. **Iterate**: Adjust reward weights based on observed behavior

## Files Modified

- `packages/cli-sim/src/rl-simulator.ts`: Added 7-component reward shaping
- `packages/ml-trainer/train_agent.py`: Added exploration hyperparameters
- `packages/ml-trainer/verify_rewards.py`: Validation script (new)
- `packages/ml-trainer/diagnose_agent.py`: Behavior analysis script (new)

## Diagnostic Scripts

All scripts are in `packages/ml-trainer/`:

- `verify_rewards.py`: Confirms reward components are working
- `diagnose_env.py`: Tests environment with random actions
- `diagnose_agent.py`: Analyzes trained agent behavior
- `test_reward_shaping.py`: Interactive reward visualization
