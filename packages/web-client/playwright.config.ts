import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const playwrightTsconfig = path.resolve(
    fileURLToPath(new URL('./tsconfig.playwright.json', import.meta.url)),
);

if (!process.env.TS_NODE_PROJECT) {
    process.env.TS_NODE_PROJECT = playwrightTsconfig;
}

if (!process.env.TSX_TSCONFIG) {
    process.env.TSX_TSCONFIG = playwrightTsconfig;
}

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    workers: 3,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        headless: true,
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'pnpm --filter @lucky-break/web-client exec vite --host 0.0.0.0 --port 4173 --clearScreen false',
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
