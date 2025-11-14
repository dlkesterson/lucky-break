"""Quick integration test for the RL environment."""

from __future__ import annotations

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from lucky_break_env import LuckyBreakEnv


def main() -> None:
    """Run a quick integration test of the environment."""
    print("Testing LuckyBreakEnv initialization and basic operation...")

    try:
        # Create environment
        env = LuckyBreakEnv(seed=42, round_number=1, telemetry=False)
        print("  ✓ Environment created")

        # Reset
        obs, info = env.reset()
        assert obs.shape == (19,), f"Expected obs shape (19,), got {obs.shape}"
        print(f"  ✓ Reset successful, observation shape: {obs.shape}")

        # Take a few steps
        for i in range(5):
            action = env.action_space.sample()
            obs, reward, done, truncated, info = env.step(action)

            assert obs.shape == (19,), f"Step {i}: wrong obs shape"
            assert isinstance(reward, float), f"Step {i}: reward not float"
            assert isinstance(done, bool), f"Step {i}: done not bool"

        print(f"  ✓ Completed {5} steps without errors")

        # Close environment
        env.close()
        print("  ✓ Environment closed cleanly")

        print("\n✅ All integration tests passed!")
        return

    except Exception as e:
        print(f"\n❌ Integration test failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
