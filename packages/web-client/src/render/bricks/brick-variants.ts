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
                g.roundRect(0, 0, width, height, Math.min(4, height / 3));
                g.fill({ color: baseColor });

                // Brighter edge definition
                g.roundRect(0.5, 0.5, width - 1, height - 1, Math.min(4, height / 3));
                g.stroke({ color: 0x000000, width: 1.5, alpha: 0.5 });

                // Enhanced inner bevel with stronger highlight
                g.roundRect(2, 2, width - 4, height / 2.5, Math.min(3, height / 4));
                g.fill({ color: 0xffffff, alpha: 0.12 });

                g.roundRect(2, height / 1.8, width - 4, height / 2.5, Math.min(3, height / 4));
                g.fill({ color: 0x000000, alpha: 0.1 });

                // Subtle inner rim highlight for 3D effect
                g.roundRect(1.5, 1.5, width - 3, height - 3, Math.min(3.5, height / 3.5));
                g.stroke({ color: 0xffffff, width: 1, alpha: 0.08 });
                break;

            case 'diamond':
                // Diamond shape (rotated square) with faceted appearance
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, height - 2)
                    .lineTo(2, cy)
                    .closePath();
                g.fill({ color: baseColor });

                // Stronger edge
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, height - 2)
                    .lineTo(2, cy)
                    .closePath();
                g.stroke({ color: 0x000000, width: 1.5, alpha: 0.5 });

                // Enhanced facet highlights for gem-like appearance
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, cy)
                    .closePath();
                g.fill({ color: 0xffffff, alpha: 0.15 });

                // Left facet highlight
                g.moveTo(2, cy)
                    .lineTo(cx, 2)
                    .lineTo(cx, cy)
                    .closePath();
                g.fill({ color: 0xffffff, alpha: 0.08 });

                // Bottom facet shadow
                g.moveTo(cx, height - 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, cy)
                    .closePath();
                g.fill({ color: 0x000000, alpha: 0.12 });
                break;

            case 'circle':
                // Circle/ball shape using ellipse with enhanced specular
                const radiusX = width / 2 - 2;
                const radiusY = height / 2 - 2;
                g.ellipse(cx, cy, radiusX, radiusY);
                g.fill({ color: baseColor });

                // Stronger edge
                g.ellipse(cx, cy, radiusX, radiusY);
                g.stroke({ color: 0x000000, width: 1.5, alpha: 0.5 });

                // Enhanced specular highlight for sphere effect
                g.ellipse(cx - radiusX * 0.25, cy - radiusY * 0.25, radiusX * 0.35, radiusY * 0.35);
                g.fill({ color: 0xffffff, alpha: 0.18 });

                // Subtle secondary highlight
                g.ellipse(cx - radiusX * 0.4, cy - radiusY * 0.4, radiusX * 0.2, radiusY * 0.2);
                g.fill({ color: 0xffffff, alpha: 0.06 });

                // Bottom shadow for depth
                g.ellipse(cx + radiusX * 0.2, cy + radiusY * 0.3, radiusX * 0.4, radiusY * 0.3);
                g.fill({ color: 0x000000, alpha: 0.08 });
                break;
        }
    };

    /**
     * Draw casino suit pip symbols (♥ ♦ ♣ ♠) in neon colors.
     */
    const drawPip = (g: Graphics, color: number, kind: PipKind): void => {
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
                g.fill({ color, alpha: 0.9 });
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
                g.fill({ color, alpha: 0.9 });
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
                g.rect(cx - r * 0.25, cy + r * 0.4, r * 0.5, r * 0.9);
                g.fill({ color, alpha: 0.9 });
                break;
            case 'club':
                const t = r * 0.85;
                g.circle(cx - t * 0.6, cy, t * 0.65);
                g.circle(cx + t * 0.6, cy, t * 0.65);
                g.circle(cx, cy - t * 0.7, t * 0.75);
                g.rect(cx - t * 0.2, cy + t * 0.2, t * 0.4, t * 0.9);
                g.fill({ color, alpha: 0.9 });
                break;
        }
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
                if (form === 'rectangle') {
                    g.roundRect(-1, -1, width + 2, height + 2, Math.min(5, height / 3));
                } else if (form === 'diamond') {
                    g.moveTo(cx, 0).lineTo(width, cy).lineTo(cx, height).lineTo(0, cy).closePath();
                } else {
                    g.ellipse(cx, cy, width / 2, height / 2);
                }
                g.fill({ color: neonColor, alpha: 0.12 });

                drawBrickBase(g, baseColor, form);

                // Pip with subtle halo - draw stroke outline first
                const pipCx = width / 2;
                const pipCy = height / 2;
                const scale = Math.min(width, height) * 0.18;
                const r = scale;

                switch (pipKinds[i % 4]) {
                    case 'diamond':
                        g.moveTo(pipCx, pipCy - r * 1.3)
                            .lineTo(pipCx + r * 1.1, pipCy)
                            .lineTo(pipCx, pipCy + r * 1.3)
                            .lineTo(pipCx - r * 1.1, pipCy)
                            .closePath();
                        g.stroke({ color: neonColor, width: 2, alpha: 0.2 });
                        break;
                    case 'heart':
                        g.moveTo(pipCx, pipCy + r * 1.2);
                        g.bezierCurveTo(
                            pipCx + r * 1.3, pipCy + r * 0.2,
                            pipCx + r * 0.9, pipCy - r * 0.9,
                            pipCx, pipCy - r * 0.4
                        );
                        g.bezierCurveTo(
                            pipCx - r * 0.9, pipCy - r * 0.9,
                            pipCx - r * 1.3, pipCy + r * 0.2,
                            pipCx, pipCy + r * 1.2
                        );
                        g.stroke({ color: neonColor, width: 2, alpha: 0.2 });
                        break;
                    case 'spade':
                        g.moveTo(pipCx, pipCy - r * 1.2);
                        g.bezierCurveTo(
                            pipCx + r * 1.2, pipCy - r * 0.1,
                            pipCx + r * 0.9, pipCy + r * 0.9,
                            pipCx, pipCy + r * 0.4
                        );
                        g.bezierCurveTo(
                            pipCx - r * 0.9, pipCy + r * 0.9,
                            pipCx - r * 1.2, pipCy - r * 0.1,
                            pipCx, pipCy - r * 1.2
                        );
                        g.rect(pipCx - r * 0.25, pipCy + r * 0.4, r * 0.5, r * 0.9);
                        g.stroke({ color: neonColor, width: 2, alpha: 0.2 });
                        break;
                    case 'club':
                        const t = r * 0.85;
                        g.circle(pipCx - t * 0.6, pipCy, t * 0.65);
                        g.circle(pipCx + t * 0.6, pipCy, t * 0.65);
                        g.circle(pipCx, pipCy - t * 0.7, t * 0.75);
                        g.rect(pipCx - t * 0.2, pipCy + t * 0.2, t * 0.4, t * 0.9);
                        g.stroke({ color: neonColor, width: 2, alpha: 0.2 });
                        break;
                }

                // Draw black shadow pip first
                drawPip(g, 0x000000, pipKinds[i % 4]);
                // Draw neon pip on top
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
                if (form === 'rectangle') {
                    g.roundRect(-1, -1, width + 2, height + 2, Math.min(5, height / 3));
                } else if (form === 'diamond') {
                    g.moveTo(cx, 0).lineTo(width, cy).lineTo(cx, height).lineTo(0, cy).closePath();
                } else {
                    g.ellipse(cx, cy, width / 2, height / 2);
                }
                g.fill({ color: 0x6b8cff, alpha: 0.15 });

                drawBrickBase(g, baseColor, form);

                // Brighter stardust field with variety
                const starCount = 16 + i * 4;
                const seed = i * 1337; // Use deterministic seed offset
                for (let s = 0; s < starCount; s++) {
                    // Deterministic pseudo-random positioning
                    const px = ((seed + s * 73) % 97) / 97 * width;
                    const py = ((seed + s * 131) % 89) / 89 * height;
                    const size = ((s * 37) % 11) / 11 * 1.5 + 0.3;
                    g.circle(px, py, size);
                    g.fill({ color: starColor, alpha: i === 2 ? 0.3 : 0.22 });
                }

                // Enhanced gold constellation lines
                if (i === 2) {
                    g.moveTo(cx - width * 0.25, cy - height * 0.2);
                    g.lineTo(cx, cy);
                    g.lineTo(cx + width * 0.25, cy + height * 0.2);
                    g.stroke({ color: 0xe9c46a, width: 1.5, alpha: 0.5 });
                } else if (form === 'rectangle') {
                    g.moveTo(6, height - 6).lineTo(width - 6, 6);
                    g.stroke({ color: 0x6b8cff, width: 1, alpha: 0.4 });
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
                if (form === 'rectangle') {
                    g.roundRect(-1, -1, width + 2, height + 2, Math.min(5, height / 3));
                } else if (form === 'diamond') {
                    g.moveTo(cx, 0).lineTo(width, cy).lineTo(cx, height).lineTo(0, cy).closePath();
                } else {
                    g.ellipse(cx, cy, width / 2, height / 2);
                }
                g.fill({ color: veinColor, alpha: 0.12 });

                drawBrickBase(g, baseColor, form);

                // Enhanced marble veining with deterministic pattern
                const seed = i * 2003;
                let x = width * 0.2 + ((seed % 47) / 47) * width * 0.3;
                for (let y = 6; y < height - 6; y += 3) {
                    g.moveTo(x, y);
                    x += ((((seed + y * 17) % 101) / 101) - 0.5) * 8;
                    g.lineTo(Math.max(4, Math.min(width - 4, x)), y + 3);
                }
                g.stroke({ color: veinColor, width: 1.5, alpha: veinAlpha });

                // Add a second vein for complexity
                x = width * 0.6 + ((seed % 31) / 31) * width * 0.2;
                for (let y = 8; y < height - 8; y += 4) {
                    g.moveTo(x, y);
                    x += ((((seed + y * 23) % 97) / 97) - 0.5) * 6;
                    g.lineTo(Math.max(6, Math.min(width - 6, x)), y + 4);
                }
                g.stroke({ color: veinColor, width: 1, alpha: veinAlpha * 0.6 });

                // Gold accent studs for premium variants
                if (i === 2) {
                    // Subtle stud glow
                    g.circle(width - 7, 7, 5);
                    g.circle(7, height - 7, 5);
                    g.fill({ color: 0xd4af37, alpha: 0.15 });

                    // Solid stud
                    g.circle(width - 7, 7, 2.5);
                    g.circle(7, height - 7, 2.5);
                    g.fill({ color: 0xd4af37, alpha: 0.9 });
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
            g.moveTo(x1, y1).lineTo(x2, y2);
            g.stroke({ color: 0xff6b35, width: 2.5, alpha: 0.2 * density / 3 });

            // Main crack line
            g.moveTo(x1, y1).lineTo(x2, y2);
            g.stroke({ color: 0x000000, width: 1.5, alpha: 0.7 });
        }

        // Add some smaller spider web cracks for more detail at higher damage
        if (density >= 2) {
            const spiderCount = Math.floor(density * 3);
            for (let i = 0; i < spiderCount; i++) {
                // Deterministic positioning
                const startX = midX + (((seed + i * 61) % 200) / 200 - 0.5) * width * 0.4;
                const startY = midY + (((seed + i * 83) % 200) / 200 - 0.5) * height * 0.4;
                const endX = startX + (((seed + i * 107) % 200) / 200 - 0.5) * width * 0.2;
                const endY = startY + (((seed + i * 127) % 200) / 200 - 0.5) * height * 0.2;
                g.moveTo(startX, startY).lineTo(endX, endY);
            }
            g.stroke({ color: 0x000000, width: 1, alpha: 0.4 });
        }
    };

    return {
        1: bake((g) => drawCracks(g, 1)),
        2: bake((g) => drawCracks(g, 2)),
        3: bake((g) => drawCracks(g, 3)),
    };
}
