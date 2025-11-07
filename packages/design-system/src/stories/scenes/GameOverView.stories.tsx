import type { Meta, StoryObj } from '@storybook/react-vite';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@lucky-break/web-client/src/i18n';
import {
  GameOverView,
  type GameOverViewProps,
} from '@lucky-break/web-client/src/ui/scenes/GameOverView';
import { DEFAULT_THEME, COLOR_BLIND_THEME } from '../../lib/themes';

/**
 * GameOverView - Presentational Component
 *
 * Pure React component for the game over scene imported directly from @lucky-break/web-client.
 * This component has no hooks or side effects - all data and callbacks come from props.
 *
 * Features:
 * - Final score display with formatting
 * - Certainty dust reward (when awarded)
 * - Achievement list with titles and descriptions
 * - Restart button with pending state
 * - Fully localized with react-i18next
 * - Styled with gradient backgrounds and theme-aware colors
 *
 * **Design System Integration**:
 * - Uses `font-display`, `font-body`, and `font-mono` from Tailwind config
 * - Colors are set via CSS custom properties injected through inline styles
 * - All design system components (Button, Panel, Heading, Label, Mono) are used
 *
 * **Location**: `packages/web-client/src/ui/scenes/GameOverView.tsx`
 * **Container**: `packages/web-client/src/ui/scenes/GameOverApp.tsx`
 */
const meta: Meta<typeof GameOverView> = {
  title: 'Game Scenes/Game Over View',
  component: GameOverView,
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
  onRestart: () => console.log('[Story] Restart clicked'),
};

const defaultProps: GameOverViewProps = {
  visible: true,
  title: 'Game Over',
  scoreLabel: 'Final Score',
  score: 45800,
  dustAwarded: 12,
  achievements: [
    {
      id: '1',
      title: 'First Blood',
      description: 'Broke your first brick',
    },
    {
      id: '2',
      title: 'Combo Master',
      description: 'Achieved a 10x combo streak',
    },
    {
      id: '3',
      title: 'Power Collector',
      description: 'Collected 5 power-ups in one round',
    },
  ],
  prompt: 'Play Again',
  pending: false,
  theme: DEFAULT_THEME,
  ...mockActions,
};

/**
 * ## Default State
 *
 * Standard game over screen with score, dust reward, and achievements.
 * This is the typical state players see after completing a run.
 */
export const Default: Story = {
  args: defaultProps,
};

/**
 * ## Restart Pending
 *
 * Shows the loading state when the player clicks "Play Again".
 * The button is disabled and shows pending text.
 */
export const RestartPending: Story = {
  args: {
    ...defaultProps,
    pending: true,
    prompt: 'Starting...',
  },
};

/**
 * ## No Achievements
 *
 * Game over screen without any achievements unlocked.
 * Shows encouraging empty state message.
 */
export const NoAchievements: Story = {
  args: {
    ...defaultProps,
    achievements: [],
  },
};

/**
 * ## No Dust Awarded
 *
 * Game over screen where no certainty dust was earned.
 * Only the score panel is shown (single column layout).
 */
export const NoDustAwarded: Story = {
  args: {
    ...defaultProps,
    dustAwarded: null,
  },
};

/**
 * ## High Score
 *
 * Exceptional performance with maximum rewards.
 * Large score value and many achievements.
 */
export const HighScore: Story = {
  args: {
    ...defaultProps,
    score: 9876543,
    dustAwarded: 156,
    achievements: [
      {
        id: '1',
        title: 'Legendary Run',
        description: 'Survived 25 rounds without losing a life',
      },
      {
        id: '2',
        title: 'Perfectionist',
        description: 'Cleared every brick in 10 consecutive rounds',
      },
      {
        id: '3',
        title: 'Power Addict',
        description: 'Collected 50+ power-ups in a single run',
      },
      {
        id: '4',
        title: 'Chain Reaction',
        description: 'Maintained a 50x combo streak',
      },
      {
        id: '5',
        title: 'Fortune Favors',
        description: 'Earned 100+ coins from golden bricks',
      },
    ],
  },
};

/**
 * ## Low Score
 *
 * Early game over with minimal achievements and rewards.
 * Tests formatting of small values.
 */
export const LowScore: Story = {
  args: {
    ...defaultProps,
    score: 450,
    dustAwarded: 1,
    achievements: [
      {
        id: '1',
        title: 'First Steps',
        description: 'Started your first run',
      },
    ],
  },
};

/**
 * ## Zero Score Edge Case
 *
 * Tests edge case handling for zero or invalid scores.
 * Should display "0" gracefully.
 */
export const ZeroScore: Story = {
  args: {
    ...defaultProps,
    score: 0,
    dustAwarded: 0,
    achievements: [],
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
    theme: COLOR_BLIND_THEME,
  },
};

/**
 * ## Hidden State
 *
 * Component returns null when not visible. This is the state
 * when the game over screen is closed or another scene is active.
 */
export const Hidden: Story = {
  args: {
    ...defaultProps,
    visible: false,
  },
};

/**
 * ## Long Achievement Text
 *
 * Tests layout with extra-long achievement titles and descriptions.
 * Ensures text wraps properly and maintains readability.
 */
export const LongAchievementText: Story = {
  args: {
    ...defaultProps,
    achievements: [
      {
        id: '1',
        title: 'The Extraordinarily Long Achievement Name That Should Wrap Properly',
        description:
          'This is a very detailed achievement description that explains in great detail exactly what the player accomplished during their run through the game, testing text wrapping and layout constraints.',
      },
      {
        id: '2',
        title: 'Short',
        description: 'Brief.',
      },
    ],
  },
};

/**
 * ## Single Achievement
 *
 * Game over screen with only one achievement unlocked.
 * Useful for testing layout and demonstrating focused feedback.
 */
export const SingleAchievement: Story = {
  args: {
    ...defaultProps,
    achievements: [
      {
        id: '1',
        title: 'Lucky Break',
        description: 'Survived against all odds',
      },
    ],
  },
};
