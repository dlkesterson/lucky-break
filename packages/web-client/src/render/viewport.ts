export interface ViewportFit {
    readonly scale: number;
    readonly offsetX: number;
    readonly offsetY: number;
}

export interface ComputeViewportFitOptions {
    readonly containerWidth: number;
    readonly containerHeight: number;
    readonly contentWidth: number;
    readonly contentHeight: number;
}

export interface ResolveViewportSizeOptions {
    readonly container: Element | null;
    readonly fallbackWidth: number;
    readonly fallbackHeight: number;
}

export const computeViewportFit = ({
    containerWidth,
    containerHeight,
    contentWidth,
    contentHeight,
}: ComputeViewportFitOptions): ViewportFit => {
    if (contentWidth <= 0 || contentHeight <= 0) {
        throw new RangeError('content dimensions must be positive');
    }

    if (containerWidth <= 0 || containerHeight <= 0) {
        return { scale: 1, offsetX: 0, offsetY: 0 };
    }

    const targetRatio = contentWidth / contentHeight;
    const containerRatio = containerWidth / containerHeight;

    if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
        throw new RangeError('invalid content aspect ratio');
    }

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    if (containerRatio > targetRatio) {
        scale = containerHeight / contentHeight;
        offsetX = (containerWidth - contentWidth * scale) / 2;
    } else {
        scale = containerWidth / contentWidth;
        offsetY = (containerHeight - contentHeight * scale) / 2;
    }

    return {
        scale,
        offsetX,
        offsetY,
    };
};

export const resolveViewportSize = ({
    container,
    fallbackWidth,
    fallbackHeight,
}: ResolveViewportSizeOptions): { width: number; height: number } => {
    const safeFallbackWidth = Number.isFinite(fallbackWidth) ? Math.max(0, fallbackWidth) : 0;
    const safeFallbackHeight = Number.isFinite(fallbackHeight) ? Math.max(0, fallbackHeight) : 0;

    if (!container) {
        return {
            width: Math.round(safeFallbackWidth),
            height: Math.round(safeFallbackHeight),
        };
    }

    try {
        const rect = container.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);

        if (width > 0 && height > 0) {
            return { width, height };
        }
    } catch {
        // Ignore measurement errors and fall back to defaults.
    }

    return {
        width: Math.round(safeFallbackWidth),
        height: Math.round(safeFallbackHeight),
    };
};
