import { Graphics } from 'pixi.js';
import {
    drawBallVisual,
    drawPaddleVisual,
    type BallVisualDefaults,
    type BallVisualPalette,
    type PaddleVisualDefaults,
    type PaddleVisualPalette,
} from './playfield-visuals';

export interface VisualFactoryDefaults {
    readonly ball: BallVisualDefaults;
    readonly paddle: PaddleVisualDefaults;
}

export interface BallGraphicOptions {
    readonly radius: number;
    readonly palette?: Partial<BallVisualPalette>;
}

export interface PaddleGraphicOptions {
    readonly width: number;
    readonly height: number;
    readonly palette?: PaddleVisualPalette;
}

export interface BallVisualFactory {
    create(options: BallGraphicOptions): Graphics;
    draw(graphics: Graphics, radius: number, palette?: Partial<BallVisualPalette>): void;
    setDefaults(defaults: BallVisualDefaults): void;
    getDefaults(): BallVisualDefaults;
}

export interface PaddleVisualFactory {
    create(options: PaddleGraphicOptions): Graphics;
    draw(graphics: Graphics, width: number, height: number, palette?: PaddleVisualPalette): void;
    setDefaults(defaults: PaddleVisualDefaults): void;
    getDefaults(): PaddleVisualDefaults;
}

export interface VisualFactoryHandle {
    readonly ball: BallVisualFactory;
    readonly paddle: PaddleVisualFactory;
}

const cloneBallDefaults = (defaults: BallVisualDefaults): BallVisualDefaults => ({
    baseColor: defaults.baseColor,
    auraColor: defaults.auraColor,
    highlightColor: defaults.highlightColor,
    baseAlpha: defaults.baseAlpha,
    rimAlpha: defaults.rimAlpha,
    innerAlpha: defaults.innerAlpha,
    innerScale: defaults.innerScale,
});

const clonePaddleDefaults = (defaults: PaddleVisualDefaults): PaddleVisualDefaults => ({
    gradient: [...defaults.gradient],
    accentColor: defaults.accentColor,
});

export const createVisualFactory = (defaults: VisualFactoryDefaults): VisualFactoryHandle => {
    let ballDefaults = cloneBallDefaults(defaults.ball);
    let paddleDefaults = clonePaddleDefaults(defaults.paddle);

    const drawBall = (
        graphics: Graphics,
        radius: number,
        palette?: Partial<BallVisualPalette>,
    ): void => {
        drawBallVisual(graphics, radius, ballDefaults, palette);
    };

    const drawPaddle = (
        graphics: Graphics,
        width: number,
        height: number,
        palette?: PaddleVisualPalette,
    ): void => {
        drawPaddleVisual(graphics, width, height, paddleDefaults, palette);
    };

    const ballFactory: BallVisualFactory = {
        create({ radius, palette }) {
            const graphics = new Graphics();
            graphics.eventMode = 'none';
            drawBall(graphics, radius, palette);
            return graphics;
        },
        draw: drawBall,
        setDefaults(nextDefaults) {
            ballDefaults = cloneBallDefaults(nextDefaults);
        },
        getDefaults() {
            return cloneBallDefaults(ballDefaults);
        },
    };

    const paddleFactory: PaddleVisualFactory = {
        create({ width, height, palette }) {
            const graphics = new Graphics();
            graphics.eventMode = 'none';
            drawPaddle(graphics, width, height, palette);
            return graphics;
        },
        draw: drawPaddle,
        setDefaults(nextDefaults) {
            paddleDefaults = clonePaddleDefaults(nextDefaults);
        },
        getDefaults() {
            return clonePaddleDefaults(paddleDefaults);
        },
    };

    return {
        ball: ballFactory,
        paddle: paddleFactory,
    };
};
