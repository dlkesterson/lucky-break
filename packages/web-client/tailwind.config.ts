import type { Config } from 'tailwindcss';
import preset from '@lucky-break/design-system/tailwind-preset';

const config: Config = {
    presets: [preset],
    content: [
        './index.html',
        './src/**/*.{ts,tsx}',
        '../design-system/src/**/*.{ts,tsx}'
    ],
    theme: {
        extend: {
            fontFamily: {
                hud: ['var(--font-display, "Luckiest Guy")', 'var(--font-ui, "Overpass")', 'cursive']
            },
            zIndex: {
                hud: '1000'
            }
        }
    }
};

export default config;
