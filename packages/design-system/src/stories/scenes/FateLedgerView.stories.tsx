import type { Meta, StoryObj } from '@storybook/react-vite';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@lucky-break/web-client/src/i18n';
import {
  FateLedgerView,
  type FateLedgerViewProps,
} from '@lucky-break/web-client/src/ui/scenes/FateLedgerView';
import { DEFAULT_THEME, COLOR_BLIND_THEME } from '../../lib/themes';

/**
 * FateLedgerView - Presentational Component
 *
 * Pure React component for the fate ledger scene imported directly from @lucky-break/web-client.
 * This component has no hooks or side effects - all data and callbacks come from props.
 *
 * Features:
 * - Summary statistics (total rolls, idle time, entropy, dust)
 * - Scrollable list of recent idle roll entries
 * - Formatted timestamps and durations
 * - Click-outside or button to close
 * - Fully localized with react-i18next
 * - Styled with cosmic gradients and theme-aware colors
 *
 * **Design System Integration**:
 * - Uses `font-display`, `font-body`, and `font-mono` from Tailwind config
 * - Colors are set via CSS custom properties injected through inline styles
 * - All design system components (Button, Panel, Heading, Label) are used
 *
 * **Location**: `packages/web-client/src/ui/scenes/FateLedgerView.tsx`
 * **Container**: `packages/web-client/src/ui/scenes/FateLedgerApp.tsx`
 */
const meta: Meta<typeof FateLedgerView> = {
  title: 'Game Scenes/Fate Ledger View',
  component: FateLedgerView,
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
  onClose: () => console.log('[Story] Close clicked'),
};

const defaultProps: FateLedgerViewProps = {
  visible: true,
  summaryLines: [
    {
      key: 'logged-rolls',
      text: 'Logged idle rolls: 12',
    },
    {
      key: 'idle-time',
      text: 'Total idle time: 2h 34m 12s',
    },
    {
      key: 'entropy-earned',
      text: 'Entropy earned: +8.5',
    },
    {
      key: 'certainty-dust',
      text: 'Certainty dust: 24.75',
    },
    {
      key: 'last-entry',
      text: 'Latest entry: 2025-11-07 14:32',
    },
  ],
  entryLines: [
    {
      key: 'entry-1',
      text: '01. 2025-11-07 14:32 · 15m 24s · ΔEntropy +1.2 · Dust 3.5',
    },
    {
      key: 'entry-2',
      text: '02. 2025-11-07 14:02 · 22m 8s · ΔEntropy +1.8 · Dust 4.2',
    },
    {
      key: 'entry-3',
      text: '03. 2025-11-07 13:28 · 8m 42s · ΔEntropy +0.6 · Dust 1.8',
    },
    {
      key: 'entry-4',
      text: '04. 2025-11-07 13:12 · 45m 18s · ΔEntropy +2.4 · Dust 6.9',
    },
    {
      key: 'entry-5',
      text: '05. 2025-11-07 12:04 · 12m 36s · ΔEntropy +0.9 · Dust 2.4',
    },
  ],
  theme: DEFAULT_THEME,
  ...mockActions,
};

/**
 * ## Default State
 *
 * Standard fate ledger with summary statistics and recent entries.
 * This is the typical state players see when viewing their idle roll history.
 */
export const Default: Story = {
  args: defaultProps,
};

/**
 * ## Empty Ledger
 *
 * Fate ledger with no entries recorded yet.
 * Shows empty state message in the entries panel.
 */
export const EmptyLedger: Story = {
  args: {
    ...defaultProps,
    summaryLines: [
      {
        key: 'logged-rolls',
        text: 'Logged idle rolls: 0',
      },
      {
        key: 'idle-time',
        text: 'Total idle time: 0s',
      },
      {
        key: 'entropy-earned',
        text: 'Entropy earned: 0',
      },
      {
        key: 'certainty-dust',
        text: 'Certainty dust: 0',
      },
    ],
    entryLines: [],
  },
};

/**
 * ## Many Entries
 *
 * Ledger with maximum displayed entries (10).
 * Tests scrolling and layout with full data.
 */
export const ManyEntries: Story = {
  args: {
    ...defaultProps,
    summaryLines: [
      {
        key: 'logged-rolls',
        text: 'Logged idle rolls: 48',
      },
      {
        key: 'idle-time',
        text: 'Total idle time: 18h 42m 36s',
      },
      {
        key: 'entropy-earned',
        text: 'Entropy earned: +52.8',
      },
      {
        key: 'certainty-dust',
        text: 'Certainty dust: 142.5',
      },
      {
        key: 'last-entry',
        text: 'Latest entry: 2025-11-07 16:45',
      },
    ],
    entryLines: [
      {
        key: 'entry-1',
        text: '01. 2025-11-07 16:45 · 1h 12m 24s · ΔEntropy +4.2 · Dust 12.5',
      },
      {
        key: 'entry-2',
        text: '02. 2025-11-07 15:18 · 38m 6s · ΔEntropy +2.8 · Dust 8.2',
      },
      {
        key: 'entry-3',
        text: '03. 2025-11-07 14:28 · 22m 42s · ΔEntropy +1.6 · Dust 4.8',
      },
      {
        key: 'entry-4',
        text: '04. 2025-11-07 13:52 · 54m 18s · ΔEntropy +3.9 · Dust 11.2',
      },
      {
        key: 'entry-5',
        text: '05. 2025-11-07 12:36 · 18m 36s · ΔEntropy +1.3 · Dust 3.6',
      },
      {
        key: 'entry-6',
        text: '06. 2025-11-07 11:58 · 42m 12s · ΔEntropy +3.1 · Dust 9.4',
      },
      {
        key: 'entry-7',
        text: '07. 2025-11-07 10:48 · 28m 48s · ΔEntropy +2.2 · Dust 6.8',
      },
      {
        key: 'entry-8',
        text: '08. 2025-11-07 09:52 · 1h 6m 0s · ΔEntropy +4.8 · Dust 14.2',
      },
      {
        key: 'entry-9',
        text: '09. 2025-11-07 08:24 · 36m 24s · ΔEntropy +2.6 · Dust 7.8',
      },
      {
        key: 'entry-10',
        text: '10. 2025-11-07 07:12 · 48m 36s · ΔEntropy +3.5 · Dust 10.6',
      },
    ],
  },
};

/**
 * ## Negative Entropy
 *
 * Ledger showing entropy losses alongside gains.
 * Tests formatting of negative values.
 */
export const NegativeEntropy: Story = {
  args: {
    ...defaultProps,
    summaryLines: [
      {
        key: 'logged-rolls',
        text: 'Logged idle rolls: 8',
      },
      {
        key: 'idle-time',
        text: 'Total idle time: 1h 18m 42s',
      },
      {
        key: 'entropy-earned',
        text: 'Entropy earned: -2.4',
      },
      {
        key: 'certainty-dust',
        text: 'Certainty dust: 16.8',
      },
      {
        key: 'last-entry',
        text: 'Latest entry: 2025-11-07 12:48',
      },
    ],
    entryLines: [
      {
        key: 'entry-1',
        text: '01. 2025-11-07 12:48 · 18m 12s · ΔEntropy -0.8 · Dust 2.4',
      },
      {
        key: 'entry-2',
        text: '02. 2025-11-07 12:18 · 24m 36s · ΔEntropy +1.2 · Dust 3.6',
      },
      {
        key: 'entry-3',
        text: '03. 2025-11-07 11:42 · 12m 48s · ΔEntropy -0.4 · Dust 1.8',
      },
    ],
  },
};

/**
 * ## Large Values
 *
 * Ledger with exceptionally large durations and rewards.
 * Tests number formatting and layout stability.
 */
export const LargeValues: Story = {
  args: {
    ...defaultProps,
    summaryLines: [
      {
        key: 'logged-rolls',
        text: 'Logged idle rolls: 999',
      },
      {
        key: 'idle-time',
        text: 'Total idle time: 148h 32m 18s',
      },
      {
        key: 'entropy-earned',
        text: 'Entropy earned: +8,542.8',
      },
      {
        key: 'certainty-dust',
        text: 'Certainty dust: 24,856.42',
      },
      {
        key: 'last-entry',
        text: 'Latest entry: 2025-11-07 22:14',
      },
    ],
    entryLines: [
      {
        key: 'entry-1',
        text: '01. 2025-11-07 22:14 · 12h 24m 36s · ΔEntropy +842.5 · Dust 2,486.8',
      },
      {
        key: 'entry-2',
        text: '02. 2025-11-06 18:42 · 8h 12m 18s · ΔEntropy +624.2 · Dust 1,842.6',
      },
    ],
  },
};

/**
 * ## Without Last Entry
 *
 * Summary without the latest entry timestamp line.
 * Tests conditional rendering of summary items.
 */
export const WithoutLastEntry: Story = {
  args: {
    ...defaultProps,
    summaryLines: [
      {
        key: 'logged-rolls',
        text: 'Logged idle rolls: 5',
      },
      {
        key: 'idle-time',
        text: 'Total idle time: 42m 18s',
      },
      {
        key: 'entropy-earned',
        text: 'Entropy earned: +3.2',
      },
      {
        key: 'certainty-dust',
        text: 'Certainty dust: 9.6',
      },
    ],
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
 * when the ledger is closed or another scene is active.
 */
export const Hidden: Story = {
  args: {
    ...defaultProps,
    visible: false,
  },
};
