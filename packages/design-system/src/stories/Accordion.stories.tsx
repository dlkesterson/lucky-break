import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/accordion';

const meta = {
  title: 'Components/Accordion',
  component: Accordion,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

const demoItems = [
  {
    value: 'physics',
    title: 'Predictable physics',
    body: 'We run Matter.js in lockstep with the deterministic replay harness so every launch feels fair whether it is live or recorded.',
  },
  {
    value: 'foreshadow',
    title: 'Foreshadow cues',
    body: 'Tone.js transport events drive haptic and audio foreshadowing so high-stakes moments get the right build up.',
  },
  {
    value: 'replay',
    title: 'Replay buffer',
    body: 'Session events stream into a rolling buffer that can be serialized with microsecond precision for instant replays.',
  },
];

export const Single: Story = {
  args: {
    type: 'single',
    collapsible: true,
    defaultValue: demoItems[0]?.value,
    className: 'w-full max-w-xl rounded-2xl border border-white/10 bg-bg/80 p-4 shadow-xl',
  },
  render: (args) => (
    <Accordion {...args}>
      {demoItems.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.title}</AccordionTrigger>
          <AccordionContent>{item.body}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  ),
};

export const Multiple: Story = {
  args: {
    type: 'multiple',
    defaultValue: demoItems.slice(0, 2).map((item) => item.value),
    className: 'w-full max-w-xl rounded-2xl border border-white/10 bg-bg/80 p-4 shadow-xl',
  },
  render: (args) => (
    <Accordion {...args}>
      {demoItems.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.title}</AccordionTrigger>
          <AccordionContent>{item.body}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  ),
};
