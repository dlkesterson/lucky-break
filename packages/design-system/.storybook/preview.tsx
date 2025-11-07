import type { Preview } from '@storybook/react-vite';

import { DesignSystemProvider } from '../src/providers/design-system-provider';
import '../src/styles.css';

const docsTheme = {
  base: 'dark',
  brandTitle: 'Lucky Break Design System',
  colorPrimary: '#ff4dc4',
  colorSecondary: '#00ff9d',
  appBg: '#0a0a1f',
  appContentBg: 'rgba(10, 10, 31, 0.92)',
  appBorderColor: 'rgba(255, 255, 255, 0.08)',
  appBorderRadius: 16,
  fontBase: '"Overpass", system-ui, sans-serif',
  fontCode:
    '"Overpass Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
    backgrounds: {
      default: 'Synth Night',
      values: [
        { name: 'Synth Night', value: '#0a0a1f' },
        { name: 'Arcade Daybreak', value: '#faf8f4' },
      ],
    },
    docs: {
      theme: docsTheme,
    },
  },
  decorators: [
    (Story) => (
      <DesignSystemProvider>
        <Story />
      </DesignSystemProvider>
    ),
  ],
};

export default preview;
