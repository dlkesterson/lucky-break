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
    report?: (progress: FontProgress) => void,
    descriptors: readonly string[] = BRAND_FONT_DESCRIPTORS,
): Promise<void> => {
    if (fontsReady) {
        report?.({ loaded: descriptors.length, total: descriptors.length });
        return;
    }

    if (!preloadPromise) {
        preloadPromise = performFontLoad(descriptors, report).then(() => {
            fontsReady = true;
        });
    }

    await preloadPromise;
    report?.({ loaded: descriptors.length, total: descriptors.length });
};

export { BRAND_FONT_DESCRIPTORS, preloadFonts };
