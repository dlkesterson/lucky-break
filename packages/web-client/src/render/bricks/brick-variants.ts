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
export async function generateBrickVariants(
    renderer: TextureRenderer,
    width: number,
    height: number
): Promise<BrickVariantSets> {
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
     */
    const drawBrickBase = (g: Graphics, baseColor: number, form: BrickForm): void => {
        const cx = width / 2;
        const cy = height / 2;

        switch (form) {
            case 'rectangle':
                // Rounded rectangle brick
                g.beginFill(baseColor).drawRoundedRect(0, 0, width, height, Math.min(4, height / 3)).endFill();
                g.lineStyle(1, 0x000000, 0.35).drawRoundedRect(0.5, 0.5, width - 1, height - 1, Math.min(4, height / 3));
                // Inner bevel highlight/shadow
                g.lineStyle(0)
                    .beginFill(0xffffff, 0.04)
                    .drawRoundedRect(2, 2, width - 4, height / 2.2, Math.min(3, height / 4))
                    .endFill();
                g.beginFill(0x000000, 0.06)
                    .drawRoundedRect(2, height / 2, width - 4, height / 2.2, Math.min(3, height / 4))
                    .endFill();
                break;

            case 'diamond':
                // Diamond shape (rotated square)
                g.beginFill(baseColor);
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, height - 2)
                    .lineTo(2, cy)
                    .closePath();
                g.endFill();
                g.lineStyle(1, 0x000000, 0.35);
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, height - 2)
                    .lineTo(2, cy)
                    .closePath();
                // Highlight on top facets
                g.lineStyle(0).beginFill(0xffffff, 0.06);
                g.moveTo(cx, 2)
                    .lineTo(width - 2, cy)
                    .lineTo(cx, cy)
                    .closePath();
                g.endFill();
                break;

            case 'circle':
                // Circle/ball shape using ellipse for landscape orientation
                const radiusX = width / 2 - 2;
                const radiusY = height / 2 - 2;
                g.beginFill(baseColor).drawEllipse(cx, cy, radiusX, radiusY).endFill();
                g.lineStyle(1, 0x000000, 0.35).drawEllipse(cx, cy, radiusX, radiusY);
                // Specular highlight
                g.lineStyle(0).beginFill(0xffffff, 0.08);
                g.drawEllipse(cx - radiusX * 0.3, cy - radiusY * 0.3, radiusX * 0.4, radiusY * 0.4);
                g.endFill();
                break;
        }
    };

    /**
     * Draw casino suit pip symbols (♥ ♦ ♣ ♠) in neon colors.
     */
    const drawPip = (g: Graphics, color: number, kind: PipKind, form: BrickForm): void => {
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
                // Outer glow for visibility
                g.lineStyle(3, neonColor, 0.15);
                if (form === 'rectangle') {
                    g.drawRoundedRect(0, 0, width, height, Math.min(4, height / 3));
                } else if (form === 'diamond') {
                    const cx = width / 2, cy = height / 2;
                    g.moveTo(cx, 2).lineTo(width - 2, cy).lineTo(cx, height - 2).lineTo(2, cy).closePath();
                } else {
                    g.drawEllipse(width / 2, height / 2, width / 2 - 2, height / 2 - 2);
                }
                
                drawBrickBase(g, baseColor, form);
                
                // Pip with subtle halo
                g.lineStyle(2, neonColor, 0.25);
                drawPip(g, 0x000000, pipKinds[i % 4], form);
                g.lineStyle(0);
                drawPip(g, neonColor, pipKinds[i % 4], form);
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
    for (const form of forms) {
        for (let i = 0; i < 2; i++) {
            const rt = bake((g) => {
                drawBrickBase(g, midnight, form);

                // Sparse stardust field
                g.beginFill(0xffffff, 0.12);
                for (let s = 0; s < 24; s++) {
                    g.drawCircle(Math.random() * width, Math.random() * height, Math.random() * 1.2 + 0.2);
                }
                g.endFill();

                // Faint gold seam accents
                if (form === 'rectangle') {
                    g.lineStyle(1, 0xe9c46a, 0.35);
                    g.moveTo(6, height - 6).lineTo(width - 6, 6);
                }
            });
            sets.mosaic.push({ texture: rt, style: 'mosaic', form, rarity: 1 });
        }
    }

    // ── Pearlescent Marble ──────────────────────────────────────────
    for (const form of forms) {
        for (let i = 0; i < 2; i++) {
            const rt = bake((g) => {
                drawBrickBase(g, obsidian, form);

                // Black marble veining
                g.lineStyle(1, 0xa0a0a0, 0.16);
                let x = Math.random() * width * 0.4;
                for (let y = 8; y < height - 8; y += 4) {
                    g.moveTo(x, y);
                    x += (Math.random() - 0.5) * 6;
                    g.lineTo(Math.max(6, Math.min(width - 6, x)), y + 4);
                }

                // Rare gold star studs
                if (Math.random() < 0.3) {
                    g.beginFill(0xe9c46a, 0.8);
                    g.drawCircle(width - 8, 8, 2);
                    g.drawCircle(8, height - 8, 2);
                    g.endFill();
                }
            });
            sets.marble.push({
                texture: rt,
                style: 'marble',
                form,
                rarity: i === 1 ? 0.05 : 1,
            });
        }
    }

    return sets;
}

/**
 * Generate crack overlay textures for damage states.
 * These work for all brick forms.
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
        g.lineStyle(1, 0x000000, 0.5);
        const midX = width / 2;
        const midY = height / 2;
        const lines = Math.floor(density * 4);

        for (let i = 0; i < lines; i++) {
            const angle = (Math.PI * 2 * i) / lines + Math.random() * 0.5;
            const lenX = width * 0.3 * (0.6 + Math.random() * 0.4);
            const lenY = height * 0.3 * (0.6 + Math.random() * 0.4);
            const x1 = midX + Math.cos(angle) * (width * 0.1);
            const y1 = midY + Math.sin(angle) * (height * 0.1);
            const x2 = midX + Math.cos(angle) * lenX;
            const y2 = midY + Math.sin(angle) * lenY;
            g.moveTo(x1, y1).lineTo(x2, y2);
        }
    };

    return {
        1: bake((g) => drawCracks(g, 1)),
        2: bake((g) => drawCracks(g, 2)),
        3: bake((g) => drawCracks(g, 3)),
    };
}
