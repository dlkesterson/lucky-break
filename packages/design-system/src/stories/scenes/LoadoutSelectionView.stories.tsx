import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@lucky-break/web-client/src/i18n';
import {
  LoadoutSelectionView,
  type LoadoutSelectionViewProps,
  type LoadoutFormPreset,
} from '@lucky-break/web-client/src/ui/scenes/LoadoutSelectionView';
import { DEFAULT_THEME, COLOR_BLIND_THEME } from '../../lib/themes';

/**
 * LoadoutSelectionView - Presentational Component
 *
 * Pure React component for the loadout selection scene imported directly from @lucky-break/web-client.
 * This component has no hooks or side effects - all data and callbacks come from props.
 *
 * Features:
 * - Animated ball preview with shape-specific rendering (sphere, octagon, D20)
 * - Form grid with selectable presets
 * - Trait/Sigil/Voice summary display
 * - Combined effects summary
 * - Locked form states
 * - Scroll hint for overflow content
 * - Fully localized with react-i18next
 * - Complex SVG rendering for D20 facets with dynamic coloring
 *
 * **Design System Integration**:
 * - Custom CSS classes with design system utilities
 * - Theme-aware colors via CSS custom properties
 * - Design system components (Button, Heading, Label, Mono) throughout
 *
 * **Location**: `packages/web-client/src/ui/scenes/LoadoutSelectionView.tsx`
 * **Container**: `packages/web-client/src/ui/scenes/LoadoutSelectionApp.tsx`
 */
const meta: Meta<typeof LoadoutSelectionView> = {
  title: 'Game Scenes/Loadout Selection View',
  component: LoadoutSelectionView,
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
  onSelectForm: (formId: string) => console.log('[Story] Selected form:', formId),
  onStart: () => console.log('[Story] Start clicked'),
};

// Helper to create D20 faces with varying colors
const createD20Faces = (baseColor: number) => {
  return Array.from({ length: 20 }, (_, index) => {
    const vertical = index / 19;
    const r = Math.round(((baseColor >> 16) & 0xff) * (1 - vertical * 0.3));
    const g = Math.round(((baseColor >> 8) & 0xff) * (1 - vertical * 0.3));
    const b = Math.round((baseColor & 0xff) * (1 - vertical * 0.3));
    return {
      id: index,
      points: `${10 + index * 4},${20 + index * 2} ${20 + index * 4},${30 + index} ${15 + index * 4},${35}`,
      fill: `rgb(${r}, ${g}, ${b})`,
      opacity: 0.72 + (1 - vertical) * 0.18,
    };
  });
};

const defaultBallStyle: CSSProperties = {
  '--loadout-ball-base': '#f4e8d8',
  '--loadout-ball-accent': '#ffcc66',
  '--loadout-ball-glow': 'rgba(244, 232, 216, 0.5)',
  '--loadout-ball-shimmer': 'rgba(255, 204, 102, 0.8)',
  '--loadout-trait-color': 'rgba(255, 204, 102, 0.85)',
  '--loadout-trait-trail': 'rgba(255, 220, 150, 0.4)',
  '--loadout-trait-soft': 'rgba(255, 204, 102, 0.16)',
} as CSSProperties;

const mockPresets: LoadoutFormPreset[] = [
  {
    id: 'ivory-orb',
    name: 'Ivory Orb',
    description: 'Balanced and reliable',
    preview: { shape: 'sphere', baseColor: 0xf4e8d8, accentColor: 0xffcc66 },
    trait: {
      id: 'fortune-favored',
      name: 'Fortune Favored',
      description: 'Luck-based trait',
      effectSummary: ['+10% luck bonus'],
    },
    sigil: {
      id: 'luck-rune',
      name: 'Luck Rune',
      description: 'Fortune sigil',
      effectSummary: ['Slight luck boost'],
    },
    voice: {
      id: 'chime',
      name: 'Chime',
      description: 'Gentle chime sound',
      effectSummary: ['Pleasant audio cues'],
    },
    cardSummary: ['Standard physics', 'Reliable bounces', 'No special effects'],
    combinedSummary: [
      '+10% scoring multiplier',
      'Standard ball physics',
      'Luck rune: Slight luck boost',
    ],
    selection: {
      form: 'ivory-orb',
      trait: 'fortune-favored',
      sigil: 'luck-rune',
      voice: 'chime',
    },
  },
  {
    id: 'stop-sign',
    name: 'Stop Sign',
    description: 'Unpredictable angles',
    preview: { shape: 'octagon', baseColor: 0xff6b4a, accentColor: 0xffd700 },
    trait: {
      id: 'entropy-bound',
      name: 'Entropy Bound',
      description: 'Chaos-aligned trait',
      effectSummary: ['Entropy gain boost'],
    },
    sigil: {
      id: 'chaos-knot',
      name: 'Chaos Knot',
      description: 'Entropy sigil',
      effectSummary: ['Extra entropy on hits'],
    },
    voice: {
      id: 'pulse',
      name: 'Pulse',
      description: 'Rhythmic pulse sound',
      effectSummary: ['Energetic audio cues'],
    },
    cardSummary: ['Sharp angle bounces', 'Chaos multiplier', 'Entropy boost'],
    combinedSummary: [
      '+25% chaos multiplier',
      'Octagon bounces: Unpredictable angles',
      'Chaos knot: Extra entropy on hits',
    ],
    selection: { form: 'stop-sign', trait: 'entropy-bound', sigil: 'chaos-knot', voice: 'pulse' },
  },
  {
    id: 'd20-diceform',
    name: 'D20 Diceform',
    description: 'Maximum variance',
    preview: { shape: 'd20', baseColor: 0x8a4fff, accentColor: 0xff66cc },
    trait: {
      id: 'double-edged',
      name: 'Double-Edged',
      description: 'High risk, high reward',
      effectSummary: ['+50% luck variance'],
    },
    sigil: {
      id: 'mirror-spiral',
      name: 'Mirror Spiral',
      description: 'Fate manipulation',
      effectSummary: ['Manipulate outcomes'],
    },
    voice: {
      id: 'static-choir',
      name: 'Static Choir',
      description: 'Ethereal chorus',
      effectSummary: ['Dramatic audio cues'],
    },
    cardSummary: ['Random face rolls', 'Critical hits', 'Fate weaving'],
    combinedSummary: [
      '+50% luck variance',
      'D20 mechanics: Random critical multipliers',
      'Mirror spiral: Manipulate outcomes',
    ],
    selection: {
      form: 'd20-diceform',
      trait: 'double-edged',
      sigil: 'mirror-spiral',
      voice: 'static-choir',
    },
  },
];

const defaultProps: LoadoutSelectionViewProps = {
  visible: true,
  presets: mockPresets,
  selectedFormId: 'ivory-orb',
  lockedForms: new Set(),
  pending: false,
  pulseActive: false,
  showScrollHint: false,
  theme: DEFAULT_THEME,
  ballStyle: defaultBallStyle,
  d20Faces: createD20Faces(0x8a4fff),
  d20PolygonPoints: '50,2 98,30 98,70 50,98 2,70 2,30',
  d20FacetLineSegments: [
    { id: '0-5', x1: '50', y1: '2', x2: '98', y2: '30' },
    { id: '5-10', x1: '98', y1: '30', x2: '98', y2: '70' },
    { id: '10-15', x1: '98', y1: '70', x2: '50', y2: '98' },
  ],
  ...mockActions,
};

/**
 * ## Default State
 *
 * Standard loadout selection with three ball forms.
 * Sphere selected by default with full preview details.
 */
export const Default: Story = {
  args: defaultProps,
};

/**
 * ## Octagon Selected
 *
 * Stop sign ball form selected, demonstrating shape-specific rendering.
 * Shows the "STOP" label overlay.
 */
export const OctagonSelected: Story = {
  args: {
    ...defaultProps,
    selectedFormId: 'stop-sign',
    ballStyle: {
      '--loadout-ball-base': '#ff6b4a',
      '--loadout-ball-accent': '#ffd700',
      '--loadout-ball-glow': 'rgba(255, 107, 74, 0.5)',
      '--loadout-ball-shimmer': 'rgba(255, 215, 0, 0.8)',
      '--loadout-trait-color': 'rgba(255, 215, 0, 0.85)',
      '--loadout-trait-trail': 'rgba(255, 230, 100, 0.4)',
      '--loadout-trait-soft': 'rgba(255, 215, 0, 0.16)',
    } as CSSProperties,
  },
};

/**
 * ## D20 Selected
 *
 * Twenty-sided die form with complex facet rendering.
 * Demonstrates SVG polygon faces with dynamic coloring.
 */
export const D20Selected: Story = {
  args: {
    ...defaultProps,
    selectedFormId: 'd20-diceform',
    ballStyle: {
      '--loadout-ball-base': '#8a4fff',
      '--loadout-ball-accent': '#ff66cc',
      '--loadout-ball-glow': 'rgba(138, 79, 255, 0.5)',
      '--loadout-ball-shimmer': 'rgba(255, 102, 204, 0.8)',
      '--loadout-trait-color': 'rgba(255, 102, 204, 0.85)',
      '--loadout-trait-trail': 'rgba(255, 150, 220, 0.4)',
      '--loadout-trait-soft': 'rgba(255, 102, 204, 0.16)',
    } as CSSProperties,
    d20Faces: createD20Faces(0x8a4fff),
  },
};

/**
 * ## With Locked Forms
 *
 * Some ball forms are locked and unavailable.
 * Tests disabled state styling and interaction blocking.
 */
export const WithLockedForms: Story = {
  args: {
    ...defaultProps,
    lockedForms: new Set(['stop-sign', 'd20-diceform']),
  },
};

/**
 * ## Start Pending
 *
 * Loading state after clicking the start button.
 * Button is disabled and shows pending text.
 */
export const StartPending: Story = {
  args: {
    ...defaultProps,
    pending: true,
  },
};

/**
 * ## Pulse Active
 *
 * Ball preview in pulsing animation state.
 * Triggered when selection changes.
 */
export const PulseActive: Story = {
  args: {
    ...defaultProps,
    pulseActive: true,
  },
};

/**
 * ## With Scroll Hint
 *
 * Shows scroll hint when content overflows.
 * Useful for responsive testing.
 */
export const WithScrollHint: Story = {
  args: {
    ...defaultProps,
    showScrollHint: true,
  },
};

/**
 * ## Many Forms
 *
 * Extended preset list testing grid layout and scrolling.
 */
export const ManyForms: Story = {
  args: {
    ...defaultProps,
    presets: [
      ...mockPresets,
      {
        id: 'nebular-jelly',
        name: 'Nebular Jelly',
        description: 'Soft and flowing',
        preview: { shape: 'sphere', baseColor: 0x4a90ff, accentColor: 0x66ffcc },
        trait: {
          id: 'stable-bias',
          name: 'Stable Bias',
          description: 'Stability-focused trait',
          effectSummary: ['Predictable outcomes'],
        },
        sigil: {
          id: 'serene-eye',
          name: 'Serene Eye',
          description: 'Calming sigil',
          effectSummary: ['Bonus calm'],
        },
        voice: {
          id: 'whisper',
          name: 'Whisper',
          description: 'Soft whisper sound',
          effectSummary: ['Gentle audio cues'],
        },
        cardSummary: ['Smooth bounces', 'Stability bonus', 'Calm effects'],
        combinedSummary: ['Stable bias: Predictable outcomes', 'Serene eye: Bonus calm'],
        selection: {
          form: 'nebular-jelly',
          trait: 'stable-bias',
          sigil: 'serene-eye',
          voice: 'whisper',
        },
      },
      {
        id: 'entropy-core',
        name: 'Entropy Core',
        description: 'Pure chaos',
        preview: { shape: 'sphere', baseColor: 0xff4400, accentColor: 0x00ffff },
        trait: {
          id: 'drifters-calm',
          name: "Drifter's Calm",
          description: 'Unpredictable movement trait',
          effectSummary: ['Chaotic motion'],
        },
        sigil: {
          id: 'void-bloom',
          name: 'Void Bloom',
          description: 'Void-based sigil',
          effectSummary: ['Entropy generation'],
        },
        voice: {
          id: 'coinfall',
          name: 'Coinfall',
          description: 'Coin drop sounds',
          effectSummary: ['Reward audio cues'],
        },
        cardSummary: ['Chaotic motion', 'Entropy generation', 'Void effects'],
        combinedSummary: ['Drifters calm: Unpredictable movement'],
        selection: {
          form: 'entropy-core',
          trait: 'drifters-calm',
          sigil: 'void-bloom',
          voice: 'coinfall',
        },
      },
    ],
    showScrollHint: true,
  },
};

/**
 * ## Empty Summary
 *
 * Selected form without combined summary details.
 * Shows empty state fallback.
 */
export const EmptySummary: Story = {
  args: {
    ...defaultProps,
    presets: [
      {
        id: 'crystal-probability',
        name: 'Crystal Probability',
        description: 'No effects',
        preview: { shape: 'sphere', baseColor: 0xcccccc, accentColor: 0x999999 },
        trait: {
          id: 'fortune-favored',
          name: 'Fortune Favored',
          description: 'Luck-based trait',
          effectSummary: [],
        },
        sigil: {
          id: 'luck-rune',
          name: 'Luck Rune',
          description: 'Fortune sigil',
          effectSummary: [],
        },
        voice: {
          id: 'chime',
          name: 'Chime',
          description: 'Gentle chime sound',
          effectSummary: [],
        },
        cardSummary: [],
        combinedSummary: [],
        selection: {
          form: 'crystal-probability',
          trait: 'fortune-favored',
          sigil: 'luck-rune',
          voice: 'chime',
        },
      },
    ],
    selectedFormId: 'crystal-probability',
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
 * when the loadout screen is closed or another scene is active.
 */
export const Hidden: Story = {
  args: {
    ...defaultProps,
    visible: false,
  },
};

/**
 * ## All Forms Locked
 *
 * Edge case where all forms are locked.
 * Start button should be disabled.
 */
export const AllFormsLocked: Story = {
  args: {
    ...defaultProps,
    lockedForms: new Set(['ivory-orb', 'stop-sign', 'd20-diceform']),
  },
};
