![Lucky Break banner](packages/web-client/assets/ui/banner.png)

# Lucky Break

[![CI](https://github.com/dlkesterson/lucky-break/actions/workflows/ci.yml/badge.svg)](https://github.com/dlkesterson/lucky-break/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fdlkesterson.github.io%2Flucky-break%2Fcoverage%2Fcoverage-summary.json&label=coverage)](https://dlkesterson.github.io/lucky-break/coverage/index.html)

Lucky Break is a high-tempo brick breaker with deterministic physics, multi-ball chaos, wager-driven bricks, and reactive audio that leans into every rally.

## Play Online

The latest build is published via GitHub Pages: https://dlkesterson.github.io/lucky-break/

## Core Systems

- `Deterministic loop` keeps physics, audio, and replays in lockstep via a fixed timestep, seeded RNG, and saved session snapshots.
- `Multi-ball + rewards` stackable power-ups, gamble bricks, and reward wheels keep the power curve fresh each round.
- `Reactive audio` uses Tone.js transport, MIDI accents, and predictive foreshadowing to telegraph impacts before they land.
- `Responsive input` supports mouse, touch gestures, and gamepads with adaptive paddle smoothing and accessibility toggles.
- `HUD & scenes` run on a Pixi scene stack with combo overlays, mobile layout scaling, and quick transitions between menus, gameplay, and recaps.

## Tech Stack

- pnpm 8 workspace with TypeScript 5 (strict) across packages.
- PixiJS 8 for rendering, post-effects, and HUD orchestration.
- Matter.js 0.19 for deterministic physics simulation and collision contracts (shared via `@lucky-break/core-domain`).
- Tone.js 14 for music direction, MIDI scheduling, and audio foreshadowing.
- Vitest + Playwright for unit, integration, and automation coverage enforced in CI.

## Getting Started

```bash
pnpm install
pnpm dev
```

`pnpm dev` boots the Vite dev server from `@lucky-break/web-client`. Open the printed URL in a desktop or mobile browser—the layout adapts on the fly. Plug in a controller or use touch to feel the input tuning.

### Development Commands

- `pnpm build` – Production bundle for `@lucky-break/web-client` with cache-busting assets.
- `pnpm lint` – ESLint across `@lucky-break/core-domain`, `@lucky-break/cli-sim`, and `@lucky-break/web-client` with `--max-warnings=0`.
- `pnpm typecheck` – TypeScript project references across every package.
- `pnpm test` – Vitest unit + integration suites (web client).
- `pnpm test:e2e` – Playwright end-to-end coverage (headless by default).
- `pnpm simulate:verify` – TSX-powered deterministic simulations (CLI) used in CI.
- `pnpm --filter @lucky-break/cli-sim exec tsx src/index.ts simulate --seed 42` – Run the headless CLI without building.

## Workspace Layout

```
packages/
  core-domain/   # Shared deterministic loop, physics, config, rewards, utilities
  cli-sim/       # Headless engine + deterministic regression tooling (TS + Tsx scripts)
  web-client/    # Pixi front-end, Vite build, assets, Playwright + Vitest suites
scripts/         # Shared CI tooling (e.g., deterministic replay generator)
```

The web client keeps its runtime under `packages/web-client/src`, while shared logic lives in `packages/core-domain/src`. Automation and CLI helpers live in `packages/cli-sim/src` and reuse the same modules through workspace aliases.

Tests live in `packages/web-client/tests/{unit,integration,e2e}` with Vitest setup in `tests/setup`. Coverage reports are emitted to `packages/web-client/coverage` and copied into the built site for GitHub Pages at `/coverage/` on every push to `main`.

## Determinism & Replays

- Session state is driven by seeded RNG; replays capture inputs and layout seeds for frame-perfect playback.
- The `game/runtime` facade exposes a diagnostics surface for latency, combo momentum, and foreshadow predictions.
- CLI tooling (`pnpm --filter @lucky-break/cli-sim exec tsx src/index.ts simulate` for ad-hoc runs, or `pnpm simulate:verify` during development/CI) exercises deterministic scenarios for balancing and regression tracking without spinning up Pixi.

## Contributing

We follow conventional TypeScript + Pixi patterns with strict linting and coverage gates. Please include tests when you touch runtime logic, new rewards, or visual/audio systems.
