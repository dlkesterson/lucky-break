import type { Meta, StoryObj } from '@storybook/react-vite';

import { Heading, Label, Mono, type TypographyProps } from '../components/typography';

const meta = {
  title: 'Components/Typography',
  component: Heading,
  args: {
    children: 'Lucky Break',
  },
  argTypes: {
    children: { control: 'text' },
    className: { control: false },
  },
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Heading>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Scale: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4 text-left">
      <Heading {...args} />
      <Label>Score big with precision shots and orchestrated chaos.</Label>
      <Mono>seed: 4fa2-992c-e1d0</Mono>
    </div>
  ),
};

export const HUDStack: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-6 text-left">
      <Heading className="text-4xl">Streak Achieved</Heading>
      <Label>Maintain flawless launches to boost the bonus multiplier.</Label>
      <Mono>multiplier: x7.2</Mono>
    </div>
  ),
};
