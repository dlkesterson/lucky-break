# lucky-break Development Guidelines

Manually curated snapshot of the workspace. Last updated: 2025-11-06.

## Workspace Overview
- pnpm 8 workspace with TypeScript 5.9 in strict mode across every package.
- Shared lint config (`eslint.config.js`) enforces type-aware ESLint and Prettier integration.
- Project references live in `tsconfig.base.json`; individual packages extend it for builds and tooling.
- Generated artifacts land in `packages/**/dist` and `coverage/`; keep them out of versioned changes.

## Active Technologies
- React 18 + PixiJS 8.14 for the browser UI, scene stack, and HUD overlays (`@lucky-break/web-client`).
- Tone.js 15.1 for audio transport, predictive foreshadow cues, and music direction.
- Matter.js 0.20 wrapped in deterministic helpers inside `@lucky-break/core-domain`.
- Zustand 5 state stores layered on top of the core-domain runtime for front-end orchestration.
- Vitest 1.6, Playwright 1.49, and TSX-powered Node scripts for tests, automation, and CLI tooling.

## Path Aliases
```
app/state             -> packages/core-domain/src/app/state.ts
app/events            -> packages/core-domain/src/app/events.ts
app/*                 -> packages/web-client/src/app/*
audio/*               -> packages/web-client/src/audio/*
render/*              -> packages/web-client/src/render/*
ui/*                  -> packages/web-client/src/ui/*
input/*               -> packages/web-client/src/input/*
scenes/*              -> packages/web-client/src/scenes/*
physics/*             -> packages/core-domain/src/physics/*
util/*                -> packages/core-domain/src/util/*
config/assets         -> packages/web-client/src/config/assets.ts
config/*              -> packages/core-domain/src/config/*
game/*                -> packages/core-domain/src/game/*
types/*               -> packages/core-domain/src/types/*
cli/*                 -> packages/cli-sim/src/*
core-domain/*         -> packages/core-domain/src/*
```

## Package Layout
```
packages/
  core-domain/
    src/
      app/        # Event bus, session state, replay buffer
      config/     # Tuning constants, reward wheel, level settings
      game/       # Gamble bricks, rewards, scoring helpers
      physics/    # Matter.js wrappers, hazards, launch + attachment controllers
      types/      # Shared DTOs for input, geometry, and contracts
      util/       # Geometry math, RNG helpers, input smoothing, scoring utilities
  cli-sim/
    src/
      headless-engine.ts  # Deterministic simulation loop reused in CI
      simulate.ts          # CLI entrypoints and replay IO
      tuning-bot.ts        # Batch tuning + balancing harness
  web-client/
    src/
      app/        # Runtime orchestration, main entry, session services
      audio/      # Tone.js schedulers, foreshadowing, soundbank
      render/     # Pixi scenes, HUD layers, visual effects
      scenes/     # Scene composition and transitions
      ui/         # React overlays, HUD widgets, menu components
      input/      # Device adapters, smoothing, launch manager
      config/     # Asset manifests and front-end config bridges
      types/      # Front-end only types and contracts
    tests/
      unit/
      integration/
      e2e/
  scripts/
    ci-simulation.ts   # Deterministic simulation harness used by simulate:verify
    log-vitest-loader.mjs / trace-vitest.*  # Vitest debugging utilities
```

## Key Commands
- `pnpm dev` – Vite dev server for `@lucky-break/web-client`.
- `pnpm build` – Production build for the web client (Pixi + React bundle).
- `pnpm test`, `pnpm test:coverage`, `pnpm test:e2e` – Vitest unit/integration, coverage reports, and Playwright suites.
- `pnpm lint`, `pnpm lint:fix`, `pnpm typecheck` – Linting and TS project references across every package.
- `pnpm simulate:verify` – Runs the TSX-based deterministic CLI regression harness.
- `pnpm ci` – Aggregated lint + typecheck + coverage + simulation workflow (mirrors GitHub Actions).

## Testing & QA
- Vitest lives under `packages/web-client/tests/{unit,integration}` with shared setup in `tests/setup`.
- Playwright specs reside in `packages/web-client/tests/e2e`; CI runs them headless against the Vite preview build.
- CLI simulations replay seeded sessions headlessly to guard deterministic physics and reward flows.
- Coverage artifacts emit to `coverage/`; ensure thresholds remain above CI gates.

## Code Style
- Named exports only (`import/no-default-export` enforced) except in config files.
- Await or explicitly handle every promise (`@typescript-eslint/no-floating-promises`).
- Exhaustive `switch` statements (`@typescript-eslint/switch-exhaustiveness-check`).
- Prefer pure, deterministic helpers in core-domain; keep side-effects at the edges (runtime, audio, CLI IO).
- React components stay function-based; keep Pixi side-effects in dedicated render modules with clear cleanup.

## Determinism Notes
- All gameplay state flows through seeded RNG and deterministic physics; reuse helpers from `core-domain` instead of re-implementing RNG or timers.
- Replay buffers (`app/replay-buffer.ts`) expect microsecond precision timestamps—preserve normalization helpers when extending events.
- Input smoothing and paddle targeting (`util/input-helpers.ts`) must stay device-agnostic for replay parity.

## Recent Highlights
- Core domain upgraded to Matter.js 0.20 with updated typings and hazard controllers.
- Monorepo wiring now relies on shared `tsconfig.base.json` path aliases for cross-package imports.
- CLI simulation harness consolidated in `packages/cli-sim` with TSX entrypoints for faster iteration.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
