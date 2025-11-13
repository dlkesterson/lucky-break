from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Callable

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv

from lucky_break_env import LuckyBreakEnv

DEFAULT_TIMESTEPS = 500_000
DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "models"
DEFAULT_TENSORBOARD_DIR = Path(__file__).resolve().parent / "runs"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a PPO agent against the Lucky Break simulator")
    parser.add_argument("--timesteps", type=int, default=DEFAULT_TIMESTEPS, help="Total timesteps to train (default: 500k)")
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
    return parser.parse_args()


def ensure_directories(*paths: Path) -> None:
    for path in paths:
        target = path if path.suffix == "" else path.parent
        target.mkdir(parents=True, exist_ok=True)


def make_env_factory(seed: int, round_number: int, telemetry: bool) -> Callable[[], LuckyBreakEnv]:
    def _factory() -> LuckyBreakEnv:
        env = LuckyBreakEnv(seed=seed, round_number=round_number, telemetry=telemetry)
        return Monitor(env)

    return _factory


def main() -> None:
    args = parse_args()

    ensure_directories(args.model_path, args.tensorboard_log)

    env_factory = make_env_factory(args.seed, args.round, not args.no_telemetry)
    vec_env = DummyVecEnv([env_factory])

    checkpoint_callback = None
    if args.checkpoint_frequency > 0:
        checkpoint_dir = args.model_path.parent / "checkpoints"
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        checkpoint_callback = CheckpointCallback(
            save_freq=max(1, args.checkpoint_frequency // max(1, vec_env.num_envs)),
            save_path=str(checkpoint_dir),
            name_prefix="ppo_lucky_break",
        )

    model = PPO(
        policy="MlpPolicy",
        env=vec_env,
        verbose=1,
        tensorboard_log=str(args.tensorboard_log),
        seed=args.seed,
    )

    try:
        model.learn(total_timesteps=args.timesteps, callback=checkpoint_callback)
    except KeyboardInterrupt:
        print("Training interrupted by user", file=sys.stderr)
    finally:
        vec_env.close()

    model.save(str(args.model_path))


if __name__ == "__main__":
    main()
