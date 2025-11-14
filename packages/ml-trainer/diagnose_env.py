"""Diagnose the RL environment to understand why episodes end early."""

from __future__ import annotations

from lucky_break_env import LuckyBreakEnv

def main() -> None:
    print("=" * 80)
    print("DIAGNOSING RL ENVIRONMENT")
    print("=" * 80)
    
    env = LuckyBreakEnv(seed=42, round_number=1, telemetry=True)
    
    try:
        print("\n1. Resetting environment...")
        observation, info = env.reset()
        print(f"   Initial observation shape: {observation.shape}")
        print(f"   Initial observation: {observation}")
        
        print("\n2. Taking steps until episode ends...")
        total_steps = 0
        max_steps = 10000  # Safety limit
        
        while total_steps < max_steps:
            # Take random actions to see how long episode lasts
            action = env.action_space.sample()
            observation, reward, done, truncated, info = env.step(action)
            total_steps += 1
            
            if total_steps <= 10 or total_steps % 100 == 0:
                print(f"   Step {total_steps}: action={action}, reward={reward:.2f}, done={done}, truncated={truncated}")
                print(f"      Score: {info.get('score')}, Lives: {info.get('lives_remaining')}, Bricks: {info.get('bricks_remaining')}")
            
            if done or truncated:
                print(f"\n   Episode ended at step {total_steps}")
                print(f"      Done: {done}, Truncated: {truncated}")
                print(f"      Final score: {info.get('score')}")
                print(f"      Final lives: {info.get('lives_remaining')}")
                print(f"      Final bricks: {info.get('bricks_remaining')}")
                break
        
        if total_steps >= max_steps:
            print(f"\n   Hit safety limit of {max_steps} steps without episode ending")
            
    except Exception as e:
        print(f"\n   ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        env.close()
        print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
