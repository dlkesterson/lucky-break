/**
 * Procedural brick generation system for Lucky Break.
 * 
 * Provides casino-themed brick variants using PixiJS Graphics → RenderTexture
 * baking for efficient GPU batching, plus lightweight per-brick FX overlays.
 * 
 * @module render/bricks
 */

export {
    generateBrickVariants,
    generateCrackTextures,
    type BrickVariant,
    type BrickStyle,
    type BrickVariantSets,
    type PipKind,
} from './brick-variants';

export { attachBrickFX, applyDamageOverlay, type BrickFXOptions } from './brick-fx';

export { placeBricks } from './brick-placement';
