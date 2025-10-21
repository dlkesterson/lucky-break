import { describe, expect, it, vi } from 'vitest';
import { FeedbackManager } from 'render/effects/FeedbackManager';

vi.mock('pixi.js', () => {
    class MockContainer {
        children: any[] = [];
        parent: MockContainer | null = null;
        x = 0;
        y = 0;
        tint = 0xffffff;
        alpha = 1;
        scale = { set: vi.fn() };
        position = { set: vi.fn() };
        visible = true;

        addChild(child: any) {
            child.parent = this;
            this.children.push(child);
            return child;
        }

        removeChild(child: any) {
            this.children = this.children.filter(c => c !== child);
            child.parent = null;
            return child;
        }

        destroy() {}
    }

    class MockGraphics extends MockContainer {
        beginFill() { return this; }
        drawCircle() { return this; }
        endFill() { return this; }
        lineStyle() { return this; }
        drawRect() { return this; }
        clear() { return this; }
    }

    return {
        Container: MockContainer,
        Graphics: MockGraphics,
    };
});

describe('FeedbackManager', () => {
  it('should create and update debris', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.createDebris(100, 100);
    expect(container.addChild).toHaveBeenCalledTimes(10);

    manager.update(1.1);
    expect(manager['debris'].length).toBe(0);
  });

  it('should create and update ripples', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.createRipple(100, 100);
    expect(container.addChild).toHaveBeenCalledTimes(1);

    manager.update(1.1);
    expect(manager['ripples'].length).toBe(0);
  });

  it('should create and update trails', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.createBallTrail({ x: 100, y: 100, width: 20 } as any);
    expect(container.addChild).toHaveBeenCalledTimes(1);

    manager.update(1.1);
    expect(manager['trails'].length).toBe(0);
  });

  it('should create and update shockwaves', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.createShockwave(100, 100);
    expect(container.addChild).toHaveBeenCalledTimes(1);

    manager.update(1.1);
    expect(manager['shockwaves'].length).toBe(0);
  });

  it('should create and update lasers', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.createLaserBeam(100, 100);
    expect(container.addChild).toHaveBeenCalledTimes(1);

    manager.update(3.1);
    expect(manager['lasers'].length).toBe(0);
  });

  it('should update screen shake', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        x: 0,
        y: 0,
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.startScreenShake(10, 5);
    manager.update(0.1);
    expect(app.stage.x).not.toBe(0);
  });

  it('should update vignette', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.showVignette();
    manager.update(1.1);
    expect(manager['vignette'].graphic).toBe(null);
  });

  it('should update starfield', () => {
    const app = {
      stage: {
        root: { addChildAt: vi.fn() },
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        removeChild: vi.fn(),
        children: [],
      },
      screen: { width: 800, height: 600 },
    } as any;
    const container = { addChild: vi.fn() } as any;
    const manager = new FeedbackManager(app, container);

    manager.updateStarfield(10);
    expect(manager['starfield'].children[0].tint).not.toBe(0xffffff);
  });
});
