"""Convert JSONL trajectory files to replay recording format for visual playback."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert trajectory JSONL to replay recording JSON"
    )
    parser.add_argument(
        "trajectory_path", type=Path, help="Path to the trajectory JSONL file"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output replay JSON file (default: trajectory_name_replay.json)",
    )
    parser.add_argument(
        "--simplify",
        action="store_true",
        help="Reduce paddle-target events by filtering minimal movements",
    )
    return parser.parse_args()


def load_trajectory(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Load trajectory data from JSONL file."""
    if not path.exists():
        raise FileNotFoundError(f"Trajectory file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        lines = f.readlines()

    if not lines:
        raise ValueError("Empty trajectory file")

    metadata = json.loads(lines[0])
    if metadata.get("type") != "metadata":
        raise ValueError("First line must be metadata")

    steps = [json.loads(line) for line in lines[1:]]
    return metadata, steps


def convert_to_replay(
    metadata: dict[str, Any], steps: list[dict[str, Any]], simplify: bool = False
) -> dict[str, Any]:
    """Convert trajectory steps to replay recording format."""
    events: list[dict[str, Any]] = []

    # Track state to reduce duplicate events
    last_paddle_x: float | None = None
    last_was_attached = True
    movement_threshold = 5.0 if simplify else 0.5  # Larger threshold when simplifying

    for step in steps:
        elapsed_ms = step.get("elapsed_ms", 0)
        time_seconds = elapsed_ms / 1000.0

        obs = step.get("observation", {})
        ball = obs.get("ball", {})
        paddle = obs.get("paddle", {})

        paddle_x = paddle.get("position", {}).get("x")
        paddle_y = paddle.get("position", {}).get("y", 0)
        ball_attached = ball.get("attached", True)

        # Record paddle target movements
        if paddle_x is not None:
            # Skip if paddle hasn't moved significantly
            if last_paddle_x is None or abs(paddle_x - last_paddle_x) > movement_threshold:
                events.append(
                    {
                        "type": "paddle-target",
                        "time": time_seconds,
                        "position": {"x": paddle_x, "y": paddle_y},
                    }
                )
                last_paddle_x = paddle_x

        # Detect launch (transition from attached to not attached)
        if last_was_attached and not ball_attached:
            events.append({"type": "launch", "time": time_seconds})

        last_was_attached = ball_attached

    # Determine duration from last step
    final_time = steps[-1].get("elapsed_ms", 0) / 1000.0 if steps else 0.0

    # Build replay recording structure
    replay: dict[str, Any] = {
        "version": 1,
        "seed": metadata.get("seed"),
        "durationSeconds": final_time,
        "events": events,
    }

    return replay


def main() -> None:
    args = parse_args()

    try:
        metadata, steps = load_trajectory(args.trajectory_path)

        if not steps:
            print("Error: Trajectory has no steps")
            return

        replay = convert_to_replay(metadata, steps, simplify=args.simplify)

        # Determine output path
        if args.output:
            output_path = args.output
        else:
            stem = args.trajectory_path.stem
            output_path = args.trajectory_path.parent / f"{stem}_replay.json"

        # Write replay recording
        with output_path.open("w", encoding="utf-8") as f:
            json.dump(replay, f, indent=2)

        print(f"✓ Converted {args.trajectory_path.name}")
        print(f"  Seed: {replay['seed']}")
        print(f"  Duration: {replay['durationSeconds']:.2f}s")
        print(f"  Events: {len(replay['events'])}")
        print(f"  Output: {output_path}")

        if args.simplify:
            print("  Note: Simplified mode (reduced paddle movements)")

    except (FileNotFoundError, ValueError) as e:
        print(f"Error: {e}")
        exit(1)


if __name__ == "__main__":
    main()
