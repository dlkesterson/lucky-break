![Lucky Break banner](assets/banner.png)

# Lucky Break

[![CI](https://github.com/dlkesterson/lucky-break/actions/workflows/ci.yml/badge.svg)](https://github.com/dlkesterson/lucky-break/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fdlkesterson.github.io%2Flucky-break%2Fcoverage%2Fcoverage-summary.json&label=coverage)](https://dlkesterson.github.io/lucky-break/coverage/)

Lucky Break is a browser-based brick breaker with a deterministic game loop, responsive input on every device, and reactive audio that ramps with the action.

## Play Online

The latest build is published via GitHub Pages: https://dlkesterson.github.io/lucky-break/

## Highlights

- Fixed-timestep simulation with seeded RNG for fully reproducible runs and replays.
- Touch gestures (swipe to aim, long press to charge) and mouse controls tuned for fast play.
- Gamepad support for standard controllers; analog stick steers the paddle and face buttons launch.
- Dynamic music director and curated soundbank that adapt to combo heat and remaining lives.
- Scene stack with polished transitions, HUD overlays, and mobile-friendly scaling.

## Getting Started

```bash
pnpm install
pnpm dev
```

This starts the Vite dev server. Open the printed URL in your browser. The game automatically resizes to the window; connect a controller if you want to try the new gamepad input.

### Useful Commands

- `pnpm build` – Production bundle.
- `pnpm lint` – ESLint across `src/` and `tests/` with `--max-warnings=0`.
- `pnpm test` – Vitest suite (unit + integration) in watchless mode.
- `pnpm simulate` – Headless CLI runner for deterministic gameplay scripts.

## Project Structure

```
src/
  app/        # Loop, runtime, state, preload
  audio/      # Music director, scheduler, SFX
  input/      # Cross-platform input pipeline
  physics/    # World setup, ball launch, constraints
  render/     # Pixi scenes, HUD, effects
  util/       # Shared helpers, scoring, config
```

Tests live under `tests/` (unit, integration, CLI). Coverage is enforced in CI; please add or update tests when you touch code.

## Contributing

Work is guided by `plan.md`, which tracks open milestones and completed tasks. Pick the top-priority item, implement it with tests and lint passing, then mark it `DONE [YYYY-MM-DD]` in the plan. Open a pull request or share diffs once everything is green.
