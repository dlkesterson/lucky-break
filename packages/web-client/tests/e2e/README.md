# E2E Test Suite

Comprehensive end-to-end test coverage for Lucky Break gameplay mechanics and user interactions.

## Test Files Overview

### Core Gameplay Tests (Existing)
- **smoke.spec.ts** - Basic app loading and scene transitions
- **pause-flow.spec.ts** - Pause/resume/quit gameplay flows
- **game-over.spec.ts** - Life drain and game over scenarios
- **level-complete.spec.ts** - Round completion and casino hub
- **brick-collision.spec.ts** - Basic brick breaking mechanics
- **hud-updates.spec.ts** - Score and UI state updates
- **bias-phase.spec.ts** - Bias phase scene functionality
- **brick-generation.spec.ts** - Brick layout generation
- **round-completion.spec.ts** - Round completion logic

### New High-Priority Tests

#### power-ups.spec.ts (9 tests)
Tests all 7 reward types and power-up mechanics:
- Sticky paddle activation and HUD display
- Wide paddle width scaling
- Double points multiplier
- Multi-ball spawning
- Slow-time physics effects
- Ghost brick activation
- Laser paddle functionality
- Power-up expiration timing
- Forced reward configuration

#### gamble-bricks.spec.ts (6 tests)
Tests gamble brick state machine and timers:
- Armed state tracking
- Armed → Primed transitions on first hit
- Timer countdown for primed bricks
- Success multiplier rewards
- Expiry events and HP penalties
- State summary accuracy

#### multi-ball.spec.ts (8 tests)
Tests multi-ball chaos and ball tracking:
- Extra ball spawning
- Total vs extra ball counting
- Attached ball tracking
- Multi-ball stacking up to capacity
- Ball drop events
- Life loss only when all balls drain
- HUD indicator visibility
- Individual ball launching

#### deterministic-replay.spec.ts (8 tests)
Tests replay recording and determinism:
- Replay buffer seed and event recording
- Identical brick layouts with same seed
- Different layouts with different seeds
- Input event capture
- Temporal ordering via timestamps
- URL seed parameter override
- Replay persistence across scene transitions
- Event serialization

#### reward-wheel.spec.ts (10 tests)
Tests bias-phase scene and reward selection:
- Bias-phase appearance after round completion
- Reward and modifier option availability
- Commit selection → gameplay transition
- Skip bias-phase functionality
- UI element visibility
- Reward wheel display
- Modifier options display
- Invalid option ID handling
- Multiple round bias-phase cycles

#### input-modalities.spec.ts (14 tests)
Tests keyboard, mouse, touch, and accessibility:
- Arrow key paddle control
- WASD key control
- Space key ball launch
- Escape key pause
- P key pause
- Mouse click targeting
- Touch interaction
- Shift+C high-contrast toggle
- F2 debug overlay toggle (dev mode)
- Continuous keyboard input smoothing
- Rapid key switch handling

#### combo-scoring.spec.ts (10 tests)
Tests combo system and scoring mechanics:
- Combo counter increments
- Score multiplier threshold progression
- Combo time decay
- Combo reset on expiry
- Brick break score awards
- Combo HUD overlay display
- Paddle hit velocity tracking
- Combo momentum buildup
- High combo multiplier scaling

## Test Helpers Added to Harness

New helper functions in `utils/harness.ts`:

```typescript
// Power-up state inspection
getPowerUpState() → PowerUpSnapshot
activatePowerUp(type: string)
activateReward(rewardType: string)
forceReward(rewardType: string | null)

// Gamble brick state
getGambleBrickState() → GambleBrickSnapshot

// Multi-ball state
getMultiBallState() → MultiBallSnapshot

// Combo state
getComboState() → ComboSnapshot
```

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test file
pnpm test:e2e power-ups.spec.ts

# Run in headed mode (see browser)
pnpm test:e2e --headed

# Run in debug mode
pnpm test:e2e --debug

# Generate test report
pnpm test:e2e --reporter=html
```

## Test Statistics

- **Total test files**: 16
- **Total test cases**: 65+
- **New tests added**: 65
- **Coverage areas**: Power-ups, gamble mechanics, multi-ball, replay determinism, input modalities, combo scoring, reward wheel

## Developer Cheat Integration

All new tests use `installEventHarness` with `enableDeveloperCheats: true` to:
- Force specific reward drops for deterministic testing
- Skip levels instantly
- Activate power-ups directly
- Query internal game state
- Control timing and RNG

## Test Patterns

### Slow Tests
Tests marked with `test.slow()` get 3x timeout multiplier for:
- Multi-ball chaos scenarios
- Gamble brick expiry waits
- Combo momentum building
- Long replay sessions

### Event Draining
Use `drainEvents()` before waiting for new events to avoid false positives from buffered events.

### Scene Transitions
Always wait for scene transitions before interacting:
```typescript
await waitForSceneTransition(page, 'gameplay', 'enter');
```

### Polling State
For rapidly changing state, poll with timeout:
```typescript
await expect.poll(async () => (await getComboState(page)).currentCombo)
    .toBeGreaterThan(5);
```

## Known Test Limitations

1. **Gamble brick transitions** - May not always trigger in single test run due to RNG
2. **High combos** - Requires sustained rallies, may timeout on unlucky runs
3. **Touch events** - Skipped on WebKit due to API differences
4. **Debug overlays** - Only visible in dev builds

## Future Test Additions

Consider adding:
- Mobile layout/orientation tests
- Audio system integration tests
- Accessibility compliance tests
- Level progression tests
- Edge case stress tests
- Performance benchmarks
