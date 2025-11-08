import { mixColors } from 'render/playfield-visuals';
import type { MultiBallColors } from 'app/multi-ball-controller';
import type { ChromaticTrailPalette } from './chromatic-trail';

const emphasize = (base: number, accent: number, amount: number): number => mixColors(base, accent, amount);

export const deriveChromaticTrailPalette = (
    ballColors: MultiBallColors,
    comboAccent: number,
): ChromaticTrailPalette => {
    const { core, aura, highlight } = ballColors;
    return {
        red: emphasize(highlight, comboAccent, 0.55),
        green: emphasize(aura, comboAccent, 0.42),
        blue: emphasize(core, aura, 0.48),
    } satisfies ChromaticTrailPalette;
};
