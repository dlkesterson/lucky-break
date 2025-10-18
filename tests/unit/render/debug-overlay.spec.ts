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
import type { Paddle } from 'render/contracts';
import type { Ball } from 'physics/contracts';
import type { Body } from 'matter-js';

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

    const paddleStub: Paddle = {
        id: 'paddle-1',
        physicsBody: { id: 1 } as unknown as Body,
        width: 100,
        height: 20,
        speed: 0,
        position: { x: 0, y: 0 },
    };

    const ballStub: Ball = {
        id: 'ball-1',
        physicsBody: { id: 2 } as unknown as Body,
        isAttached: true,
        attachmentOffset: { x: 0, y: 0 },
        radius: 8,
    };

    const createOverlay = () =>
        new InputDebugOverlay({
            inputManager: { getDebugState: () => mockInputState } as any,
            paddleController: { getDebugInfo: () => mockPaddleDebug } as any,
            ballController: { getDebugInfo: () => mockBallDebug } as any,
            paddle: paddleStub,
            ball: ballStub,
        });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('initializes overlay content and updates drawing primitives', () => {
        const overlay = createOverlay();
        const container = overlay.getContainer() as Container & { destroy: ReturnType<typeof vi.fn> };
        expect(container).toBeInstanceOf(Container);
        expect(container.children.length).toBeGreaterThanOrEqual(5);

        overlay.update();

        const overlayGraphics = container.children[0] as Graphics & {
            rect: ReturnType<typeof vi.fn>;
            circle: ReturnType<typeof vi.fn>;
            destroy: ReturnType<typeof vi.fn>;
        };
        const rectMock = overlayGraphics.rect;
        const circleMock = overlayGraphics.circle;
        expect(rectMock).toHaveBeenCalledWith(100, 50, 200, 40);
        expect(circleMock).toHaveBeenCalledWith(180.4, 65.2, 5);

        const texts = container.children.filter((child): child is Text => child instanceof Text);
        expect(texts[0].text).toContain('Input: keyboard');
        expect(texts[1].text).toContain('(150.1, 71.0)');
    });

    it('cleans up PIXI resources on destroy', () => {
        const overlay = createOverlay();
        const container = overlay.getContainer() as Container & { destroy: ReturnType<typeof vi.fn> };
        const overlayGraphics = container.children[0] as Graphics & {
            destroy: ReturnType<typeof vi.fn>;
        };
        const texts = container.children.filter((child): child is Text => child instanceof Text) as (
            Text & { destroy: ReturnType<typeof vi.fn> }
        )[];

        overlay.destroy();

        const destroyGraphics = overlayGraphics.destroy;
        expect(destroyGraphics).toHaveBeenCalledTimes(1);
        texts.forEach((text) => {
            expect(text.destroy).toHaveBeenCalledTimes(1);
        });
        const destroyContainer = container.destroy;
        expect(destroyContainer).toHaveBeenCalledTimes(1);
    });
});
