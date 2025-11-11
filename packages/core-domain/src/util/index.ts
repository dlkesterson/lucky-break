export type Noop = () => void;

export const noop: Noop = () => undefined;

/**
 * Sanitize an array of unknown values using a sanitizer function
 * @param value - Unknown value that might be an array
 * @param fallback - Fallback array to use if value is not an array or all items are invalid
 * @param sanitizer - Function to sanitize each item (return null to filter out)
 * @returns Sanitized array or fallback
 */
export const sanitizeArray = <T>(
    value: unknown,
    fallback: readonly T[],
    sanitizer: (item: unknown) => T | null,
): readonly T[] => {
    if (!Array.isArray(value)) {
        return [...fallback];
    }
    const sanitized = (value as unknown[]).map(sanitizer).filter((v): v is T => v !== null);
    return sanitized.length > 0 ? sanitized : [...fallback];
};

export * from './math';
export * from './geometry';
export * from './input-helpers';
export * from './type-guards';
