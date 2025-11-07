import type { Meta, StoryObj } from '@storybook/react-vite';
import { Fragment } from 'react';

const palette = {
  dark: {
    background: 'hsl(240 51% 8%)',
    foreground: 'hsl(240 100% 97%)',
    muted: 'hsl(215 16% 47%)',
    mutedForeground: 'hsl(215 20% 81%)',
    accent: 'hsl(320 100% 65%)',
    accentForeground: 'hsl(240 51% 8%)',
    accentCombo: '#ff4dc4',
    accentPowerup: '#00ff9d',
    accentBloom: '#fffa88',
    secondary: 'hsl(217 33% 15%)',
    secondaryForeground: 'hsl(210 40% 98%)',
    card: 'hsl(229 39% 10%)',
    cardForeground: 'hsl(213 31% 91%)',
    destructive: 'hsl(0 84% 62%)',
    destructiveForeground: 'hsl(210 40% 98%)',
    ring: 'hsl(320 100% 65%)',
    border: 'hsl(218 23% 22%)',
  },
  light: {
    background: 'hsl(40 43% 97%)',
    foreground: 'hsl(224 71% 4%)',
    muted: 'hsl(214 32% 91%)',
    mutedForeground: 'hsl(222 47% 13%)',
    accent: 'hsl(25 95% 55%)',
    accentForeground: 'hsl(210 40% 98%)',
    accentCombo: '#ff4dc4',
    accentPowerup: '#00ff9d',
    accentBloom: '#fffa88',
    secondary: 'hsl(220 14% 96%)',
    secondaryForeground: 'hsl(222 47% 13%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(224 71% 4%)',
    destructive: 'hsl(0 72% 51%)',
    destructiveForeground: 'hsl(210 40% 98%)',
    ring: 'hsl(25 95% 55%)',
    border: 'hsl(214 32% 91%)',
  },
} as const;

type Mode = keyof typeof palette;

type TokenKey = keyof typeof palette.dark;

interface TokenConfig {
  readonly token: TokenKey;
  readonly label: string;
  readonly description?: string;
  readonly textToken?: TokenKey;
  readonly textOverride?: Partial<Record<Mode, string>>;
}

const tokenConfigs: TokenConfig[] = [
  {
    token: 'background',
    label: 'Background',
    description: 'Primary stage backdrop for canvas and HUD layers.',
    textToken: 'foreground',
  },
  {
    token: 'foreground',
    label: 'Foreground',
    description: 'Default text color for long-form copy and UI labels.',
    textToken: 'background',
  },
  {
    token: 'card',
    label: 'Card Surface',
    description: 'Framing for spotlight panels, modals, and overlays.',
    textToken: 'cardForeground',
  },
  {
    token: 'cardForeground',
    label: 'Card Foreground',
    description: 'High-contrast text to layer on card surfaces.',
    textToken: 'background',
  },
  {
    token: 'muted',
    label: 'Muted Surface',
    description: 'Low-emphasis containers and neutral rails.',
    textToken: 'foreground',
  },
  {
    token: 'mutedForeground',
    label: 'Muted Foreground',
    description: 'Secondary body copy and helper text.',
    textToken: 'background',
  },
  {
    token: 'accent',
    label: 'Accent Primary',
    description: 'Interactive focus color used for buttons and active states.',
    textToken: 'accentForeground',
  },
  {
    token: 'accentCombo',
    label: 'Combo Glow',
    description: 'Highlight for streak multipliers and jackpot cues.',
    textOverride: { dark: 'hsl(240 51% 8%)', light: 'hsl(224 71% 4%)' },
  },
  {
    token: 'accentPowerup',
    label: 'Power-Up',
    description: 'Positive feedback for collected power-ups.',
    textOverride: { dark: 'hsl(240 51% 8%)', light: 'hsl(224 71% 4%)' },
  },
  {
    token: 'accentBloom',
    label: 'Bloom Highlight',
    description: 'Energy shimmer for spotlighted elements.',
    textOverride: { dark: 'hsl(240 51% 8%)', light: 'hsl(224 71% 4%)' },
  },
  {
    token: 'secondary',
    label: 'Secondary Surface',
    description: 'Layer behind inline HUD widgets and chips.',
    textToken: 'secondaryForeground',
  },
  {
    token: 'secondaryForeground',
    label: 'Secondary Foreground',
    description: 'Content that sits on secondary surfaces.',
    textToken: 'background',
  },
  {
    token: 'destructive',
    label: 'Destructive',
    description: 'Alerts and hazard indicators.',
    textToken: 'destructiveForeground',
  },
  {
    token: 'ring',
    label: 'Focus Ring',
    description: 'Accessible outline for focus-visible states.',
    textToken: 'background',
  },
  {
    token: 'border',
    label: 'Border',
    description: 'Stroke color for panels, inputs, and separators.',
    textOverride: { dark: 'hsl(240 100% 97%)', light: 'hsl(224 71% 4%)' },
  },
];

const defaultTextColor: Record<Mode, string> = {
  dark: 'hsl(240 100% 97%)',
  light: 'hsl(224 71% 4%)',
};

const borderColor: Record<Mode, string> = {
  dark: 'rgba(255, 255, 255, 0.1)',
  light: 'rgba(12, 16, 32, 0.12)',
};

interface SwatchProps {
  readonly mode: Mode;
  readonly config: TokenConfig;
}

const Swatch = ({ mode, config }: SwatchProps): JSX.Element => {
  const value = palette[mode][config.token];
  const displayColor =
    config.textOverride?.[mode] ??
    (config.textToken ? palette[mode][config.textToken] : defaultTextColor[mode]);

  return (
    <div
      className="overflow-hidden rounded-xl border shadow-md"
      style={{ borderColor: borderColor[mode], background: 'transparent' }}
    >
      <div className="flex flex-col gap-2 p-4" style={{ background: value, color: displayColor }}>
        <span className="font-display text-lg tracking-tight">{config.label}</span>
        {config.description ? (
          <p className="text-sm leading-snug opacity-80">{config.description}</p>
        ) : null}
        <code className="font-mono text-xs uppercase tracking-wide opacity-90">{value}</code>
      </div>
    </div>
  );
};

const Section = ({ mode }: { readonly mode: Mode }) => (
  <Fragment>
    <header className="flex flex-col gap-1">
      <h2 className="font-display text-3xl tracking-tight">
        {mode === 'dark' ? 'Dark mode' : 'Light mode'}
      </h2>
      <p className="font-body text-sm text-muted">
        {mode === 'dark'
          ? 'Arcade default palette used in runtime and primary HUD overlays.'
          : 'High-key palette for accessibility previews and marketing tooling.'}
      </p>
    </header>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tokenConfigs.map((config) => (
        <Swatch key={`${mode}-${config.token}`} mode={mode} config={config} />
      ))}
    </div>
  </Fragment>
);

const PaletteDemo = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-10">
    <Section mode="dark" />
    <Section mode="light" />
  </div>
);

const meta = {
  title: 'Foundations/Palette',
  component: PaletteDemo,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PaletteDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => <PaletteDemo />,
};
