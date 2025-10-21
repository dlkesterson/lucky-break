import { Container, Graphics, Application, Stage } from 'pixi.js';

interface Debris {
  graphic: Graphics;
  dx: number;
  dy: number;
  life: number;
}

interface Ripple {
  graphic: Graphics;
  life: number;
  maxLife: number;
}

interface Trail {
  graphic: Graphics;
  life: number;
}

interface Shockwave {
  graphic: Graphics;
  life: number;
  maxLife: number;
}

import { Body, Bodies } from 'matter-js';

interface Star {
  graphic: Graphics;
  speed: number;
}

interface Laser {
  graphic: Graphics;
  body: Body;
  life: number;
}

interface CustomStage extends Stage {
  root: Container;
}

export class FeedbackManager {
  private debris: Debris[] = [];
  private ripples: Ripple[] = [];
  private trails: Trail[] = [];
  private shockwaves: Shockwave[] = [];
  private stars: Star[] = [];
  private lasers: Laser[] = [];
  private starfield: Container;
  private screenShake = { duration: 0, intensity: 0 };
  private vignette: { graphic: Graphics | null, life: number } = { graphic: null, life: 0 };
  private container: Container;
  private app: Application;

  constructor(app: Application, container: Container) {
    this.app = app;
    this.container = container;
    this.starfield = new Container();
    (this.app.stage as CustomStage).root.addChildAt(this.starfield, 0);

    for (let i = 0; i < 500; i++) {
      const star = new Graphics();
      star.beginFill(0xffffff, Math.random());
      star.drawCircle(0, 0, Math.random() * 1.5 + 0.5);
      star.endFill();
      star.x = Math.random() * app.screen.width;
      star.y = Math.random() * app.screen.height;
      this.starfield.addChild(star);
      this.stars.push({ graphic: star, speed: Math.random() * 0.5 + 0.1 });
    }
  }

  createDebris(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const graphic = new Graphics();
      graphic.beginFill(0xffffff);
      graphic.drawCircle(0, 0, Math.random() * 2 + 1);
      graphic.endFill();
      graphic.x = x;
      graphic.y = y;
      this.container.addChild(graphic);

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;
      this.debris.push({ graphic, dx, dy, life: 1 });
    }
  }

  createRipple(x: number, y: number) {
    const graphic = new Graphics();
    graphic.lineStyle(2, 0xffffff, 1);
    graphic.drawCircle(0, 0, 10);
    graphic.x = x;
    graphic.y = y;
    this.container.addChild(graphic);
    this.ripples.push({ graphic, life: 1, maxLife: 1 });
  }

  createBallTrail(ball: Graphics) {
    const graphic = new Graphics();
    graphic.beginFill(0xffffff, 0.5);
    graphic.drawCircle(0, 0, ball.width / 2);
    graphic.endFill();
    graphic.x = ball.x;
    graphic.y = ball.y;
    this.container.addChild(graphic);
    this.trails.push({ graphic, life: 1 });
  }

  createShockwave(x: number, y: number) {
    const graphic = new Graphics();
    graphic.lineStyle(4, 0xffffff, 1);
    graphic.drawCircle(0, 0, 30);
    graphic.x = x;
    graphic.y = y;
    this.container.addChild(graphic);
    this.shockwaves.push({ graphic, life: 1, maxLife: 1 });
  }

  createLaserBeam(x: number, y: number): Body {
    const graphic = new Graphics();
    graphic.beginFill(0xff00ff);
    graphic.drawRect(0, 0, 5, 50);
    graphic.endFill();
    graphic.x = x;
    graphic.y = y;
    this.container.addChild(graphic);

    const body = Bodies.rectangle(x, y, 5, 50, { isSensor: true, label: 'laser' });
    Body.setVelocity(body, { x: 0, y: -15 });
    this.lasers.push({ graphic, body, life: 3 });
    return body;
  }

  startScreenShake(intensity: number, duration: number) {
    this.screenShake.intensity = intensity;
    this.screenShake.duration = duration;
  }

  showVignette() {
    if (this.vignette.graphic) {
      this.vignette.graphic.destroy();
    }
    const graphic = new Graphics();
    graphic.beginFill(0x000000);
    graphic.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    graphic.endFill();
    graphic.alpha = 0.5;
    this.app.stage.addChild(graphic);
    this.vignette.graphic = graphic;
    this.vignette.life = 1;
  }

  updateStarfield(combo: number) {
    const color = 0xffffff;
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const comboEffect = Math.min(1, combo / 20);
    const newR = r * (1 - comboEffect) + 0xff * comboEffect;
    const newG = g * (1 - comboEffect) + 0xaa * comboEffect;
    const newB = b * (1 - comboEffect) + 0x00 * comboEffect;

    const newColor = (newR << 16) | (newG << 8) | newB;

    this.starfield.children.forEach(star => {
      (star as Graphics).tint = newColor;
    });
  }

  update(deltaSeconds: number) {
    this.stars.forEach(star => {
      star.graphic.y += star.speed * deltaSeconds * 60;
      if (star.graphic.y > this.app.screen.height) {
        star.graphic.y = 0;
        star.graphic.x = Math.random() * this.app.screen.width;
      }
    });

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.graphic.x += d.dx;
      d.graphic.y += d.dy;
      d.dx *= 0.95;
      d.dy *= 0.95;
      d.life -= deltaSeconds;
      if (d.life <= 0) {
        d.graphic.destroy();
        this.debris.splice(i, 1);
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const progress = 1 - r.life / r.maxLife;
      r.graphic.scale.set(1 + progress * 5);
      r.graphic.alpha = r.life;
      r.life -= deltaSeconds * 2;

      if (r.life <= 0) {
        r.graphic.destroy();
        this.ripples.splice(i, 1);
      }
    }

    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.graphic.alpha = t.life;
      t.graphic.scale.set(t.life);
      t.life -= deltaSeconds * 5;
      if (t.life <= 0) {
        t.graphic.destroy();
        this.trails.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      const progress = 1 - s.life / s.maxLife;
      s.graphic.scale.set(1 + progress * 2);
      s.graphic.alpha = s.life;
      s.life -= deltaSeconds * 3;
      if (s.life <= 0) {
        s.graphic.destroy();
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.graphic.x = l.body.position.x;
      l.graphic.y = l.body.position.y;
      l.life -= deltaSeconds;
      if (l.life <= 0) {
        l.graphic.destroy();
        this.lasers.splice(i, 1);
      }
    }

    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= deltaSeconds;
      this.app.stage.x = (Math.random() - 0.5) * this.screenShake.intensity;
      this.app.stage.y = (Math.random() - 0.5) * this.screenShake.intensity;
    } else {
      this.app.stage.x = 0;
      this.app.stage.y = 0;
    }

    if (this.vignette.graphic) {
      this.vignette.life -= deltaSeconds;
      if (this.vignette.life > 0) {
        this.vignette.graphic.alpha = this.vignette.life * 0.5;
      } else {
        this.vignette.graphic.destroy();
        this.vignette.graphic = null;
      }
    }
  }
}
