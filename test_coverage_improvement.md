
# Targeted plan (prioritized)

**P0 — Biggest low-hanging fruit (will move branch/function coverage fast):**

1. **`src/render/hud-display.ts` (≈16% lines, 0% funcs)**
   Add a render-layer test harness that mounts the HUD display, drives its public API, and asserts DOM/canvas state transitions:

   * Construct with minimal Pixi/App test doubles (you already mock Pixi in `scene-manager.spec.ts`; reuse that pattern).
   * Cover: init/dispose, show/hide toggles, text/value updates, layout/resize, and any animation gating flags.
   * Assert layer membership before/after, visibility/alpha, and any time-based update ticks.
     *Impact*: +200–250 covered lines, +3 functions → huge uplift. 

2. **`src/cli/index.ts` (≈29% lines, 33% funcs)**
   Add CLI behavior tests around `createCli()`:

   * Option parsing (happy/sad), required flags, unknown args, help/version output.
   * Command dispatch success/failure (stub handlers), non-zero exit codes.
   * Use node test runner style: spawn via `execa` or call the factory directly with injected argv/output sinks.
     *Impact*: easy +30–40% on funcs/branches. 

3. **`src/audio/index.ts` (funcs 0%)**
   Tiny barrel test: assert `bootstrapAudio` wiring with a mock Tone context:

   * Validate it returns the expected scheduler/layer factories or side effects.
     *Impact*: flips function coverage from 0 → 100 with 1–2 tests. 

**P1 — Branch wins in already-good files (cheap % boosts):**
4) **`src/render/scene-manager.ts` (branches ≈56%)**
You already have solid lifecycle tests. Add edge-case branches:

* Switching to an unregistered scene → throws/returns error.
* Double `switch()` calls while one is mid-init (re-entrancy/queue).
* `update()` when no current scene; `destroy()` idempotency.
  *Impact*: +10–20% branches. 

5. **`src/app/preloader.ts` (branches ≈63%)**
   Cover resource failure branches/timeouts and conditional asset paths:

   * Simulate one asset missing/corrupt.
   * Verify retry/backoff or error reporting code paths.
     *Impact*: +10–15% branches. 

6. **`src/render/paddle-body.ts` (branches ≈70%)**
   Hit geometry/constraint edge cases: min/max extents, subpixel rounding, zero-size bounds.
   *Impact*: +5–10% branches. 

7. **`src/audio/sfx.ts` (branches ≈73%)**
   Exercise conditional loading and rate-limiting/gain envelopes:

   * “SFX already loaded” early return.
   * Muted/master-gain=0 case; polyphony cap.
     *Impact*: +5–10% branches. 

**P2 — Nice-to-haves to raise the floor:**
8) **`src/util/observable.ts` (funcs ≈67%)**
Add tests for `complete()` early, subscribe-after-complete (no-op), and unsubscribe idempotency.
*Impact*: takes functions >90%. 

9. **`src/input/*` + `src/app/events.ts` (branches mid-70s)**

   * Keyboard vs mouse vs touch precedence branches.
   * Debounce/launch gating, out-of-bounds mouse, “no input devices.”
     *Impact*: trims remaining red lines. 

---

# Concrete 5-day sprint

**Day 1 — Guardrails & visibility**

* In `vitest.config.ts`, set thresholds so regressions are caught:

  ```ts
  coverage: {
    provider: 'v8',
    all: true,
    thresholds: { lines: 80, functions: 75, branches: 75, statements: 80 },
    reportsDirectory: './coverage',
    reporter: ['text', 'json', 'html'],
  }
  ```
* Add `collectCoverageFrom` to include src/**/*.ts and exclude test helpers/mocks.
* Run `pnpm test:coverage` and snapshot current report (already ~87% lines overall). 

**Day 2 — HUD Display**

* Create `tests/unit/render/hud-display.spec.ts`:

  * Reuse Pixi doubles style from `scene-manager.spec.ts` to mount HUD.
  * Cover: init/resize/toggle/show/hide/update fields/cleanup.
* Aim to lift `hud-display.ts` from ~16% → ≥80%. 

**Day 3 — CLI & Audio barrel**

* `tests/unit/cli/index.spec.ts` expansion:

  * Parameterize argv scenarios; assert returned exit codes and output.
* `tests/unit/audio/index.spec.ts`:

  * Assert that `bootstrapAudio` exists and wires scheduler/layer correctly with Tone mocks (you already have Tone mocking in `scheduler.spec.ts`; reuse it).
* Re-run coverage; set interim branch gate to 72% to avoid flakiness.

**Day 4 — Branch sweeps**

* Add cases to:

  * `scene-manager.spec.ts` for error/edge transitions.
  * `preloader.spec.ts` for failure/timeouts.
  * `paddle-body.spec.ts` & `sfx.spec.ts` for edge branches.
* Cut tiny tests for `util/observable.ts` completed/late-subscribe paths.

**Day 5 — Input & Events polish**

* Extend `input-normalization.spec.ts`, `launch-detection.spec.ts`, and `app/events` tests to cover rare paths (no devices, OOB positions, repeat keys, paused state).
* Lock coverage thresholds to final targets (lines 85, funcs 80, branches 75).

---

# Test patterns & helpers to copy/paste

* **Pixi test double pattern:** mirror what you did in `scene-manager.spec.ts` (custom `Application`, `Container`, `Sprite` classes). This isolates rendering deterministically and keeps tests fast. 
* **Tone mock reuse:** your `tests/unit/audio/mocks.ts` + `scheduler.spec.ts` show a solid way to stub `Transport.scheduleOnce/clear/cancel/nextSubdivision`. Reuse that harness for `audio/index.ts` and `sfx.ts` edge cases. 
* **Branch forcing:** where code chooses paths based on flags or ranges, add tiny public helpers or dependency injection seams (e.g., inject clock/now, inject asset map) so tests can push execution through each branch without heavy setup.

---

# Quick wins checklist (copy into a GH issue)

* [ ] `render/hud-display.ts` lifecycle + update tests (init, show/hide, resize, dispose)
* [ ] `cli/index.ts` argv matrix (happy/sad), help/version, exit codes
* [ ] `audio/index.ts` exports/wiring test
* [ ] `render/scene-manager.ts` error & re-entrancy branches
* [ ] `app/preloader.ts` failure/timeout branches
* [ ] `render/paddle-body.ts` boundary/rounding branches
* [ ] `audio/sfx.ts` cached load, mute, polyphony cap
* [ ] `util/observable.ts` complete() & subscribe-after-complete
* [ ] `input/*` and `app/events.ts` rare path branches
* [ ] Raise `vitest` thresholds (branches ≥75, funcs ≥75, lines ≥85) and commit

---

