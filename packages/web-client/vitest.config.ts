import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const resolveFromPackage = (relativePath: string): string => {
    const rootDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(rootDir, relativePath);
};

const resolveFromCore = (relativePath: string): string =>
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core-domain', relativePath);

const resolveFromCli = (relativePath: string): string =>
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli-sim', relativePath);

export default defineConfig({
    resolve: {
        alias: [
            { find: /^app\/state$/, replacement: resolveFromCore('src/app/state.ts') },
            { find: /^app\/events$/, replacement: resolveFromCore('src/app/events.ts') },
            { find: /^app\/replay-buffer$/, replacement: resolveFromCore('src/app/replay-buffer.ts') },
            { find: 'app', replacement: resolveFromPackage('src/app') },
            { find: 'physics', replacement: resolveFromCore('src/physics') },
            { find: 'render', replacement: resolveFromPackage('src/render') },
            { find: 'audio', replacement: resolveFromPackage('src/audio') },
            { find: 'util', replacement: resolveFromCore('src/util') },
            { find: 'cli', replacement: resolveFromCli('src') },
            { find: 'input', replacement: resolveFromPackage('src/input') },
            { find: 'types', replacement: resolveFromCore('src/types') },
            { find: 'scenes', replacement: resolveFromPackage('src/scenes') },
            { find: 'game', replacement: resolveFromCore('src/game') },
            { find: /^config\/assets$/, replacement: resolveFromPackage('src/config/assets.ts') },
            { find: 'config', replacement: resolveFromCore('src/config') },
        ],
    },
    test: {
        environment: 'jsdom',
        include: ['tests/unit/**/*.spec.ts'],
        setupFiles: ['tests/setup/vitest.setup.ts'],
        clearMocks: true,
        coverage: {
            provider: 'v8',
            all: true,
            reportsDirectory: './coverage',
            reporter: ['text', 'json', 'json-summary', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/app/main.ts',
                'src/render/stage.ts',
                'src/scenes/**/*',
                'src/types/**/*',
            ],
            thresholds: {
                statements: 80,
                branches: 75,
                functions: 75,
                lines: 80,
            },
        },
    },
});
