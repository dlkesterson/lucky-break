/**
 * Type Guard Utilities
 *
 * Purpose: Common type checking functions used throughout the codebase
 */

/**
 * Check if value is a string
 */
export const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Check if value is a number
 */
export const isNumber = (value: unknown): value is number => typeof value === 'number';

/**
 * Check if value is a plain object (not null, not array)
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Check if value is an array
 */
export const isArray = <T = unknown>(value: unknown): value is T[] => Array.isArray(value);

/**
 * Check if value is a boolean
 */
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * Check if value is a function
 */
export const isFunction = (value: unknown): value is (...args: unknown[]) => unknown =>
    typeof value === 'function';
