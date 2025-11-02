const preloadFonts = async (
    descriptors: string[],
    report: (progress: { loaded: number; total: number }) => void,
): Promise<void> => {
    const total = descriptors.length;

    report({ loaded: 0, total });

    const fontFaceSet = document.fonts;
    if (!fontFaceSet) {
        report({ loaded: total, total });
        return;
    }

    let loaded = 0;
    for (const descriptor of descriptors) {
        await fontFaceSet.load(descriptor);
        loaded += 1;
        report({ loaded, total });
    }

    await fontFaceSet.ready;
    report({ loaded: total, total });
};

export { preloadFonts };
