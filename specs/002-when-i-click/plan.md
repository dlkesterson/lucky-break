# Implementation Plan: Paddle Control and Ball Launch

**Branch**: `002-when-i-click` | **Date**: 2025-10-15 | **Spec**: [link to spec.md](spec.md)
**Input**: Feature specification from `/specs/002-when-i-click/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement paddle control mechanics and ball launch system for the Lucky Break game. The ball must start positioned on the paddle at round start, remain stationary until launch is triggered by paddle movement or screen tap, and the paddle must respond to mouse, keyboard, and touch input while staying within game boundaries.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: PixiJS 8, Matter.js 0.19, Vite 7
**Storage**: N/A (session lives entirely in memory; no persistent datastore)
**Testing**: Vitest (jsdom environment)
**Target Platform**: Web browser (desktop and mobile)
**Project Type**: Web application (game)
**Performance Goals**: 60 FPS gameplay with <16ms frame time
**Constraints**: Real-time physics simulation, responsive input handling (<50ms latency), cross-platform input support
**Scale/Scope**: Single-player game session with physics simulation for ball, paddle, and boundaries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Based on the repository Constitution (see `.specify/memory/constitution.md`):

**I. Library-First**: ✅ PASS - Feature implemented as reusable input, paddle, and ball controller modules

**II. CLI Interface**: ✅ PASS - Game already has CLI simulation command that can be extended to test paddle/ball mechanics

**III. Vitest Unit Tests (NON-NEGOTIABLE)**: ✅ PASS - All new code will be test-driven with Vitest unit tests in jsdom environment

**IV. Observability, Versioning & Simplicity**: ✅ PASS - Uses existing logging system, follows semantic versioning, keeps implementation simple and focused

**Additional Constraints**:
- Technology: ✅ PASS - Uses existing approved stack (TypeScript, PixiJS, Matter.js)
- Testing: ✅ PASS - Only Vitest unit tests required
- Security: ✅ PASS - No sensitive data handling required
- Performance: ✅ PASS - Meets 60 FPS target with existing architecture

**POST-DESIGN STATUS**: ✅ ALL GATES STILL PASS - Design maintains constitution compliance

## Project Structure

### Documentation (this feature)

```
specs/002-when-i-click/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
src/
├── app/
│   ├── main.ts          # Game initialization (will add input handling)
│   ├── loop.ts          # Game loop (will add input processing)
│   └── state.ts         # Game state (will add ball attachment state)
├── physics/
│   └── world.ts         # Physics world (will add ball launch mechanics)
├── render/
│   ├── stage.ts         # Rendering (will add input event handling)
│   └── hud.ts           # HUD (unchanged)
├── types/               # Type definitions (will add input types)
└── util/                # Utilities (will add input helpers)

tests/
└── unit/
    ├── app/
    │   ├── main.spec.ts     # Test game initialization with input
    │   ├── loop.spec.ts     # Test input processing in loop
    │   └── state.spec.ts    # Test ball attachment state
    ├── physics/
    │   └── world.spec.ts    # Test ball launch mechanics
    └── render/
        └── stage.spec.ts    # Test input event handling
```

**Structure Decision**: Uses existing web application structure with game-specific modules. New input handling will be integrated into the main game loop and physics system.

## Complexity Tracking

*No violations - all constitution principles satisfied with existing architecture*
