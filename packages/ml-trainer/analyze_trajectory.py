"""Analyze trajectory data to extract strategy insights from RL agent gameplay."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze trajectory data to extract strategy insights"
    )
    parser.add_argument(
        "trajectory_path", type=Path, help="Path to the trajectory JSONL file to analyze"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show detailed event-by-event analysis"
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


def extract_events(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract all events from trajectory steps."""
    all_events = []
    for step in steps:
        events = step.get("events", [])
        if events:
            for event in events:
                event_copy = dict(event)
                event_copy["step_frame"] = step.get("frame")
                event_copy["step_elapsed_ms"] = step.get("elapsed_ms")
                all_events.append(event_copy)
    return all_events


def analyze_combos(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze combo-related events."""
    combo_milestones = [e for e in events if e.get("name") == "ComboMilestoneReached"]
    combo_resets = [e for e in events if e.get("name") == "ComboReset"]

    max_combo = 0
    max_combo_multiplier = 1.0

    for milestone in combo_milestones:
        payload = milestone.get("payload", {})
        combo = payload.get("combo", 0)
        multiplier = payload.get("multiplier", 1.0)
        if combo > max_combo:
            max_combo = combo
            max_combo_multiplier = multiplier

    return {
        "milestones_reached": len(combo_milestones),
        "max_combo": max_combo,
        "max_multiplier": max_combo_multiplier,
        "combo_resets": len(combo_resets),
    }


def analyze_bricks(events: list[dict[str, Any]], steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze brick breaking patterns."""
    brick_breaks = [e for e in events if e.get("name") == "BrickBreak"]
    brick_hits = [e for e in events if e.get("name") == "BrickHit"]

    brick_types = Counter()
    power_up_bricks = []
    high_hp_bricks = []

    for brick_event in brick_breaks:
        payload = brick_event.get("payload", {})
        brick_type = payload.get("brickType", "standard")
        brick_types[brick_type] += 1

        if brick_type == "power-up":
            power_up_bricks.append(
                {
                    "frame": brick_event.get("step_frame"),
                    "elapsed_ms": brick_event.get("step_elapsed_ms"),
                    "row": payload.get("row"),
                    "col": payload.get("col"),
                }
            )

        initial_hp = payload.get("initialHp", 1)
        if initial_hp > 1:
            high_hp_bricks.append(
                {
                    "frame": brick_event.get("step_frame"),
                    "hp": initial_hp,
                    "row": payload.get("row"),
                    "col": payload.get("col"),
                }
            )

    # Calculate average combo heat at break time
    combo_heats = [e.get("payload", {}).get("comboHeat", 0) for e in brick_breaks]
    avg_combo_at_break = sum(combo_heats) / len(combo_heats) if combo_heats else 0

    return {
        "total_breaks": len(brick_breaks),
        "total_hits": len(brick_hits),
        "brick_types": dict(brick_types),
        "power_up_bricks": power_up_bricks,
        "high_hp_bricks": high_hp_bricks,
        "avg_combo_at_break": avg_combo_at_break,
    }


def analyze_hazards(
    events: list[dict[str, Any]], steps: list[dict[str, Any]]
) -> dict[str, Any]:
    """Analyze hazard interactions from entropy events."""
    # Hazard events are not directly named but can be inferred from observation changes
    # and collision patterns. For now, we'll analyze what we can from the data.

    hazard_contacts = []
    for step in steps:
        obs = step.get("observation", {})
        hazards = obs.get("hazards", [])

        # Track hazard proximity (if ball is very close to hazard)
        ball = obs.get("ball", {})
        ball_pos = ball.get("position", {})
        ball_x = ball_pos.get("x", 0)
        ball_y = ball_pos.get("y", 0)

        for hazard in hazards:
            haz_pos = hazard.get("position", {})
            haz_x = haz_pos.get("x", 0)
            haz_y = haz_pos.get("y", 0)
            haz_radius = hazard.get("radius", 0)
            haz_type = hazard.get("type", "unknown")

            distance = ((ball_x - haz_x) ** 2 + (ball_y - haz_y) ** 2) ** 0.5

            # If ball is within hazard radius (contact)
            if distance <= haz_radius + 10:  # Ball radius is ~10
                hazard_contacts.append(
                    {
                        "frame": step.get("frame"),
                        "type": haz_type,
                        "distance": distance,
                    }
                )

    hazard_types = Counter(c["type"] for c in hazard_contacts)

    return {
        "total_contacts": len(hazard_contacts),
        "contacts_by_type": dict(hazard_types),
        "unique_hazard_types": len(hazard_types),
    }


def analyze_paddle_behavior(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze paddle movement and targeting patterns."""
    paddle_positions = []
    paddle_velocities = []
    target_deviations = []

    for step in steps:
        obs = step.get("observation", {})
        paddle = obs.get("paddle", {})

        pos = paddle.get("position", {}).get("x", 0)
        target = paddle.get("targetX", 0)
        velocity = paddle.get("velocityX", 0)

        paddle_positions.append(pos)
        paddle_velocities.append(abs(velocity))
        target_deviations.append(abs(pos - target))

    avg_position = sum(paddle_positions) / len(paddle_positions) if paddle_positions else 0
    avg_velocity = sum(paddle_velocities) / len(paddle_velocities) if paddle_velocities else 0
    avg_deviation = (
        sum(target_deviations) / len(target_deviations) if target_deviations else 0
    )

    return {
        "avg_position": avg_position,
        "avg_absolute_velocity": avg_velocity,
        "avg_target_deviation": avg_deviation,
        "position_variance": (
            sum((p - avg_position) ** 2 for p in paddle_positions) / len(paddle_positions)
            if paddle_positions
            else 0
        ),
    }


def analyze_ball_behavior(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze ball movement patterns."""
    ball_speeds = []
    launch_frame = None

    for step in steps:
        obs = step.get("observation", {})
        ball = obs.get("ball", {})

        attached = ball.get("attached", True)
        speed = ball.get("speed", 0)

        if not attached:
            ball_speeds.append(speed)
            if launch_frame is None:
                launch_frame = step.get("frame", 0)

    avg_speed = sum(ball_speeds) / len(ball_speeds) if ball_speeds else 0
    max_speed = max(ball_speeds) if ball_speeds else 0
    min_speed = min(ball_speeds) if ball_speeds else 0

    return {
        "launch_frame": launch_frame,
        "avg_speed": avg_speed,
        "max_speed": max_speed,
        "min_speed": min_speed,
        "speed_samples": len(ball_speeds),
    }


def analyze_scoring(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze scoring progression."""
    scores = [step.get("score", 0) for step in steps]
    rewards = [step.get("reward", 0) for step in steps]

    initial_score = scores[0] if scores else 0
    final_score = scores[-1] if scores else 0
    total_reward = sum(rewards)

    # Find largest single-frame score gain
    max_single_gain = max(rewards) if rewards else 0
    max_gain_frame = rewards.index(max_single_gain) if rewards else None

    return {
        "initial_score": initial_score,
        "final_score": final_score,
        "total_reward": total_reward,
        "max_single_frame_gain": max_single_gain,
        "max_gain_frame": max_gain_frame,
        "avg_reward_per_step": total_reward / len(rewards) if rewards else 0,
    }


def analyze_survival(steps: list[dict[str, Any]], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze survival metrics."""
    life_lost_events = [e for e in events if e.get("name") == "LifeLost"]

    lives_data = [step.get("lives_remaining", 3) for step in steps]
    initial_lives = lives_data[0] if lives_data else 3
    final_lives = lives_data[-1] if lives_data else 0

    return {
        "initial_lives": initial_lives,
        "final_lives": final_lives,
        "lives_lost": len(life_lost_events),
        "life_lost_frames": [e.get("step_frame") for e in life_lost_events],
    }


def print_summary(
    metadata: dict[str, Any],
    steps: list[dict[str, Any]],
    events: list[dict[str, Any]],
    verbose: bool = False,
) -> None:
    """Print comprehensive trajectory analysis summary."""
    print("=" * 80)
    print("TRAJECTORY ANALYSIS SUMMARY")
    print("=" * 80)
    print(f"\nMetadata:")
    print(f"  Seed: {metadata.get('seed')}")
    print(f"  Round: {metadata.get('round')}")
    print(f"  Total Steps: {metadata.get('steps')}")
    print(f"  Truncated: {metadata.get('truncated', False)}")

    if not steps:
        print("\nNo step data available.")
        return

    # Combos
    combo_analysis = analyze_combos(events)
    print(f"\nCombo Analysis:")
    print(f"  Milestones Reached: {combo_analysis['milestones_reached']}")
    print(f"  Max Combo: {combo_analysis['max_combo']}")
    print(f"  Max Multiplier: {combo_analysis['max_multiplier']:.2f}x")
    print(f"  Combo Resets: {combo_analysis['combo_resets']}")

    # Bricks
    brick_analysis = analyze_bricks(events, steps)
    print(f"\nBrick Analysis:")
    print(f"  Total Breaks: {brick_analysis['total_breaks']}")
    print(f"  Total Hits: {brick_analysis['total_hits']}")
    print(f"  Brick Types: {brick_analysis['brick_types']}")
    print(f"  Power-Up Bricks: {len(brick_analysis['power_up_bricks'])}")
    print(f"  High-HP Bricks: {len(brick_analysis['high_hp_bricks'])}")
    print(f"  Avg Combo at Break: {brick_analysis['avg_combo_at_break']:.2f}")

    if verbose and brick_analysis["power_up_bricks"]:
        print("\n  Power-Up Brick Details:")
        for pu in brick_analysis["power_up_bricks"]:
            print(
                f"    Frame {pu['frame']} ({pu['elapsed_ms']}ms): "
                f"Row {pu['row']}, Col {pu['col']}"
            )

    # Hazards
    hazard_analysis = analyze_hazards(events, steps)
    print(f"\nHazard Analysis:")
    print(f"  Total Contacts: {hazard_analysis['total_contacts']}")
    print(f"  Contacts by Type: {hazard_analysis['contacts_by_type']}")

    # Paddle
    paddle_analysis = analyze_paddle_behavior(steps)
    print(f"\nPaddle Behavior:")
    print(f"  Avg Position: {paddle_analysis['avg_position']:.1f}")
    print(f"  Avg Velocity: {paddle_analysis['avg_absolute_velocity']:.2f}")
    print(f"  Avg Target Deviation: {paddle_analysis['avg_target_deviation']:.2f}")
    print(f"  Position Variance: {paddle_analysis['position_variance']:.1f}")

    # Ball
    ball_analysis = analyze_ball_behavior(steps)
    print(f"\nBall Behavior:")
    print(f"  Launch Frame: {ball_analysis['launch_frame']}")
    print(f"  Avg Speed: {ball_analysis['avg_speed']:.2f}")
    print(f"  Max Speed: {ball_analysis['max_speed']:.2f}")
    print(f"  Min Speed: {ball_analysis['min_speed']:.2f}")

    # Scoring
    scoring_analysis = analyze_scoring(steps)
    print(f"\nScoring:")
    print(f"  Initial Score: {scoring_analysis['initial_score']:.0f}")
    print(f"  Final Score: {scoring_analysis['final_score']:.0f}")
    print(f"  Total Reward: {scoring_analysis['total_reward']:.0f}")
    print(f"  Max Single-Frame Gain: {scoring_analysis['max_single_frame_gain']:.0f}")
    print(f"  Avg Reward/Step: {scoring_analysis['avg_reward_per_step']:.3f}")

    # Survival
    survival_analysis = analyze_survival(steps, events)
    print(f"\nSurvival:")
    print(f"  Initial Lives: {survival_analysis['initial_lives']}")
    print(f"  Final Lives: {survival_analysis['final_lives']}")
    print(f"  Lives Lost: {survival_analysis['lives_lost']}")
    if survival_analysis["life_lost_frames"]:
        print(f"  Life Lost at Frames: {survival_analysis['life_lost_frames']}")

    print("\n" + "=" * 80)


def main() -> None:
    args = parse_args()

    try:
        metadata, steps = load_trajectory(args.trajectory_path)
        events = extract_events(steps)
        print_summary(metadata, steps, events, verbose=args.verbose)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error: {e}")
        exit(1)


if __name__ == "__main__":
    main()
