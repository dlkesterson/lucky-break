import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../components/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip';

const meta = {
  title: 'Components/Tooltip',
  component: TooltipContent,
  args: {
    children: 'Bonus: +250 XP',
    side: 'top',
  },
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TooltipContent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost">Hover for bonus intel</Button>
        </TooltipTrigger>
        <TooltipContent {...args} />
      </Tooltip>
    </TooltipProvider>
  ),
};

export const Directions: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-6">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <Tooltip key={side}>
            <TooltipTrigger asChild>
              <Button variant="subtle">{side.toUpperCase()}</Button>
            </TooltipTrigger>
            <TooltipContent side={side}>Foreshadow ping ({side})</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  ),
};
