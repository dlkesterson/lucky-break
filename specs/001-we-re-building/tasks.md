---
description: "Task list for Lucky Break Core Experience"
---

# Tasks: Lucky Break Core Experience

**Input**: Design documents from `/specs/001-we-re-building/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Required by Test-First principle. Each story includes dedicated test tasks that must fail before implementation proceeds.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish project scaffolding, dependency policy, and tooling

- [X] T001 Create pnpm workspace manifest with latest-major TypeScript/Vite/PixiJS/Matter.js/Tone.js dependencies in `package.json`
- [X] T002 Configure TypeScript compiler and Vite entrypoint in `tsconfig.json` and `vite.config.ts`
- [X] T003 [P] Add linting/formatting configuration for strict TypeScript in `.eslintrc.cjs` and `.prettierrc`
- [X] T004 [P] Define pnpm scripts for dev/test/cli workflows in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any user story work

- [X] T005 Create subsystem directories and placeholder exports in `src/app/main.ts`, `src/physics/world.ts`, `src/render/stage.ts`, `src/audio/index.ts`, `src/util/index.ts`, `src/cli/index.ts`
- [X] T006 [P] Configure Vitest harness and baseline spec in `vitest.config.ts` and `tests/unit/bootstrap.spec.ts`
- [X] T007 [P] Add jsdom setup and testing-library helpers in `tests/setup/vitest.setup.ts`
- [X] T008 [P] Provide Tone.js test doubles and fixtures in `tests/unit/audio/mocks.ts`
- [X] T009 Implement typed event bus scaffolding in `src/app/events.ts`
- [X] T010 Add structured logging helper and subsystem tags in `src/util/log.ts`

**Checkpoint**: Foundation ready — user story implementation can begin in parallel

---

## Phase 3: User Story 1 - Start And Finish A Round (Priority: P1) 🎯 MVP

**Goal**: First-time player can launch Lucky Break, complete a round, and view completion feedback without auxiliary features.

**Independent Test**: Use Vitest to simulate a full round via state events, assert HUD snapshots, and confirm CLI summary output.

### Tests for User Story 1

- [X] T011 [P] [US1] Author GameSession state transition specs in `tests/unit/app/state.spec.ts`
- [X] T012 [P] [US1] Verify HUD scoreboard rendering in `tests/unit/render/hud.spec.ts`

### Implementation for User Story 1

- [X] T013 [P] [US1] Implement GameSession manager with score/life tracking in `src/app/state.ts`
- [X] T014 [P] [US1] Build Matter.js world bootstrap and body factory in `src/physics/world.ts`
- [X] T015 [P] [US1] Construct Pixi stage, sprite pools, and layout in `src/render/stage.ts`
- [X] T016 [US1] Implement fixed-step loop and render pump in `src/app/loop.ts`
- [ ] T017 [US1] Implement preloader and start prompt flow in `src/app/preloader.ts`
- [X] T018 [US1] Render HUD scoreboard and life indicators in `src/render/hud.ts`
- [ ] T019 [US1] Wire scoring and round completion events in `src/app/events.ts`
- [ ] T020 [US1] Implement headless simulation command in `src/cli/simulate.ts`

**Checkpoint**: User Story 1 independently delivers a playable round and CLI simulation output

---

## Phase 4: User Story 2 - Experience Audio-Synced Gameplay (Priority: P2)

**Goal**: Players hear responsive SFX and bar-synced music transitions reacting to gameplay momentum.

**Independent Test**: Execute Vitest suites that simulate scheduler timelines and assert SFX trigger latency plus scene transitions using mocked Tone transport.

### Tests for User Story 2

- [ ] T021 [P] [US2] Assert SFX trigger latency with mocked Tone transport in `tests/unit/audio/sfx.spec.ts`
- [ ] T022 [P] [US2] Validate bar-synced scene transitions in `tests/unit/audio/music.spec.ts`

### Implementation for User Story 2

- [ ] T023 [P] [US2] Implement Tone transport scheduler with look-ahead in `src/audio/scheduler.ts`
- [ ] T024 [P] [US2] Map gameplay events to SFX router in `src/audio/sfx.ts`
- [ ] T025 [US2] Implement music scene finite state machine in `src/audio/music.ts`
- [ ] T026 [US2] Configure tone bus, shared FX, and manifest loading in `src/audio/toneBus.ts`
- [ ] T027 [US2] Extend momentum metrics publishing for audio cues in `src/app/state.ts`
- [ ] T028 [US2] Expose audio bootstrap that binds scheduler, FSM, and SFX in `src/audio/index.ts`

**Checkpoint**: User Story 2 independently validates responsive audio and adaptive music

---

## Phase 5: User Story 3 - Tailor The Experience (Priority: P3)

**Goal**: Players adjust audio and visual comfort settings that persist across the session and take immediate effect.

**Independent Test**: Run Vitest specs that toggle preferences via state actions, asserting HUD/UI updates and audio parameter adjustments.

### Tests for User Story 3

- [ ] T029 [P] [US3] Add preferences persistence unit spec in `tests/unit/app/preferences.spec.ts`
- [ ] T030 [P] [US3] Validate settings HUD interactions in `tests/unit/render/settingsPanel.spec.ts`

### Implementation for User Story 3

- [ ] T031 [P] [US3] Implement settings HUD components in `src/render/hud/settingsPanel.ts`
- [ ] T032 [US3] Implement preferences controller and actions in `src/app/preferences.ts`
- [ ] T033 [US3] Persist preference state and selectors in `src/app/state.ts`
- [ ] T034 [US3] Apply preference-driven audio mix controls in `src/audio/toneBus.ts`
- [ ] T035 [US3] Provide session storage helpers for preferences in `src/util/storage.ts`

**Checkpoint**: User Story 3 independently validates configurable experience controls

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalize documentation, instrumentation, and dependency governance

- [ ] T036 [P] Refresh README and quickstart guidance in `README.md` and `specs/001-we-re-building/quickstart.md`
- [ ] T037 Add HUD debug overlay and structured logging toggles in `src/render/hud/debugOverlay.ts`
- [ ] T038 [P] Automate latest-major dependency audit script in `scripts/check-deps.mjs`
- [ ] T039 Run full quality gate (`pnpm test` and CLI smoke) in CI workflow configuration `.github/workflows/ci.yml`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 → Phase 2**: Setup must finish before foundational work starts.
- **Phase 2 → Stories**: Foundational phase completion unlocks all user stories.
- **Stories → Phase 6**: Polish tasks begin after chosen user stories complete.

### User Story Dependencies
- **US1** requires only foundational tasks and stands alone as MVP.
- **US2** depends on US1 momentum metrics and event bus extensions but can start once US1 state scaffolding exists.
- **US3** depends on US1 HUD/state scaffolding; audio preference hooks rely on US2 tone bus.

### Task Dependencies (Highlights)
- T019 depends on event bus scaffolding (T009).
- T020 depends on GameSession loop (T013–T016).
- T026 depends on Tone scheduler (T023).
- T034 depends on tone bus established in T026.
- T038 depends on package manifest from T001/T004.

---

## Parallel Opportunities
- Tasks marked `[P]` can run concurrently.
- During Phase 1, T003 and T004 proceed in parallel after T001 establishes the manifest.
- In Phase 2, testing harness tasks (T006–T008) can execute simultaneously.
- For US1, T013–T015 can be split across developers before integrating via T016–T018.
- For US2, audio modules T023–T024 can progress parallel to test tasks T021–T022.
- For US3, UI (T031) and backend preference logic (T032) can advance in parallel once tests exist.

Example parallel batch for US2:
```bash
# In separate terminals
pnpm vitest run tests/unit/audio/sfx.spec.ts   # T021
pnpm vitest run tests/unit/audio/music.spec.ts # T022
```

---

## Implementation Strategy

### MVP First (User Story 1)
1. Complete Phases 1–2.
2. Execute US1 tests (T011–T012) and implementation tasks (T013–T020).
3. Validate round-completion Vitest specs and CLI simulation before proceeding.

### Incremental Delivery
1. Ship US1 as playable MVP.
2. Layer US2 audio enhancements once US1 is stable.
3. Add US3 personalization to reach full experience parity.

### Parallel Team Strategy
- Developer A: Focus on physics/render pipeline (T013–T018).
- Developer B: Focus on audio scheduler & SFX (T021–T028).
- Developer C: Focus on settings UX and persistence (T029–T035).
- Rotate polish tasks (T036–T039) after stories reach DONE.

---

## Notes
- Maintain Test-First discipline: ensure each test task fails before implementation.
- Keep dependency versions current per NFR-001 by running T038 routinely.
- Commit after each task or logical group to preserve incremental progress.
