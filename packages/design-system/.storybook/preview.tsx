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
      test: 'todo',
    },
    backgrounds: {
      default: 'Synth Night',
      values: [
        { name: 'Synth Night', value: '#0a0a1f' },
        { name: 'Arcade Daybreak', value: '#faf8f4' },
        { name: 'Dark', value: '#02030a' },
        { name: 'Night', value: '#0f1729' },
      ],
    },
    docs: {
      theme: docsTheme,
    },
    viewport: {
      viewports: {
        // iPhone models
        iphone14Pro: {
          name: 'iPhone 14 Pro',
          styles: {
            width: '393px',
            height: '852px',
          },
          type: 'mobile',
        },
        iphone14ProMax: {
          name: 'iPhone 14 Pro Max',
          styles: {
            width: '430px',
            height: '932px',
          },
          type: 'mobile',
        },
        iphoneSE: {
          name: 'iPhone SE',
          styles: {
            width: '375px',
            height: '667px',
          },
          type: 'mobile',
        },
        // Android models
        pixelXL: {
          name: 'Pixel XL',
          styles: {
            width: '411px',
            height: '731px',
          },
          type: 'mobile',
        },
        galaxyS21: {
          name: 'Galaxy S21',
          styles: {
            width: '360px',
            height: '800px',
          },
          type: 'mobile',
        },
        // Tablets
        ipadMini: {
          name: 'iPad Mini',
          styles: {
            width: '744px',
            height: '1133px',
          },
          type: 'tablet',
        },
        ipadPro11: {
          name: 'iPad Pro 11"',
          styles: {
            width: '834px',
            height: '1194px',
          },
          type: 'tablet',
        },
        // Landscape variants
        iphone14ProLandscape: {
          name: 'iPhone 14 Pro (Landscape)',
          styles: {
            width: '852px',
            height: '393px',
          },
          type: 'mobile',
        },
        galaxyS21Landscape: {
          name: 'Galaxy S21 (Landscape)',
          styles: {
            width: '800px',
            height: '360px',
          },
          type: 'mobile',
        },
      },
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
