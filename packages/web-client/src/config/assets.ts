export type StaticAssetKind = 'texture' | 'ui';

export interface StaticAsset {
    readonly id: string;
    readonly kind: StaticAssetKind;
    readonly path: string;
    readonly url: string;
}

export interface AssetManifestReport {
    readonly missing: readonly string[];
    readonly total: number;
}

const TEXTURE_MANIFEST = {
    starfieldBackground: 'textures/starfield.png',
} as const;

const UI_MANIFEST = {
    mainBanner: 'ui/banner.png',
} as const;

type TextureAssetId = keyof typeof TEXTURE_MANIFEST;
type UiAssetId = keyof typeof UI_MANIFEST;

interface StaticAssetDescriptor {
    readonly kind: StaticAssetKind;
    readonly id: string;
    readonly path: string;
}

const STATIC_ASSET_PREFIX = '../../assets/';

const STATIC_ASSET_MODULES: Record<string, unknown> = import.meta.glob('../../assets/**/*', {
    eager: true,
    query: '?url',
    import: 'default',
});

const createDescriptor = (kind: StaticAssetKind, id: string, path: string): StaticAssetDescriptor => ({
    kind,
    id,
    path,
});

const STATIC_ASSET_DESCRIPTORS: readonly StaticAssetDescriptor[] = [
    ...Object.entries(TEXTURE_MANIFEST).map(([id, path]) => createDescriptor('texture', id, path)),
    ...Object.entries(UI_MANIFEST).map(([id, path]) => createDescriptor('ui', id, path)),
];

const toModuleKey = (path: string): string => `${STATIC_ASSET_PREFIX}${path}`;

const isString = (value: unknown): value is string => typeof value === 'string';

const resolveModuleUrl = (descriptor: StaticAssetDescriptor): string => {
    const key = toModuleKey(descriptor.path);
    const module = STATIC_ASSET_MODULES[key];
    if (!isString(module)) {
        throw new Error(`Static asset not found for path: ${descriptor.path}`);
    }
    return module;
};

export const listTextureAssets = (): readonly StaticAsset[] =>
    STATIC_ASSET_DESCRIPTORS.filter((descriptor) => descriptor.kind === 'texture').map((descriptor) => ({
        id: descriptor.id,
        kind: descriptor.kind,
        path: descriptor.path,
        url: resolveModuleUrl(descriptor),
    }));

export const listUiAssets = (): readonly StaticAsset[] =>
    STATIC_ASSET_DESCRIPTORS.filter((descriptor) => descriptor.kind === 'ui').map((descriptor) => ({
        id: descriptor.id,
        kind: descriptor.kind,
        path: descriptor.path,
        url: resolveModuleUrl(descriptor),
    }));

export const listAllStaticAssets = (): readonly StaticAsset[] =>
    STATIC_ASSET_DESCRIPTORS.map((descriptor) => ({
        id: descriptor.id,
        kind: descriptor.kind,
        path: descriptor.path,
        url: resolveModuleUrl(descriptor),
    }));

export const resolveTextureAsset = (id: TextureAssetId): StaticAsset => {
    const path = TEXTURE_MANIFEST[id];
    const descriptor = STATIC_ASSET_DESCRIPTORS.find((candidate) => candidate.path === path);
    if (!descriptor) {
        throw new Error(`Texture asset descriptor missing for id: ${id}`);
    }
    return {
        id,
        kind: descriptor.kind,
        path: descriptor.path,
        url: resolveModuleUrl(descriptor),
    };
};

export const resolveUiAsset = (id: UiAssetId): StaticAsset => {
    const path = UI_MANIFEST[id];
    const descriptor = STATIC_ASSET_DESCRIPTORS.find((candidate) => candidate.path === path);
    if (!descriptor) {
        throw new Error(`UI asset descriptor missing for id: ${id}`);
    }
    return {
        id,
        kind: descriptor.kind,
        path: descriptor.path,
        url: resolveModuleUrl(descriptor),
    };
};

export const verifyAssetManifest = (): AssetManifestReport => {
    const missing = STATIC_ASSET_DESCRIPTORS.filter((descriptor) => {
        const module = STATIC_ASSET_MODULES[toModuleKey(descriptor.path)];
        return !isString(module);
    }).map((descriptor) => descriptor.path);

    return {
        missing,
        total: STATIC_ASSET_DESCRIPTORS.length,
    };
};
