import type { Meta, StoryObj } from '@storybook/react-vite';

import { Panel } from '../components/panel';

const meta = {
  title: 'Components/Panel',
  component: Panel,
  args: {
    children: 'Panels frame HUD overlays and modal surfaces across the Lucky Break UI.',
    tone: 'default',
  },
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid gap-6 sm:grid-cols-3">
      <Panel tone="default" className="h-full">
        <div className="font-display text-2xl text-fg">Default</div>
        <p className="mt-2 text-sm text-muted">Rich card styling used for spotlight moments.</p>
      </Panel>
      <Panel tone="muted" className="h-full">
        <div className="font-display text-2xl text-fg">Muted</div>
        <p className="mt-2 text-sm text-muted">
          Great for inline groupings, secondary information, and controls.
        </p>
      </Panel>
      <Panel tone="accent" className="h-full">
        <div className="font-display text-2xl text-fg">Accent</div>
        <p className="mt-2 text-sm text-muted">
          Pops for call-to-action flows and priority status messages.
        </p>
      </Panel>
    </div>
  ),
};
