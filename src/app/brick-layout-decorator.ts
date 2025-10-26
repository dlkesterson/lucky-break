import type { LevelGenerationOptions } from 'util/levels';

const noopRandom = () => 0.5;

export const createBrickDecorator = (
    orientation: 'portrait' | 'landscape',
): LevelGenerationOptions['decorateBrick'] => {

    if (orientation === 'portrait') {
        // Track wall piece count in closure
        let wallCount = 0;
        const WALL_MAX = 6;
        return (context) => {
            const { row, slotIndex, slotCount, traits, random } = context;
            if (traits?.includes('gamble') || traits?.includes('fortified')) {
                return undefined;
            }

            const center = (slotCount - 1) / 2;
            const normalizedDistance = slotCount <= 1 ? 0 : Math.abs(slotIndex - center) / Math.max(1, center);
            const rng = random ?? noopRandom;

            // Only allow up to WALL_MAX wall pieces near the extreme slots
            if (wallCount < WALL_MAX && normalizedDistance >= 0.95 && row <= 1) {
                wallCount++;
                return { form: 'circle', breakable: false };
            }

            if (normalizedDistance < 0.3 && row % 3 === 0) {
                return { form: 'circle' };
            }

            if ((row + slotIndex) % 4 === 0) {
                return { form: 'diamond' };
            }

            if ((row + slotIndex) % 4 === 2 && rng() > 0.35) {
                return { form: 'circle' };
            }

            return undefined;
        };
    }

    return (context) => {
        const { row, slotIndex, traits, random } = context;
        if (traits?.includes('gamble') || traits?.includes('fortified')) {
            return undefined;
        }
        const rng = random ?? noopRandom;
        if ((row + slotIndex) % 3 === 0) {
            return { form: 'diamond' };
        }
        if ((row + slotIndex) % 3 === 1 && rng() > 0.4) {
            return { form: 'circle' };
        }
        return undefined;
    };
};
