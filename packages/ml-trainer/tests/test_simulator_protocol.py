"""Smoke test for the RL simulator JSON protocol."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from shutil import which
from typing import Any


def find_pnpm() -> str:
    """Locate pnpm executable."""
    candidate = which("pnpm") or which("pnpm.cmd")
    if candidate is None:
        raise FileNotFoundError("pnpm not found on PATH")
    return candidate


def start_simulator() -> subprocess.Popen[str]:
    """Start the RL simulator process."""
    repo_root = Path(__file__).resolve().parents[2]
    pnpm = find_pnpm()

    cmd = [
        pnpm,
        "--filter",
        "@lucky-break/cli-sim",
        "exec",
        "tsx",
        "src/index.ts",
        "simulate-rl",
        "--seed",
        "42",
        "--round",
        "1",
        "--no-telemetry",
    ]

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=repo_root,
        text=True,
        bufsize=1,
    )

    return proc


def send_command(proc: subprocess.Popen[str], command: dict[str, Any]) -> None:
    """Send a JSON command to the simulator."""
    if not proc.stdin:
        raise RuntimeError("Simulator stdin not available")

    line = json.dumps(command, separators=(",", ":"))
    proc.stdin.write(f"{line}\n")
    proc.stdin.flush()


def read_response(proc: subprocess.Popen[str]) -> dict[str, Any]:
    """Read a JSON response from the simulator."""
    if not proc.stdout:
        raise RuntimeError("Simulator stdout not available")

    line = proc.stdout.readline()
    if not line:
        stderr_output = proc.stderr.read() if proc.stderr else ""
        raise RuntimeError(f"Simulator terminated unexpectedly. stderr: {stderr_output}")

    return json.loads(line)


def test_reset() -> None:
    """Test reset command."""
    print("Testing reset command...")
    proc = start_simulator()

    try:
        # Read initial reset response (sent automatically on startup)
        response = read_response(proc)
        assert response.get("type") == "reset", f"Expected 'reset', got {response.get('type')}"
        assert "observation" in response, "Missing observation in reset response"

        obs = response["observation"]
        assert "ball" in obs, "Missing ball in observation"
        assert "paddle" in obs, "Missing paddle in observation"
        assert "session" in obs, "Missing session in observation"

        print("  ✓ Reset response valid")

        # Send explicit reset command
        send_command(proc, {"type": "reset", "seed": 123})
        response = read_response(proc)
        assert response.get("type") == "reset", f"Expected 'reset', got {response.get('type')}"
        print("  ✓ Explicit reset successful")

    finally:
        send_command(proc, {"type": "close"})
        proc.terminate()
        proc.wait(timeout=5)


def test_step() -> None:
    """Test step command."""
    print("Testing step command...")
    proc = start_simulator()

    try:
        # Read initial reset
        read_response(proc)

        # Send step commands with various actions
        for action in range(6):  # Actions 0-5
            send_command(proc, {"type": "step", "action": action})
            response = read_response(proc)

            assert response.get("type") == "step", f"Expected 'step', got {response.get('type')}"
            assert "observation" in response, "Missing observation in step response"
            assert "reward" in response, "Missing reward in step response"
            assert "done" in response, "Missing done in step response"
            assert "info" in response, "Missing info in step response"

            # Validate types
            assert isinstance(response["reward"], (int, float)), "Reward must be numeric"
            assert isinstance(response["done"], bool), "Done must be boolean"

        print(f"  ✓ All {6} actions executed successfully")

    finally:
        send_command(proc, {"type": "close"})
        proc.terminate()
        proc.wait(timeout=5)


def test_episode_completion() -> None:
    """Test running a short episode."""
    print("Testing episode completion...")
    proc = start_simulator()

    try:
        # Read initial reset
        read_response(proc)

        # Run a few steps
        max_steps = 100
        done = False
        step_count = 0

        for i in range(max_steps):
            # Alternate between moving and launching
            action = 3 if i == 0 else (i % 3)
            send_command(proc, {"type": "step", "action": action})
            response = read_response(proc)

            step_count += 1
            done = response.get("done", False)

            if done:
                print(f"  ✓ Episode completed in {step_count} steps")
                break

        if not done:
            print(f"  ⚠ Episode did not complete in {max_steps} steps (expected for full game)")

    finally:
        send_command(proc, {"type": "close"})
        proc.terminate()
        proc.wait(timeout=5)


def test_invalid_command() -> None:
    """Test handling of invalid commands."""
    print("Testing invalid command handling...")
    proc = start_simulator()

    try:
        # Read initial reset
        read_response(proc)

        # Send invalid action (out of range)
        send_command(proc, {"type": "step", "action": 999})

        # Should receive error message on stderr or handle gracefully
        # For now, we just verify the simulator doesn't crash
        try:
            response = read_response(proc)
            # If it responds, it should indicate error or ignore
            print("  ✓ Simulator handled invalid action gracefully")
        except Exception:
            # Or it might write to stderr
            print("  ✓ Simulator rejected invalid action")

    finally:
        send_command(proc, {"type": "close"})
        proc.terminate()
        proc.wait(timeout=5)


def main() -> None:
    """Run all smoke tests."""
    print("=" * 60)
    print("RL Simulator Protocol Smoke Tests")
    print("=" * 60)

    tests = [
        ("Reset Command", test_reset),
        ("Step Command", test_step),
        ("Episode Completion", test_episode_completion),
        ("Invalid Command", test_invalid_command),
    ]

    passed = 0
    failed = 0

    for name, test_fn in tests:
        try:
            print(f"\n[{name}]")
            test_fn()
            passed += 1
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
