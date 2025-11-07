import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@lucky-break/web-client/src/i18n';
import {
  PauseView,
  type PauseViewProps,
  type LegendItem,
} from '@lucky-break/web-client/src/ui/scenes/PauseView';
import type { HudEntropyActionDescriptor } from '@lucky-break/web-client/src/render/hud';
import { DEFAULT_THEME, COLOR_BLIND_THEME } from '../../lib/themes';

/**
 * # PauseView - Presentational Component
 *
 * Pure presentational layer for the pause menu dialog with score display,
 * entropy store actions, audio controls, and power-up legend.
 *
 * ## Design Principles
 * - **Pure Presentation**: No hooks, side-effects, or state management
 * - **Callback-Driven**: All interactions via props callbacks
 * - **Themeable**: Accepts theme definition and CSS custom properties
 * - **Dialog-Based**: Uses design system Dialog primitives
 * - **Accessible**: Proper ARIA labels and semantic HTML
 *
 * ## Features
 * - Current score display panel
 * - Entropy store with purchasable actions
 * - Audio controls (volume slider, mute toggle)
 * - Power-up legend list
 * - Resume and quit action buttons
 * - Theme toggle
 * - Pending state support
 *
 * **Location**: `packages/web-client/src/ui/scenes/PauseView.tsx`
 */
const meta: Meta<typeof PauseView> = {
  title: 'Scenes/PauseView',
  component: PauseView,
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <div style={{ minHeight: '100vh', background: '#0a0614' }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Pause menu overlay with game state, entropy actions, and settings controls.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PauseView>;

const mockEntropyActions: HudEntropyActionDescriptor[] = [
  {
    action: 'reroll',
    label: 'Reroll Gamble',
    hotkey: 'r',
    cost: 150,
    charges: 2,
    affordable: true,
  },
  {
    action: 'shield',
    label: 'Protective Shield',
    hotkey: 's',
    cost: 200,
    charges: 0,
    affordable: true,
  },
  {
    action: 'bailout',
    label: 'Emergency Bailout',
    hotkey: 'b',
    cost: 300,
    charges: 0,
    affordable: false,
  },
];

const mockLegendItems: LegendItem[] = [
  { type: 'paddle-width', text: 'Cyan Paddle Width - Widens your paddle for extra coverage.' },
  { type: 'ball-speed', text: 'Blue Ball Speed - Speeds up the ball and boosts scoring.' },
  { type: 'multi-ball', text: 'Pink Multi Ball - Splits the active ball into additional balls.' },
  { type: 'sticky-paddle', text: 'Teal Sticky Paddle - Catches the ball until you launch again.' },
  { type: 'laser', text: 'Red Laser - Fire devastating beams to destroy bricks.' },
];

const overlayStyle: CSSProperties = {
  '--pause-bg-from': DEFAULT_THEME.background.from,
  '--pause-bg-to': DEFAULT_THEME.background.to,
  '--pause-panel-fill': DEFAULT_THEME.hud.panelFill,
  '--pause-panel-line': DEFAULT_THEME.hud.panelLine,
  '--pause-text-primary': DEFAULT_THEME.hud.textPrimary,
  '--pause-text-secondary': DEFAULT_THEME.hud.textSecondary,
  '--pause-accent': DEFAULT_THEME.accents.combo,
} as CSSProperties;

const scorePanelStyle: CSSProperties = {
  background: 'linear-gradient(150deg, rgba(30, 22, 52, 0.78), rgba(18, 12, 36, 0.66))',
  borderColor: 'rgba(255, 255, 255, 0.08)',
} as CSSProperties;

const storePanelStyle: CSSProperties = {
  background: 'linear-gradient(150deg, rgba(40, 28, 70, 0.72), rgba(18, 10, 32, 0.62))',
  borderColor: 'rgba(255, 255, 255, 0.08)',
} as CSSProperties;

const legendPanelStyle: CSSProperties = {
  background: 'linear-gradient(150deg, rgba(32, 24, 58, 0.68), rgba(20, 12, 36, 0.56))',
  borderColor: 'rgba(255, 255, 255, 0.08)',
} as CSSProperties;

const mockActions = {
  onResume: async () => {
    await Promise.resolve();
    console.log('Resume clicked');
  },
  onQuit: async () => {
    await Promise.resolve();
    console.log('Quit clicked');
  },
  onVolumeChange: (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Volume changed:', event.currentTarget.value);
  },
  onMuteToggle: (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Mute toggled:', event.currentTarget.checked);
  },
  onThemeToggle: () => {
    console.log('Theme toggled');
  },
  onEntropyAction: (action: string) => {
    console.log('Entropy action:', action);
  },
};

const defaultProps: PauseViewProps = {
  visible: true,
  title: 'PAUSED',
  description: 'Take a breath. The game awaits.',
  score: 42750,
  coins: 1250,
  entropyActions: mockEntropyActions,
  legendTitle: 'Power-Up Guide',
  legendItems: mockLegendItems,
  resumeLabel: 'Resume Game',
  quitLabel: 'Quit to Menu',
  pending: null,
  theme: DEFAULT_THEME,
  themeLabel: 'Theme: Default',
  volumePercent: 75,
  muted: false,
  overlayStyle,
  scorePanelStyle,
  storePanelStyle,
  legendPanelStyle,
  ...mockActions,
};

/**
 * ## Default State
 *
 * Standard pause menu with score, entropy actions, audio controls, and legend.
 */
export const Default: Story = {
  args: defaultProps,
};

/**
 * ## Resume Pending
 *
 * Resume button in loading state while game resumes.
 */
export const ResumePending: Story = {
  args: {
    ...defaultProps,
    pending: 'resume',
    resumeLabel: 'Resuming...',
  },
};

/**
 * ## Quit Pending
 *
 * Quit button in loading state while navigating to menu.
 */
export const QuitPending: Story = {
  args: {
    ...defaultProps,
    pending: 'quit',
    quitLabel: 'Quitting...',
  },
};

/**
 * ## High Score
 *
 * Displaying a large score value with many coins.
 */
export const HighScore: Story = {
  args: {
    ...defaultProps,
    score: 9876543,
    coins: 25000,
  },
};

/**
 * ## Low Score
 *
 * Early game with minimal score and coins.
 */
export const LowScore: Story = {
  args: {
    ...defaultProps,
    score: 150,
    coins: 25,
    entropyActions: [
      {
        action: 'bailout',
        label: 'Emergency Bailout',
        hotkey: 'b',
        cost: 300,
        charges: 0,
        affordable: false,
      },
    ],
  },
};

/**
 * ## No Entropy Actions
 *
 * Empty entropy store state.
 */
export const NoEntropyActions: Story = {
  args: {
    ...defaultProps,
    entropyActions: [],
  },
};

/**
 * ## All Actions Charged
 *
 * Multiple charged actions ready to use.
 */
export const AllActionsCharged: Story = {
  args: {
    ...defaultProps,
    entropyActions: [
      {
        action: 'reroll',
        label: 'Reroll Gamble',
        hotkey: 'r',
        cost: 150,
        charges: 3,
        affordable: true,
      },
      {
        action: 'shield',
        label: 'Protective Shield',
        hotkey: 's',
        cost: 200,
        charges: 2,
        affordable: true,
      },
      {
        action: 'bailout',
        label: 'Emergency Bailout',
        hotkey: 'b',
        cost: 300,
        charges: 1,
        affordable: true,
      },
    ],
  },
};

/**
 * ## All Actions Locked
 *
 * Insufficient coins for any entropy actions.
 */
export const AllActionsLocked: Story = {
  args: {
    ...defaultProps,
    coins: 50,
    entropyActions: [
      {
        action: 'reroll',
        label: 'Reroll Gamble',
        hotkey: 'r',
        cost: 150,
        charges: 0,
        affordable: false,
      },
      {
        action: 'shield',
        label: 'Protective Shield',
        hotkey: 's',
        cost: 200,
        charges: 0,
        affordable: false,
      },
      {
        action: 'bailout',
        label: 'Emergency Bailout',
        hotkey: 'b',
        cost: 300,
        charges: 0,
        affordable: false,
      },
    ],
  },
};

/**
 * ## Muted Audio
 *
 * Audio controls with mute enabled.
 */
export const MutedAudio: Story = {
  args: {
    ...defaultProps,
    muted: true,
    volumePercent: 0,
  },
};

/**
 * ## Max Volume
 *
 * Volume slider at maximum.
 */
export const MaxVolume: Story = {
  args: {
    ...defaultProps,
    volumePercent: 100,
  },
};

/**
 * ## No Legend
 *
 * Empty power-up legend state.
 */
export const NoLegend: Story = {
  args: {
    ...defaultProps,
    legendItems: [],
  },
};

/**
 * ## No Legend Title
 *
 * Legend content without title header.
 */
export const NoLegendTitle: Story = {
  args: {
    ...defaultProps,
    legendTitle: null,
  },
};

/**
 * ## Long Legend
 *
 * Extended legend with many power-up descriptions.
 */
export const LongLegend: Story = {
  args: {
    ...defaultProps,
    legendItems: [
      { type: 'paddle-width', text: 'Cyan Paddle Width - Widens your paddle for extra coverage.' },
      { type: 'ball-speed', text: 'Blue Ball Speed - Speeds up the ball and boosts scoring.' },
      {
        type: 'multi-ball',
        text: 'Pink Multi Ball - Splits the active ball into additional balls.',
      },
      {
        type: 'sticky-paddle',
        text: 'Teal Sticky Paddle - Catches the ball until you launch again.',
      },
      { type: 'laser', text: 'Red Laser - Fire devastating beams to destroy bricks.' },
      { text: 'Shift + C toggles high-contrast color mode.' },
      { text: 'Collect coins to unlock entropy store actions.' },
      { text: 'Build combos to increase score multipliers.' },
    ],
  },
};

/**
 * ## No Quit Option
 *
 * Pause menu without quit button (e.g., tutorial mode).
 */
export const NoQuitOption: Story = {
  args: {
    ...defaultProps,
    quitLabel: null,
    onQuit: null,
  },
};

/**
 * ## Color-Blind Theme
 *
 * Accessible theme variant for color-blind players.
 */
export const ColorBlindTheme: Story = {
  args: {
    ...defaultProps,
    theme: COLOR_BLIND_THEME,
    themeLabel: 'Theme: Accessible',
    overlayStyle: {
      '--pause-bg-from': COLOR_BLIND_THEME.background.from,
      '--pause-bg-to': COLOR_BLIND_THEME.background.to,
      '--pause-panel-fill': COLOR_BLIND_THEME.hud.panelFill,
      '--pause-panel-line': COLOR_BLIND_THEME.hud.panelLine,
      '--pause-text-primary': COLOR_BLIND_THEME.hud.textPrimary,
      '--pause-text-secondary': COLOR_BLIND_THEME.hud.textSecondary,
      '--pause-accent': COLOR_BLIND_THEME.accents.combo,
    } as CSSProperties,
  },
};

/**
 * ## Hidden State
 *
 * Pause menu not visible (dialog closed).
 */
export const Hidden: Story = {
  args: {
    ...defaultProps,
    visible: false,
  },
};

/**
 * ## Minimal State
 *
 * Pause menu with minimal content across all panels.
 */
export const MinimalState: Story = {
  args: {
    ...defaultProps,
    score: 0,
    coins: 0,
    entropyActions: [],
    legendItems: [],
    legendTitle: null,
  },
};
