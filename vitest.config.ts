import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const resolveFromRoot = (relativePath: string): string => {
    const rootDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(rootDir, relativePath);
};

export default defineConfig({
    resolve: {
        alias: {
            'app': resolveFromRoot('src/app'),
            'physics': resolveFromRoot('src/physics'),
            'render': resolveFromRoot('src/render'),
            'audio': resolveFromRoot('src/audio'),
            'util': resolveFromRoot('src/util'),
            'cli': resolveFromRoot('src/cli'),
            'input': resolveFromRoot('src/input'),
            'types': resolveFromRoot('src/types'),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['tests/unit/**/*.spec.ts'],
        setupFiles: ['tests/setup/vitest.setup.ts'],
        clearMocks: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.{ts,tsx}'],
        },
    },
});
