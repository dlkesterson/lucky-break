import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility helper that merges Tailwind class names while respecting conditional overrides.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
