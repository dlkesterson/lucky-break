import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('audio/soundbank validation', () => {
    const importModule = async () => {
        const module = await import('audio/soundbank');
        return module;
    };

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(async () => {
        const { __setSoundbankLoaderForTesting, __setSoundbankImporterForTesting } = await importModule();
        __setSoundbankLoaderForTesting(null);
        __setSoundbankImporterForTesting();
    });

    it('throws when the soundbank payload is missing or malformed', async () => {
        const { __loadRawSoundbankForTesting, __setSoundbankImporterForTesting } = await importModule();

        __setSoundbankImporterForTesting(async () => ({ default: undefined }));
        await expect(__loadRawSoundbankForTesting()).rejects.toThrow('Soundbank JSON payload is malformed.');
    });

    it('rejects entries that do not provide an id', async () => {
        const { __setSoundbankLoaderForTesting, loadSoundbank } = await importModule();

        __setSoundbankLoaderForTesting(async () => ({
            loops: [
                {
                    url: './demo.wav',
                    category: 'music',
                },
            ],
            sfx: [],
        }));

        await expect(loadSoundbank()).rejects.toThrow('Soundbank entry is missing a valid "id" field.');
    });

    it('rejects entries that do not provide a url', async () => {
        const { __setSoundbankLoaderForTesting, loadSoundbank } = await importModule();

        __setSoundbankLoaderForTesting(async () => ({
            loops: [
                {
                    id: 'demo-loop',
                    category: 'music',
                },
            ],
            sfx: [],
        }));

        await expect(loadSoundbank()).rejects.toThrow('Soundbank entry "demo-loop" is missing a valid "url" field.');
    });

    it('rejects entries with urls that are not registered assets', async () => {
        const { __setSoundbankLoaderForTesting, loadSoundbank } = await importModule();

        __setSoundbankLoaderForTesting(async () => ({
            loops: [
                {
                    id: 'missing-asset',
                    url: './definitely-not-present.wav',
                    category: 'music',
                },
            ],
            sfx: [],
        }));

        await expect(loadSoundbank()).rejects.toThrow('Soundbank asset not found for path: ./definitely-not-present.wav');
    });
});
