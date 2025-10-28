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

export const lerp = (start: number, end: number, alpha: number): number => {
    return start + (end - start) * alpha;
};
