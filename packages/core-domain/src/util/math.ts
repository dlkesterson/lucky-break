export const clamp = (value: number, min: number, max: number): number => {
    if (Number.isNaN(value)) {
        return min;
    }
    if (min > max) {
        return clamp(value, max, min);
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

export const clampUnit = (value: number): number => clamp(value, 0, 1);

/**
 * Safely returns a finite number or a fallback value.
 * @param value - The value to check
 * @param fallback - The fallback value if not finite (default: 0)
 */
export const safeFinite = (value: number, fallback = 0): number => {
    return Number.isFinite(value) ? value : fallback;
};

/**
 * Positive modulo operation that always returns non-negative results.
 * @param value - The value to modulo
 * @param modulus - The modulus
 */
export const modulo = (value: number, modulus: number): number => {
    if (modulus === 0) {
        return 0;
    }
    const remainder = value % modulus;
    return remainder < 0 ? remainder + modulus : remainder;
};

export const lerp = (start: number, end: number, alpha: number): number => {
    return start + (end - start) * alpha;
};
