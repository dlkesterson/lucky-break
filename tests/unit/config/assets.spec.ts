import { describe, expect, it } from 'vitest';

import {
    listAllStaticAssets,
    resolveTextureAsset,
    resolveUiAsset,
    verifyAssetManifest,
} from 'config/assets';

describe('config/assets', () => {
    it('reports no missing static assets', () => {
        const report = verifyAssetManifest();
        expect(report.total).toBeGreaterThan(0);
        expect(report.missing).toHaveLength(0);
    });

    it('resolves texture assets to urls', () => {
        const texture = resolveTextureAsset('starfieldBackground');
        expect(texture.url).toContain('starfield');
        expect(texture.kind).toBe('texture');
    });

    it('lists all static assets with urls', () => {
        const assets = listAllStaticAssets();
        expect(assets.length).toBeGreaterThan(0);
        for (const asset of assets) {
            const isAbsolute = asset.url.startsWith('http://') || asset.url.startsWith('https://');
            const isRootRelative = asset.url.startsWith('/');
            expect(isAbsolute || isRootRelative).toBe(true);
        }
    });

    it('resolves ui assets to urls', () => {
        const banner = resolveUiAsset('mainBanner');
        expect(banner.url).toContain('banner');
        expect(banner.kind).toBe('ui');
    });
});
