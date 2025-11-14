# Lucky Break ML Trainer

Offline reinforcement learning harness built around the Lucky Break CLI simulator.

## Quick Start

### GPU-Accelerated Training (Recommended)

For significantly faster training, enable GPU acceleration:

1. **Install PyTorch with CUDA support:**

   ```bash
   pip uninstall torch torchvision torchaudio -y
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```

2. **Verify GPU setup:**

   ```bash
   python setup_gpu.py
   ```

3. **Start GPU training:**

   ```bash
   python train_agent.py --device cuda --timesteps 2000000 --n-envs 4 --batch-size 512
   ```

### Standard Setup (CPU)

1. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   # source .venv/bin/activate  # Linux/macOS
   pip install -r requirements-dev.txt
   ```

2. Launch the training loop:

   ```bash
   python train_agent.py --timesteps 1000000 --seed 1337 --round 1
   ```

   Checkpoints land under `models/checkpoints/`, and TensorBoard logs write to `runs/`.

3. Evaluate a saved model:

   ```bash
   python evaluate_agent.py models/ppo_lucky_break.zip --episodes 3
   ```

   This will run the agent, display episode summaries, and automatically analyze the latest trajectory.

## Trajectory Analysis

After running episodes (either during training or evaluation), trajectory files are saved to `trajectories/` in JSONL format.

### Analyze a Single Trajectory

```bash
python analyze_trajectory.py trajectories/trajectory_seed1337_ep0001.jsonl
```

This produces a detailed breakdown of:
- Combo milestones and max combo achieved
- Brick breaking patterns and power-up pickups
- Hazard contact analysis
- Paddle and ball behavior metrics
- Scoring progression and survival stats

Add `--verbose` to see event-by-event details.

### Batch Analysis

Analyze all trajectories in a directory:

```bash
python batch_analyze.py --dir trajectories
```

Outputs comparative statistics across episodes (mean scores, max combos, etc.).

Optionally save detailed results to JSON:

```bash
python batch_analyze.py --dir trajectories --output analysis_results.json
```

### Convert Trajectory to Replay

Convert a trajectory file to the replay recording format for visual playback in the game:

```bash
python trajectory_to_replay.py trajectories/trajectory_seed1337_ep0001.jsonl
```

This creates a `*_replay.json` file that can be used with:

```bash
pnpm --filter @lucky-break/cli-sim exec tsx src/index.ts simulate --replay trajectories/trajectory_seed1337_ep0001_replay.json
```

Use `--simplify` to reduce paddle-target events for cleaner replays.

## Development

- Lint the package with Ruff:

   ```bash
   ruff check .
   ```

- Run the unit tests with coverage:

   ```bash
   pytest --cov=lucky_break_env --cov-report=term-missing
   ```

- Run the integration smoke test:

   ```bash
   # From repository root with venv activated
   python packages/ml-trainer/tests/test_integration.py
   ```

- Run the protocol smoke tests:

   ```bash
   # Python version
   python packages/ml-trainer/tests/test_simulator_protocol.py

   # TypeScript version (from cli-sim directory)
   cd packages/cli-sim
   tsx tests/smoke-rl-protocol.ts
   ```

## Files

- `lucky_break_env.py` — Gym-compatible environment that bridges to the existing `simulate-rl` CLI, logging JSONL trajectories under `trajectories/`.
- `train_agent.py` — Entry point for PPO training with Stable Baselines 3, including optional checkpoints and TensorBoard logging.
- `evaluate_agent.py` — Helper script to run evaluation episodes, print summary statistics, and automatically analyze trajectories.
- `analyze_trajectory.py` — Parse and analyze a single trajectory file for strategy insights.
- `batch_analyze.py` — Batch analyze multiple trajectories and generate comparative summaries.
- `trajectory_to_replay.py` — Convert JSONL trajectory to replay recording format for visual playback.
- `OBSERVATION_SPACE.md` — Detailed documentation of the 19-element observation vector, explaining included/excluded features.
- `requirements.txt` — Python dependencies for the training tooling.

## Observation Space

The RL agent operates on a 19-dimensional observation vector capturing:
- Time and frame counters
- Ball position, velocity, speed, and attachment state
- Paddle position, target, width, and velocity
- Session state (score, lives, bricks, combo heat, volley length)

See `OBSERVATION_SPACE.md` for full documentation of the observation space, including rationale for excluded features (hazards, multi-ball, brick grid).

## Workflow Summary

1. **Train**: `python train_agent.py` — Train PPO agent on seed 1337
2. **Evaluate**: `python evaluate_agent.py models/ppo_lucky_break.zip` — Test trained agent
3. **Analyze**: Trajectories auto-saved to `trajectories/`, analyzed via `analyze_trajectory.py`
4. **Replay**: Convert trajectory to replay format with `trajectory_to_replay.py`, visualize in game

## Simulator Protocol

The Python environment communicates with the TypeScript simulator via JSON over stdin/stdout:

**Commands sent to simulator:**
- `{"type": "reset", "seed": 1337}` — Reset environment with seed
- `{"type": "step", "action": 2}` — Execute action (0-5)
- `{"type": "close"}` — Shutdown simulator

**Responses from simulator:**
- `{"type": "reset", "observation": {...}}` — Initial state after reset
- `{"type": "step", "observation": {...}, "reward": 10.0, "done": false, "info": {...}}` — Step result

Actions are discrete (0-5):
- 0: No-op (idle)
- 1: Move left
- 2: Move right
- 3: Launch ball
- 4: Move left + launch
- 5: Move right + launch
