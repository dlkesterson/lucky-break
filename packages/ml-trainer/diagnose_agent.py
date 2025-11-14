"""Diagnose what actions the trained agent is taking."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from stable_baselines3 import PPO

from lucky_break_env import LuckyBreakEnv

ACTION_NAMES = {
    0: "no-op",
    1: "left",
    2: "right",
    3: "launch",
    4: "left+launch",
    5: "right+launch",
}


def main() -> None:
    print("=" * 80)
    print("DIAGNOSING TRAINED AGENT BEHAVIOR")
    print("=" * 80)

    model_path = Path("models/best/best_model.zip")
    if not model_path.exists():
        print(f"\nModel not found: {model_path}")
        return

    env = LuckyBreakEnv(seed=42, round_number=1, telemetry=False)

    try:
        print(f"\nLoading model from: {model_path}")
        model = PPO.load(str(model_path))

        print("\n1. Resetting environment and running agent...")
        observation, _ = env.reset(seed=42)

        action_counts = Counter()
        total_steps = 0
        max_steps = 1000

        last_score = 0
        last_lives = 3
        last_bricks = 0

        print(f"\n   Step | Action        | Score | Lives | Bricks | Reward")
        print(f"   " + "-" * 60)

        while total_steps < max_steps:
            action, _ = model.predict(observation, deterministic=True)
            action_int = int(action)
            action_counts[action_int] += 1

            observation, reward, done, truncated, info = env.step(action_int)
            total_steps += 1

            score = info.get("score", 0)
            lives = info.get("lives_remaining", 0)
            bricks = info.get("bricks_remaining", 0)

            # Print updates when something interesting happens
            if (
                total_steps <= 20
                or score != last_score
                or lives != last_lives
                or bricks != last_bricks
                or total_steps % 100 == 0
            ):
                action_name = ACTION_NAMES.get(action_int, f"unknown-{action_int}")
                print(
                    f"   {total_steps:4d} | {action_name:13s} | {score:5d} | {lives:5d} | {bricks:6d} | {reward:6.1f}"
                )
                last_score = score
                last_lives = lives
                last_bricks = bricks

            if done or truncated:
                print(f"\n   Episode ended at step {total_steps}")
                print(f"      Done: {done}, Truncated: {truncated}")
                print(f"      Final score: {score}")
                print(f"      Final lives: {lives}")
                print(f"      Final bricks: {bricks}")
                break

        if total_steps >= max_steps:
            print(f"\n   Stopped after {max_steps} steps")
            print(f"      Final score: {last_score}")
            print(f"      Final lives: {last_lives}")
            print(f"      Final bricks: {last_bricks}")

        print(f"\n2. Action distribution over {total_steps} steps:")
        for action_id in sorted(action_counts.keys()):
            count = action_counts[action_id]
            percentage = 100.0 * count / total_steps
            action_name = ACTION_NAMES.get(action_id, f"unknown-{action_id}")
            print(f"      {action_name:13s}: {count:5d} ({percentage:5.1f}%)")

    except Exception as e:
        print(f"\n   ERROR: {e}")
        import traceback

        traceback.print_exc()
    finally:
        env.close()
        print("\n" + "=" * 80)


if __name__ == "__main__":
    main()
