import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeHud } from 'app/runtime/modules/runtime-hud';
import type { GameThemeDefinition } from 'render/theme';
import type { BrickLayoutBounds } from 'app/level-runtime';
import type { StageHandle } from 'render/stage';
import { createHudDisplay } from 'render/hud-display';
import { createMobileHudDisplay } from 'render/mobile-hud-display';

type MockFn = ReturnType<typeof vi.fn>;

interface DisplayConfig {
    width: number;
    height: number;
}

interface DisplayStub {
    container: Container;
    width: number;
    getHeight: () => number;
    update: MockFn;
    pulseCombo: MockFn;
    setTheme: MockFn;
    setEntropyActionHandler: MockFn;
}

const displayState = vi.hoisted(() => ({
    desktopQueue: [] as DisplayConfig[],
    mobileQueue: [] as DisplayConfig[],
    lastEntropyHandler: null as ((action: unknown) => void) | null,
}));

function createStubDisplay(config?: DisplayConfig): DisplayStub {
    const width = config?.width ?? 420;
    const height = config?.height ?? 120;
    const container = new Container();
    const setEntropyActionHandler = vi.fn();
    setEntropyActionHandler.mockImplementation((handler: unknown) => {
        displayState.lastEntropyHandler = handler as ((action: unknown) => void) | null;
    });

    const stub: DisplayStub = {
        container,
        width,
        getHeight: () => height,
        update: vi.fn(),
        pulseCombo: vi.fn(),
        setTheme: vi.fn(),
        setEntropyActionHandler,
    };
    return stub;
}

vi.mock('render/hud-display', () => {
    return {
        createHudDisplay: vi.fn(() => {
            const config = displayState.desktopQueue.shift();
            return createStubDisplay(config);
        }),
    };
});

vi.mock('render/mobile-hud-display', () => {
    return {
        createMobileHudDisplay: vi.fn(() => {
            const config = displayState.mobileQueue.shift();
            return createStubDisplay(config);
        }),
    };
});

const baseTheme: GameThemeDefinition = {
    background: { from: '#000000', to: '#111111', starAlpha: 0.2 },
    brickColors: ['#ff0000'],
    paddle: { gradient: ['#ffffff'], glow: 0.5 },
    ball: { core: '#ffffff', aura: '#eeeeee', highlight: '#dddddd' },
    font: 'sans-serif',
    monoFont: 'monospace',
    hud: {
        panelFill: '#111111',
        panelLine: '#222222',
        textPrimary: '#ffffff',
        textSecondary: '#cccccc',
        accent: '#ffcc00',
        danger: '#ff3300',
    },
    accents: { combo: '#ffcc00', powerUp: '#00ccff' },
};

afterEach(() => {
    displayState.desktopQueue.length = 0;
    displayState.mobileQueue.length = 0;
    displayState.lastEntropyHandler = null;
    vi.clearAllMocks();
});

const createStage = () => {
    const playfield = new Container();
    const stage = {
        layers: {
            playfield,
        },
    } as unknown as StageHandle;
    return { stage, playfield };
};

describe('createRuntimeHud', () => {
    it('positions desktop HUD based on paddle and brick layout', () => {
        displayState.desktopQueue.push({ width: 400, height: 100 });
        const { stage, playfield } = createStage();
        const onEntropyAction = vi.fn();
        let layoutBounds: BrickLayoutBounds | null = {
            minX: 0,
            maxX: 600,
            minY: 100,
            maxY: 500,
        };

        const handle = createRuntimeHud({
            stage,
            theme: baseTheme,
            hudProfile: 'desktop',
            playfieldWidth: 800,
            metrics: {
                desktop: { margin: 20, minScale: 0.6, maxScale: 1.2 },
                mobile: { margin: 12, minScale: 0.8, maxScale: 0.9 },
            },
            getBrickLayoutBounds: () => layoutBounds,
            getPaddleSnapshot: () => ({ centerY: 700, height: 60 }),
            onEntropyAction,
        });

        expect(createHudDisplay).toHaveBeenCalledTimes(1);
        expect(displayState.lastEntropyHandler).toBe(onEntropyAction);
        expect(playfield.children.includes(handle.container)).toBe(true);

        handle.updateLayout();

        expect(handle.display.container.scale.x).toBeCloseTo(1.2, 3);
        expect(handle.display.container.scale.y).toBeCloseTo(1.2, 3);
        expect(handle.display.container.position.x).toBe(160);
        expect(handle.display.container.position.y).toBe(520);

        layoutBounds = null;
        handle.updateLayout();
        expect(handle.display.container.position.y).toBe(530);
    });

    it('applies mobile layout metrics and clamps to minimum scale', () => {
        displayState.mobileQueue.push({ width: 320, height: 140 });
        const { stage } = createStage();

        const handle = createRuntimeHud({
            stage,
            theme: baseTheme,
            hudProfile: 'mobile',
            playfieldWidth: 260,
            metrics: {
                desktop: { margin: 20, minScale: 0.6, maxScale: 1.2 },
                mobile: { margin: 12, minScale: 0.8, maxScale: 0.9 },
            },
            getBrickLayoutBounds: () => ({ minX: 0, maxX: 240, minY: 50, maxY: 170 }),
            getPaddleSnapshot: () => ({ centerY: 200, height: 40 }),
            onEntropyAction: vi.fn(),
        });

        expect(createMobileHudDisplay).toHaveBeenCalledTimes(1);

        handle.updateLayout();

        expect(handle.display.container.scale.x).toBeCloseTo(0.8, 3);
        expect(handle.display.container.scale.y).toBeCloseTo(0.8, 3);
        expect(handle.display.container.position.x).toBe(2);
        expect(handle.display.container.position.y).toBe(56);
    });

    it('removes resize listener and detaches container on dispose', () => {
        displayState.desktopQueue.push({ width: 400, height: 120 });
        const { stage, playfield } = createStage();
        const addListenerSpy = vi.spyOn(window, 'addEventListener');
        const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

        const handle = createRuntimeHud({
            stage,
            theme: baseTheme,
            hudProfile: 'desktop',
            playfieldWidth: 700,
            metrics: {
                desktop: { margin: 18, minScale: 0.5, maxScale: 1.1 },
                mobile: { margin: 12, minScale: 0.8, maxScale: 0.9 },
            },
            getBrickLayoutBounds: () => null,
            getPaddleSnapshot: () => ({ centerY: 500, height: 48 }),
            onEntropyAction: vi.fn(),
        });

        expect(addListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

        handle.dispose();

        expect(removeListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
        expect(playfield.children.includes(handle.container)).toBe(false);

        addListenerSpy.mockRestore();
        removeListenerSpy.mockRestore();
    });
});
