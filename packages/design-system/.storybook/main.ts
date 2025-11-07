import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
    stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    addons: [
        '@chromatic-com/storybook',
        '@storybook/addon-docs',
        '@storybook/addon-onboarding',
        '@storybook/addon-a11y',
        '@storybook/addon-vitest',
    ],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    async viteFinal(config) {
        return mergeConfig(config, {
            resolve: {
                alias: {
                    'ui/scenes': path.resolve(__dirname, '../../web-client/src/ui/scenes'),
                    'ui/state': path.resolve(__dirname, '../../web-client/src/ui/state'),
                    'ui/hooks': path.resolve(__dirname, '../../web-client/src/ui/hooks'),
                    'render/theme': path.resolve(__dirname, '../../web-client/src/render/theme'),
                    'render/hud': path.resolve(__dirname, '../../web-client/src/render/hud'),
                },
            },
        });
    },
};
export default config;