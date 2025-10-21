import { Container, Graphics, Sprite, Texture } from 'pixi.js';

interface TextureRenderer {
    readonly generateTexture: (displayObject: Graphics) => Texture;
}

const BASE_RADIUS = 128;
const INNER_RADIUS_SCALE = 0.72;
const OUTER_STROKE_WIDTH = 14;
const INNER_STROKE_WIDTH = 6;

interface ComboRingTextures {
    readonly fill: Texture;
    readonly outer: Texture;
    readonly inner: Texture;
}

export interface ComboRingUpdateOptions {
    readonly position: { readonly x: number; readonly y: number };
    readonly radius: number;
    readonly outerColor: number;
    readonly outerAlpha: number;
    readonly innerColor: number;
    readonly innerAlpha: number;
    readonly fillAlpha: number;
    readonly overallAlpha: number;
}

export interface ComboRingHandle {
    readonly container: Container;
    update(options: ComboRingUpdateOptions): void;
    hide(): void;
    dispose(): void;
}

const createRingTextures = (renderer: TextureRenderer): ComboRingTextures => {
    const fillGfx = new Graphics();
    fillGfx.circle(0, 0, BASE_RADIUS);
    fillGfx.fill({ color: 0xffffff, alpha: 1 });
    fillGfx.eventMode = 'none';

    const outerGfx = new Graphics();
    outerGfx.circle(0, 0, BASE_RADIUS);
    outerGfx.stroke({ color: 0xffffff, width: OUTER_STROKE_WIDTH, alpha: 1 });
    outerGfx.eventMode = 'none';

    const innerGfx = new Graphics();
    innerGfx.circle(0, 0, BASE_RADIUS * INNER_RADIUS_SCALE);
    innerGfx.stroke({ color: 0xffffff, width: INNER_STROKE_WIDTH, alpha: 1 });
    innerGfx.eventMode = 'none';

    const fill = renderer.generateTexture(fillGfx);
    const outer = renderer.generateTexture(outerGfx);
    const inner = renderer.generateTexture(innerGfx);

    fillGfx.destroy();
    outerGfx.destroy();
    innerGfx.destroy();

    return { fill, outer, inner } satisfies ComboRingTextures;
};

export const createComboRing = (renderer: TextureRenderer): ComboRingHandle => {
    const textures = createRingTextures(renderer);

    const container = new Container();
    container.visible = false;
    container.alpha = 0;
    container.eventMode = 'none';

    const fillSprite = new Sprite(textures.fill);
    fillSprite.anchor.set(0.5);
    fillSprite.eventMode = 'none';
    fillSprite.blendMode = 'add';

    const outerSprite = new Sprite(textures.outer);
    outerSprite.anchor.set(0.5);
    outerSprite.eventMode = 'none';
    outerSprite.blendMode = 'add';

    const innerSprite = new Sprite(textures.inner);
    innerSprite.anchor.set(0.5);
    innerSprite.eventMode = 'none';
    innerSprite.blendMode = 'add';

    container.addChild(fillSprite, outerSprite, innerSprite);

    let disposed = false;

    const update = ({
        position,
        radius,
        outerColor,
        outerAlpha,
        innerColor,
        innerAlpha,
        fillAlpha,
        overallAlpha,
    }: ComboRingUpdateOptions) => {
        if (overallAlpha <= 0) {
            hide();
            return;
        }

        const scale = radius > 0 ? radius / BASE_RADIUS : 0;
        const alpha = Math.max(0, Math.min(1, overallAlpha));

        container.visible = alpha > 0;
        container.alpha = alpha;
        container.position.set(position.x, position.y);

        fillSprite.alpha = Math.max(0, Math.min(1, fillAlpha));
        fillSprite.scale.set(scale);

        outerSprite.tint = outerColor;
        outerSprite.alpha = Math.max(0, Math.min(1, outerAlpha));
        outerSprite.scale.set(scale);

        innerSprite.tint = innerColor;
        innerSprite.alpha = Math.max(0, Math.min(1, innerAlpha));
        innerSprite.scale.set(scale);
    };

    const hide = () => {
        container.visible = false;
        container.alpha = 0;
    };

    const dispose = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        hide();
        container.removeChildren();
        fillSprite.destroy(false);
        outerSprite.destroy(false);
        innerSprite.destroy(false);
        textures.fill.destroy(true);
        textures.outer.destroy(true);
        textures.inner.destroy(true);
    };

    return { container, update, hide, dispose } satisfies ComboRingHandle;
};
