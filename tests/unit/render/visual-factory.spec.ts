import { describe, it, expect, vi, afterEach } from 'vitest';
import { Graphics } from 'pixi.js';
import { createVisualFactory } from '../../../src/render/visual-factory';
import * as PlayfieldVisuals from '../../../src/render/playfield-visuals';
import type { BallVisualDefaults, PaddleVisualDefaults } from '../../../src/render/playfield-visuals';

afterEach(() => {
    vi.restoreAllMocks();
});

const createBallDefaults = (): BallVisualDefaults => ({
    baseColor: 0xff3366,
    auraColor: 0x66ccff,
    highlightColor: 0xffffff,
    baseAlpha: 0.75,
    rimAlpha: 0.4,
    innerAlpha: 0.3,
    innerScale: 0.55,
});

const createPaddleDefaults = (): PaddleVisualDefaults => ({
    gradient: [0x112233, 0x445566],
    accentColor: 0xffcc33,
});

describe('visual-factory', () => {
    it('draws ball graphics using the active defaults', () => {
        const drawSpy = vi.spyOn(PlayfieldVisuals, 'drawBallVisual').mockImplementation(() => undefined);
        const defaults = createBallDefaults();
        const factory = createVisualFactory({
            ball: defaults,
            paddle: createPaddleDefaults(),
        });
        const graphics = new Graphics();

        factory.ball.draw(graphics, 12, { baseColor: 0x123456 });

        expect(drawSpy).toHaveBeenCalledTimes(1);
        const call = drawSpy.mock.calls[0];
        expect(call?.[0]).toBe(graphics);
        expect(call?.[1]).toBe(12);
        expect(call?.[2]).toEqual(defaults);
        expect(call?.[3]).toEqual({ baseColor: 0x123456 });
    });

    it('updates ball defaults when setDefaults is called', () => {
        const drawSpy = vi.spyOn(PlayfieldVisuals, 'drawBallVisual').mockImplementation(() => undefined);
        const factory = createVisualFactory({
            ball: createBallDefaults(),
            paddle: createPaddleDefaults(),
        });
        const nextDefaults: BallVisualDefaults = {
            baseColor: 0xffffff,
            auraColor: 0x0000ff,
            highlightColor: 0xff0000,
            baseAlpha: 0.7,
            rimAlpha: 0.45,
            innerAlpha: 0.28,
            innerScale: 0.6,
        };

        factory.ball.setDefaults(nextDefaults);
        const graphics = new Graphics();
        factory.ball.draw(graphics, 8);

        const call = drawSpy.mock.calls.at(-1);
        expect(call?.[2]).toEqual(nextDefaults);
    });

    it('creates ball graphics with eventMode disabled', () => {
        const drawSpy = vi.spyOn(PlayfieldVisuals, 'drawBallVisual').mockImplementation(() => undefined);
        const factory = createVisualFactory({
            ball: createBallDefaults(),
            paddle: createPaddleDefaults(),
        });

        const graphic = factory.ball.create({ radius: 6 });

        expect(graphic).toBeInstanceOf(Graphics);
        expect(graphic.eventMode).toBe('none');
        expect(drawSpy).toHaveBeenCalledTimes(1);
        const call = drawSpy.mock.calls[0];
        expect(call?.[0]).toBe(graphic);
        expect(call?.[1]).toBe(6);
        expect(call?.[2]).toEqual(factory.ball.getDefaults());
        expect(call?.[3]).toBeUndefined();
    });

    it('draws paddle graphics using the active defaults', () => {
        const drawSpy = vi.spyOn(PlayfieldVisuals, 'drawPaddleVisual').mockImplementation(() => undefined);
        const defaults = createPaddleDefaults();
        const factory = createVisualFactory({
            ball: createBallDefaults(),
            paddle: defaults,
        });
        const graphics = new Graphics();

        factory.paddle.draw(graphics, 80, 20, { accentColor: 0xabcdef });

        expect(drawSpy).toHaveBeenCalledTimes(1);
        const call = drawSpy.mock.calls[0];
        expect(call?.[0]).toBe(graphics);
        expect(call?.[1]).toBe(80);
        expect(call?.[2]).toBe(20);
        expect(call?.[3]).toEqual(defaults);
        expect(call?.[4]).toEqual({ accentColor: 0xabcdef });
    });

    it('updates paddle defaults when setDefaults is called', () => {
        const drawSpy = vi.spyOn(PlayfieldVisuals, 'drawPaddleVisual').mockImplementation(() => undefined);
        const factory = createVisualFactory({
            ball: createBallDefaults(),
            paddle: createPaddleDefaults(),
        });
        const nextDefaults: PaddleVisualDefaults = {
            gradient: [0x000000, 0xffffff],
            accentColor: 0x00ffcc,
        };

        factory.paddle.setDefaults(nextDefaults);
        const graphics = new Graphics();
        factory.paddle.draw(graphics, 90, 24);

        const call = drawSpy.mock.calls.at(-1);
        expect(call?.[3]).toEqual(nextDefaults);
    });

    it('creates paddle graphics with eventMode disabled', () => {
        const drawSpy = vi.spyOn(PlayfieldVisuals, 'drawPaddleVisual').mockImplementation(() => undefined);
        const factory = createVisualFactory({
            ball: createBallDefaults(),
            paddle: createPaddleDefaults(),
        });

        const graphic = factory.paddle.create({ width: 96, height: 22 });

        expect(graphic).toBeInstanceOf(Graphics);
        expect(graphic.eventMode).toBe('none');
        expect(drawSpy).toHaveBeenCalledTimes(1);
        const call = drawSpy.mock.calls[0];
        expect(call?.[0]).toBe(graphic);
        expect(call?.[1]).toBe(96);
        expect(call?.[2]).toBe(22);
        expect(call?.[3]).toEqual(factory.paddle.getDefaults());
        expect(call?.[4]).toBeUndefined();
    });
});
