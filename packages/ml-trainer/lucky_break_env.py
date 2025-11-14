from __future__ import annotations

import json
import subprocess
from pathlib import Path
from shutil import which
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces
from numpy.typing import NDArray

RL_ACTION_COUNT = 6
DEFAULT_SEED = 1337
DEFAULT_ROUND = 1
REPO_ROOT = Path(__file__).resolve().parents[2]
CLI_PACKAGE = "@lucky-break/cli-sim"

def _resolve_pnpm() -> str:
    candidate = which("pnpm") or which("pnpm.cmd")
    if candidate is None:
        raise FileNotFoundError(
            "pnpm executable not found on PATH. Install pnpm or expose it before training."
        )
    return candidate

SIMULATOR_COMMAND = [_resolve_pnpm(), "--filter", CLI_PACKAGE, "exec", "tsx", "src/index.ts", "simulate-rl"]
TRAJECTORY_DIR = Path(__file__).resolve().parent / "trajectories"
TRAJECTORY_DIR.mkdir(parents=True, exist_ok=True)


ObservationArray = NDArray[np.float32]


class LuckyBreakEnv(gym.Env):
    metadata = {"render.modes": []}

    def __init__(
        self,
        seed: int = DEFAULT_SEED,
        round_number: int = DEFAULT_ROUND,
        telemetry: bool = True,
    ) -> None:
        super().__init__()
        self._seed = seed
        self._round = round_number
        self._telemetry = telemetry
        self._proc: subprocess.Popen[str] | None = None
        self._episode_done = False
        self._episode_index = 0
        self._latest_observation: dict[str, Any] | None = None
        self._trajectory: list[dict[str, Any]] = []

        self.action_space = spaces.Discrete(RL_ACTION_COUNT)
        # Observation vector layout (19 floats)
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf, shape=(19,), dtype=np.float32)

        self._start_simulator()

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[ObservationArray, dict[str, Any]]:
        super().reset(seed=seed)
        if seed is not None:
            self._seed = int(seed)

        if self._trajectory:
            self._write_trajectory(truncated=True)

        self._trajectory = []
        self._episode_index += 1
        self._episode_done = False

        self._send_command({"type": "reset", "seed": self._seed})
        message = self._read_message()
        self._assert_message_type(message, "reset")
        observation_dict = message["observation"]
        self._latest_observation = observation_dict
        observation = self._to_vector(observation_dict)
        return observation, {}

    def step(self, action: int) -> tuple[ObservationArray, float, bool, bool, dict[str, Any]]:
        if self._episode_done:
            raise RuntimeError("Episode finished. Call reset() before stepping again.")
        if not self.action_space.contains(action):
            raise ValueError(f"Action {action} is out of bounds for this environment.")

        self._send_command({"type": "step", "action": int(action)})
        message = self._read_message()
        self._assert_message_type(message, "step")

        observation_dict = message["observation"]
        reward = float(message["reward"])
        done = bool(message["done"])
        info_payload = message.get("info", {})

        observation = self._to_vector(observation_dict)
        self._latest_observation = observation_dict

        info = {
            "frame": info_payload.get("frame"),
            "elapsed_ms": info_payload.get("elapsedMs"),
            "score": info_payload.get("score"),
            "lives_remaining": info_payload.get("livesRemaining"),
            "bricks_remaining": info_payload.get("bricksRemaining"),
            "events": info_payload.get("events"),
        }

        self._trajectory.append(
            {
                "frame": info["frame"],
                "elapsed_ms": info["elapsed_ms"],
                "action": int(action),
                "reward": reward,
                "done": done,
                "observation": observation_dict,
                "score": info["score"],
                "lives_remaining": info["lives_remaining"],
                "bricks_remaining": info["bricks_remaining"],
                "events": info["events"],
            }
        )

        if done:
            self._episode_done = True
            self._write_trajectory(truncated=False)

        return observation, reward, done, False, info

    def close(self) -> None:
        if self._trajectory:
            # Episode interrupted before completion
            self._write_trajectory(truncated=True)

        if self._proc:
            try:
                self._send_command({"type": "close"})
            except Exception:
                pass
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                self._proc.kill()
            finally:
                self._proc = None

    def _start_simulator(self) -> None:
        command = list(SIMULATOR_COMMAND)
        if self._seed is not None:
            command.extend(["--seed", str(self._seed)])
        if self._round is not None:
            command.extend(["--round", str(self._round)])
        if not self._telemetry:
            command.append("--no-telemetry")

        self._proc = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=REPO_ROOT,
            text=True,
            bufsize=1,
        )

        initial = self._read_message()
        self._assert_message_type(initial, "reset")
        self._latest_observation = initial["observation"]

    def _send_command(self, payload: dict[str, Any]) -> None:
        if not self._proc or not self._proc.stdin:
            raise RuntimeError('Simulator process is not running.')
        line = json.dumps(payload, separators=(",", ":"))
        try:
            self._proc.stdin.write(f"{line}\n")
            self._proc.stdin.flush()
        except BrokenPipeError as error:
            raise RuntimeError('Simulator process closed unexpectedly.') from error

    def _read_message(self) -> dict[str, Any]:
        if not self._proc or not self._proc.stdout:
            raise RuntimeError('Simulator process is not running.')
        line = self._proc.stdout.readline()
        if line == "":
            stderr_output = ''
            if self._proc.stderr:
                stderr_output = self._proc.stderr.read().strip()
            raise RuntimeError(f"Simulator terminated. stderr: {stderr_output}")
        try:
            return json.loads(line)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Failed to decode simulator output: {line.strip()}") from error

    @staticmethod
    def _assert_message_type(message: dict[str, Any], expected: str) -> None:
        actual = message.get('type')
        if actual != expected:
            raise RuntimeError(f"Expected message type '{expected}', received '{actual}'.")

    def _to_vector(self, observation: dict[str, Any]) -> ObservationArray:
        ball = observation.get('ball', {})
        paddle = observation.get('paddle', {})
        session = observation.get('session', {})

        values = np.array(
            [
                float(observation.get('frame', 0.0)),
                float(observation.get('timeMs', 0.0)),
                float(ball.get('position', {}).get('x', 0.0)),
                float(ball.get('position', {}).get('y', 0.0)),
                float(ball.get('velocity', {}).get('x', 0.0)),
                float(ball.get('velocity', {}).get('y', 0.0)),
                float(ball.get('speed', 0.0)),
                1.0 if bool(ball.get('attached', False)) else 0.0,
                float(paddle.get('position', {}).get('x', 0.0)),
                float(paddle.get('position', {}).get('y', 0.0)),
                float(paddle.get('targetX', 0.0)),
                float(paddle.get('width', 0.0)),
                float(paddle.get('velocityX', 0.0)),
                float(session.get('score', 0.0)),
                float(session.get('livesRemaining', 0.0)),
                float(session.get('bricksRemaining', 0.0)),
                float(session.get('bricksTotal', 0.0)),
                float(session.get('comboHeat', 0.0)),
                float(session.get('volleyLength', 0.0)),
            ],
            dtype=np.float32,
        )
        return values

    def _write_trajectory(self, *, truncated: bool) -> None:
        if not self._trajectory:
            return

        filename = TRAJECTORY_DIR / f"trajectory_seed{self._seed}_ep{self._episode_index:04d}.jsonl"
        with filename.open('w', encoding='utf-8') as handle:
            metadata = {
                'type': 'metadata',
                'seed': self._seed,
                'round': self._round,
                'steps': len(self._trajectory),
                'truncated': truncated,
            }
            handle.write(json.dumps(metadata) + '\n')
            for step in self._trajectory:
                handle.write(json.dumps(step) + '\n')

        self._trajectory = []

    def __del__(self) -> None:  # pragma: no cover - best effort cleanup
        try:
            self.close()
        except Exception:
            pass
