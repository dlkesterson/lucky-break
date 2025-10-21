import { GlowFilter } from '@pixi/filter-glow';
import { DisplacementFilter, Sprite, Application } from 'pixi.js';

export const createGlowFilter = () => {
  return new GlowFilter({
    distance: 15,
    outerStrength: 2,
    innerStrength: 0,
    color: 0xffffff,
    quality: 0.2,
  });
};

export const createDistortionFilter = (app: Application) => {
  const displacementSprite = new Sprite(app.renderer.generateTexture(app.stage));
  displacementSprite.texture.baseTexture.wrapMode = 'repeat';
  const displacementFilter = new DisplacementFilter(displacementSprite);
  return displacementFilter;
};
