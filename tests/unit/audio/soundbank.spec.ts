import { describe, expect, it, vi } from 'vitest';
import {
    loadSoundbank,
    countSoundbankAssets,
    prefetchSoundbankAssets,
    requireSoundbankEntry,
} from 'audio/soundbank';

const createFetchMock = () => vi.fn(async () => new Response(null));

describe('audio/soundbank', () => {
    it('loads loop and sfx entries with resolved urls', async () => {
        const soundbank = await loadSoundbank();

        const calm = requireSoundbankEntry(soundbank, 'calm');
        const brick = requireSoundbankEntry(soundbank, 'brick-hit-low');

        expect(calm.url).toMatch(/073_low-drums/);
        expect(brick.url).toMatch(/bass-poweron/);
    });

    it('prefetches all assets and reports progress', async () => {
        const soundbank = await loadSoundbank();
        const totalAssets = countSoundbankAssets(soundbank);
        const fetchMock = createFetchMock();
        const progressCalls: number[] = [];

        await prefetchSoundbankAssets(soundbank, ({ loaded, total }) => {
            progressCalls.push(loaded);
            expect(total).toBe(totalAssets);
        }, fetchMock);

        expect(fetchMock).toHaveBeenCalledTimes(totalAssets);
        expect(progressCalls.at(-1)).toBe(totalAssets);
    });
});
