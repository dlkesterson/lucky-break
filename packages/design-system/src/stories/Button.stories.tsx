import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../components/button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Claim Reward',
    variant: 'default',
    size: 'default',
    type: 'button',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'subtle', 'outline', 'ghost', 'link', 'destructive'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
    asChild: { control: false },
    className: { control: false },
  },
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap gap-4">
      {(['default', 'subtle', 'outline', 'ghost', 'link', 'destructive'] as const).map(
        (variant) => (
          <Button key={variant} variant={variant}>
            {variant.charAt(0).toUpperCase() + variant.slice(1)}
          </Button>
        ),
      )}
    </div>
  ),
};

export const Sizes: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Pause">
        ||
      </Button>
    </div>
  ),
};
