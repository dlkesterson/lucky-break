from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest

import lucky_break_env as lbe


@pytest.fixture(name="env_stub")
def env_stub() -> lbe.LuckyBreakEnv:
    env = lbe.LuckyBreakEnv.__new__(lbe.LuckyBreakEnv)
    env._trajectory = []
    env._seed = 1337
    env._round = 1
    env._episode_index = 42
    return env


def test_assert_message_type_accepts_expected(env_stub: lbe.LuckyBreakEnv) -> None:
    lbe.LuckyBreakEnv._assert_message_type({"type": "reset"}, "reset")


def test_assert_message_type_rejects_invalid(env_stub: lbe.LuckyBreakEnv) -> None:
    with pytest.raises(RuntimeError):
        lbe.LuckyBreakEnv._assert_message_type({"type": "step"}, "reset")


@pytest.mark.parametrize(
    "observation, expected",
    [
        (
            {
                "frame": 10,
                "timeMs": 33,
                "ball": {
                    "attached": True,
                    "position": {"x": 4.0, "y": 5.0},
                    "velocity": {"x": 0.1, "y": -0.2},
                    "speed": 1.2,
                },
                "paddle": {
                    "position": {"x": 6.0, "y": 7.0},
                    "targetX": 6.5,
                    "width": 120.0,
                    "velocityX": 0.3,
                },
                "session": {
                    "score": 1000,
                    "livesRemaining": 2,
                    "bricksRemaining": 45,
                    "bricksTotal": 48,
                    "comboHeat": 0.75,
                    "volleyLength": 12,
                },
            },
            np.array(
                [
                    10.0,
                    33.0,
                    4.0,
                    5.0,
                    0.1,
                    -0.2,
                    1.2,
                    1.0,
                    6.0,
                    7.0,
                    6.5,
                    120.0,
                    0.3,
                    1000.0,
                    2.0,
                    45.0,
                    48.0,
                    0.75,
                    12.0,
                ],
                dtype=np.float32,
            ),
        ),
    ],
)
def test_to_vector_matches_expected(
    env_stub: lbe.LuckyBreakEnv,
    observation: dict[str, Any],
    expected: np.ndarray,
) -> None:
    vector = lbe.LuckyBreakEnv._to_vector(env_stub, observation)
    assert vector.shape == (19,)
    np.testing.assert_allclose(vector, expected)


def test_write_trajectory_creates_jsonl(
    tmp_path: Path,
    env_stub: lbe.LuckyBreakEnv,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_stub._trajectory = [
        {
            "frame": 1,
            "elapsed_ms": 8,
            "action": 3,
            "reward": 0.5,
            "done": False,
            "observation": {"frame": 1},
            "score": 20,
            "lives_remaining": 2,
            "bricks_remaining": 44,
            "events": None,
        }
    ]

    monkeypatch.setattr(lbe, "TRAJECTORY_DIR", tmp_path)
    lbe.LuckyBreakEnv._write_trajectory(env_stub, truncated=False)

    files = list(tmp_path.glob("trajectory_seed1337_ep0042.jsonl"))
    assert len(files) == 1

    contents = files[0].read_text(encoding="utf-8").splitlines()
    assert contents[0] == json.dumps(
        {
            "type": "metadata",
            "seed": 1337,
            "round": 1,
            "steps": 1,
            "truncated": False,
        }
    )
    assert json.loads(contents[1])["frame"] == 1
    assert env_stub._trajectory == []
