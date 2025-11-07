import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel, Heading, Label, Button } from '../../index';

/**
 * Example Scene Template
 *
 * This is a template for creating new scene documentation stories.
 * Copy this file and modify it for your scene.
 *
 * ## Usage
 *
 * 1. Copy this file to a new name (e.g., `MyScene.stories.tsx`)
 * 2. Update the meta.title to match your scene
 * 3. Replace the example content with your scene description
 * 4. Add multiple story exports for different states
 * 5. Run `pnpm storybook` in the design-system package to view
 *
 * ## Example States to Document
 *
 * - Default/initial state
 * - Loading state
 * - Error state
 * - Success state
 * - Empty state
 * - Various data scenarios
 */
const meta = {
  title: 'Game Scenes/Example Template',
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'Synth Night',
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * ## Default State
 *
 * Shows the scene in its default/initial configuration.
 */
export const Default: Story = {
  render: () => (
    <Panel className="max-w-2xl space-y-4 p-6">
      <Heading>Example Scene</Heading>
      <Label>
        This is a template for documenting game scenes. Replace this content with a description of
        your scene's purpose and features.
      </Label>
      <div className="flex gap-3">
        <Button variant="default">Primary Action</Button>
        <Button variant="outline">Secondary Action</Button>
      </div>
    </Panel>
  ),
};

/**
 * ## Loading State
 *
 * Shows the scene while data is being loaded or processed.
 */
export const Loading: Story = {
  render: () => (
    <Panel className="max-w-2xl space-y-4 p-6">
      <Heading>Example Scene</Heading>
      <Label>Loading data...</Label>
      <div className="flex gap-3">
        <Button variant="default" disabled>
          Loading...
        </Button>
      </div>
    </Panel>
  ),
};

/**
 * ## Empty State
 *
 * Shows the scene when there's no data to display.
 */
export const Empty: Story = {
  render: () => (
    <Panel className="max-w-2xl space-y-4 p-6">
      <Heading>Example Scene</Heading>
      <Label className="text-sm opacity-75">
        No data available. Try interacting with the game to populate this scene.
      </Label>
    </Panel>
  ),
};

/**
 * ## With Data
 *
 * Shows the scene with sample data populated.
 */
export const WithData: Story = {
  render: () => (
    <Panel className="max-w-2xl space-y-4 p-6">
      <Heading>Example Scene</Heading>
      <div className="space-y-2">
        <Label>Data Item 1: Active</Label>
        <Label>Data Item 2: Completed</Label>
        <Label>Data Item 3: Pending</Label>
      </div>
      <div className="flex gap-3">
        <Button variant="default">Confirm</Button>
        <Button variant="destructive">Cancel</Button>
      </div>
    </Panel>
  ),
};
