import {
    Graphics,
    Texture,
} from 'pixi.js';

export type BrickStyle = 'neon' | 'mosaic' | 'marble';
export type BrickForm = 'rectangle' | 'diamond' | 'circle';
export type PipKind = 'heart' | 'diamond' | 'club' | 'spade';

export interface BrickVariant {
    texture: Texture;
    style: BrickStyle;
    form: BrickForm;
    rarity: number;
}

export type BrickVariantSets = Record<BrickStyle, BrickVariant[]>;

interface TextureRenderer {
    readonly generateTexture: (displayObject: Graphics) => Texture;
}

/**
 * Procedurally generate all brick variant textures at startup.
 * Each set is baked once into Textures for efficient GPU batching.
 */
export function generateBrickVariants(
    renderer: TextureRenderer,
    width: number,
    height: number
): BrickVariantSets {
    const sets: BrickVariantSets = {
        neon: [],
        mosaic: [],
        marble: [],
    };

    const forms: BrickForm[] = ['rectangle', 'diamond', 'circle'];

    /**
     * Helper to bake Graphics draw calls into a Texture.
     */
    const bake = (draw: (g: Graphics) => void): Texture => {
        const g = new Graphics();
        draw(g);
        const texture = renderer.generateTexture(g);
        g.destroy();
        return texture;
    };

    /**
     * Draw the base shape for a brick based on form.
     * Enhanced with better highlights and depth for visibility.
     */
    const drawBrickBase = (g: Graphics, baseColor: number, form: BrickForm): void => {
        const cx = width / 2;
        const cy = height / 2;

        switch (form) {
            case 'rectangle':
                // Rounded rectangle brick with enhanced depth
                g.beginFill(baseColor).drawRoundedRect(0, 0, width, height, Math.min(4, height / 3)).endFill();

                // Brighter edge definition
                g.lineStyle(1.5, 0x000000, 0.5).drawRoundedRect(0.5, 0.5, width - 1, height - 1, Math.min(4, height / 3));

                // Enhanced inner bevel with stronger highlight
                g.lineStyle(0)
                    .beginFill(0xffffff, 0.12)
                    .drawRoundedRect(2, 2, width - 4, height / 2.5, Math.min(3, height / 4))
                    .endFill();
                g.beginFill(0x000000, 0.1)
                    .drawRoundedRect(2, height / 1.8, width - 4, height / 2.5, Math.min(3, height / 4))
                    .endFill();

                // Subtle inner rim highlight for 3D effect
                g.lineStyle(1, 0xffffff, 0.08);
                g.drawRoundedRect(1.5, 1.5, width - 3, height - 3, Math.min(3.5, height / 3.5));
                break;

            case 'diamond':
                // Diamond shape (rotated square) with faceted appearance
                g.beginFill(baseColor);
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, height - 2)
                    .lineTo(2, cy)
                    .closePath();
                g.endFill();

                // Stronger edge
                g.lineStyle(1.5, 0x000000, 0.5);
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, height - 2)
                    .lineTo(2, cy)
                    .closePath();

                // Enhanced facet highlights for gem-like appearance
                g.lineStyle(0).beginFill(0xffffff, 0.15);
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, cy)
                    .closePath();
                g.endFill();

                // Left facet highlight
                g.beginFill(0xffffff, 0.08);
                g.moveTo(2, cy)
                    .lineTo(cx, 2)
                    .lineTo(cx, cy)
                    .closePath();
                g.endFill();

                // Bottom facet shadow
                g.beginFill(0x000000, 0.12);
                g.moveTo(cx, height - 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, cy)
                    .closePath();
                g.endFill();
                break;

            case 'circle':
                // Circle/ball shape using ellipse with enhanced specular
                const radiusX = width / 2 - 2;
                const radiusY = height / 2 - 2;
                g.beginFill(baseColor).drawEllipse(cx, cy, radiusX, radiusY).endFill();

                // Stronger edge
                g.lineStyle(1.5, 0x000000, 0.5).drawEllipse(cx, cy, radiusX, radiusY);

                // Enhanced specular highlight for sphere effect
                g.lineStyle(0).beginFill(0xffffff, 0.18);
                g.drawEllipse(cx - radiusX * 0.25, cy - radiusY * 0.25, radiusX * 0.35, radiusY * 0.35);
                g.endFill();

                // Subtle secondary highlight
                g.beginFill(0xffffff, 0.06);
                g.drawEllipse(cx - radiusX * 0.4, cy - radiusY * 0.4, radiusX * 0.2, radiusY * 0.2);
                g.endFill();

                // Bottom shadow for depth
                g.beginFill(0x000000, 0.08);
                g.drawEllipse(cx + radiusX * 0.2, cy + radiusY * 0.3, radiusX * 0.4, radiusY * 0.3);
                g.endFill();
                break;
        }
    };

    /**
     * Draw casino suit pip symbols (♥ ♦ ♣ ♠) in neon colors.
     */
    const drawPip = (g: Graphics, color: number, kind: PipKind): void => {
        g.beginFill(color, 0.9);
        const cx = width / 2;
        const cy = height / 2;
        // Scale pip size based on brick dimensions
        const scale = Math.min(width, height) * 0.18;
        const r = scale;

        switch (kind) {
            case 'diamond':
                g.moveTo(cx, cy - r * 1.3)
                    .lineTo(cx + r * 1.1, cy)
                    .lineTo(cx, cy + r * 1.3)
                    .lineTo(cx - r * 1.1, cy)
                    .closePath();
                break;
            case 'heart':
                g.moveTo(cx, cy + r * 1.2);
                g.bezierCurveTo(
                    cx + r * 1.3,
                    cy + r * 0.2,
                    cx + r * 0.9,
                    cy - r * 0.9,
                    cx,
                    cy - r * 0.4
                );
                g.bezierCurveTo(
                    cx - r * 0.9,
                    cy - r * 0.9,
                    cx - r * 1.3,
                    cy + r * 0.2,
                    cx,
                    cy + r * 1.2
                );
                break;
            case 'spade':
                g.moveTo(cx, cy - r * 1.2);
                g.bezierCurveTo(
                    cx + r * 1.2,
                    cy - r * 0.1,
                    cx + r * 0.9,
                    cy + r * 0.9,
                    cx,
                    cy + r * 0.4
                );
                g.bezierCurveTo(
                    cx - r * 0.9,
                    cy + r * 0.9,
                    cx - r * 1.2,
                    cy - r * 0.1,
                    cx,
                    cy - r * 1.2
                );
                g.drawRect(cx - r * 0.25, cy + r * 0.4, r * 0.5, r * 0.9);
                break;
            case 'club':
                const t = r * 0.85;
                g.drawCircle(cx - t * 0.6, cy, t * 0.65);
                g.drawCircle(cx + t * 0.6, cy, t * 0.65);
                g.drawCircle(cx, cy - t * 0.7, t * 0.75);
                g.drawRect(cx - t * 0.2, cy + t * 0.2, t * 0.4, t * 0.9);
                break;
        }
        g.endFill();
    };

    // Cosmic casino color palette - vibrant neons and rich jewel tones
    const neonColors = [0x00e5ff, 0xff2fb9, 0xd8ff00, 0x8b5cf6, 0xff6b35];
    const pipKinds: PipKind[] = ['heart', 'diamond', 'club', 'spade'];

    // Rich base colors for better visibility
    const richNavy = 0x1a2332;
    const deepPurple = 0x2d1b4e;
    const darkCrimson = 0x3d1725;
    const darkEmerald = 0x1a3a2e;

    // ── Neon Inlaid Bricks ──────────────────────────────────────────
    const baseColors = [richNavy, deepPurple, darkCrimson, darkEmerald];

    for (const form of forms) {
        for (let i = 0; i < 5; i++) {
            const neonColor = neonColors[i % neonColors.length];
            const baseColor = baseColors[i % baseColors.length];

            const rt = bake((g) => {
                const cx = width / 2;
                const cy = height / 2;

                // Outer glow for visibility - draw as filled shape with alpha
                g.lineStyle(0);
                g.beginFill(neonColor, 0.12);
                if (form === 'rectangle') {
                    g.drawRoundedRect(-1, -1, width + 2, height + 2, Math.min(5, height / 3));
                } else if (form === 'diamond') {
                    g.moveTo(cx, 0).lineTo(width, cy).lineTo(cx, height).lineTo(0, cy).closePath();
                } else {
                    g.drawEllipse(cx, cy, width / 2, height / 2);
                }
                g.endFill();

                drawBrickBase(g, baseColor, form);

                // Pip with subtle halo
                g.lineStyle(2, neonColor, 0.2);
                drawPip(g, 0x000000, pipKinds[i % 4]);
                g.lineStyle(0);
                drawPip(g, neonColor, pipKinds[i % 4]);
            });
            sets.neon.push({
                texture: rt,
                style: 'neon',
                form,
                rarity: i >= 3 ? 0.15 : 1, // rare color variants
            });
        }
    }

    // ── Constellation Mosaic ────────────────────────────────────────
    const cosmicBlue = 0x1e2847;
    const deepSpace = 0x16181f;

    for (const form of forms) {
        for (let i = 0; i < 3; i++) {
            const baseColor = i === 0 ? cosmicBlue : deepSpace;
            const starColor = i === 2 ? 0xe9c46a : 0xffffff;

            const rt = bake((g) => {
                const cx = width / 2;
                const cy = height / 2;

                // Subtle cosmic glow
                g.lineStyle(0);
                g.beginFill(0x6b8cff, 0.15);
                if (form === 'rectangle') {
                    g.drawRoundedRect(-1, -1, width + 2, height + 2, Math.min(5, height / 3));
                } else if (form === 'diamond') {
                    g.moveTo(cx, 0).lineTo(width, cy).lineTo(cx, height).lineTo(0, cy).closePath();
                } else {
                    g.drawEllipse(cx, cy, width / 2, height / 2);
                }
                g.endFill();

                drawBrickBase(g, baseColor, form);

                // Brighter stardust field with variety
                const starCount = 16 + i * 4;
                const seed = i * 1337; // Use deterministic seed offset
                g.lineStyle(0);
                g.beginFill(starColor, i === 2 ? 0.3 : 0.22);
                for (let s = 0; s < starCount; s++) {
                    // Deterministic pseudo-random positioning
                    const px = ((seed + s * 73) % 97) / 97 * width;
                    const py = ((seed + s * 131) % 89) / 89 * height;
                    const size = ((s * 37) % 11) / 11 * 1.5 + 0.3;
                    g.drawCircle(px, py, size);
                }
                g.endFill();

                // Enhanced gold constellation lines
                g.lineStyle(0);
                if (i === 2) {
                    g.lineStyle(1.5, 0xe9c46a, 0.5);
                    g.moveTo(cx - width * 0.25, cy - height * 0.2);
                    g.lineTo(cx, cy);
                    g.lineTo(cx + width * 0.25, cy + height * 0.2);
                } else if (form === 'rectangle') {
                    g.lineStyle(1, 0x6b8cff, 0.4);
                    g.moveTo(6, height - 6).lineTo(width - 6, 6);
                }
            });
            sets.mosaic.push({ texture: rt, style: 'mosaic', form, rarity: i === 2 ? 0.1 : 1 });
        }
    }

    // ── Pearlescent Marble ──────────────────────────────────────────
    const obsidian = 0x1a1d28;
    const charcoal = 0x252833;

    for (const form of forms) {
        for (let i = 0; i < 3; i++) {
            const baseColor = i % 2 === 0 ? obsidian : charcoal;
            const veinColor = i === 2 ? 0xd4af37 : 0xb0b0b0;
            const veinAlpha = i === 2 ? 0.35 : 0.25;

            const rt = bake((g) => {
                const cx = width / 2;
                const cy = height / 2;

                // Pearlescent rim glow
                g.lineStyle(0);
                g.beginFill(veinColor, 0.12);
                if (form === 'rectangle') {
                    g.drawRoundedRect(-1, -1, width + 2, height + 2, Math.min(5, height / 3));
                } else if (form === 'diamond') {
                    g.moveTo(cx, 0).lineTo(width, cy).lineTo(cx, height).lineTo(0, cy).closePath();
                } else {
                    g.drawEllipse(cx, cy, width / 2, height / 2);
                }
                g.endFill();

                drawBrickBase(g, baseColor, form);

                // Enhanced marble veining with deterministic pattern
                const seed = i * 2003;
                g.lineStyle(1.5, veinColor, veinAlpha);
                let x = width * 0.2 + ((seed % 47) / 47) * width * 0.3;
                for (let y = 6; y < height - 6; y += 3) {
                    g.moveTo(x, y);
                    x += ((((seed + y * 17) % 101) / 101) - 0.5) * 8;
                    g.lineTo(Math.max(4, Math.min(width - 4, x)), y + 3);
                }

                // Add a second vein for complexity
                g.lineStyle(1, veinColor, veinAlpha * 0.6);
                x = width * 0.6 + ((seed % 31) / 31) * width * 0.2;
                for (let y = 8; y < height - 8; y += 4) {
                    g.moveTo(x, y);
                    x += ((((seed + y * 23) % 97) / 97) - 0.5) * 6;
                    g.lineTo(Math.max(6, Math.min(width - 6, x)), y + 4);
                }

                // Gold accent studs for premium variants
                g.lineStyle(0);
                if (i === 2) {
                    // Subtle stud glow
                    g.beginFill(0xd4af37, 0.15);
                    g.drawCircle(width - 7, 7, 5);
                    g.drawCircle(7, height - 7, 5);
                    g.endFill();

                    // Solid stud
                    g.beginFill(0xd4af37, 0.9);
                    g.drawCircle(width - 7, 7, 2.5);
                    g.drawCircle(7, height - 7, 2.5);
                    g.endFill();
                }
            });
            sets.marble.push({
                texture: rt,
                style: 'marble',
                form,
                rarity: i === 2 ? 0.08 : 1,
            });
        }
    }

    return sets;
}

/**
 * Generate crack overlay textures for damage states.
 * Enhanced visibility with glowing cracks for cosmic theme.
 */
export function generateCrackTextures(
    renderer: TextureRenderer,
    width: number,
    height: number
): Record<1 | 2 | 3, Texture> {
    const bake = (draw: (g: Graphics) => void): Texture => {
        const g = new Graphics();
        draw(g);
        const texture = renderer.generateTexture(g);
        g.destroy();
        return texture;
    };

    const drawCracks = (g: Graphics, density: number): void => {
        const midX = width / 2;
        const midY = height / 2;
        const lines = Math.floor(density * 5);
        const seed = density * 1000; // Deterministic seed based on density

        for (let i = 0; i < lines; i++) {
            // Deterministic pseudo-random angles and lengths
            const angleOffset = ((seed + i * 41) % 100) / 100 * 0.6;
            const angle = (Math.PI * 2 * i) / lines + angleOffset;
            const lenFactorX = ((seed + i * 73) % 100) / 100 * 0.5 + 0.5;
            const lenFactorY = ((seed + i * 97) % 100) / 100 * 0.5 + 0.5;
            const lenX = width * 0.35 * lenFactorX;
            const lenY = height * 0.35 * lenFactorY;
            const x1 = midX + Math.cos(angle) * (width * 0.08);
            const y1 = midY + Math.sin(angle) * (height * 0.08);
            const x2 = midX + Math.cos(angle) * lenX;
            const y2 = midY + Math.sin(angle) * lenY;

            // Glowing crack effect - outer glow
            g.lineStyle(2.5, 0xff6b35, 0.2 * density / 3);
            g.moveTo(x1, y1).lineTo(x2, y2);

            // Main crack line
            g.lineStyle(1.5, 0x000000, 0.7);
            g.moveTo(x1, y1).lineTo(x2, y2);
        }

        // Add some smaller spider web cracks for more detail at higher damage
        if (density >= 2) {
            g.lineStyle(1, 0x000000, 0.4);
            const spiderCount = Math.floor(density * 3);
            for (let i = 0; i < spiderCount; i++) {
                // Deterministic positioning
                const startX = midX + (((seed + i * 61) % 200) / 200 - 0.5) * width * 0.4;
                const startY = midY + (((seed + i * 83) % 200) / 200 - 0.5) * height * 0.4;
                const endX = startX + (((seed + i * 107) % 200) / 200 - 0.5) * width * 0.2;
                const endY = startY + (((seed + i * 127) % 200) / 200 - 0.5) * height * 0.2;
                g.moveTo(startX, startY).lineTo(endX, endY);
            }
        }
    };

    return {
        1: bake((g) => drawCracks(g, 1)),
        2: bake((g) => drawCracks(g, 2)),
        3: bake((g) => drawCracks(g, 3)),
    };
}
