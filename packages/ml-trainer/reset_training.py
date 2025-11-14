#!/usr/bin/env python3
"""Reset training and start fresh with improved reward shaping."""

from __future__ import annotations

import shutil
from pathlib import Path


def main() -> None:
    """Clean up old models and prepare for fresh training."""
    ml_trainer_dir = Path(__file__).parent

    # Directories to clean
    dirs_to_remove = [
        ml_trainer_dir / "models" / "best",
        ml_trainer_dir / "models" / "checkpoints",
        ml_trainer_dir / "trajectories",
        ml_trainer_dir / "runs",  # TensorBoard logs
    ]

    print("=" * 80)
    print("RESETTING TRAINING ENVIRONMENT")
    print("=" * 80)
    print()
    print("This will delete:")
    for dir_path in dirs_to_remove:
        if dir_path.exists():
            print(f"  ✗ {dir_path.relative_to(ml_trainer_dir)}")
        else:
            print(f"  - {dir_path.relative_to(ml_trainer_dir)} (doesn't exist)")
    print()

    response = input("Continue? (yes/no): ").strip().lower()
    if response not in ["yes", "y"]:
        print("\nCancelled.")
        return

    print()
    for dir_path in dirs_to_remove:
        if dir_path.exists():
            print(f"Removing {dir_path.relative_to(ml_trainer_dir)}...")
            shutil.rmtree(dir_path)
            print(f"  ✓ Removed")

    print()
    print("=" * 80)
    print("READY FOR FRESH TRAINING")
    print("=" * 80)
    print()
    print("Next steps:")
    print()
    print("  1. Start training:")
    print("     pnpm train:fresh")
    print()
    print("  2. Monitor progress (in another terminal):")
    print("     pnpm train:monitor")
    print()
    print("  3. Evaluate after 1M steps:")
    print("     pnpm train:evaluate")
    print()
    print("Expected improvements:")
    print("  - Episode reward: 10 → 100+")
    print("  - Episode length: 5000 → 2000-3000")
    print("  - Action diversity: 96% no-op → <20% no-op")
    print("  - Bricks broken: 1 → 50-80")
    print()
    print("=" * 80)


if __name__ == "__main__":
    main()
