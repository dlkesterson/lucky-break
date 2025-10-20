import { Container, Graphics } from 'pixi.js';
import { Body as MatterBody, Vector as MatterVector } from 'matter-js';
import type { Body } from 'matter-js';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { PhysicsWorldHandle } from 'physics/world';
import { mixColors, type BallVisualPalette } from 'render/playfield-visuals';

export interface MultiBallColors {
    readonly core: number;
    readonly aura: number;
    readonly highlight: number;
}

export interface MultiBallControllerOptions {
    readonly physics: PhysicsWorldHandle;
    readonly ball: Ball;
    readonly paddle: Paddle;
    readonly ballGraphics: Graphics;
    readonly gameContainer: Container;
    readonly visualBodies: Map<Body, Container>;
    readonly drawBallVisual: (graphics: Graphics, radius: number, palette?: BallVisualPalette) => void;
    readonly colors: MultiBallColors;
    readonly multiplier: number;
}

interface ExtraBallEntry {
    readonly body: Body;
    readonly visual: Graphics;
}

export interface MultiBallController {
    spawnExtraBalls(payload: { readonly currentLaunchSpeed: number }): void;
    promoteExtraBallToPrimary(expiredBody: Body): boolean;
    removeExtraBallByBody(body: Body): void;
    clear(): void;
    isExtraBallBody(body: Body): boolean;
    count(): number;
}

const createAngularOffsets = (count: number): number[] => {
    if (count <= 0) {
        return [];
    }
    if (count === 1) {
        return [0.25];
    }

    const spread = 0.35;
    const midpoint = (count - 1) / 2;
    return Array.from({ length: count }, (_, index) => (index - midpoint) * spread);
};

const destroyVisual = (visual: Graphics): void => {
    if (visual.parent) {
        visual.parent.removeChild(visual);
    }
    visual.destroy();
};

export const createMultiBallController = ({
    physics,
    ball,
    paddle,
    ballGraphics,
    gameContainer,
    visualBodies,
    drawBallVisual,
    colors,
    multiplier,
}: MultiBallControllerOptions): MultiBallController => {
    const extraBalls = new Map<number, ExtraBallEntry>();

    const collectBallBodies = (): Body[] => {
        return [
            ball.physicsBody,
            ...Array.from(extraBalls.values()).map((entry) => entry.body),
        ];
    };

    const spawnExtraBalls: MultiBallController['spawnExtraBalls'] = ({ currentLaunchSpeed }) => {
        const sourceBodies = collectBallBodies();
        const clonesPerBall = Math.max(0, multiplier - 1);

        if (clonesPerBall <= 0 || sourceBodies.length === 0) {
            return;
        }

        sourceBodies.forEach((sourceBody) => {
            const baseSpeed = MatterVector.magnitude(sourceBody.velocity);
            const hasMotion = baseSpeed > 0.01;
            const direction = hasMotion ? MatterVector.normalise(sourceBody.velocity) : MatterVector.create(0, -1);
            const speed = hasMotion ? baseSpeed : currentLaunchSpeed;
            const effectiveSpeed = Math.max(currentLaunchSpeed, speed);
            const offsets = createAngularOffsets(clonesPerBall);

            offsets.forEach((offset, index) => {
                const rotated = MatterVector.rotate(MatterVector.clone(direction), offset);
                const velocity = MatterVector.mult(rotated, effectiveSpeed);
                const lateralNormal = { x: -rotated.y, y: rotated.x };
                const separation = (index - (offsets.length - 1) / 2) * 12;
                const spawnPosition = {
                    x: sourceBody.position.x + lateralNormal.x * separation,
                    y: sourceBody.position.y + lateralNormal.y * separation,
                };

                const extraBody = physics.factory.ball({
                    radius: ball.radius,
                    position: spawnPosition,
                    restitution: 0.98,
                });

                MatterBody.setVelocity(extraBody, velocity);
                physics.add(extraBody);

                const extraVisual = new Graphics();
                drawBallVisual(extraVisual, ball.radius, {
                    baseColor: mixColors(colors.core, 0xffc94c, 0.5),
                    baseAlpha: 0.8,
                    rimColor: colors.highlight,
                    rimAlpha: 0.5,
                    innerColor: colors.aura,
                    innerAlpha: 0.4,
                    innerScale: 0.5,
                });
                extraVisual.eventMode = 'none';
                gameContainer.addChild(extraVisual);
                visualBodies.set(extraBody, extraVisual);
                extraBalls.set(extraBody.id, { body: extraBody, visual: extraVisual });
            });
        });
    };

    const promoteExtraBallToPrimary: MultiBallController['promoteExtraBallToPrimary'] = (expiredBody) => {
        const iterator = extraBalls.entries().next();
        if (iterator.done) {
            return false;
        }

        const [extraId, extra] = iterator.value;
        extraBalls.delete(extraId);

        visualBodies.delete(expiredBody);
        physics.remove(expiredBody);

        destroyVisual(extra.visual);

        ball.physicsBody = extra.body;
        ball.isAttached = false;
        ball.attachmentOffset = { x: 0, y: -ball.radius - paddle.height / 2 };

        visualBodies.set(extra.body, ballGraphics);
        ballGraphics.x = extra.body.position.x;
        ballGraphics.y = extra.body.position.y;
        ballGraphics.rotation = extra.body.angle;

        return true;
    };

    const removeExtraBallByBody: MultiBallController['removeExtraBallByBody'] = (body) => {
        const entry = extraBalls.get(body.id);
        if (!entry) {
            return;
        }

        extraBalls.delete(body.id);
        physics.remove(entry.body);
        visualBodies.delete(entry.body);
        destroyVisual(entry.visual);
    };

    const clear: MultiBallController['clear'] = () => {
        extraBalls.forEach((entry) => {
            physics.remove(entry.body);
            visualBodies.delete(entry.body);
            destroyVisual(entry.visual);
        });
        extraBalls.clear();
    };

    const isExtraBallBody: MultiBallController['isExtraBallBody'] = (body) => extraBalls.has(body.id);
    const count: MultiBallController['count'] = () => extraBalls.size;

    return {
        spawnExtraBalls,
        promoteExtraBallToPrimary,
        removeExtraBallByBody,
        clear,
        isExtraBallBody,
        count,
    };
};
