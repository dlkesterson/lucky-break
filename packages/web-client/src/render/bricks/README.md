# Procedural Brick Generation System

Casino-themed brick variants using hybrid procedural → baked → instanced rendering for optimal GPU performance.

## Architecture

### Core Approach
1. **Procedural Generation**: Draw each brick variant once using PixiJS `Graphics` API
2. **Texture Baking**: Render to `RenderTexture` for GPU-friendly instancing
3. **Lightweight FX**: Small additive overlay sprites for glow/twinkle/sweep effects

### Why This Works
- **Artistic Control**: Procedural drawing allows precise inlay/filigree/damage rendering
- **Performance**: Baked textures enable batching and efficient GPU memory usage
- **Visual Polish**: Additive overlays provide casino ambiance without expensive full-screen filters

## Brick Variants

### Neon Inlaid Bricks
- **Base**: Obsidian (0x0B0D16) with beveled edges
- **Motif**: Casino suit pips (♥ ♦ ♣ ♠) in neon colors
  - Cyan: 0x00E5FF
  - Magenta: 0xFF2FB9
  - Lime: 0xD8FF00
- **Rarity**: 5% jackpot variant per set
- **FX**: Breathing glow + specular sweep

### Constellation Mosaic
- **Base**: Midnight (0x0F1020) with beveled edges
- **Motif**: Sparse stardust field (24 particles)
- **Accent**: Faint gold seams (0xE9C46A)
- **FX**: Twinkle stars (random flicker)

### Pearlescent Marble
- **Base**: Obsidian with beveled edges
- **Motif**: Black marble veining (0xA0A0A0)
- **Accent**: Rare gold star studs (30% chance)
- **Rarity**: 5% jackpot variant per set
- **FX**: Specular sweep

## Brick Forms

All brick styles support three collision shapes:
- **Rectangle**: Standard landscape-oriented brick (100×40)
- **Diamond**: Rotated square for diagonal bounces
- **Circle**: Elliptical ball shape for unpredictable physics

## API Reference

### Core Functions

#### `generateBrickVariants(renderer, width, height)`
Procedurally generate all brick variant textures at startup.

```ts
const sets = await generateBrickVariants(app.renderer, 100, 40);
// Returns: { neon: BrickVariant[], mosaic: BrickVariant[], marble: BrickVariant[] }
```

**Parameters:**
- `renderer: Renderer` - PixiJS renderer instance
- `width: number` - Brick texture width in pixels
- `height: number` - Brick texture height in pixels

**Returns:** `Promise<BrickVariantSets>`

Each style generates 6 variants (2 per form × 3 forms: rectangle, diamond, circle).

---

#### `attachBrickFX(sprite, options?)`
Attach visual effects to a brick sprite.

```ts
attachBrickFX(brickSprite, {
    twinkle: true,  // Enable star twinkles (mosaic style)
    sweep: false,   // Disable specular sweep
});
```

**Parameters:**
- `sprite: Sprite` - Brick sprite to enhance
- `options?: BrickFXOptions`
  - `twinkle?: boolean` - Enable twinkle stars
  - `sweep?: boolean` - Enable specular sweep

**Effects Applied:**
- **Breathing Glow**: Additive alpha pulse (0.85 → 1.0)
- **Specular Sweep**: Diagonal gradient slide with long cooldown
- **Twinkle Stars**: 1-2px star sprites with random flicker

---

#### `applyDamageOverlay(brick, crackTex, severity)`
Apply progressive damage visualization.

```ts
applyDamageOverlay(brickSprite, crackTextures[2], 2);
```

**Parameters:**
- `brick: Sprite` - Target brick sprite
- `crackTex: Texture` - Pre-generated crack texture
- `severity: 1 | 2 | 3` - Damage level (affects alpha)

---

#### `generateCrackTextures(renderer, width, height)`
Generate crack overlay textures for damage states.

```ts
const cracks = generateCrackTextures(app.renderer, 100, 40);
// Returns: { 1: RenderTexture, 2: RenderTexture, 3: RenderTexture }
```

**Parameters:**
- `renderer: Renderer` - PixiJS renderer instance
- `width: number` - Texture width matching brick width
- `height: number` - Texture height matching brick height

**Returns:** `Record<1 | 2 | 3, RenderTexture>`

## Integration

This system is integrated into `level-runtime.ts`:

1. **Initialization**: Variants are generated lazily on first level load
2. **Variant Selection**: Bricks pick variants based on grid position and brick form
3. **FX Attachment**: Effects are applied automatically for procedural bricks
4. **Damage Overlays**: Applied through `updateBrickDamage()` when HP changes

See `packages/web-client/src/app/level-runtime.ts` for the integration implementation.

## Performance Notes

### Batching
- All bricks in a single `Container` batch efficiently when using the same base rendering state
- Additive overlays are tiny and don't significantly impact draw calls
- Avoid full-screen filters; prefer small overlay sprites

### Memory
- Generate variants once at startup; reuse textures across all instances
- Each 100×40 RenderTexture consumes ~16KB GPU memory
- Total memory for all variants: ~300KB (negligible)

### Optimization Tips
- Cull offscreen rows for large grids
- Use `ParticleContainer` for coin glitter bursts only
- Keep FX animations simple; avoid complex shaders

## Architecture Alignment

This system integrates with Lucky Break's existing architecture:

- **Determinism**: All RNG for variant selection happens at render time; gameplay logic remains pure
- **Separation**: Visual effects live in `render/` layer; core domain stays clean
- **Performance**: Aligns with PixiJS 8.14 best practices for batching and GPU efficiency
- **Maintainability**: Procedural generation makes adding new variants trivial
