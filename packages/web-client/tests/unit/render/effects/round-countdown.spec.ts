import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameThemeDefinition } from 'render/theme';

const pixiState = vi.hoisted(() => {
    class MockPoint {
        x: number;
        y: number;

        constructor(x = 0, y = x) {
            this.x = x;
            this.y = y;
        }

        set(x: number, y?: number) {
            this.x = x;
            this.y = y ?? x;
        }
    }

    const containers: unknown[] = [];
    const graphics: unknown[] = [];
    const texts: unknown[] = [];
    const gradients: unknown[] = [];

    class MockContainer {
        children: unknown[] = [];
        eventMode: string | null = null;
        visible = true;
        sortableChildren = false;
        zIndex = 0;
        alpha = 1;
        position = new MockPoint();

        constructor() {
            containers.push(this);
        }

        addChild(child: unknown) {
            this.children.push(child);
            return child;
        }
    }

    class MockGraphics {
        eventMode: string | null = null;
        alpha = 1;
        blendMode: string | null = null;
        scale = new MockPoint(1, 1);
        strokeCalls: { color: number; width: number; alpha?: number }[] = [];
        fillCalls: unknown[] = [];
        lastStroke: { color: number; width: number; alpha?: number } | null = null;
        circleCalls: { x: number; y: number; radius: number }[] = [];
        rectCalls: { x: number; y: number; width: number; height: number }[] = [];
        roundRectCalls: { x: number; y: number; width: number; height: number; radius: number }[] = [];

        constructor() {
            graphics.push(this);
        }

        clear() {
            this.lastStroke = null;
            this.strokeCalls = [];
            this.fillCalls = [];
            this.circleCalls = [];
            this.rectCalls = [];
            this.roundRectCalls = [];
        }

        moveTo() {
            // Mock implementation
        }

        arc() {
            // Mock implementation
        }

        lineTo() {
            // Mock implementation
        }

        closePath() {
            // Mock implementation
        }

        circle(x: number, y: number, radius: number) {
            this.circleCalls.push({ x, y, radius });
        }

        fill(value: unknown) {
            this.fillCalls.push(value);
        }

        stroke(options: { color: number; width: number; alpha?: number }) {
            this.lastStroke = options;
            this.strokeCalls.push(options);
        }

        rect(x: number, y: number, width: number, height: number) {
            this.rectCalls.push({ x, y, width, height });
        }

        roundRect(x: number, y: number, width: number, height: number, radius: number) {
            this.roundRectCalls.push({ x, y, width, height, radius });
        }
    }

    class MockText {
        text: string;
        style: Record<string, any>;
        eventMode: string | null = null;
        alpha = 1;
        filters: unknown[] | null = null;
        scale = new MockPoint(1, 1);
        position = new MockPoint();
        anchor: { x: number; y: number; set: (value: number) => void };

        constructor(text: string, style: Record<string, any> = {}) {
            this.text = text;
            this.style = { ...style };
            const anchor = {
                x: 0,
                y: 0,
                set: (value: number) => {
                    anchor.x = value;
                    anchor.y = value;
                },
            };
            this.anchor = anchor;
            texts.push(this);
        }
    }

    class MockFillGradient {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        stops: { offset: number; color: number }[] = [];

        constructor(x0: number, y0: number, x1: number, y1: number) {
            this.x0 = x0;
            this.y0 = y0;
            this.x1 = x1;
            this.y1 = y1;
            gradients.push(this);
        }

        addColorStop(offset: number, color: number) {
            this.stops.push({ offset, color });
        }
    }

    return {
        MockContainer,
        MockGraphics,
        MockText,
        MockFillGradient,
        MockPoint,
        containers,
        graphics,
        texts,
        gradients,
        reset() {
            containers.length = 0;
            graphics.length = 0;
            texts.length = 0;
            gradients.length = 0;
        },
    };
});

vi.mock('pixi.js', () => ({
    Container: pixiState.MockContainer,
    Graphics: pixiState.MockGraphics,
    Text: pixiState.MockText,
    FillGradient: pixiState.MockFillGradient,
    Filter: class MockFilter { },
}));

const glowState = vi.hoisted(() => {
    const instances: MockGlowFilter[] = [];

    class MockGlowFilter {
        distance: number;
        outerStrength: number;
        innerStrength: number;
        color: number;
        quality: number;

        constructor(options: { distance: number; outerStrength: number; innerStrength: number; color: number; quality: number }) {
            this.distance = options.distance;
            this.outerStrength = options.outerStrength;
            this.innerStrength = options.innerStrength;
            this.color = options.color;
            this.quality = options.quality;
            instances.push(this);
        }
    }

    return {
        GlowFilter: MockGlowFilter,
        instances,
        reset() {
            instances.length = 0;
        },
    };
});

vi.mock('@pixi/filter-glow', () => ({
    GlowFilter: glowState.GlowFilter,
}));

import { mixColors, toColorNumber } from 'render/playfield-visuals';
import { createRoundCountdown } from 'render/effects/round-countdown';

type PixiState = typeof pixiState;
type MockGraphics = InstanceType<PixiState['MockGraphics']>;
type MockText = InstanceType<PixiState['MockText']>;

type GlowState = typeof glowState;

type MockGlowFilter = InstanceType<GlowState['GlowFilter']>;

const baseTheme: GameThemeDefinition = {
    background: { from: '#130c25', to: '#1f1340', starAlpha: 0.2 },
    brickColors: ['#f15a24', '#fbb03b', '#7ac943', '#22b573'],
    paddle: { gradient: ['#0081cf', '#003c8f'], glow: 0.4 },
    ball: { core: '#ffffff', aura: '#ffeedd', highlight: '#fff5e6' },
    font: 'Orbitron',
    monoFont: 'Overpass Mono',
    hud: {
        panelFill: '#14102d',
        panelLine: '#fbb03b',
        textPrimary: '#fef5e6',
        textSecondary: '#ffc766',
        accent: '#ffdd55',
        danger: '#ff3344',
    },
    accents: {
        combo: '#00ff88',
        powerUp: '#ffd966',
    },
};

const alternateTheme: GameThemeDefinition = {
    background: { from: '#011627', to: '#2a3d66', starAlpha: 0.3 },
    brickColors: ['#f8485e', '#ffd166', '#06d6a0', '#118ab2'],
    paddle: { gradient: ['#f0f3bd', '#1b9aaa'], glow: 0.5 },
    ball: { core: '#f0f3bd', aura: '#e4fde1', highlight: '#ffffff' },
    font: 'Chakra Petch',
    monoFont: 'Space Mono',
    hud: {
        panelFill: '#13293d',
        panelLine: '#247ba0',
        textPrimary: '#f0f3bd',
        textSecondary: '#b7e4c7',
        accent: '#ffbf69',
        danger: '#ff3366',
    },
    accents: {
        combo: '#06d6a0',
        powerUp: '#ffd166',
    },
};

const expectCloseTo = (value: number, expected: number) => {
    expect(value).toBeCloseTo(expected, 6);
};

describe('round-countdown effect', () => {
    beforeEach(() => {
        pixiState.reset();
        glowState.reset();
    });

    const extractElements = (display: ReturnType<typeof createRoundCountdown>) => {
        const halo = display.container.children[0] as unknown as MockGraphics;
        const backplate = display.container.children[1] as unknown as MockGraphics;
        const innerGlow = display.container.children[2] as unknown as MockGraphics;
        const ghostText = display.container.children[3] as unknown as MockText;
        const progressRing = display.container.children[4] as unknown as MockGraphics;
        const shadowText = display.container.children[5] as unknown as MockText;
        const valueText = display.container.children[6] as unknown as MockText;
        return { halo, backplate, innerGlow, ghostText, progressRing, shadowText, valueText, glow: (valueText.filters?.[0] ?? null) as MockGlowFilter | null };
    };

    it('updates severity visuals as the timer crosses thresholds', () => {
        const display = createRoundCountdown({
            playfieldSize: { width: 800, height: 600 },
            theme: baseTheme,
        });
        const { halo, shadowText, valueText, glow } = extractElements(display);

        expect(display.container.visible).toBe(false);

        display.show(5.4, 10);

        const cautionBaseColor = mixColors(
            toColorNumber(baseTheme.accents.powerUp),
            toColorNumber(baseTheme.hud.textPrimary),
            0.35,
        );
        const cautionFill = mixColors(cautionBaseColor, 0xffffff, 0.38);
        const cautionStroke = mixColors(cautionBaseColor, 0xffffff, 0.56);
        const cautionGlow = mixColors(cautionBaseColor, 0xffffff, 0.24);
        const cautionHaloInput = mixColors(cautionBaseColor, 0xffffff, 0.22);
        const cautionHalo = mixColors(cautionHaloInput, 0xffffff, 0.35);
        expect(display.container.visible).toBe(true);
        expect(valueText.text).toBe('6');
        expect(shadowText.text).toBe('6');
        expect(valueText.style.fill).toBe(cautionFill);
        expect(valueText.style.stroke.color).toBe(cautionStroke);
        expect(glow?.color).toBe(cautionGlow);
        expect(halo.lastStroke?.color).toBe(cautionHalo);

        const fractionalCaution = 5.4 - Math.floor(5.4);
        const pulseCaution = (() => {
            const t = Math.max(0, Math.min(1, 1 - fractionalCaution));
            const oneMinus = 1 - t;
            return 1 - oneMinus * oneMinus * oneMinus;
        })();
        expectCloseTo(halo.alpha, 0.12 + pulseCaution * 0.18);
        expectCloseTo(valueText.scale.x, 1 + pulseCaution * 0.14);
        expectCloseTo(shadowText.scale.x, (1 + pulseCaution * 0.14) * 1.01);

        display.show(2.1, 10);

        const warningBaseColor = toColorNumber(baseTheme.hud.danger);
        const warningFill = mixColors(warningBaseColor, 0xffffff, 0.28);
        const warningStroke = mixColors(warningBaseColor, 0xffffff, 0.5);
        const warningGlow = mixColors(warningBaseColor, 0xffffff, 0.18);
        const warningHaloInput = mixColors(warningBaseColor, 0xffffff, 0.18);
        const warningHalo = mixColors(warningHaloInput, 0xffffff, 0.35);
        expect(valueText.text).toBe('3');
        expect(valueText.style.fill).toBe(warningFill);
        expect(valueText.style.stroke.color).toBe(warningStroke);
        expect(glow?.color).toBe(warningGlow);
        expect(halo.lastStroke?.color).toBe(warningHalo);
        const normalizedWarning = Math.min(1, Math.max(0, 2.1 / 10));
        expectCloseTo(display.container.alpha, 0.4 + (1 - normalizedWarning) * 0.18);

        const fractionalWarning = 2.1 - Math.floor(2.1);
        const pulseWarning = (() => {
            const t = Math.max(0, Math.min(1, 1 - fractionalWarning));
            const oneMinus = 1 - t;
            return 1 - oneMinus * oneMinus * oneMinus;
        })();
        expectCloseTo(valueText.scale.x, 1 + pulseWarning * 0.14);
        expectCloseTo(shadowText.scale.x, (1 + pulseWarning * 0.14) * 1.01);

        display.show(0, 10);
        expect(display.container.visible).toBe(false);
        expect(halo.alpha).toBe(0);

        display.show(7.1, 10);
        const normalBaseColor = toColorNumber(baseTheme.accents.combo);
        const normalFill = mixColors(normalBaseColor, 0xffffff, 0.48);
        const normalStroke = mixColors(normalBaseColor, 0xffffff, 0.6);
        const normalGlow = mixColors(normalBaseColor, 0xffffff, 0.24);
        const normalHaloInput = mixColors(normalBaseColor, 0xffffff, 0.26);
        const normalHalo = mixColors(normalHaloInput, 0xffffff, 0.35);
        expect(display.container.visible).toBe(true);
        expect(valueText.text).toBe('8');
        expect(valueText.style.fill).toBe(normalFill);
        expect(valueText.style.stroke.color).toBe(normalStroke);
        expect(glow?.color).toBe(normalGlow);
        expect(halo.lastStroke?.color).toBe(normalHalo);
    });

    it('adapts typography and glow when the theme changes', () => {
        const display = createRoundCountdown({
            playfieldSize: { width: 640, height: 640 },
            theme: baseTheme,
        });
        const { halo, shadowText, valueText, glow } = extractElements(display);

        display.setTheme(alternateTheme);

        const expectedFontSize = Math.round(640 * 0.26);
        const expectedSpacing = Math.round(expectedFontSize * 0.08);
        const expectedStrokeWidth = Math.max(4, Math.round(expectedFontSize * 0.14));
        const expectedShadowOffset = Math.max(4, Math.round(expectedFontSize * 0.06));
        const normalBaseColor = toColorNumber(alternateTheme.accents.combo);
        const expectedNormalStroke = mixColors(normalBaseColor, 0xffffff, 0.6);

        expect(valueText.style.fontFamily).toBe(alternateTheme.font);
        expect(shadowText.style.fontFamily).toBe(alternateTheme.font);
        expect(valueText.style.fontSize).toBe(expectedFontSize);
        expect(shadowText.style.fontSize).toBe(expectedFontSize);
        expect(valueText.style.letterSpacing).toBe(expectedSpacing);
        expect(shadowText.position.y).toBe(expectedShadowOffset);
        expect(valueText.style.stroke.width).toBe(expectedStrokeWidth);
        expect(valueText.style.stroke.color).toBe(expectedNormalStroke);
        const expectedNormalFill = mixColors(toColorNumber(alternateTheme.accents.combo), 0xffffff, 0.48);
        const expectedNormalGlow = mixColors(toColorNumber(alternateTheme.accents.combo), 0xffffff, 0.24);
        const expectedNormalHaloInput = mixColors(toColorNumber(alternateTheme.accents.combo), 0xffffff, 0.26);
        const expectedNormalHalo = mixColors(expectedNormalHaloInput, 0xffffff, 0.35);
        expect(valueText.style.fill).toBe(expectedNormalFill);
        expect(glow?.color).toBe(expectedNormalGlow);
        expect(halo.lastStroke?.color).toBe(expectedNormalHalo);
    });

    it('sanitizes countdown inputs and manages visibility safely', () => {
        const display = createRoundCountdown({
            playfieldSize: { width: 512, height: 512 },
            theme: baseTheme,
        });
        const { halo, shadowText, valueText } = extractElements(display);

        display.show(-5, 10);
        expect(display.container.visible).toBe(false);

        display.show(Number.NaN, Number.NaN);
        expect(display.container.visible).toBe(false);

        display.show(10, 0);
        expect(display.container.visible).toBe(true);
        expect(valueText.text).toBe('10');
        const pulseFull = (() => {
            const t = Math.max(0, Math.min(1, 1 - (10 - Math.floor(10))));
            const oneMinus = 1 - t;
            return 1 - oneMinus * oneMinus * oneMinus;
        })();

        const haloShrink = 10 <= 5 ? Math.max(0.7, 1 - (5 - 10) * 0.08) : 1;
        const haloScale = 0.94 + pulseFull * 0.3;
        const shortestEdge = 512;
        const haloRadius = shortestEdge * 0.46;
        const minHaloRadius = haloRadius * 0.78;
        const targetHaloRadius = Math.max(minHaloRadius, haloRadius * haloScale * haloShrink);
        const effectiveHaloScale = targetHaloRadius / haloRadius;

        expectCloseTo(valueText.scale.x, 1 + pulseFull * 0.14);
        expectCloseTo(shadowText.scale.x, (1 + pulseFull * 0.14) * 1.01);
        expectCloseTo(halo.scale.x, effectiveHaloScale);
        expectCloseTo(halo.alpha, 0.12 + pulseFull * 0.18);
        expectCloseTo(display.container.alpha, 0.4 + (1 - 1) * 0.18);

        display.hide();
        expect(display.container.visible).toBe(false);
    });
});
