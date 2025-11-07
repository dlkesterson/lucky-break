import type { Meta, StoryObj } from '@storybook/react-vite';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@lucky-break/web-client/src/i18n';
import {
  MainMenuView,
  type MainMenuViewProps,
} from '@lucky-break/web-client/src/ui/scenes/MainMenuView';
import { DEFAULT_THEME, COLOR_BLIND_THEME, type ThemeName } from '../../lib/themes';

/**
 * MainMenuView - Presentational Component
 *
 * Pure React component for the main menu scene imported directly from @lucky-break/web-client.
 * This component has no hooks or side effects - all data and callbacks come from props.
 *
 * Features:
 * - Title and start button
 * - Optional narrative prologue
 * - How-to-play instructions
 * - High score leaderboard
 * - Settings actions (performance, theme, ledger, story)
 * - Fully localized with react-i18next
 * - Styled with Tailwind CSS using the design system's theme tokens
 * - Fonts and colors automatically inherit from CSS custom properties
 *
 * **Design System Integration**:
 * - Uses `font-display`, `font-body`, and `font-mono` from Tailwind config
 * - Colors are set via CSS custom properties injected through inline styles
 * - All design system components (Button, Panel, Heading, Label, Mono) are used
 *
 * **Location**: `packages/web-client/src/ui/scenes/MainMenuView.tsx`
 * **Container**: `packages/web-client/src/ui/scenes/MainMenuApp.tsx`
 */
const meta: Meta<typeof MainMenuView> = {
  title: 'Game Scenes/Main Menu View',
  component: MainMenuView,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'Synth Night',
    },
  },
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <Story />
      </I18nextProvider>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

const mockActions = {
  onStart: () => console.log('[Story] Start clicked'),
  onTogglePerformance: () => console.log('[Story] Toggle performance'),
  onToggleTheme: () => console.log('[Story] Toggle theme'),
  onOpenLedger: () => console.log('[Story] Open ledger'),
  onShowStory: () => console.log('[Story] Show story'),
};

const defaultProps: MainMenuViewProps = {
  visible: true,
  title: 'Lucky Break',
  prompt: 'Begin Your Run',
  prologue: {
    heading: 'The Fateweaver Game',
    body: [
      'Fortune favours the bold, but Mayhaps favours no one. Every brick you break, every coin you claim - it all feeds the cosmic ledger.',
      'Survive the volleys. Defy the odds. Let chaos spin the wheel while you hold steady at the paddle.',
    ],
  },
  helpLines: [
    'Drag or tap to move the paddle left and right',
    'Keep the ball in play and break bricks to earn points',
    'Golden bricks grant coin drops; shimmering bricks unleash power-ups',
    'Combo chains multiply your score - let nothing fall',
  ],
  scores: [
    { id: '1', rank: 1, name: 'Stardust Gambler', score: 98250, round: 12 },
    { id: '2', rank: 2, name: 'Cosmic Void', score: 76500, round: 10 },
    { id: '3', rank: 3, name: 'Nebula Rogue', score: 54300, round: 8 },
    { id: '4', rank: 4, name: 'Luck Thief', score: 42100, round: 7 },
    { id: '5', rank: 5, name: 'Entropy Sage', score: 31200, round: 6 },
  ],
  performanceEnabled: false,
  pendingStart: false,
  theme: DEFAULT_THEME,
  themeName: 'default',
  ...mockActions,
};

/**
 * ## Default State
 *
 * Full main menu with prologue, high scores, and all features.
 * This is the typical state players see when launching the game.
 */
export const Default: Story = {
  args: defaultProps,
};

/**
 * ## Start Pending
 *
 * Shows the loading state when the player clicks "Begin Your Run".
 * The button is disabled and shows "Starting..." text.
 */
export const StartPending: Story = {
  args: {
    ...defaultProps,
    pendingStart: true,
  },
};

/**
 * ## No Prologue
 *
 * Menu without the narrative intro section. Useful for returning players
 * who have already seen the story, or for quick-start scenarios.
 */
export const NoPrologue: Story = {
  args: {
    ...defaultProps,
    prologue: null,
  },
};

/**
 * ## Empty Leaderboard
 *
 * First-time player experience with no previous runs recorded.
 * Shows encouraging empty state message.
 */
export const NoScores: Story = {
  args: {
    ...defaultProps,
    scores: [],
  },
};

/**
 * ## Minimal Instructions
 *
 * Condensed help text for experienced players or mobile displays.
 */
export const MinimalHelp: Story = {
  args: {
    ...defaultProps,
    helpLines: ['Drag or tap to move the paddle', 'Break bricks and chain combos for points'],
  },
};

/**
 * ## Performance Mode
 *
 * Menu with performance mode enabled. This setting reduces visual effects
 * for better performance on lower-end devices.
 */
export const PerformanceMode: Story = {
  args: {
    ...defaultProps,
    performanceEnabled: true,
  },
};

/**
 * ## Color-Blind Theme
 *
 * Accessible theme variant designed for color-blind players.
 * Uses high-contrast colors and different visual patterns.
 */
export const ColorBlindTheme: Story = {
  args: {
    ...defaultProps,
    themeName: 'colorBlind' as ThemeName,
    theme: COLOR_BLIND_THEME,
  },
};

/**
 * ## Single Score
 *
 * Leaderboard with only one entry. Useful for testing layout
 * and demonstrating first-run experience.
 */
export const SingleScore: Story = {
  args: {
    ...defaultProps,
    scores: [{ id: '1', rank: 1, name: 'Lone Wolf', score: 45000, round: 5 }],
  },
};

/**
 * ## Hidden State
 *
 * Component returns null when not visible. This is the state
 * when the main menu is closed or another scene is active.
 */
export const Hidden: Story = {
  args: {
    ...defaultProps,
    visible: false,
  },
};

/**
 * ## Custom Branding
 *
 * Demonstrates customizable title and prompt text.
 */
export const CustomText: Story = {
  args: {
    ...defaultProps,
    title: 'Mayhaps Casino',
    prompt: 'Roll the Dice',
  },
};

/**
 * ## Stress Test - Long Content
 *
 * Tests truncation and responsive layout with extra-long names
 * and large score values.
 */
export const LongContent: Story = {
  args: {
    ...defaultProps,
    scores: [
      {
        id: '1',
        rank: 1,
        name: 'The Extraordinarily Long Player Name That Should Truncate Gracefully',
        score: 9999999,
        round: 99,
      },
      {
        id: '2',
        rank: 2,
        name: 'Another Very Long Name That Tests Grid Layout',
        score: 8888888,
        round: 88,
      },
      {
        id: '3',
        rank: 3,
        name: 'Short',
        score: 123,
        round: 1,
      },
    ],
  },
};

/**
 * ## Fully Minimal
 *
 * Absolute minimum configuration - no prologue, no scores, minimal help.
 * Demonstrates the component's ability to adapt to sparse data.
 */
export const FullyMinimal: Story = {
  args: {
    ...defaultProps,
    prologue: null,
    scores: [],
    helpLines: ['Move paddle and break bricks'],
  },
};
