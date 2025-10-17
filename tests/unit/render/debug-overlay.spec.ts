import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
    class Container {
        children: any[] = [];
        destroy = vi.fn();
        addChild(...nodes: any[]): void {
            this.children.push(...nodes);
        }
    }

    class Graphics {
        clear = vi.fn();
        setStrokeStyle = vi.fn();
        rect = vi.fn();
        stroke = vi.fn();
        setFillStyle = vi.fn();
        circle = vi.fn();
        fill = vi.fn();
        moveTo = vi.fn();
        lineTo = vi.fn();
        destroy = vi.fn();
    }

    class TextStyle {
        constructor(public options: unknown) { }
    }

    class Text {
        x = 0;
        y = 0;
        destroy = vi.fn();
        constructor(public text: string, public style: TextStyle) { }
    }

    return { Container, Graphics, Text, TextStyle };
});

import { Container, Graphics, Text } from 'pixi.js';
import { InputDebugOverlay } from 'render/debug-overlay';

describe('InputDebugOverlay', () => {
    const mockInputState = {
        activeInputs: ['keyboard'],
        mousePosition: { x: 320, y: 200 },
        keyboardPressed: ['ArrowLeft'],
        paddleTarget: { x: 200, y: 0 },
        launchPending: true,
    };
    const mockPaddleDebug = {
        position: { x: 150.123, y: 70.987 },
        velocity: { x: 0, y: 0 },
        bounds: { x: 100, y: 50, width: 200, height: 40 },
        physicsBodyId: 1,
        inputState: mockInputState,
    };
    const mockBallDebug = {
        isAttached: true,
        position: { x: 180.4, y: 65.2 },
        velocity: { x: 2.3, y: -4.1 },
        attachmentOffset: { x: 10, y: -15 },
    };

    const createOverlay = () =>
        new InputDebugOverlay({
            inputManager: { getDebugState: () => mockInputState } as any,
            paddleController: { getDebugInfo: () => mockPaddleDebug } as any,
            ballController: { getDebugInfo: () => mockBallDebug } as any,
            paddle: {},
            ball: {},
        });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('initializes overlay content and updates drawing primitives', () => {
        const overlay = createOverlay();
        const container = overlay.getContainer();
        expect(container).toBeInstanceOf(Container);
        expect(container.children.length).toBeGreaterThanOrEqual(5);

        overlay.update();

        const overlayGraphics = container.children[0] as Graphics;
        expect(overlayGraphics.rect).toHaveBeenCalledWith(100, 50, 200, 40);
        expect(overlayGraphics.circle).toHaveBeenCalledWith(180.4, 65.2, 5);

        const texts = container.children.filter((child): child is Text => child instanceof Text);
        expect(texts[0].text).toContain('Input: keyboard');
        expect(texts[1].text).toContain('(150.1, 71.0)');
    });

    it('cleans up PIXI resources on destroy', () => {
        const overlay = createOverlay();
        const container = overlay.getContainer();
        const overlayGraphics = container.children[0] as Graphics;
        const texts = container.children.filter((child): child is Text => child instanceof Text);

        overlay.destroy();

        expect(overlayGraphics.destroy).toHaveBeenCalledTimes(1);
        texts.forEach((text) => expect(text.destroy).toHaveBeenCalledTimes(1));
        expect((container as any).destroy).toHaveBeenCalledTimes(1);
    });
});
