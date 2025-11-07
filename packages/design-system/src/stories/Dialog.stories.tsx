import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/dialog';

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    defaultOpen: true,
  },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger asChild>
        <Button variant="subtle">Open pause dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pause mission?</DialogTitle>
          <DialogDescription>
            Suspend the run to review loadout, swap power-ups, or tweak assists. Progress is saved
            but the combo meter decays while paused.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-muted">
            Resume before the beat drops to keep perfect sync timings and preserve the streak bonus.
          </div>
          <div className="grid gap-2 text-sm text-muted">
            <span className="flex items-center justify-between">
              <span className="text-fg/80">Elapsed time</span>
              <span>06:12</span>
            </span>
            <span className="flex items-center justify-between">
              <span className="text-fg/80">Active combo</span>
              <span>x5.4</span>
            </span>
            <span className="flex items-center justify-between">
              <span className="text-fg/80">Foreshadow cue</span>
              <span>Incoming hazard sweep</span>
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button>Resume mission</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Controlled: Story = {
  args: {
    open: true,
  },
  parameters: {
    controls: { exclude: ['open'] },
  },
  render: (args) => (
    <Dialog {...args}>
      <DialogContent overlayClassName="bg-black/80 backdrop-blur">
        <DialogHeader>
          <DialogTitle>Confirm quit</DialogTitle>
          <DialogDescription>
            Leaving now ends the run and logs the current payout. Are you sure you want to bail out?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">Keep playing</Button>
          <Button variant="destructive">Exit run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
