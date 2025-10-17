
# Wave 1 (Fast gains → to ~70–75%)

**Goal:** Cover zero-covered “barrel” modules and simple utilities; add smoke tests that also exercise import paths.

1. **Barrels @ `index.ts` (audio/cli/input/physics/render/types/util) — currently 0%**

* Add one smoke test per barrel that imports *named* exports and asserts type/function presence.
* This lifts statement/lines across 6 files quickly.

2. **`util/geometry.ts` — 0%**

* Unit-test each pure function (create/add/subtract/multiply/normalize/dot/center/intersect/clamp/lerp/deg↔rad).
* Edge cases: zero-length normalize, rectangle borders touching, negative sizes.

3. **`render/paddle-constraints.ts` — 0% (despite existing specs referencing constraints)**

* Write direct unit tests against `PaddleBoundaryConstraints`:

  * `constrainToBounds` clamps at all edges.
  * `isWithinBounds` true/false at edges and just-outside.
  * `distanceToBoundary` for ±x/±y directions and zero-vector direction (Infinity).

4. **`render/debug-overlay.ts` — 0%**

* Add a minimal jsdom test that instantiates the overlay (mock PIXI if needed) and asserts it attaches/detaches nodes or calls draw hooks.

5. **`util/log.ts` — 0%**

* Add tests for log levels / formatting (stub console methods) to verify no-throw and correct routing.

6. **`util/input-helpers.ts` (~43%)**

* Cover branches around normalization edge cases: simultaneous inputs, NaN/undefined, clamping, and debounce paths.

# Wave 2 (Core gameplay gaps → to ~85%)

**Goal:** Cover gameplay glue and physics that users *feel*.

7. **`physics/ball-attachment.ts` (~10%)**

* Tests:

  * Creates attached ball w/ options (radius, restitution).
  * `updateAttachment` keeps offset on paddle move.
  * `resetToAttached` toggles state correctly.
  * `isAttached` true/false transitions.
* Use Matter.Body stubs or light real bodies with a test world.

8. **`physics/ball-launch.ts` (~47%)**

* Tests:

  * Default upward launch vector and override direction.
  * Prevent re-launch when already free (if applicable).
  * Interaction with speed-regulation (if invoked).

9. **`audio/index.ts` / `audio/scheduler.ts` (~0% / ~89%)**

* Add one “wiring” test for `audio/index.ts` that exports/creates a scheduler or SFX facade.
* `scheduler`: add negative/zero lookAhead, cancel/dispose behavior (verify Transport.scheduleOnce/clear/cancel mocks called once).

10. **`util/power-ups.ts` (~47%)**

* Determinism: inject `now()` & `Math.random` seeds/mocks.
* Tests:

  * `shouldSpawnPowerUp` hit/miss boundaries,
  * `createPowerUpEffect` duration/start,
  * `updatePowerUpEffect` expiry removal,
  * `isPowerUpFadingOut` boundary timing,
  * `calculatePaddleWidthScale` / `calculateBallSpeedScale` across 0%, 50%, 100% fade,
  * `PowerUpManager` activate→update→expire cycle.

11. **`app/loop.ts` (already pretty good)**

* Add explicit tests for `maxStepsPerFrame` clamping and fallback RAF (setTimeout) path.

# Wave 3 (Bootstrap & integration polish → 90%+)

**Goal:** Tackle the biggest single hole and ensure user-visible flows are exercised.

12. **`app/main.ts` (~5%)**

* Create a **bootstrap test** with jsdom that:

  * Mocks `PIXI.Application`, `Tone` (Transport/now), and any canvas.
  * Calls the default entry (or exported init) and asserts:

    * Stage/world initialized,
    * Event listeners bound,
    * Game loop started & stopped cleanly.
* Add a second test for “guard rails”: when a required DOM container is missing, it no-throws and logs a clear error.

13. **CLI coverage**

* `cli/index.ts` (0%): smoke test that imports and runs the command entry with stubbed `process.argv`; assert it delegates to `simulate`.
* `cli/simulate.ts` (~97% but with a few missed lines): add one scenario to hit lines 170–172 & 183–185 (e.g., invalid args or dry-run flag).

14. **Integration edge cases**

* Expand `tests/integration/paddle-ball-flow.spec.ts` to:

  * Include one “sticky paddle” power-up flow.
  * Include reflection-at-edge vs center (ties into `paddle-reflection` which is already at 100% but adds end-to-end confidence).

---

## Quality gates & config hardening

* In `vitest.config.ts`: set thresholds to keep gains (**example**: `lines: 75, statements: 75, branches: 70, functions: 75` for Wave 1; bump to 85/80 in Wave 2). Also exclude generated/bundled files only—keep barrels in coverage to force imports. (You’re already on V8 coverage.) 
* Add `ci` script that runs: `pnpm lint && pnpm test --coverage` and fails on threshold drops. 

## Concrete next PRs (bite-sized)

1. **PR A – Barrels & Geometry**

   * `tests/unit/util/geometry.spec.ts`
   * `tests/unit/{audio,cli,input,physics,render,types,util}/index.spec.ts`
2. **PR B – Paddle constraints & Debug overlay**

   * `tests/unit/render/paddle-constraints.spec.ts` (direct to class)
   * `tests/unit/render/debug-overlay.spec.ts`
3. **PR C – Power-ups package**

   * `tests/unit/util/power-ups.spec.ts`
4. **PR D – Physics attach/launch**

   * `tests/unit/physics/ball-attachment.spec.ts` (expanded)
   * `tests/unit/physics/ball-launch.spec.ts` (expanded)
5. **PR E – Bootstrap & CLI**

   * `tests/unit/app/main.bootstrap.spec.ts`
   * `tests/unit/cli/index.spec.ts` & add args case in `simulate.spec.ts`
6. **PR F – Integration edge**

   * Extend `paddle-ball-flow.spec.ts` with one power-up + sticky paddle scenario.

## Tiny code examples (ready to paste)

**Barrel smoke (works for each `index.ts`):**

```ts
import * as Audio from '../../src/audio';

it('exports scheduler factory', () => {
  expect(Audio).toBeDefined();
  expect(typeof Audio).toBe('object');
});
```

**Geometry edge:**

```ts
import { normalizeVector, rectanglesIntersect } from '../../src/util/geometry';

it('normalizes zero vector to (0,0)', () => {
  expect(normalizeVector({x:0,y:0})).toEqual({x:0,y:0});
});

it('detects touching edges as intersecting = false', () => {
  expect(rectanglesIntersect({x:0,y:0,width:10,height:10},{x:10,y:0,width:10,height:10})).toBe(false);
});
```

**Power-ups timing:**

```ts
import { createPowerUpEffect, updatePowerUpEffect, isPowerUpFadingOut } from '../../src/util/power-ups';

it('fades in last 25%', () => {
  const start = 1000; let now = start;
  const effect = createPowerUpEffect('paddle-width', { defaultDuration: 4 }, () => now);
  // advance 3.1s => remaining 0.9s => in fade window
  updatePowerUpEffect(effect, 3.1);
  expect(isPowerUpFadingOut(effect)).toBe(true);
});
```

**Bootstrap main with mocks (pattern):**

```ts
vi.mock('pixi.js', () => ({ Application: vi.fn().mockImplementation(() => ({ stage:{ addChild:vi.fn() }, ticker:{ add:vi.fn() } })) }));
vi.mock('tone', () => ({ Transport: { start: vi.fn(), scheduleOnce: vi.fn(), clear: vi.fn(), cancel: vi.fn() }, now: () => 0 }));
document.body.innerHTML = `<div id="game"></div>`;
await import('../../src/app/main');
```

---
