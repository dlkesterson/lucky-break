import { describe, expect, it, vi } from 'vitest';
import { createPreloader, type ProgressReporter } from 'app/preloader';

describe('createPreloader', () => {
    const createContainer = () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        return container;
    };

    it('loads assets and presents the start prompt', async () => {
        const container = createContainer();
        const loadAssets = vi.fn(async (report: ProgressReporter) => {
            report({ loaded: 2, total: 4 });
            report({ loaded: 4, total: 4 });
        });

        const preloader = createPreloader({
            container,
            promptText: 'Tap to start',
            loadAssets,
        });

        await preloader.prepare();

        expect(preloader.status()).toBe('awaiting-interaction');
        expect(preloader.progress()).toEqual({ loaded: 4, total: 4 });
        expect(loadAssets).toHaveBeenCalledTimes(1);

        const prompt = container.querySelector('button[data-role="start-prompt"]');
        expect(prompt).not.toBeNull();
        expect(prompt?.textContent).toContain('Tap to start');
        preloader.destroy();
        container.remove();
    });

    it('invokes the start callback and completes once the user interacts', async () => {
        const container = createContainer();
        const onStart = vi.fn();

        const preloader = createPreloader({
            container,
            loadAssets: async (report: ProgressReporter) => {
                report({ loaded: 1, total: 1 });
            },
            onStart,
        });

        await preloader.prepare();

        const prompt = container.querySelector<HTMLButtonElement>('button[data-role="start-prompt"]')!;
        prompt.click();
        await Promise.resolve();

        expect(onStart).toHaveBeenCalledTimes(1);
        expect(preloader.status()).toBe('completed');
        expect(container.querySelector('button[data-role="start-prompt"]')).toBeNull();

        preloader.destroy();
        container.remove();
    });

    it('marks the preloader as failed when asset loading throws', async () => {
        const container = createContainer();
        const error = new Error('load failed');

        const preloader = createPreloader({
            container,
            loadAssets: async () => {
                throw error;
            },
        });

        await expect(preloader.prepare()).rejects.toThrow(error);
        expect(preloader.status()).toBe('failed');
        expect(container.querySelector('button[data-role="start-prompt"]')).toBeNull();

        preloader.destroy();
        container.remove();
    });
});
