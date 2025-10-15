# Quickstart — Lucky Break Core Experience

## Prerequisites
- Node.js 20+
- pnpm 9 (preferred) or npm 10
- Modern browser with WebGL2 support for manual testing

## Install
```powershell
pnpm install
```

## Development Workflow
1. Start the dev server:
   ```powershell
   pnpm dev
   ```
2. Open `http://localhost:5173` and trigger audio by clicking the "Tap to start" prompt.
3. Run headless simulation:
   ```powershell
   pnpm lucky-break simulate --seed 42 --round 1 --duration 180
   ```
4. Execute the unit tests:
   ```powershell
   pnpm test           # Vitest (jsdom) unit suites
   ```

## Project Structure
```
src/
├── app/            # boot, loop, state orchestration
├── physics/        # Matter.js setup, bodies, collisions
├── render/         # PixiJS stage, HUD, VFX
├── audio/          # Tone.js buses, scenes, SFX
├── util/           # shared helpers (rng, pools, time)
└── cli/            # headless simulation & asset tooling

tests/
└── unit/           # Vitest (jsdom) suites
```

## CLI Reference
- `pnpm lucky-break simulate --seed <number> --round <n>`: deterministic headless run.
- `pnpm lucky-break preload --manifest assets/samples/manifest.json`: preload audio and report asset stats.
- `pnpm lucky-break export-metrics --session <id> --output reports/<file>.json`: dump telemetry for analysis.

## Observability & Diagnostics
- Enable HUD debug overlay with `?debug=true` query parameter.
- Logs surface subsystem tags (`[audio]`, `[physics]`, `[render]`).
- CLI commands emit JSON to stdout and human-readable progress to stderr.
