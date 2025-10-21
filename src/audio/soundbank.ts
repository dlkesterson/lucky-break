export type SoundbankCategory = string;

export interface SoundbankEntry {
    readonly id: string;
    readonly url: string;
    readonly category: SoundbankCategory;
    readonly bpm?: number;
    readonly gain?: number;
}

export interface Soundbank {
    readonly loops: readonly SoundbankEntry[];
    readonly sfx: readonly SoundbankEntry[];
}

interface RawSoundbank {
    readonly loops?: readonly RawSoundbankEntry[];
    readonly sfx?: readonly RawSoundbankEntry[];
}

interface RawSoundbankEntry {
    readonly id?: unknown;
    readonly url?: unknown;
    readonly category?: unknown;
    readonly bpm?: unknown;
    readonly gain?: unknown;
}

interface SoundbankProgressEvent {
    readonly entry: SoundbankEntry;
    readonly loaded: number;
    readonly total: number;
}

const SOUND_ASSET_PREFIX = '../../assets/samples/';

const SOUND_ASSET_URLS = import.meta.glob('../../assets/samples/*', {
    eager: true,
    as: 'url',
});

let cachedSoundbank: Promise<Soundbank> | null = null;

const loadRawSoundbank = async (): Promise<RawSoundbank> => {
    const module = (await import('../../assets/samples/soundbank.json')) as { default?: RawSoundbank };
    const data = module.default;
    if (!data || typeof data !== 'object') {
        throw new TypeError('Soundbank JSON payload is malformed.');
    }
    return data;
};

const toAssetKey = (relativePath: string): string => {
    const normalized = relativePath.replace(/^\.\//u, '').replace(/^\//u, '');
    return `${SOUND_ASSET_PREFIX}${normalized}`;
};

const resolveAssetUrl = (relativePath: string): string => {
    const key = toAssetKey(relativePath);
    const url = SOUND_ASSET_URLS[key];
    if (!url) {
        throw new Error(`Soundbank asset not found for path: ${relativePath}`);
    }
    return url;
};

const normalizeEntry = (raw: RawSoundbankEntry, fallbackCategory: SoundbankCategory): SoundbankEntry => {
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) {
        throw new Error('Soundbank entry is missing a valid "id" field.');
    }

    if (typeof raw.url !== 'string' || raw.url.trim() === '') {
        throw new Error(`Soundbank entry "${id}" is missing a valid "url" field.`);
    }

    const url = resolveAssetUrl(raw.url);
    const category = typeof raw.category === 'string' ? raw.category : fallbackCategory;

    const bpm = typeof raw.bpm === 'number' && Number.isFinite(raw.bpm) ? raw.bpm : undefined;
    const gain = typeof raw.gain === 'number' && Number.isFinite(raw.gain) ? raw.gain : undefined;

    return {
        id,
        url,
        category,
        ...(bpm !== undefined ? { bpm } : {}),
        ...(gain !== undefined ? { gain } : {}),
    } satisfies SoundbankEntry;
};

const normalizeSoundbank = (raw: RawSoundbank): Soundbank => {
    const loops = (raw.loops ?? []).map((entry) => normalizeEntry(entry, 'music'));
    const sfx = (raw.sfx ?? []).map((entry) => normalizeEntry(entry, 'sfx'));
    return {
        loops,
        sfx,
    } satisfies Soundbank;
};

const listAllEntries = (soundbank: Soundbank): readonly SoundbankEntry[] => [
    ...soundbank.loops,
    ...soundbank.sfx,
];

export const loadSoundbank = async (): Promise<Soundbank> => {
    cachedSoundbank ??= loadRawSoundbank().then(normalizeSoundbank);
    return cachedSoundbank;
};

export const countSoundbankAssets = (soundbank: Soundbank): number => listAllEntries(soundbank).length;

export const prefetchSoundbankAssets = async (
    soundbank: Soundbank,
    onProgress?: (event: SoundbankProgressEvent) => void,
    fetchFn: typeof fetch = fetch,
): Promise<void> => {
    const entries = listAllEntries(soundbank);
    const total = entries.length;

    if (total === 0) {
        return;
    }

    let loaded = 0;
    for (const entry of entries) {
        await fetchFn(entry.url, { cache: 'force-cache' });
        loaded += 1;
        onProgress?.({ entry, loaded, total });
    }
};

export const findSoundbankEntry = (soundbank: Soundbank, id: string): SoundbankEntry | undefined => {
    const trimmed = id.trim();
    return listAllEntries(soundbank).find((entry) => entry.id === trimmed);
};

export const requireSoundbankEntry = (soundbank: Soundbank, id: string): SoundbankEntry => {
    const entry = findSoundbankEntry(soundbank, id);
    if (!entry) {
        throw new Error(`Soundbank entry not found for id: ${id}`);
    }
    return entry;
};

