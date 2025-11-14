"""Batch analyze multiple trajectory files and generate comparative insights."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from analyze_trajectory import (
    analyze_ball_behavior,
    analyze_bricks,
    analyze_combos,
    analyze_hazards,
    analyze_paddle_behavior,
    analyze_scoring,
    analyze_survival,
    extract_events,
    load_trajectory,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Batch analyze multiple trajectory files"
    )
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path(__file__).parent / "trajectories",
        help="Directory containing trajectory files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional: output summary JSON file",
    )
    return parser.parse_args()


def analyze_trajectories(trajectory_dir: Path) -> list[dict[str, Any]]:
    """Analyze all trajectory files in the directory."""
    trajectory_files = sorted(trajectory_dir.glob("trajectory_*.jsonl"))

    if not trajectory_files:
        print(f"No trajectory files found in {trajectory_dir}")
        return []

    print(f"Found {len(trajectory_files)} trajectory file(s)")

    results = []
    for traj_file in trajectory_files:
        try:
            metadata, steps = load_trajectory(traj_file)
            events = extract_events(steps)

            analysis = {
                "filename": traj_file.name,
                "metadata": metadata,
                "combos": analyze_combos(events),
                "bricks": analyze_bricks(events, steps),
                "hazards": analyze_hazards(events, steps),
                "paddle": analyze_paddle_behavior(steps),
                "ball": analyze_ball_behavior(steps),
                "scoring": analyze_scoring(steps),
                "survival": analyze_survival(steps, events),
            }

            results.append(analysis)
            print(f"  ✓ Analyzed {traj_file.name}")

        except Exception as e:
            print(f"  ✗ Failed to analyze {traj_file.name}: {e}")

    return results


def print_comparative_summary(results: list[dict[str, Any]]) -> None:
    """Print comparative statistics across all trajectories."""
    if not results:
        print("\nNo results to summarize.")
        return

    print("\n" + "=" * 80)
    print("BATCH ANALYSIS SUMMARY")
    print("=" * 80)

    # Aggregate metrics
    total_episodes = len(results)
    final_scores = [r["scoring"]["final_score"] for r in results]
    max_combos = [r["combos"]["max_combo"] for r in results]
    bricks_broken = [r["bricks"]["total_breaks"] for r in results]
    lives_lost = [r["survival"]["lives_lost"] for r in results]
    total_steps = [r["metadata"]["steps"] for r in results]

    print(f"\nEpisodes Analyzed: {total_episodes}")

    print("\nFinal Scores:")
    print(f"  Mean: {sum(final_scores) / len(final_scores):.1f}")
    print(f"  Min: {min(final_scores):.0f}")
    print(f"  Max: {max(final_scores):.0f}")

    print("\nMax Combos:")
    print(f"  Mean: {sum(max_combos) / len(max_combos):.1f}")
    print(f"  Max: {max(max_combos)}")

    print("\nBricks Broken:")
    print(f"  Mean: {sum(bricks_broken) / len(bricks_broken):.1f}")
    print(f"  Total: {sum(bricks_broken)}")

    print("\nLives Lost:")
    print(f"  Mean: {sum(lives_lost) / len(lives_lost):.1f}")
    print(f"  Min: {min(lives_lost)}")
    print(f"  Max: {max(lives_lost)}")

    print("\nSteps per Episode:")
    print(f"  Mean: {sum(total_steps) / len(total_steps):.1f}")
    print(f"  Min: {min(total_steps)}")
    print(f"  Max: {max(total_steps)}")

    # Power-up analysis
    total_powerups = sum(len(r["bricks"]["power_up_bricks"]) for r in results)
    print(f"\nPower-Ups Collected: {total_powerups}")
    if total_powerups > 0:
        print(f"  Per Episode: {total_powerups / total_episodes:.1f}")

    # Hazard analysis
    total_hazard_contacts = sum(r["hazards"]["total_contacts"] for r in results)
    print(f"\nHazard Contacts: {total_hazard_contacts}")
    if total_hazard_contacts > 0:
        print(f"  Per Episode: {total_hazard_contacts / total_episodes:.1f}")

    print("\n" + "=" * 80)


def main() -> None:
    args = parse_args()

    results = analyze_trajectories(args.dir)

    if results:
        print_comparative_summary(results)

        if args.output:
            with args.output.open("w", encoding="utf-8") as f:
                json.dump(results, f, indent=2)
            print(f"\nDetailed results written to {args.output}")


if __name__ == "__main__":
    main()
