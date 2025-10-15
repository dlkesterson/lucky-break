# Implementation Plan: Lucky Break Core Experience

**Branch**: `001-we-re-building` | **Date**: 2025-10-15 | **Spec**: [spec.md](c:/Code/lucky-break/specs/001-we-re-building/spec.md)
**Input**: Feature specification from `/specs/001-we-re-building/spec.md`

**Note**: This plan captures design intent through Phase 2 of the planning workflow. Implementation is out of scope for `/speckit.plan`.

## Summary

Deliver a browser-based Lucky Break experience that marries PixiJS rendering, Matter.js physics, and Tone.js audio into a tightly synchronized Breakout loop. Players must launch, clear, and replay rounds with responsive visuals, momentum-aware music shifts, and accessibility controls that honor the spec’s success criteria.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: PixiJS 8, Matter.js 0.19, Tone.js 14, Vite 5 build tooling  
**Storage**: N/A (session lives entirely in memory; no persistent datastore)  
**Testing**: Vitest (jsdom) + @testing-library/pixi for unit-level logic  
**Target Platform**: Modern desktop and mobile browsers with WebGL2 or Canvas fallback support  
**Project Type**: Single-page web application served via static hosting  
**Performance Goals**: Maintain ≥60 FPS on desktop and ≥45 FPS on mobile; fire >95% of collision SFX within 100 ms perceived latency; music transitions lock to bar boundaries  
**Constraints**: Keep audio glitch-free on mobile Safari/Chrome, respect SampleSwap licensing (local manifest, attribution), minimize GC by pooling sprites/events, operate offline after initial asset load  
**Scale/Scope**: Single-player arcade session with modular subsystems (app, physics, audio) and supporting CLI automation for headless simulation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [ ] **I. Library-First**: Ship gameplay subsystems (`src/app`, `src/audio`, `src/physics`, `src/render`) as reusable modules with documented entry points; verification via module export review and unit coverage per package.
- [ ] **II. CLI Interface**: Provide headless simulation and asset tooling commands under `src/cli` exposed as `lucky-break <command>`; verification via CLI smoke test documented in `quickstart.md`.
- [ ] **III. Vitest Unit Tests (NON-NEGOTIABLE)**: Each implementation PR includes failing Vitest jsdom specs committed before production code, captured in development log; verification via unit test diffs and CI history.
- [ ] **IV. Observability, Versioning & Simplicity**: Add structured console logging with subsystem tags, HUD debug overlay toggles, and semantic version output through CLI; verification via instrumentation review and release notes update.
- [ ] **Additional Constraints – Dependency Justification**: Limit runtime dependencies to PixiJS, Matter.js, Tone.js, Vite ecosystem, and document any additions in plan updates; verification through dependency audit.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```
src/
├── app/            # boot, loop, input, state orchestrators
├── physics/        # Matter.js setup, bodies, collision routing
├── render/         # PixiJS stage, HUD, sprite pools, beat VFX
├── audio/          # Tone.js bus init, music FSM, SFX bindings
├── util/           # shared helpers (rng, pooling, timing)
└── cli/            # headless simulation + asset preprocessing adapters

tests/
└── unit/           # Vitest (jsdom) suites for state, audio, and UI adapters
```

**Structure Decision**: Single-project web client with subsystems mapped to dedicated directories; CLI utilities co-reside under `src/cli`, and tests mirror runtime packages via focused Vitest unit suites.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
|  |  |  |
