import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
    class BaseDisplayObject {
        eventMode: string | undefined;
        label: string | undefined;
        visible = true;
        zIndex = 0;
        position = { set: vi.fn() };
        destroy = vi.fn();
    }

    class Container extends BaseDisplayObject {
        children: any[] = [];
        parent: Container | null = null;

        addChild(...nodes: any[]): void {
            for (const node of nodes) {
                if (!node) {
                    continue;
                }
                node.parent = this;
                this.children.push(node);
            }
        }

        removeFromParent(): void {
            if (this.parent) {
                this.parent.children = this.parent.children.filter((child) => child !== this);
                this.parent = null;
            }
        }
    }

    class Graphics extends Container {
        clear = vi.fn();
        roundRect = vi.fn();
        fill = vi.fn();
        stroke = vi.fn();
        circle = vi.fn();
        moveTo = vi.fn();
        lineTo = vi.fn();
    }

    class TextStyle {
        constructor(public options: unknown) { }
    }

    class Text extends BaseDisplayObject {
        style: TextStyle;
        private _text = '';
        width = 0;
        height = 0;

        constructor(text: string, style: TextStyle) {
            super();
            this.style = style;
            this.text = text;
        }

        get text(): string {
            return this._text;
        }

        set text(value: string) {
            this._text = value;
            const lines = value.split('\n');
            const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
            this.width = maxLineLength * 8;
            this.height = lines.length * 18;
        }
    }

    return { Container, Graphics, Text, TextStyle };
});

import { Container, Graphics, Text } from 'pixi.js';
import { InputDebugOverlay, PhysicsDebugOverlay } from 'render/debug-overlay';
import type { Paddle } from 'render/contracts';
import type { Ball } from 'physics/contracts';
import type { MatterBody as Body } from 'physics/matter';

describe('InputDebugOverlay', () => {
    const mockInputState = {
        activeInputs: ['mouse', 'keyboard'],
        primaryInput: 'mouse' as const,
        mousePosition: { x: 320, y: 200 },
        touchPosition: null,
        gamepadCursor: { x: 640, y: 380 },
        gamepadAxisRaw: 0.4,
        gamepadAxisNormalized: 0.3,
        gamepadButtonsPressed: [0, 1],
        gamepadLaunchHeld: true,
        keyboardPressed: ['ArrowLeft'],
        paddleTarget: { x: 200, y: 0 },
        aimDirection: { x: 0, y: -1 },
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

    type MockFn = ReturnType<typeof vi.fn>;

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
        const container = overlay.getContainer();
        expect(container.children.length).toBe(2);

        overlay.update();

        const panel = container.children[0] as Container;
        const pointer = container.children[1] as Graphics;
        expect(panel.children.length).toBe(2);

        const background = panel.children[0] as Graphics;
        const backgroundMock = background as unknown as {
            roundRect: MockFn;
            fill: MockFn;
            stroke: MockFn;
        };
        expect(backgroundMock.roundRect).toHaveBeenCalledWith(0, 0, expect.any(Number), expect.any(Number), expect.any(Number));
        expect(backgroundMock.fill).toHaveBeenCalledWith({ color: 0x000000, alpha: 0.6 });
        expect(backgroundMock.stroke).toHaveBeenCalledWith({ color: 0xffffff, width: 1, alpha: 0.18 });

        const textNode = panel.children[1] as Text;
        expect(textNode.text).toContain('Mode: mouse');
        expect(textNode.text).toContain('Ball: attached');
        expect(textNode.text).toContain('Axis: raw 0.40 | filtered 0.30');
        expect(textNode.text).toContain('Buttons: 0, 1');
        expect(textNode.text).toContain('Keyboard: ArrowLeft');
        expect(textNode.text).toContain('Aim: 0.0, -1.0');
        expect(textNode.text).toContain('Launch: pending | trigger held');

        const pointerMock = pointer as unknown as {
            circle: MockFn;
            stroke: MockFn;
        };
        expect(pointerMock.circle).toHaveBeenCalledWith(200, 0, 9);
        expect(pointerMock.stroke).toHaveBeenCalledWith({ color: 0x4fd0ff, width: 1.5, alpha: 0.85 });
    });

    it('cleans up PIXI resources on destroy', () => {
        const overlay = createOverlay();
        const container = overlay.getContainer();
        const panel = container.children[0] as Container;
        const pointer = container.children[1] as Graphics;
        const background = panel.children[0] as Graphics;
        const textNode = panel.children[1] as Text;

        overlay.destroy();

        const pointerMock = pointer as unknown as { destroy: MockFn };
        const textMock = textNode as unknown as { destroy: MockFn };
        const backgroundMock = background as unknown as { destroy: MockFn };
        const panelMock = panel as unknown as { destroy: MockFn };
        const containerMock = container as unknown as { destroy: MockFn };

        expect(pointerMock.destroy).toHaveBeenCalledTimes(1);
        expect(textMock.destroy).toHaveBeenCalledTimes(1);
        expect(backgroundMock.destroy).toHaveBeenCalledTimes(1);
        expect(panelMock.destroy).toHaveBeenCalledTimes(1);
        expect(containerMock.destroy).toHaveBeenCalledTimes(1);
    });
});

describe('PhysicsDebugOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createOverlay = () => new PhysicsDebugOverlay();

    it('renders physics metrics and regulation info', () => {
        const overlay = createOverlay();
        const container = overlay.getContainer();
        expect(container.children.length).toBe(1);

        overlay.setVisible(true);
        overlay.update({
            currentSpeed: 9.42,
            baseSpeed: 8,
            maxSpeed: 14,
            timeScale: 0.8,
            slowTimeScale: 0.5,
            slowTimeRemaining: 4.2,
            regulation: { direction: 'boost', delta: 1.2 },
            extraBalls: 2,
            extraBallCapacity: 3,
        });

        const panel = container.children[0] as Container;
        const background = panel.children[0] as Graphics;
        const textNode = panel.children[1] as Text;

        expect(textNode.text).toContain('Speed:');
        expect(textNode.text).toContain('Time Scale:');
        expect(textNode.text).toContain('Regulation: boost');
        expect(textNode.text).toContain('Multi-Ball: 2/3');

        const backgroundMock = background as unknown as {
            roundRect: ReturnType<typeof vi.fn>;
            fill: ReturnType<typeof vi.fn>;
            stroke: ReturnType<typeof vi.fn>;
        };
        expect(backgroundMock.roundRect).toHaveBeenCalledWith(0, 0, expect.any(Number), expect.any(Number), expect.any(Number));
        expect(backgroundMock.fill).toHaveBeenCalledWith({ color: 0x000000, alpha: 0.68 });
        expect(backgroundMock.stroke).toHaveBeenCalledWith({ color: 0xffffff, width: 1, alpha: 0.2 });
    });

    it('destroys PIXI primitives cleanly', () => {
        const overlay = createOverlay();
        const container = overlay.getContainer();
        const panel = container.children[0] as Container;
        const background = panel.children[0] as Graphics;
        const textNode = panel.children[1] as Text;

        overlay.destroy();

        const backgroundMock = background as unknown as { destroy: ReturnType<typeof vi.fn> };
        const textMock = textNode as unknown as { destroy: ReturnType<typeof vi.fn> };
        const panelMock = panel as unknown as { destroy: ReturnType<typeof vi.fn> };
        const containerMock = container as unknown as { destroy: ReturnType<typeof vi.fn> };

        expect(backgroundMock.destroy).toHaveBeenCalledTimes(1);
        expect(textMock.destroy).toHaveBeenCalledTimes(1);
        expect(panelMock.destroy).toHaveBeenCalledTimes(1);
        expect(containerMock.destroy).toHaveBeenCalledTimes(1);
    });
});
