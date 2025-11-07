const BRAND_FONT_DESCRIPTORS = [
    '48px "Luckiest Guy"',
    '400 24px "Overpass"',
    '600 16px "Overpass Mono"',
] as const;

interface FontProgress {
    readonly loaded: number;
    readonly total: number;
}

let preloadPromise: Promise<void> | null = null;
let fontsReady = false;

const performFontLoad = async (
    descriptors: readonly string[],
    report?: (progress: FontProgress) => void,
): Promise<void> => {
    const fontFaceSet = typeof document !== 'undefined' ? document.fonts : undefined;
    const total = descriptors.length;
    if (!fontFaceSet) {
        report?.({ loaded: total, total });
        return;
    }

    let loaded = 0;
    for (const descriptor of descriptors) {
        await fontFaceSet.load(descriptor);
        loaded += 1;
        report?.({ loaded, total });
    }

    await fontFaceSet.ready;
    report?.({ loaded: total, total });
};

const preloadFonts = async (
    descriptors: readonly string[] = BRAND_FONT_DESCRIPTORS,
    report?: (progress: FontProgress) => void,
): Promise<void> => {
    const fontFaceSet = typeof document !== 'undefined' ? document.fonts : undefined;
    const total = descriptors.length;

    if (!fontFaceSet) {
        report?.({ loaded: 0, total });
        fontsReady = true;
        preloadPromise ??= Promise.resolve();
        report?.({ loaded: total, total });
        await preloadPromise;
        return;
    }

    if (fontsReady) {
        report?.({ loaded: total, total });
        return;
    }

    report?.({ loaded: 0, total });

    preloadPromise ??= performFontLoad(descriptors, report).then(() => {
        fontsReady = true;
    });

    if (preloadPromise === null) {
        throw new Error('Font preload promise was not initialized.');
    }

    await preloadPromise;
};

export { BRAND_FONT_DESCRIPTORS, preloadFonts };
