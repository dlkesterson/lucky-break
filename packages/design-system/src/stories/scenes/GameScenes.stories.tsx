import type { Meta } from '@storybook/react-vite';
import { Heading, Label, Panel } from '../../index';

/**
 * Game scene documentation and screenshots.
 *
 * The Lucky Break game includes several full-screen React overlays that handle
 * menu navigation, game state, and player interactions. Due to their tight
 * coupling with the game runtime (Zustand stores, theme providers, and Pixi.js),
 * these scenes are documented here with static examples.
 *
 * For interactive exploration, run `pnpm dev` in the workspace root.
 */
const meta = {
  title: 'Game Scenes/Overview',
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'Synth Night',
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;

/**
 * ## Main Menu
 *
 * The main menu (`MainMenuApp`) presents:
 * - Game title and start button
 * - Optional narrative prologue
 * - How-to-play instructions
 * - High score leaderboard
 * - Settings toggles (performance mode, theme, fate ledger, story)
 *
 * **Props**: `visible`, `suspended`, `snapshot` (with callbacks for user actions)
 *
 * **Location**: `packages/web-client/src/ui/scenes/MainMenuApp.tsx`
 */
export const MainMenu = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Main Menu Scene</Heading>
    <Label>
      Full-screen overlay with gradient backgrounds, animated buttons, and responsive grid layout.
      Displays high scores, instructions, and narrative prologue.
    </Label>
    <Label className="text-sm opacity-75">
      💡 Run the game with `pnpm dev` to see this scene in action.
    </Label>
  </Panel>
);

/**
 * ## Game Over
 *
 * The game over screen (`GameOverApp`) shows:
 * - Final score and certainty dust earned
 * - Achievements unlocked during the run
 * - Restart button to return to loadout selection
 *
 * **Props**: `visible`, `suspended`, `snapshot` (with score, dust, achievements, and restart callback)
 *
 * **Location**: `packages/web-client/src/ui/scenes/GameOverApp.tsx`
 */
export const GameOver = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Game Over Scene</Heading>
    <Label>
      Displays run summary with achievement cards, dust rewards, and restart option. Uses gradient
      backgrounds and animated score displays.
    </Label>
    <Label className="text-sm opacity-75">
      💡 This scene appears when all lives are lost or the player quits a run.
    </Label>
  </Panel>
);

/**
 * ## Pause Menu
 *
 * The pause overlay (`PauseApp`) includes:
 * - Current score display
 * - Entropy action store with purchase options
 * - Audio settings (volume slider, mute toggle)
 * - Power-up legend
 * - Resume and quit buttons
 *
 * **Props**: `visible`, `suspended`, `snapshot` (with callbacks and HUD state)
 *
 * **Location**: `packages/web-client/src/ui/scenes/PauseApp.tsx`
 */
export const PauseMenu = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Pause Menu Scene</Heading>
    <Label>
      Dialog-based pause screen with entropy action store, audio controls, and power-up legend.
      Rendered inside a Radix Dialog component.
    </Label>
    <Label className="text-sm opacity-75">
      💡 Press ESC or click outside the dialog to resume the game.
    </Label>
  </Panel>
);

/**
 * ## Loadout Selection
 *
 * The loadout selector (`LoadoutSelectionApp`) features:
 * - Grid of ball form presets (sphere, octagon, d20, etc.)
 * - Animated ball preview with traits and effects
 * - Combined summary of trait + sigil + voice bonuses
 * - Start button to begin the run
 *
 * **Props**: `visible`, `suspended`, `presets`, `lockedForms`, `defaultFormId`, `commitSelection`
 *
 * **Location**: `packages/web-client/src/ui/scenes/LoadoutSelectionApp.tsx`
 */
export const LoadoutSelection = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Loadout Selection Scene</Heading>
    <Label>
      Full-screen loadout picker with animated 3D-style ball previews (including d20 facet
      rendering) and scrollable preset cards.
    </Label>
    <Label className="text-sm opacity-75">
      💡 Each preset combines trait, sigil, and voice for unique gameplay modifiers.
    </Label>
  </Panel>
);

/**
 * ## Fate Ledger
 *
 * The fate ledger (`FateLedgerApp`) displays:
 * - Total idle rolls and accumulated time
 * - Entropy and certainty dust totals
 * - Recent entry log (timestamps, duration, rewards)
 *
 * **Props**: `visible`, `suspended`, `snapshot`, `onClose`
 *
 * **Location**: `packages/web-client/src/ui/scenes/FateLedgerApp.tsx`
 */
export const FateLedger = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Fate Ledger Scene</Heading>
    <Label>
      Modal overlay showing idle roll history and accumulated rewards. Click outside to dismiss.
    </Label>
    <Label className="text-sm opacity-75">
      💡 Accessible from the main menu via &quot;View Fate Ledger&quot; button.
    </Label>
  </Panel>
);

/**
 * ## Casino Hub (Bias Phase)
 *
 * The cosmic casino (`CasinoHubApp`) offers:
 * - Level complete recap panel
 * - Entropy balance and session scoreboard
 * - Wagering options (bias modifiers)
 * - Fate roulette wheel preview
 * - Nebula slots mini-game
 * - Commit and skip buttons
 *
 * **Props**: `visible`, `suspended`, `payload` (with session data, options, and callbacks)
 *
 * **Location**: `packages/web-client/src/ui/scenes/CasinoHub.tsx`
 */
export const CasinoHub = () => (
  <Panel className="max-w-2xl space-y-4">
    <Heading>Casino Hub Scene (Bias Phase)</Heading>
    <Label>
      Full-screen bias phase interface with level recap, entropy wagering, roulette preview, and
      slots mini-game. Players spend entropy to modify upcoming volley difficulty.
    </Label>
    <Label className="text-sm opacity-75">
      💡 Appears between gameplay volleys to let players shape their fate.
    </Label>
  </Panel>
);
