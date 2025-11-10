import { Sprite, Texture, type Ticker } from 'pixi.js';
import type { RandomSource } from 'util/random';

export interface BrickFXOptions {
    /** Enable twinkle stars (for mosaic style) */
    twinkle?: boolean;
    /** Enable specular sweep (for neon/marble styles) */
    sweep?: boolean;
    /** Optional deterministic random source for visual effects */
    rng?: RandomSource;
}

/**
 * Create an additive glow overlay sprite.
 */
function makeGlowOverlay(base: Texture, size: number): Sprite {
    const glow = new Sprite(base);
    glow.width = glow.height = size;
    glow.blendMode = 'add';
    glow.alpha = 0.0;
    return glow;
}

/**
 * Attach lightweight visual effects to a brick sprite.
 * - Neon breathing glow (additive)
 * - Specular sweep (diagonal gradient slide)
 * - Twinkle stars (random flicker)
 */
export function attachBrickFX(sprite: Sprite, opts: BrickFXOptions = {}): void {
    const rng = opts.rng ?? (() => Math.random());

    // ── Neon breathing glow ─────────────────────────────────────────
    const phase = rng() * Math.PI * 2;
    const glow = makeGlowOverlay(sprite.texture, sprite.width);
    sprite.addChild(glow);

    // ── Optional specular sweep ─────────────────────────────────────
    let sweep: Sprite | null = null;
    if (opts.sweep) {
        const grad = Texture.WHITE;
        sweep = new Sprite(grad);
        sweep.width = sprite.width * 0.4;
        sweep.height = sprite.height * 1.2;
        sweep.angle = 35;
        sweep.tint = 0x99ccff;
        sweep.alpha = 0.0;
        sweep.blendMode = 'add';
        sweep.x = -sprite.width * 0.5;
        sweep.y = -sprite.height * 0.1;
        sprite.addChild(sweep);
    }

    // ── Optional twinkles ───────────────────────────────────────────
    const twinkles: Sprite[] = [];
    if (opts.twinkle) {
        for (let i = 0; i < 3; i++) {
            const star = new Sprite(Texture.WHITE);
            star.tint = 0xffffff;
            star.width = star.height = 1 + rng() * 1.5;
            star.alpha = 0.0;
            star.x = rng() * sprite.width;
            star.y = rng() * sprite.height;
            star.blendMode = 'add';
            sprite.addChild(star);
            twinkles.push(star);
        }
    }

    // ── Animation ticker hook ───────────────────────────────────────
    // Wire into the parent stage ticker once the sprite is added to the scene.
    const onAdded = (): void => {
        const container = sprite.parent as any;
        const ticker: Ticker | undefined =
            container?.stage?.ticker ?? (sprite as any).ticker;

        if (!ticker) return;

        let t = 0;
        let sweepCooldown = 0;

        const updateFX = (tickerInstance: Ticker): void => {
            const deltaTime = tickerInstance.deltaMS / 16.67; // normalize to ~60fps
            const dt = deltaTime / 60;
            t += dt;

            // Breathing glow
            glow.alpha = 0.85 + 0.05 * Math.sin(t + phase);

            // Specular sweep
            if (sweep) {
                sweepCooldown -= deltaTime;

                if (sweepCooldown <= 0) {
                    // Reset sweep
                    sweep.alpha = 0.0;
                    sweep.x = -sprite.width * 0.6;
                    sweepCooldown = 300 + rng() * 600; // long random cooldown
                }

                if (sweepCooldown < 260) {
                    // Fade in and slide
                    sweep.alpha = Math.min(0.25, sweep.alpha + 0.02 * deltaTime);
                    sweep.x += 1.8 * deltaTime;
                } else if (sweep.alpha > 0) {
                    // Fade out
                    sweep.alpha = Math.max(0, sweep.alpha - 0.02 * deltaTime);
                }
            }

            // Twinkle stars
            for (const s of twinkles) {
                if (rng() < 0.02) {
                    s.alpha = 0.25 + rng() * 0.4;
                }
                s.alpha *= 0.95;
            }
        };

        ticker.add(updateFX);

        // Clean up ticker on sprite destroy
        sprite.once('destroyed', () => {
            ticker.remove(updateFX);
        });

        sprite.off('added', onAdded);
    };

    sprite.on('added', onAdded);
}

/**
 * Apply a crack overlay texture to a brick sprite based on damage severity.
 */
export function applyDamageOverlay(
    brick: Sprite,
    crackTex: Texture,
    severity: 1 | 2 | 3
): void {
    const id = `crack-${severity}`;
    let overlay = brick.getChildByName(id) as Sprite | undefined;

    if (!overlay) {
        overlay = new Sprite(crackTex);
        overlay.name = id;
        overlay.width = brick.width;
        overlay.height = brick.height;
        overlay.blendMode = 'normal';
        brick.addChild(overlay);
    }

    // Modulate alpha by severity
    overlay.alpha = 0.3 + 0.2 * severity;
}
