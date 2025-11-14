"""Verify all reward shaping components are working."""

from __future__ import annotations

from collections import Counter

from lucky_break_env import LuckyBreakEnv


def main() -> None:
    print("=" * 80)
    print("VERIFYING REWARD SHAPING COMPONENTS")
    print("=" * 80)

    env = LuckyBreakEnv(seed=1337, round_number=1, telemetry=False)

    try:
        env.reset(seed=1337)

        reward_types = Counter()
        total_reward = 0.0
        step = 0

        print("\nTaking 1000 random actions and tracking rewards...\n")

        for _ in range(1000):
            action = env.action_space.sample()
            _, reward, done, truncated, info = env.step(action)
            total_reward += reward
            step += 1

            # Categorize rewards
            if reward > 40:
                reward_types["level_complete"] += 1
                print(f"   Step {step}: LEVEL COMPLETE! reward={reward:.2f}")
            elif reward > 10:
                reward_types["brick_break_with_score"] += 1
            elif reward > 1.5:
                reward_types["brick_break_bonus"] += 1
            elif 0.4 < reward < 0.6:
                reward_types["paddle_hit"] += 1
            elif reward < -9:
                reward_types["life_lost"] += 1
                print(f"   Step {step}: LIFE LOST! reward={reward:.2f}")
            elif -0.1 < reward < -0.01:
                reward_types["time_penalty"] += 1
            elif reward == 0:
                reward_types["no_reward"] += 1
            else:
                reward_types["other"] += 1

            if done or truncated:
                print(f"\n   Episode ended at step {step}")
                break

        print(f"\n{'='*80}")
        print("REWARD COMPONENT SUMMARY")
        print(f"{'='*80}")
        print(f"Total steps: {step}")
        print(f"Total reward: {total_reward:.2f}")
        print(f"\nReward breakdown:")
        for reward_type, count in sorted(reward_types.items(), key=lambda x: -x[1]):
            print(f"  {reward_type:30s}: {count:5d} ({100*count/step:5.1f}%)")

        print(f"\n{'='*80}")
        print("EXPECTED COMPONENTS:")
        print("  ✓ paddle_hit: Small positive rewards (~0.5)")
        print("  ✓ brick_break_bonus: Medium rewards (~2.0)")  
        print("  ✓ brick_break_with_score: Large rewards (score + 2.0)")
        print("  ✓ life_lost: Large negative penalty (~-10.0)")
        print("  ✓ time_penalty: Small negative nudge (~-0.02)")
        print("  ✓ level_complete: Huge bonus (~50.0)")
        print(f"{'='*80}\n")

    finally:
        env.close()


if __name__ == "__main__":
    main()
