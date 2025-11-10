import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const resolveFromWebClient = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, new URL('../../web-client/', import.meta.url)));

const resolveFromCore = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, new URL('../../core-domain/', import.meta.url)));

const resolveFromCli = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, new URL('../../cli-sim/', import.meta.url)));

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
                alias: [
                    // Mirror web-client's vite.config.ts alias structure
                    { find: /^app\/state$/, replacement: resolveFromCore('./src/app/state.ts') },
                    { find: /^app\/events$/, replacement: resolveFromCore('./src/app/events.ts') },
                    { find: /^app\/replay-buffer$/, replacement: resolveFromCore('./src/app/replay-buffer.ts') },
                    { find: 'app', replacement: resolveFromWebClient('./src/app') },
                    { find: 'physics', replacement: resolveFromCore('./src/physics') },
                    { find: 'render', replacement: resolveFromWebClient('./src/render') },
                    { find: 'ui', replacement: resolveFromWebClient('./src/ui') },
                    { find: 'audio', replacement: resolveFromWebClient('./src/audio') },
                    { find: 'util', replacement: resolveFromCore('./src/util') },
                    { find: 'cli', replacement: resolveFromCli('./src') },
                    { find: 'input', replacement: resolveFromWebClient('./src/input') },
                    { find: 'types', replacement: resolveFromCore('./src/types') },
                    { find: 'scenes', replacement: resolveFromWebClient('./src/scenes') },
                    { find: 'game', replacement: resolveFromCore('./src/game') },
                    { find: /^config\/assets$/, replacement: resolveFromWebClient('./src/config/assets.ts') },
                    { find: 'config', replacement: resolveFromCore('./src/config') },
                ],
            },
        });
    },
};
export default config;