import type { Meta, StoryObj } from '@storybook/react-vite';

import { Progress } from '../components/progress';

const meta = {
  title: 'Components/Progress',
  component: Progress,
  args: {
    value: 72,
    max: 100,
    className: 'w-72',
  },
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Progress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playback: Story = {
  args: {
    'aria-label': 'Combo meter progress',
  },
};

export const NearComplete: Story = {
  args: {
    value: 95,
    'aria-label': 'Incoming jackpot meter',
  },
};

export const Empty: Story = {
  args: {
    value: 0,
    'aria-label': 'Reset meter',
  },
};
