import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('./tailwind.preset.cjs');

const config: Config = {
    presets: [preset],
    content: [
        './src/**/*.{ts,tsx}',
        '../web-client/src/**/*.{ts,tsx}',
    ],
};

export default config;
