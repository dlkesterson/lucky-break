from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Callable
from pathlib import Path

import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from lucky_break_env import LuckyBreakEnv

DEFAULT_TIMESTEPS = 500_000
DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "models"
DEFAULT_TENSORBOARD_DIR = Path(__file__).resolve().parent / "runs"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a PPO agent against the Lucky Break simulator")
    parser.add_argument(
        "--timesteps",
        type=int,
        default=DEFAULT_TIMESTEPS,
        help="Total timesteps to train (default: 500k)",
    )
    parser.add_argument("--seed", type=int, default=1337, help="Seed passed to the simulator (default: 1337)")
    parser.add_argument("--round", type=int, default=1, help="Round number for the simulator (default: 1)")
    parser.add_argument(
        "--model-path",
        type=Path,
        default=DEFAULT_MODEL_DIR / "ppo_lucky_break",
        help="Destination path for the trained model",
    )
    parser.add_argument(
        "--tensorboard-log",
        type=Path,
        default=DEFAULT_TENSORBOARD_DIR,
        help="TensorBoard log directory",
    )
    parser.add_argument(
        "--checkpoint-frequency",
        type=int,
        default=100_000,
        help="Timesteps between checkpoint saves (0 disables checkpoints)",
    )
    parser.add_argument(
        "--no-telemetry",
        action="store_true",
        help="Disable event telemetry collection in the simulator",
    )
    parser.add_argument(
        "--resume-from",
        type=Path,
        default=None,
        help="Path to a saved model to continue training from (e.g., models/best/best_model.zip)",
    )
    # GPU and performance options
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cuda", "cpu"],
        help="Device to use for training (auto detects GPU availability)",
    )
    parser.add_argument(
        "--n-envs",
        type=int,
        default=1,
        help="Number of parallel environments (vectorized). Recommended: CPU_count // 2 for CPU training",
    )
    parser.add_argument(
        "--n-steps",
        type=int,
        default=2048,
        help="Number of steps per environment per update (default: 2048)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=64,
        help="Minibatch size for PPO updates (default: 64). Larger = better GPU utilization",
    )
    parser.add_argument(
        "--eval-frequency",
        type=int,
        default=0,
        help="Timesteps between evaluation runs (0 disables evaluation)",
    )
    parser.add_argument(
        "--eval-episodes",
        type=int,
        default=5,
        help="Number of episodes to run during evaluation",
    )
    return parser.parse_args()


def ensure_directories(*paths: Path) -> None:
    for path in paths:
        target = path if path.suffix == "" else path.parent
        target.mkdir(parents=True, exist_ok=True)


def make_env_factory(seed: int, round_number: int, telemetry: bool) -> Callable[[], Monitor]:
    def _factory() -> Monitor:
        env = LuckyBreakEnv(seed=seed, round_number=round_number, telemetry=telemetry)
        return Monitor(env)

    return _factory


def get_device(device_arg: str) -> str:
    """Determine the device to use for training."""
    if device_arg == "auto":
        if torch.cuda.is_available():
            device = "cuda"
            print(f"✓ GPU detected: {torch.cuda.get_device_name(0)}")
            print(f"  CUDA version: {torch.version.cuda}")
            print(f"  PyTorch version: {torch.__version__}")
        else:
            device = "cpu"
            print("ℹ Using CPU (no GPU detected)")
            print("  For GPU support, reinstall PyTorch with CUDA:")
            print("  pip install torch --index-url https://download.pytorch.org/whl/cu121")
    else:
        device = device_arg
        if device == "cuda" and not torch.cuda.is_available():
            print("⚠ Warning: CUDA requested but not available, falling back to CPU", file=sys.stderr)
            device = "cpu"

    return device


def main() -> None:
    args = parse_args()

    ensure_directories(args.model_path, args.tensorboard_log)

    # Determine device and print configuration
    device = get_device(args.device)
    print(f"\n{'='*60}")
    print(f"Training Configuration:")
    print(f"  Device: {device}")
    print(f"  Parallel environments: {args.n_envs}")
    print(f"  Steps per update: {args.n_steps}")
    print(f"  Batch size: {args.batch_size}")
    print(f"  Total timesteps: {args.timesteps:,}")
    print(f"  Seed: {args.seed}")
    if args.resume_from:
        print(f"  Resume from: {args.resume_from}")
    print(f"{'='*60}\n")

    # Create vectorized environment
    env_factory = make_env_factory(args.seed, args.round, not args.no_telemetry)

    if args.n_envs > 1:
        # Use SubprocVecEnv for parallel CPU environments
        print(f"Creating {args.n_envs} parallel environments...")
        vec_env = SubprocVecEnv([
            lambda idx=i: make_env_factory(args.seed + idx, args.round, not args.no_telemetry)()
            for i in range(args.n_envs)
        ])
    else:
        vec_env = DummyVecEnv([env_factory])

    # Prepare callbacks
    callbacks = []

    # Checkpoint callback
    if args.checkpoint_frequency > 0:
        checkpoint_dir = args.model_path.parent / "checkpoints"
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        checkpoint_callback = CheckpointCallback(
            save_freq=max(1, args.checkpoint_frequency // max(1, vec_env.num_envs)),
            save_path=str(checkpoint_dir),
            name_prefix="ppo_lucky_break",
        )
        callbacks.append(checkpoint_callback)

    # Evaluation callback
    if args.eval_frequency > 0:
        eval_env = DummyVecEnv([make_env_factory(args.seed + 9999, args.round, False)])
        eval_callback = EvalCallback(
            eval_env,
            best_model_save_path=str(args.model_path.parent / "best"),
            log_path=str(args.tensorboard_log / "eval"),
            eval_freq=max(1, args.eval_frequency // max(1, vec_env.num_envs)),
            n_eval_episodes=args.eval_episodes,
            deterministic=True,
            render=False,
        )
        callbacks.append(eval_callback)

    # Create or load PPO model
    if args.resume_from:
        if not args.resume_from.exists():
            print(f"⚠ Warning: Resume path not found: {args.resume_from}", file=sys.stderr)
            print("Starting fresh training instead.\n", file=sys.stderr)
            model = PPO(
                policy="MlpPolicy",
                env=vec_env,
                verbose=1,
                tensorboard_log=str(args.tensorboard_log),
                seed=args.seed,
                device=device,
                n_steps=args.n_steps,
                batch_size=args.batch_size,
                policy_kwargs=dict(
                    net_arch=dict(pi=[256, 256], vf=[256, 256]),
                ),
            )
        else:
            print(f"Loading existing model from: {args.resume_from}")
            model = PPO.load(
                str(args.resume_from),
                env=vec_env,
                device=device,
                tensorboard_log=str(args.tensorboard_log),
            )
            print("✓ Model loaded successfully. Continuing training...\n")
    else:
        # Create new model with optimized hyperparameters
        model = PPO(
            policy="MlpPolicy",
            env=vec_env,
            verbose=1,
            tensorboard_log=str(args.tensorboard_log),
            seed=args.seed,
            device=device,
            n_steps=args.n_steps,
            batch_size=args.batch_size,
            # Optimized policy network architecture for GPU
            policy_kwargs=dict(
                net_arch=dict(pi=[256, 256], vf=[256, 256]),
            ),
        )

    print(f"\nStarting training on {device}...")
    print(f"Monitor progress with: tensorboard --logdir {args.tensorboard_log}")
    print("Press Ctrl+C to stop training and save the model\n")

    try:
        model.learn(
            total_timesteps=args.timesteps,
            callback=callbacks if callbacks else None,
            progress_bar=True,
        )
    except KeyboardInterrupt:
        print("\n⚠ Training interrupted by user", file=sys.stderr)
    finally:
        vec_env.close()
        if args.eval_frequency > 0:
            eval_env.close()

    model.save(str(args.model_path))
    print(f"\n✓ Model saved to: {args.model_path}")


if __name__ == "__main__":
    main()
