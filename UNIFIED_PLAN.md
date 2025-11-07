# Unified Integration Plan: React UI + Mayhaps Features

This document combines the React UI migration plan with the Mayhaps cosmic casino feature integration. The plan is organized into phases that can be executed in parallel or sequentially, with clear checklists for each task.

---

## Phase 0: Repository Setup & React Foundation (PR-0)

**Goal**: Establish React infrastructure for future UI work

### Checklist

- [x] **Install React dependencies**
  - Run: `pnpm -F @lucky-break/web-client add react react-dom zustand`
  - Run: `pnpm -F @lucky-break/web-client add -D @types/react @types/react-dom @vitejs/plugin-react`
- [x] **Configure Vite for React**
  - Edit `packages/web-client/vite.config.ts`
  - Import `react` from `@vitejs/plugin-react`
  - Add `react()` to plugins array
  - Verify JSX transformation works

- [x] **Update TypeScript configuration**
  - Edit `packages/web-client/tsconfig.json`
  - Add `"jsx": "react-jsx"` to compilerOptions
  - Ensure `"lib": ["ES2022", "DOM", "DOM.Iterable"]` is present
  - Verify no type errors

- [x] **Update HTML structure**
  - Edit `packages/web-client/index.html`
  - Wrap canvas in `#stage-wrap` container
  - Add `#ui-root` div adjacent to `#pixi-canvas`
  - Ensure container structure: `<div id="stage-wrap"><canvas id="pixi-canvas"></canvas><div id="ui-root"></div></div>`

- [x] **Verify build** 
  - Run `pnpm build` to ensure no errors
  - Run `pnpm typecheck` to verify TypeScript config
  - Test that existing PixiJS code still works

---

## Phase 1: React HUD Overlay Shell (PR-1)

**Goal**: Create the React overlay infrastructure and basic HUD bridge

### Checklist

- [x] **Create React root bootstrapper**
  - Create `packages/web-client/src/ui/boot/react-root.tsx`
  - Use `createRoot` from `react-dom/client`
  - Mount to `#ui-root` element
  - Export initialization function

- [x] **Create HUD CSS styles**
  - Create `packages/web-client/src/ui/styles/hud.css`
  - Define CSS variables for typography (`--t--1`, `--t-0`, `--t-1`, `--t-2`, `--pad`)
  - Style `#ui-root` with fixed positioning, pointer-events: none
  - Add `.ui-interactive` class for pointer-events: auto
  - Define `.hud-row` layout with CSS Grid
  - Include safe-area-inset support

- [x] **Create Zustand game bridge**
  - Create `packages/web-client/src/ui/state/game-bridge.ts`
  - Define `HudState` type with: `score`, `lives`, `combo`, `fps?`
  - Create Zustand store with `useHud`
  - Export `hudSetters` object with: `setScore`, `setLives`, `setCombo`, `setFps`
  - Keep store read-only from React side

- [x] **Create initial HUD component**
  - Create `packages/web-client/src/ui/HudApp.tsx`
  - Subscribe to `useHud` store
  - Render score, lives, combo, fps in `.hud-row` layout
  - Use CSS variables for typography
  - Mark interactive areas with `.ui-interactive`

- [x] **Integrate React boot into main entry**
  - Edit `packages/web-client/src/app/main.ts` (or `game-runtime.ts` if needed)
  - Import React root bootstrapper after PIXI initialization
  - Import `HudApp` component
  - Import CSS file
  - Call bootstrap after PIXI stage is ready
  - Verify React renders without errors

- [x] **Test initial render** 
  - Run `pnpm dev`
  - Verify React HUD appears over canvas
  - Verify HUD shows default values (0, 3, 0, no fps)
  - Check browser console for errors

---

## Phase 2: Wire Game State to React Bridge (PR-2)

**Goal**: Connect existing game runtime to React HUD

### Checklist

- [x] **Locate runtime state sources**
  - Identify where score is computed (`packages/web-client/src/app/runtime/*` or `packages/core-domain/src/util/scoring.ts`)
  - Identify where lives are tracked (likely in session state)
  - Identify where combo is calculated (scoring system)
  - Identify where FPS is available (PIXI app.ticker.FPS)

- [x] **Wire score updates**
  - Find score update location (likely in `runtime-hud-coordinator.ts` or scoring module)
  - Import `hudSetters` from bridge
  - Call `hudSetters.setScore()` when score changes
  - Verify score updates in React HUD

- [x] **Wire lives updates**
  - Find lives tracking location (session state or game runtime)
  - Call `hudSetters.setLives()` when lives change
  - Verify lives update in React HUD

- [x] **Wire combo updates**
  - Find combo calculation (likely in scoring system)
  - Call `hudSetters.setCombo()` when combo changes
  - Verify combo updates in React HUD

- [x] **Wire FPS updates**
  - Find PIXI app instance (likely in stage or game-runtime)
  - Set up interval (1-2 Hz) to read `app.ticker.FPS`
  - Call `hudSetters.setFps()` with rounded value
  - Verify FPS displays in React HUD

- [x] **Test state synchronization** 
  - Play game and verify HUD updates match gameplay
  - Check that score increments correctly
  - Check that lives decrement on ball loss
  - Check that combo resets appropriately
  - Verify no performance regressions

---

## Phase 3: Mayhaps Narrative Foundation (PR-3)

**Goal**: Establish the Mayhaps story and narrative hooks

### Checklist

- [x] **Create narrative assets structure**
  - Plan narrative asset locations in `packages/web-client/assets/`
  - Create placeholder text files for narrative content
  - Document narrative structure (intro, in-game, idle, etc.)

- [x] **Add intro/tutorial sequence**
  - Extend `packages/web-client/src/scenes/main-menu.ts` or create new intro scene
  - Add "Story" button or auto-trigger on first launch
  - Create cinematic text overlay (PixiJS or React)
  - Display: "You are Mayhaps, a ball of pure luck. In this cosmic casino, every bounce is a bet."
  - Store first-launch flag in localStorage

- [x] **Create narrative service**
  - Create `packages/web-client/src/app/narrative-service.ts`
  - Define narrative event types (tutorial, combo-milestone, idle-return, etc.)
  - Create event emitter for narrative triggers
  - Integrate with existing event bus (`packages/core-domain/src/app/events.ts`)

- [x] **Add in-game flavor text**
  - Extend HUD to show flavor text on events
  - Hook into paddle hits: "Luck rebounds!"
  - Hook into combo milestones: "The cosmos favors you—chain the entropy!"
  - Use event bus to trigger narrative events
  - Display in React HUD or as floating text

- [x] **Create Fate Ledger narrative generator**
  - Extend `packages/web-client/src/app/fate-ledger.ts`
  - Create template system for procedural stories
  - Generate stories like: "Mayhaps drifted through a nebula of forgotten bets, gathering 42 Luck Dust."
  - Store in narrative service for idle return

- [x] **Test narrative flow**
  - Test intro sequence appears on first launch
  - Test flavor text triggers during gameplay
  - Test Fate Ledger generation with mock data
  - Verify narrative doesn't interfere with gameplay

---

## Phase 4: Mayhaps Ball Customization System (PR-4)

**Goal**: Implement the customization system for Mayhaps (ball forms, traits, sigils, voices)

### Checklist

- [x] **Create customization domain models**
  - Create `packages/core-domain/src/util/mayhaps-customization.ts`
  - Define `MayhapsForm` enum/type (PolishedIvoryOrb, D6Diceform, etc.)
  - Define `CoreTrait` enum/type (FortuneFavored, DoubleEdged, etc.)
  - Define `Sigil` enum/type (LuckRune, etc.)
  - Define `Voice` enum/type (Chime, Pulse, etc.)
  - Define `MayhapsCustomization` interface combining all aspects

- [x] **Extend session state**
  - Edit `packages/core-domain/src/app/state.ts`
  - Add `mayhaps` field to session state with default customization
  - Ensure state is serializable for saves

- [x] **Implement form physics effects**
  - Edit `packages/core-domain/src/physics/ball-launch.ts`
  - Extend `createBall` factory to accept form parameter
  - Implement "D6 Diceform" with random velocity jitter
  - Implement other form effects (elasticity, size, etc.)
  - Use `packages/core-domain/src/util/random.ts` for seeded RNG

- [x] **Implement core trait effects**
  - Edit `packages/core-domain/src/util/scoring.ts`
  - Modify `awardBrickPoints` to check core trait
  - Implement "Double-Edged": double points but risk hazards
  - Apply trait modifiers to scoring calculations
  - Completed 2025-11-06: Double-Edged now boosts double-points baseline and hazard intensity via runtime facade

- [x] **Implement sigil effects**
  - Edit `packages/core-domain/src/game/rewards.ts`
  - Add sigil bonus calculations (e.g., +10% coin drop)
  - Apply sigil modifiers to reward generation

- [x] **Implement voice audio effects**
  - Edit `packages/web-client/src/audio/soundbank.ts`
  - Create voice modulation system
  - Implement "Pulse" voice: modulate Tone.js synths on bounces
  - Hook into bounce events to trigger voice effects

- [x] **Create customization UI (React)**
  - Create `packages/web-client/src/ui/components/MayhapsCustomizer.tsx`
  - Display grid of unlockable forms, traits, sigils, voices
  - Show previews (PixiJS render of ball with effects)
  - Add unlock logic (tied to prestige currency later)
  - Store selections in game state

- [x] **Integrate customization into gameplay**
  - Load customization from session state on game start
  - Apply physics, scoring, reward, and audio modifiers
  - Verify all effects work correctly
  - Test with different customization combinations

- [x] **Add customization tests** _(targeted physics/scoring coverage verified via new spec)_
  - [x] Create `packages/web-client/tests/unit/mayhaps-customization.spec.ts`
  - [x] Test form physics effects
  - [x] Test trait scoring modifiers
  - [x] Test sigil reward bonuses
  - [x] Verify state persistence

---

## Phase 5: Enhanced Bias Phase (Casino Hub) (PR-5)

**Goal**: Transform bias phase into full casino hub with wagering and mini-games

### Checklist

- [x] **Extend entropy storage**
  - Edit `packages/core-domain/src/app/state.ts`
  - Ensure `entropyStored` is tracked in session
  - Hook `BrickBreak` event to accumulate entropy
  - Add entropy spending logic

- [x] **Extend bias phase coordinator** _(entropy wager flow wired with stored entropy spending and affordability UI)_
  - Edit `packages/web-client/src/app/runtime/bias-phase-coordinator.ts`
  - Add wagering logic for entropy
  - Implement "Tilt" option: nudge odds (+20% crit bricks)
  - Implement "Lock" option: freeze rules (e.g., "Always drop coins")
  - Implement "Reforge" option: reroll physics (gravity, etc.)
  - Use seeded RNG for deterministic outcomes

- [x] **Create casino hub React scene**
  - Create `packages/web-client/src/ui/scenes/CasinoHub.tsx`
  - Design casino aesthetic (cosmic Las Vegas theme)
  - Display entropy balance
  - Show wagering options (Tilt, Lock, Reforge)
  - Add roulette wheel visual (PixiJS spinner or React component)
  - Add slots mini-game placeholder

- [x] **Migrate bias phase scene to React**
  - Replace `packages/web-client/src/scenes/bias-phase.ts` logic with React
  - Keep scene registration for transition
  - Create React component that renders casino hub
  - Maintain existing coordinator interface

- [x] **Implement modifier application**
  - Edit `packages/web-client/src/app/runtime/modifiers.ts`
  - Apply "Tilt" modifiers to brick generation
  - Apply "Lock" rules to game mechanics
  - Apply "Reforge" physics changes via `packages/core-domain/src/physics/world.ts`

- [x] **Add casino mini-games module**
  - Create `packages/web-client/src/app/runtime/casino-games.ts`
  - Implement roulette game (entropy input → re-rolls)
  - Implement slots game (entropy input → random biases)
  - Integrate with audio: Tone.js stingers on wins/losses
  - Balance via CLI sim (add casino sim mode)

- [ ] **Add tutorial for casino**
  - Create dialog: "In the Luck Architect's sanctum, bet your entropy to tilt fate."
  - Show mini-tutorial on first casino visit
  - Explain each wagering option clearly

- [ ] **Test casino flow**
  - Test entropy accumulation from brick breaks
  - Test wagering options apply correctly
  - Test mini-games function
  - Verify modifiers persist through rounds
  - Test deterministic RNG seeding

---

## Phase 6: Idle Mechanics (The Drift) (PR-6)

**Goal**: Implement offline progression system

### Checklist

- [x] **Extend idle system**
  - Edit `packages/web-client/src/app/runtime/idle.ts`
  - Calculate yields on return based on time away
  - Generate "Luck Dust" (rate based on biases)
  - Implement max cap (24 hours) to prevent exploits

- [x] **Create idle storage**
  - Extend `packages/web-client/src/app/meta-progress-service.ts`
  - Save timestamp in localStorage on game exit
  - Load timestamp on game start
  - Calculate time difference

- [x] **Generate Fate Ledger stories** _(procedural narrative hooks now live via narrative service)_
  - Extend narrative service with procedural story generation
  - Create template system with random fills
  - Generate stories like: "While you slumbered, Mayhaps wandered the voids..."
  - Include rewards in stories

- [ ] **Create idle return UI** _(dialog still to be implemented)_
  - Create `packages/web-client/src/ui/components/IdleReturnDialog.tsx`
  - Display Fate Ledger story
  - Show accumulated Luck Dust
  - Show artifacts found during drift
  - Add "Continue" button to dismiss

- [x] **Integrate idle check**
  - Edit `packages/web-client/src/app/game-initializer.ts` or `game-runtime.ts`
  - Check for idle timestamp on game start
  - Calculate rewards if idle time > threshold
  - Present idle return dialog
  - Grant rewards to player

- [ ] **Test idle mechanics** _(suite missing for persistence/reward validation)_
  - Test timestamp saving on exit
  - Test reward calculation for various time periods
  - Test max cap enforcement
  - Test story generation
  - Verify rewards are granted correctly

---

## Phase 7: Migrate Non-Diegetic UI to React (PR-7)

**Goal**: Move menus and dialogs from PixiJS to React DOM

### Checklist

- [x] **Migrate main menu**
  - Create `packages/web-client/src/ui/scenes/MainMenu.tsx`
  - Replace `packages/web-client/src/scenes/main-menu.ts` logic
  - Keep scene registration for transition
  - Add "Story" button for narrative
  - Maintain existing functionality (high scores, start game)

- [x] **Migrate pause menu**
  - Create `packages/web-client/src/ui/scenes/PauseMenu.tsx`
  - Replace `packages/web-client/src/scenes/pause.ts` logic
  - Add resume, quit, settings options
  - Implement focus trapping for accessibility

- [x] **Migrate loadout selection**
  - Create `packages/web-client/src/ui/scenes/LoadoutSelection.tsx`
  - Replace `packages/web-client/src/scenes/loadout-selection.ts` logic
  - Display loadout grid with previews
  - Maintain existing loadout system integration

- [x] **Migrate game over screen**
  - Create `packages/web-client/src/ui/scenes/GameOver.tsx`
  - Replace `packages/web-client/src/scenes/game-over.ts` logic
  - Show final score, stats, restart option

- [ ] **Migrate reward dialogs** _(React component still to be introduced)_
  - Create `packages/web-client/src/ui/components/RewardDialog.tsx`
  - Replace any PixiJS reward display logic
  - Show rewards in scrollable list
  - Add animations for reward reveals

- [ ] **Create settings panel** _(dedicated React settings component pending)_
  - Create `packages/web-client/src/ui/components/SettingsPanel.tsx`
  - Add volume controls
  - Add control scheme options
  - Add reduced motion toggle
  - Persist settings in localStorage

- [x] **Maintain scene compatibility**
  - Keep old PixiJS scene files as thin adapters during transition
  - Re-export React components through scene registration
  - Ensure call-sites don't break
  - Add feature flags for rollback if needed

- [ ] **Test all migrated screens**
  - Test menu navigation
  - Test pause/resume flow
  - Test loadout selection
  - Test game over and restart
  - Verify all interactions work correctly

---

## Phase 8: Meta-Progression & Ascension (PR-8)

**Goal**: Implement prestige system and permanent upgrades

### Checklist

- [ ] **Extend prestige system**
  - Edit `packages/core-domain/src/util/prestige.ts`
  - Create "Certainty Dust" currency
  - Implement reset logic (retain dust on reset)
  - Calculate dust based on run progress

- [ ] **Create meta-progression store**
  - Extend `packages/web-client/src/app/metaprogression.ts`
  - Store permanent upgrades in localStorage
  - Track ascension progress
  - Implement unlock system

- [ ] **Implement permanent upgrades**
  - Edit `packages/core-domain/src/util/scoring.ts`
  - Add base crit % upgrade
  - Apply permanent modifiers to calculations
  - Store upgrades in meta-progress

- [ ] **Create upgrade tree UI**
  - Create `packages/web-client/src/ui/components/UpgradeTree.tsx`
  - Display upgrade tree with locked/unlocked states
  - Show cost in Certainty Dust
  - Show effect descriptions
  - Implement purchase logic

- [ ] **Implement ascension system**
  - Create rare events (e.g., after 10 rounds)
  - Trigger boss fights (abstract brick layouts representing "Randomness")
  - Create ascension UI flow
  - Grant ascension rewards

- [ ] **Create new table unlocks**
  - Extend `packages/core-domain/src/util/levels.ts`
  - Add unlockable level tables
  - Require Certainty Dust to unlock
  - Store unlocks in meta-progress

- [ ] **Add end-of-run recap**
  - Create `packages/web-client/src/ui/components/RunRecap.tsx`
  - Display: "Ascend Mayhaps? Retain dust to sculpt probability eternal."
  - Show dust earned
  - Show upgrade suggestions
  - Add ascension trigger button

- [ ] **Test meta-progression**
  - Test dust accumulation
  - Test upgrade purchases
  - Test ascension triggers
  - Test persistence across resets
  - Verify upgrades apply correctly

---

## Phase 9: Graphics & Visual Polish (PR-9)

**Goal**: Replace placeholders with cosmic casino aesthetic

### Checklist

- [ ] **Plan asset pipeline**
  - Document asset locations in `packages/web-client/assets/`
  - Update `packages/web-client/src/config/assets.ts` with new assets
  - Extend `packages/web-client/src/app/preloader.ts` to load new assets

- [ ] **Replace ball (Mayhaps) visuals**
  - Edit `packages/web-client/src/render/visual-factory.ts`
  - Create sprite with auras (glow filter)
  - Implement custom form textures
  - Add dynamic effects based on form (e.g., `packages/web-client/src/render/effects/gamble-highlight.ts`)

- [ ] **Replace brick visuals**
  - Edit `packages/web-client/src/render/brick-texture-cache.ts`
  - Create neon outlines with PixiJS Graphics
  - Add glass shaders (PixiJS DisplacementFilter for iridescence)
  - Tie visuals to odds (high-stake bricks pulse)
  - Use procedural generation where possible

- [ ] **Replace background**
  - Edit `packages/web-client/src/render/stage.ts` or background rendering
  - Create cosmic gradients (PixiJS Mesh/Shader)
  - Make dynamic based on luck state
  - Add heat-distortion effects (use `packages/web-client/src/render/effects/heat-ripple.ts`)

- [ ] **Polish casino hub visuals**
  - Enhance casino hub UI with cosmic theme
  - Add floating UI elements
  - Create animated roulette wheel (PixiJS AnimatedSprite or React animation)
  - Add portal/warp effects

- [ ] **Add luck aura effects**
  - Extend `packages/web-client/src/render/effects/index.ts`
  - Create luck aura shaders
  - Add portal warp effects
  - Integrate with Mayhaps customization

- [ ] **Load Overpass font**
  - Verify Overpass font is loaded (already in HTML)
  - Use in React UI components
  - Ensure consistent typography

- [ ] **Test visual polish**
  - Verify all assets load correctly
  - Test shader effects perform well
  - Test on multiple devices/browsers
  - Verify no visual regressions

---

## Phase 10: Responsive Design & Accessibility (PR-10)

**Goal**: Ensure UI works across devices and is accessible

### Checklist

- [ ] **Establish design resolution**
  - Define single design resolution in PIXI stage
  - Scale root containers on resize (preserve aspect)
  - Cap devicePixelRatio at 2 for battery life

- [ ] **Fix text scaling**
  - Stop scaling text sprites in PIXI
  - Switch to bitmap/SDF where text must stay in PIXI
  - Use fluid type (`clamp()`) in DOM HUD
  - Use CSS Grid/Flex for layout

- [ ] **Respect safe areas**
  - Use `env(safe-area-inset-*)` in CSS
  - Ensure HUD doesn't overlap notches
  - Test on devices with notches

- [ ] **Implement scrollable panels**
  - Create `packages/web-client/src/ui/components/Panel.tsx`
  - Use DOM panels for real scrolling
  - Style with backdrop-filter and borders
  - Ensure scrollable content works on touch devices

- [ ] **Fix pointer events**
  - Ensure overlay root uses `pointer-events: none`
  - Mark interactive controls with `pointer-events: auto`
  - Test touch interactions work correctly

- [ ] **Implement focus management**
  - Add focus trapping for modals/pause menu
  - Use `tabIndex` and ARIA roles
  - Restore focus to canvas when UI closes
  - Add global "UI toggle" hotkey

- [ ] **Test responsive design**
  - Test at 3 aspect ratios (portrait, landscape, square)
  - Test at 2 DPRs (1.0, 2.0)
  - Verify HUD doesn't overlap safe areas
  - Verify text min size ≥ 12px equivalent
  - Test panels remain scrollable and clickable

---

## Phase 11: Testing & Quality Assurance (PR-11)

**Goal**: Comprehensive testing for all new features

### Checklist

- [ ] **Add Playwright E2E tests**
  - Extend `packages/web-client/tests/e2e/` with new scenarios
  - Test HUD layout at multiple aspect ratios and DPRs
  - Test casino hub flow
  - Test idle return flow
  - Test customization selection
  - Test meta-progression flow
  - Assert pass/fail on layout requirements

- [ ] **Add unit tests**
  - Create `packages/web-client/tests/unit/mayhaps-customization.spec.ts`
  - Create `packages/web-client/tests/unit/game-bridge.spec.ts`
  - Test React HUD component rendering
  - Test bridge state updates
  - Test customization effects
  - Test casino game logic
  - Test idle calculations

- [ ] **Update CLI simulation**
  - Edit `packages/cli-sim/src/simulate.ts`
  - Add casino sim mode
  - Add Mayhaps customization testing
  - Add idle yield calculations
  - Verify deterministic outputs

- [ ] **Update CI tests**
  - Edit `scripts/ci-simulation.ts`
  - Include Mayhaps features in CI
  - Verify all tests pass
  - Ensure coverage thresholds are met

- [ ] **Performance testing**
  - Profile React HUD updates (should be minimal)
  - Throttle bridge updates (FPS at 1-2 Hz)
  - Schedule heavy UI work during PIXI post-render
  - Use `requestIdleCallback` for non-critical updates
  - Verify no layout trashing in Chrome performance panel

- [ ] **Mobile testing**
  - Test touch interactions in `input-manager.ts`
  - Verify mobile HUD works correctly
  - Test on real mobile devices if possible
  - Verify responsive design works

- [ ] **Accessibility audit**
  - Test keyboard navigation
  - Test screen reader compatibility
  - Verify ARIA labels are correct
  - Test focus management

---

## Phase 12: Progressive Rollout & Cleanup (PR-12+)

**Goal**: Finalize migration and remove old code

### Checklist

- [ ] **Move one screen at a time**
  - Keep old PIXI UI behind feature flags for fast rollback
  - Test each migration thoroughly before moving to next
  - Get user feedback on each screen

- [ ] **Delete deprecated modules**
  - Remove old `packages/web-client/src/render/hud.ts` logic (keep file as adapter if needed)
  - Remove old `packages/web-client/src/render/hud-display.ts` logic
  - Remove old `packages/web-client/src/render/mobile-hud-display.ts` logic
  - Remove old scene implementations after React migration
  - Only delete after parity + e2e green

- [ ] **Documentation**
  - Update README with new architecture
  - Document React UI patterns
  - Document Mayhaps customization system
  - Document casino hub mechanics
  - Document idle system

- [ ] **Final polish**
  - Fix any remaining bugs
  - Optimize performance
  - Ensure all features work together
  - Verify save/load compatibility

---

## Key File Touchpoints

### React Integration

- **Entry & stage:** `packages/web-client/src/app/main.ts`, `packages/web-client/src/render/stage.ts`, `packages/web-client/src/render/scene-manager.ts`
- **HUD modules to replace:** `packages/web-client/src/render/hud.ts`, `packages/web-client/src/render/hud-display.ts`, `packages/web-client/src/render/mobile-hud-display.ts`, `packages/web-client/src/app/runtime/modules/runtime-hud*.ts`
- **Runtime state producers:** `packages/web-client/src/app/game-runtime.ts`, `packages/web-client/src/app/runtime/state-store.ts`, `packages/web-client/src/app/runtime/*`
- **Menus/scenes to migrate:** `packages/web-client/src/scenes/*` (main-menu, pause, game-over, loadout-selection, bias-phase)

### Mayhaps Features

- **Domain logic:** `packages/core-domain/src/util/mayhaps-customization.ts`, `packages/core-domain/src/util/prestige.ts`, `packages/core-domain/src/util/scoring.ts`
- **Physics:** `packages/core-domain/src/physics/ball-launch.ts`, `packages/core-domain/src/physics/world.ts`
- **Rewards:** `packages/core-domain/src/game/rewards.ts`, `packages/core-domain/src/game/gamble-brick-manager.ts`
- **State:** `packages/core-domain/src/app/state.ts`, `packages/core-domain/src/app/events.ts`
- **Audio:** `packages/web-client/src/audio/soundbank.ts`, `packages/web-client/src/audio/midi-engine.ts`
- **Narrative:** `packages/web-client/src/app/narrative-service.ts`, `packages/web-client/src/app/fate-ledger.ts`
- **Idle:** `packages/web-client/src/app/runtime/idle.ts`, `packages/web-client/src/app/meta-progress-service.ts`
- **Casino:** `packages/web-client/src/app/runtime/bias-phase-coordinator.ts`, `packages/web-client/src/app/runtime/casino-games.ts`

---

## Execution Strategy

### Recommended Order

1. **Phases 0-2**: React foundation (enables easier UI work)
2. **Phase 3**: Narrative foundation (lightweight, sets tone)
3. **Phase 4**: Ball customization (core Mayhaps feature)
4. **Phase 5**: Casino hub (extends existing bias phase)
5. **Phase 6**: Idle mechanics (independent feature)
6. **Phase 7**: UI migration (can happen in parallel with 4-6)
7. **Phase 8**: Meta-progression (builds on other features)
8. **Phase 9**: Graphics polish (can happen throughout)
9. **Phases 10-12**: Testing and cleanup

### Parallel Work Opportunities

- React UI work (Phases 1-2, 7) can proceed in parallel with Mayhaps features (Phases 3-6)
- Graphics work (Phase 9) can happen throughout development
- Testing (Phase 11) should be continuous

### Milestones

- **Milestone 1**: React HUD working (Phases 0-2)
- **Milestone 2**: Mayhaps core features (Phases 3-4)
- **Milestone 3**: Casino & idle (Phases 5-6)
- **Milestone 4**: Full UI migration (Phase 7)
- **Milestone 5**: Meta-progression (Phase 8)
- **Milestone 6**: Polish & ship (Phases 9-12)

---

## Notes

- Keep React and PixiJS worlds separate: Game writes → HUD reads. React dispatches intents via controller functions.
- Maintain determinism: Use seeded RNG for casino/idle calculations.
- Performance: Keep React HUD pure, throttle updates, schedule heavy work appropriately.
- Accessibility: Native DOM scrolling, focus management, ARIA support are major wins over canvas UI.
- Testing: Use CLI sim for balance testing, Playwright for E2E, Vitest for units.

---

## What You Get

- **React UI**: Native scrolling, responsive type, accessibility, easier UI development
- **Mayhaps Features**: Cosmic casino theme, ball customization, gambling mechanics, idle progression
- **Unified Experience**: Seamless integration of story, mechanics, and visuals
- **Maintainable Codebase**: Clear separation of concerns, testable components, scalable architecture
