"""Test that reward shaping is working correctly."""

from __future__ import annotations

from lucky_break_env import LuckyBreakEnv

def main() -> None:
    print("=" * 80)
    print("TESTING REWARD SHAPING")
    print("=" * 80)
    
    env = LuckyBreakEnv(seed=42, round_number=1, telemetry=False)
    
    try:
        print("\n1. Testing reward signals...")
        observation, _ = env.reset(seed=42)
        
        print("\n   Action | Reward | Score | Lives | Bricks | Notes")
        print("   " + "-" * 70)
        
        # Take a few steps and observe rewards
        for step in range(50):
            # Alternate between different actions
            if step < 5:
                action = 5  # right+launch to start
            elif step < 20:
                action = 2  # move right
            elif step < 35:
                action = 1  # move left
            else:
                action = 0  # no-op
            
            observation, reward, done, truncated, info = env.step(action)
            
            score = info.get("score", 0)
            lives = info.get("lives_remaining", 0)
            bricks = info.get("bricks_remaining", 0)
            
            action_name = {
                0: "no-op",
                1: "left",
                2: "right",
                3: "launch",
                4: "left+launch",
                5: "right+launch",
            }.get(action, f"action-{action}")
            
            notes = []
            if reward > 0.4 and reward < 0.6:
                notes.append("paddle hit")
            elif reward > 1.8 and reward < 2.2:
                notes.append("brick hit bonus")
            elif reward >= 10:
                notes.append("score+brick")
            elif reward < -9:
                notes.append("LIFE LOST!")
            elif reward < -0.01 and reward > -0.1:
                notes.append("time penalty")
            
            if step < 20 or reward != 0 or len(notes) > 0:
                print(
                    f"   {step+1:2d}     | {reward:6.2f} | {score:5d} | {lives:5d} | {bricks:6d} | {' '.join(notes)}"
                )
            
            if done or truncated:
                print(f"\n   Episode ended at step {step + 1}")
                break
        
        print("\n2. Key observations:")
        print("   ✓ Positive rewards should appear for paddle hits (~0.5)")
        print("   ✓ Larger rewards for brick breaks (2.0 + score)")
        print("   ✓ Negative rewards for life loss (~-10.0)")
        print("   ✓ Small time penalties for inactivity (~-0.02)")
        
        print("\n3. Expected behavior:")
        print("   - Agent should learn paddle hits are good (keep ball alive)")
        print("   - Agent should learn brick breaks are very good (main objective)")
        print("   - Agent should learn losing lives is very bad (avoid at all costs)")
        print("   - Agent should learn to make progress (avoid stalling)")
        
    except Exception as e:
        print(f"\n   ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        env.close()
        print("\n" + "=" * 80)

if __name__ == "__main__":
    main()
