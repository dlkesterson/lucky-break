import type { Meta, StoryObj } from '@storybook/react-vite';

import { Slider } from '../components/slider';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  args: {
    defaultValue: [48],
    min: 0,
    max: 100,
    step: 1,
    className: 'w-72',
    'aria-label': 'Audio cue intensity',
  },
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: [32],
  },
};

export const RangeSelection: Story = {
  args: {
    defaultValue: [30, 70],
    max: 100,
  },
};
