from __future__ import annotations

import argparse
import statistics
from pathlib import Path
from typing import Any, Dict, List, Tuple, cast

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv

from lucky_break_env import LuckyBreakEnv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate a trained PPO agent against Lucky Break")
    parser.add_argument("model_path", type=Path, help="Path to the trained model to evaluate")
    parser.add_argument("--episodes", type=int, default=5, help="Number of evaluation episodes (default: 5)")
    parser.add_argument("--seed", type=int, default=1337, help="Simulator seed to use for evaluation")
    parser.add_argument("--round", type=int, default=1, help="Round number for the simulator")
    parser.add_argument("--deterministic", action="store_true", help="Use deterministic policy during evaluation")
    parser.add_argument("--no-telemetry", action="store_true", help="Disable simulator telemetry events")
    return parser.parse_args()


def make_env(seed: int, round_number: int, telemetry: bool) -> DummyVecEnv:
    return DummyVecEnv([lambda: LuckyBreakEnv(seed=seed, round_number=round_number, telemetry=telemetry)])


def run_episode(env: DummyVecEnv, model: PPO, deterministic: bool) -> Tuple[float, int, Dict[str, Any]]:
    observations = env.reset()
    done = np.array([False])
    total_reward = 0.0
    steps = 0
    last_info: Dict[str, Any] = {}

    while not bool(done[0]):
        action, _ = model.predict(observations, deterministic=deterministic)
        observations, rewards, done, infos = env.step(action)
        total_reward += float(rewards[0])
        steps += 1
        if infos:
            last_info = cast(Dict[str, Any], infos[0])

    return total_reward, steps, last_info


def summarize(results: List[Tuple[float, int, Dict[str, Any]]]) -> None:
    if not results:
        print("No evaluation episodes were completed.")
        return

    rewards = [reward for reward, _, _ in results]
    steps_list = [steps for _, steps, _ in results]
    scores = [float(info.get("score", 0.0)) for *_, info in results]

    print("Episodes:", len(results))
    print(f"Reward: mean={statistics.mean(rewards):.2f}, stdev={statistics.pstdev(rewards):.2f}")
    print(f"Steps: mean={statistics.mean(steps_list):.1f}, max={max(steps_list)}")
    print(f"Score: mean={statistics.mean(scores):.1f}, max={max(scores)}")


def main() -> None:
    args = parse_args()

    env = make_env(args.seed, args.round, not args.no_telemetry)
    model = PPO.load(str(args.model_path), env=env)

    results: List[Tuple[float, int, Dict[str, Any]]] = []
    try:
        for episode in range(args.episodes):
            reward, steps, info = run_episode(env, model, deterministic=args.deterministic)
            results.append((reward, steps, info))
            print(f"Episode {episode + 1}: reward={reward:.2f}, steps={steps}, score={info.get('score')}")
    finally:
        env.close()

    summarize(results)


if __name__ == "__main__":
    main()
