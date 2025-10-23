import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
    const createPoint = () => {
        return {
            x: 0,
            y: 0,
            set(x: number, y?: number) {
                this.x = x;
                this.y = y ?? x;
            },
        };
    };

    class MockContainer {
        public children: unknown[] = [];
        public eventMode: string | undefined;
        public visible = true;
        public alpha = 1;
        public blendMode: string | undefined;
        public position = createPoint();
        public scale = createPoint();

        addChild<T>(...items: T[]): T {
            this.children.push(...items);
            return items[0];
        }
    }

    class Graphics extends MockContainer {
        public commands: { type: string; payload?: any }[] = [];

        clear(): void {
            this.commands.push({ type: 'clear' });
        }

        circle(x: number, y: number, radius: number): this {
            this.commands.push({ type: 'circle', payload: { x, y, radius } });
            return this;
        }

        ellipse(x: number, y: number, width: number, height: number): this {
            this.commands.push({ type: 'ellipse', payload: { x, y, width, height } });
            return this;
        }

        fill(style: unknown): this {
            this.commands.push({ type: 'fill', payload: style });
            return this;
        }

        stroke(style: unknown): this {
            this.commands.push({ type: 'stroke', payload: style });
            return this;
        }

        roundRect(x: number, y: number, width: number, height: number, radius: number): this {
            this.commands.push({ type: 'roundRect', payload: { x, y, width, height, radius } });
            return this;
        }

        rect(x: number, y: number, width: number, height: number): this {
            this.commands.push({ type: 'rect', payload: { x, y, width, height } });
            return this;
        }

        moveTo(x: number, y: number): this {
            this.commands.push({ type: 'moveTo', payload: { x, y } });
            return this;
        }

        lineTo(x: number, y: number): this {
            this.commands.push({ type: 'lineTo', payload: { x, y } });
            return this;
        }

        closePath(): this {
            this.commands.push({ type: 'closePath' });
            return this;
        }
    }

    class FillGradient {
        public stops: { offset: number; color: number }[] = [];

        public constructor(
            public readonly x0: number,
            public readonly y0: number,
            public readonly x1: number,
            public readonly y1: number,
        ) { }

        addColorStop(offset: number, color: number): void {
            this.stops.push({ offset, color });
        }
    }

    class Texture {
        public constructor(public readonly label: string) { }
    }

    class TilingSprite extends MockContainer {
        public tileScale = {
            x: 1, y: 1, set: (x: number, y?: number) => {
                this.tileScale.x = x;
                this.tileScale.y = y ?? x;
            }
        };
        public tint = 0xffffff;
        public alpha = 1;

        public constructor(options: { texture: Texture; width: number; height: number }) {
            super();
            Object.assign(this, options);
        }
    }

    return {
        Container: MockContainer,
        Graphics,
        FillGradient,
        Texture,
        TilingSprite,
    };
});

import {
    clampUnit,
    computeBrickFillColor,
    createPlayfieldBackgroundLayer,
    drawBallVisual,
    drawPaddleVisual,
    mixColors,
    paintBrickVisual,
    toColorNumber,
} from 'render/playfield-visuals';

import { Graphics, FillGradient, TilingSprite, Texture } from 'pixi.js';

const getCommands = (value: unknown) => (value as { commands: { type: string; payload?: any }[] }).commands;

describe('render/playfield-visuals', () => {
    it('mixes colors with clamping', () => {
        expect(mixColors(0x000000, 0xffffff, 0)).toBe(0);
        expect(mixColors(0x000000, 0xffffff, 1)).toBe(0xffffff);
        expect(mixColors(0x336699, 0xffcc00, 0.5)).toBe(0x99994d);
        expect(clampUnit(-0.4)).toBe(0);
        expect(clampUnit(1.7)).toBe(1);
        expect(toColorNumber('#AABBCC')).toBe(0xaabbcc);
    });

    it('draws ball visuals with palette overrides', () => {
        const gfx = new Graphics();
        drawBallVisual(gfx, 12, {
            baseColor: 0x112233,
            auraColor: 0x223344,
            highlightColor: 0x445566,
            baseAlpha: 0.75,
            rimAlpha: 0.2,
            innerAlpha: 0.3,
            innerScale: 0.4,
        }, {
            baseColor: 0x999999,
            rimColor: 0x777777,
            baseAlpha: 0.9,
        });

        const commands = getCommands(gfx);
        expect(commands.slice(0, 4)).toMatchObject([
            { type: 'clear' },
            { type: 'circle', payload: { radius: 12 } },
            { type: 'fill', payload: { color: 0x999999, alpha: 0.9 } },
            { type: 'stroke', payload: { color: 0x777777, width: 3, alpha: 0.2 } },
        ]);
        expect(commands[4]?.type).toBe('circle');
        expect(commands[4]?.payload?.radius).toBeCloseTo(4.8, 5);
        expect(commands[5]).toMatchObject({ type: 'fill', payload: { color: 0x223344, alpha: 0.3 } });
        expect(gfx.blendMode).toBe('normal');
    });

    it('renders paddle visuals with gradients and pulse effect', () => {
        const gfx = new Graphics();
        drawPaddleVisual(gfx, 80, 20, {
            gradient: [0x123456, 0x654321],
            accentColor: 0xff00aa,
        }, {
            gradient: [0xff0000, 0x00ff00, 0x0000ff],
            accentColor: 0xffffff,
            pulseStrength: 0.75,
        });

        const commands = getCommands(gfx);
        const gradientFill = commands.find((command) => command.type === 'fill' && command.payload instanceof FillGradient);
        expect(gradientFill?.payload).toBeInstanceOf(FillGradient);
        expect(gfx.alpha).toBeCloseTo(0.96, 2);
        expect(commands.filter((command) => command.type === 'rect')).toHaveLength(2);
    });

    it('applies motion glow overlays and fallback gradients when needed', () => {
        const defaults = {
            gradient: [0x112233, 0x445566],
            accentColor: 0x225588,
        } as const;
        const motionGlow = 0.5;
        const gfx = new Graphics();

        drawPaddleVisual(
            gfx,
            90,
            24,
            defaults,
            {
                gradient: [],
                motionGlow,
                pulseStrength: 0.2,
            },
        );

        const commands = getCommands(gfx);
        const gradientFill = commands.find((command) => command.type === 'fill' && command.payload instanceof FillGradient)?.payload;
        expect(gradientFill).toBeDefined();

        const gradientStops: { color: number }[] =
            (gradientFill as unknown as { stops: { color: number }[] } | undefined)?.stops ?? [];
        const expectedStart = mixColors(defaults.gradient[0], 0xffffff, 0.45 * motionGlow);
        const expectedEnd = mixColors(defaults.gradient[1], 0xffffff, 0.45 * motionGlow);
        expect(gradientStops[0]?.color).toBe(expectedStart);
        expect(gradientStops.at(-1)?.color).toBe(expectedEnd);

        const expectedGlowAlpha = 0.08 + motionGlow * 0.18;
        const glowFill = commands.find(
            (command) => command.type === 'fill' && typeof command.payload?.alpha === 'number' && Math.abs(command.payload.alpha - expectedGlowAlpha) < 1e-6,
        );
        expect(glowFill).toBeDefined();
    });

    it('computes brick fill colors based on remaining health', () => {
        const base = 0x336699;
        const full = computeBrickFillColor(base, 4, 4);
        const half = computeBrickFillColor(base, 2, 4);
        const empty = computeBrickFillColor(base, 0, 4);
        expect(full).toBe(base);
        expect(half).not.toBe(base);
        expect(empty).not.toBe(base);
    });

    it('returns the base color when max health is one', () => {
        const base = 0xabcdef;
        expect(computeBrickFillColor(base, 0, 1)).toBe(base);
        expect(computeBrickFillColor(base, 1, 1)).toBe(base);
    });

    it('creates playfield background layer with tiling sprite and overlay', () => {
        const texture = new Texture('stars' as unknown as any);
        const layer = createPlayfieldBackgroundLayer({ width: 400, height: 200 }, texture);
        expect(layer.container.children).toHaveLength(2);
        const [tiling, overlay] = layer.container.children as [TilingSprite, Graphics];
        expect(tiling).toBeInstanceOf(TilingSprite);
        expect(tiling.alpha).toBeCloseTo(0.78, 2);
        expect(getCommands(overlay).some((command) => command.type === 'rect')).toBe(true);
    });

    it('creates playfield background layers without textures when none provided', () => {
        const layer = createPlayfieldBackgroundLayer({ width: 320, height: 180 }, null);
        expect(layer.tilingSprite).toBeNull();
        expect(layer.container.children).toHaveLength(1);
        expect(layer.container.children[0]).toBeInstanceOf(Graphics);
    });

    it('paints brick visuals with highlight and shadow layers', () => {
        const gfx = new Graphics();
        paintBrickVisual(gfx, 60, 24, 0xcc5500, 0.5, 0.9);

        const commands = getCommands(gfx);
        const clears = commands.filter((command) => command.type === 'clear');
        const fills = commands.filter((command) => command.type === 'fill');
        const crackStrokes = commands.filter((command) => command.type === 'stroke' && command.payload?.width && command.payload.width < 2);
        const lines = commands.filter((command) => command.type === 'lineTo');
        expect(clears).toHaveLength(1);
        expect(fills.length).toBeGreaterThan(1);
        expect(crackStrokes.length).toBeGreaterThan(0);
        expect(lines.length).toBeGreaterThan(0);
    });

    it('supports circular brick forms with radial highlights', () => {
        const gfx = new Graphics();
        paintBrickVisual(gfx, 48, 48, 0x44ccff, 0.25, 0.85, 'circle');

        const commands = getCommands(gfx);
        expect(commands.some((command) => command.type === 'circle')).toBe(true);
        expect(commands.some((command) => command.type === 'ellipse')).toBe(true);
        expect(commands.filter((command) => command.type === 'stroke')).not.toHaveLength(0);
    });

    it('supports diamond brick forms with angled crack strokes', () => {
        const gfx = new Graphics();
        paintBrickVisual(gfx, 80, 36, 0xff7755, 0.6, 0.95, 'diamond');

        const commands = getCommands(gfx);
        const closePaths = commands.filter((command) => command.type === 'closePath');
        expect(closePaths.length).toBeGreaterThanOrEqual(3);
        expect(commands.filter((command) => command.type === 'moveTo').length).toBeGreaterThan(0);
        expect(commands.filter((command) => command.type === 'stroke').length).toBeGreaterThan(1);
    });

    it('omits crack strokes when damage is negligible across forms', () => {
        const strokeCountBelow = (commands: { type: string; payload?: any }[]) =>
            commands.filter((command) => command.type === 'stroke' && typeof command.payload?.width === 'number' && command.payload.width < 1.5).length;

        const baseRect = new Graphics();
        paintBrickVisual(baseRect, 50, 24, 0x8899aa, 0.001, 0.85, 'rectangle');
        expect(strokeCountBelow(getCommands(baseRect))).toBe(0);

        const baseCircle = new Graphics();
        paintBrickVisual(baseCircle, 40, 40, 0x55ffaa, 0.005, 0.9, 'circle');
        expect(strokeCountBelow(getCommands(baseCircle))).toBe(0);

        const baseDiamond = new Graphics();
        paintBrickVisual(baseDiamond, 60, 30, 0xaa55ff, 0.004, 0.92, 'diamond');
        expect(strokeCountBelow(getCommands(baseDiamond))).toBe(0);
    });
});
