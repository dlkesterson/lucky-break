---
description: "Task list for Paddle Control and Ball Launch feature implementation"
---

# Tasks: Paddle Control and Ball Launch

**Input**: Design documents from `/specs/002-when-i-click/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Required by Constitution III (Vitest Unit Tests). Each story includes dedicated test tasks that must fail before implementation proceeds.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish project scaffolding and tooling for the feature

- [x] T001 Create input handling module structure in `src/input/`
- [x] T002 Create ball physics extension interfaces in `src/physics/`
- [x] T003 Create paddle control interfaces in `src/render/`
- [x] T004 [P] Configure Vitest test harness for input and physics modules in `tests/unit/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any user story work

- [x] T005 Create shared type definitions for input and physics in `src/types/input.ts`
- [x] T006 Implement Vector2 and Rectangle utility types in `src/util/geometry.ts`
- [x] T007 Create input event normalization helpers in `src/util/input-helpers.ts`
- [x] T008 Extend physics world with attachment tracking in `src/physics/world.ts`

**Checkpoint**: Foundation ready — user story implementation can begin in parallel

---

## Phase 3: User Story 1 - Ball Starts at Paddle Position (Priority: P1) 🎯 MVP

**Goal**: Ball appears centered on paddle at round start with zero velocity, moves with paddle during positioning

**Independent Test**: Start round and verify ball appears on paddle, moves with paddle when paddle moves, maintains zero velocity until launch

### Tests for User Story 1

- [x] T009 [P] [US1] Author ball attachment state unit tests in `tests/unit/physics/ball-attachment.spec.ts`
- [x] T010 [P] [US1] Author paddle positioning unit tests in `tests/unit/render/paddle-positioning.spec.ts`

### Implementation for User Story 1

- [x] T011 [P] [US1] Implement ball attachment mechanics in `src/physics/ball-attachment.ts`
- [x] T012 [P] [US1] Implement paddle kinematic body in `src/render/paddle-body.ts`
- [x] T013 [US1] Integrate ball positioning in game initialization in `src/app/main.ts`
- [x] T014 [US1] Add ball-paddle attachment sync in game loop in `src/app/loop.ts`

**Checkpoint**: User Story 1 independently delivers ball positioning on paddle

---

## Phase 4: User Story 2 - Ball Launches on Paddle Movement or Tap (Priority: P2)

**Goal**: Ball launches with upward velocity when paddle moves beyond threshold or screen is tapped

**Independent Test**: Position ball on paddle, trigger launch via movement or tap, verify ball gains upward velocity and detaches from paddle

### Tests for User Story 2

- [x] T015 [P] [US2] Author launch trigger detection unit tests in `tests/unit/input/launch-detection.spec.ts`
- [x] T016 [P] [US2] Author ball launch mechanics unit tests in `tests/unit/physics/ball-launch.spec.ts`

### Implementation for User Story 2

- [x] T017 [P] [US2] Implement launch trigger detection in `src/input/launch-manager.ts`
- [x] T018 [P] [US2] Implement ball launch velocity application in `src/physics/ball-launch.ts`
- [x] T019 [US2] Integrate launch triggers in game loop in `src/app/loop.ts`
- [x] T020 [US2] Add launch state management in `src/app/state.ts`

**Checkpoint**: User Story 2 independently validates launch mechanics

---

## Phase 5: User Story 3 - Paddle Movement Controls (Priority: P3)

**Goal**: Paddle responds to mouse, keyboard, and touch input while staying within game boundaries

**Independent Test**: Move paddle using mouse, keyboard, and touch inputs, verify it follows input and respects boundaries

### Tests for User Story 3

- [x] T021 [P] [US3] Author input normalization unit tests in `tests/unit/input/input-normalization.spec.ts`
- [x] T022 [P] [US3] Author boundary constraint unit tests in `tests/unit/render/paddle-constraints.spec.ts`

### Implementation for User Story 3

- [x] T023 [P] [US3] Implement cross-platform input handling in `src/input/input-manager.ts`
- [x] T024 [P] [US3] Implement paddle boundary constraints in `src/render/paddle-constraints.ts`
- [x] T025 [US3] Integrate input processing in game loop in `src/app/loop.ts`
- [x] T026 [US3] Add paddle movement to stage rendering in `src/render/stage.ts`

**Checkpoint**: User Story 3 independently validates paddle controls

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalize integration, testing, and documentation

- [x] T027 [P] Update CLI simulation to test paddle/ball mechanics in `src/cli/simulate.ts`
- [x] T028 Add input debugging overlay in `src/render/debug-overlay.ts`
- [x] T029 [P] Run full integration test suite in `tests/integration/paddle-ball-flow.spec.ts`
- [x] T030 Update quickstart documentation in `specs/002-when-i-click/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 → Phase 2**: Setup must finish before foundational work starts.
- **Phase 2 → Stories**: Foundational phase completion unlocks all user stories.
- **Stories → Phase 6**: Polish tasks begin after chosen user stories complete.

### User Story Dependencies
- **US1** requires only foundational tasks and stands alone as MVP.
- **US2** depends on US1 ball positioning but can start once attachment mechanics exist.
- **US3** depends on US1 paddle body but can develop paddle controls independently.

### Task Dependencies (Highlights)
- T013 depends on T011-T012 (attachment and paddle implementations)
- T019 depends on T017-T018 (launch detection and mechanics)
- T025 depends on T023-T024 (input handling and constraints)

---

## Parallel Opportunities
- Tasks marked `[P]` can run concurrently.
- During Phase 1, T001-T004 can execute simultaneously.
- In Phase 2, T005-T008 can proceed in parallel.
- For US1, T009-T012 can be split across developers.
- For US2, T015-T018 can progress parallel to test tasks.
- For US3, T021-T024 can advance simultaneously.

Example parallel batch for US1:
```bash
# In separate terminals
pnpm vitest run tests/unit/physics/ball-attachment.spec.ts   # T009
pnpm vitest run tests/unit/render/paddle-positioning.spec.ts # T010
```

---

## Implementation Strategy

### MVP First (User Story 1)
1. Complete Phases 1–2.
2. Execute US1 tests (T009–T010) and implementation tasks (T011–T014).
3. Validate ball positioning independently before proceeding.

### Incremental Delivery
1. Ship US1 as playable MVP with ball positioning.
2. Layer US2 launch mechanics once positioning is stable.
3. Add US3 paddle controls to reach full experience parity.

### Parallel Team Strategy
- Developer A: Focus on physics/ball mechanics (T009–T020).
- Developer B: Focus on input/paddle controls (T021–T026).
- Rotate polish tasks (T027–T030) after stories reach DONE.

---

## Notes
- Maintain Test-First discipline: ensure each test task fails before implementation.
- Keep implementation simple per Constitution IV.
- Commit after each task or logical group to preserve incremental progress.