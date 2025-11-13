# Lucky Break ML Trainer

Offline reinforcement learning harness built around the Lucky Break CLI simulator.

## Getting Started

1. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
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

## Files

- `lucky_break_env.py` — Gym-compatible environment that bridges to the existing `simulate-rl` CLI, logging JSONL trajectories under `trajectories/`.
- `train_agent.py` — Entry point for PPO training with Stable Baselines 3, including optional checkpoints and TensorBoard logging.
- `evaluate_agent.py` — Helper script to run evaluation episodes and print summary statistics.
- `requirements.txt` — Python dependencies for the training tooling.
