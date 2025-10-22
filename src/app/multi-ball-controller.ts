import { Container, Graphics } from 'pixi.js';
import { Body as MatterBody, Vector as MatterVector } from 'matter-js';
import type { Body } from 'matter-js';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import type { PhysicsWorldHandle } from 'physics/world';
import { mixColors, type BallVisualPalette } from 'render/playfield-visuals';
import { createSpeedRing } from 'render/effects/speed-ring';

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
    readonly maxExtraBalls: number;
}

interface ExtraBallEntry {
    readonly body: Body;
    readonly visual: Graphics;
    readonly ring: ReturnType<typeof createSpeedRing>;
}

export interface MultiBallController {
    spawnExtraBalls(payload: { readonly currentLaunchSpeed: number; readonly requestedCount?: number }): void;
    promoteExtraBallToPrimary(expiredBody: Body): boolean;
    removeExtraBallByBody(body: Body): void;
    clear(): void;
    isExtraBallBody(body: Body): boolean;
    count(): number;
    applyTheme(colors: MultiBallColors): void;
    updateSpeedIndicators(payload: {
        readonly baseSpeed: number;
        readonly maxSpeed: number;
        readonly deltaSeconds: number;
    }): void;
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

const destroyRing = (ring: ReturnType<typeof createSpeedRing>): void => {
    if (ring.container.parent) {
        ring.container.parent.removeChild(ring.container);
    }
    ring.destroy();
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
    maxExtraBalls,
}: MultiBallControllerOptions): MultiBallController => {
    const extraBalls = new Map<number, ExtraBallEntry>();
    let palette: MultiBallColors = { ...colors };
    const baseBallZ = typeof ballGraphics.zIndex === 'number' ? ballGraphics.zIndex : 0;

    const buildSpeedRing = () => {
        const ring = createSpeedRing({
            minRadius: ball.radius + 6,
            maxRadius: ball.radius + 28,
            haloRadiusOffset: 14,
            ringThickness: 3,
            palette: {
                ringColor: palette.highlight,
                haloColor: palette.aura,
            },
        });
        ring.container.eventMode = 'none';
        ring.container.zIndex = baseBallZ - 1;
        return ring;
    };

    const collectBallBodies = (): Body[] => {
        return [
            ball.physicsBody,
            ...Array.from(extraBalls.values()).map((entry) => entry.body),
        ];
    };

    const drawExtraBall = (visual: Graphics): void => {
        drawBallVisual(visual, ball.radius, {
            baseColor: mixColors(palette.core, 0xffc94c, 0.5),
            baseAlpha: 0.8,
            rimColor: palette.highlight,
            rimAlpha: 0.5,
            innerColor: palette.aura,
            innerAlpha: 0.4,
            innerScale: 0.5,
        });
    };

    const spawnExtraBalls: MultiBallController['spawnExtraBalls'] = ({ currentLaunchSpeed, requestedCount }) => {
        const capacity = Math.max(0, Math.floor(maxExtraBalls));
        let slotsLeft = capacity - extraBalls.size;
        if (slotsLeft <= 0) {
            return;
        }

        const sourceBodies = collectBallBodies();
        const clonesPerBall = Math.max(0, multiplier - 1);
        if (sourceBodies.length === 0) {
            return;
        }

        const hasExplicitRequest = typeof requestedCount === 'number' && Number.isFinite(requestedCount);
        const desiredCount = hasExplicitRequest
            ? Math.min(slotsLeft, Math.max(0, Math.floor(requestedCount)))
            : slotsLeft;

        if (desiredCount <= 0) {
            return;
        }

        const offsets = clonesPerBall > 0
            ? createAngularOffsets(clonesPerBall)
            : hasExplicitRequest
                ? [0]
                : [];
        if (offsets.length === 0) {
            return;
        }

        let remaining = desiredCount;
        sourceBodies.forEach((sourceBody) => {
            if (slotsLeft <= 0 || remaining <= 0) {
                return;
            }
            const baseSpeed = MatterVector.magnitude(sourceBody.velocity);
            const hasMotion = baseSpeed > 0.01;
            const direction = hasMotion ? MatterVector.normalise(sourceBody.velocity) : MatterVector.create(0, -1);
            const speed = hasMotion ? baseSpeed : currentLaunchSpeed;
            const effectiveSpeed = Math.max(currentLaunchSpeed, speed);

            offsets.forEach((offset, index) => {
                if (slotsLeft <= 0 || remaining <= 0) {
                    return;
                }
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
                drawExtraBall(extraVisual);
                extraVisual.eventMode = 'none';
                extraVisual.zIndex = baseBallZ;

                const speedRing = buildSpeedRing();

                gameContainer.addChild(speedRing.container);
                gameContainer.addChild(extraVisual);
                visualBodies.set(extraBody, extraVisual);
                extraBalls.set(extraBody.id, { body: extraBody, visual: extraVisual, ring: speedRing });
                slotsLeft -= 1;
                remaining -= 1;
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
        destroyRing(extra.ring);

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
        destroyRing(entry.ring);
    };

    const clear: MultiBallController['clear'] = () => {
        extraBalls.forEach((entry) => {
            physics.remove(entry.body);
            visualBodies.delete(entry.body);
            destroyVisual(entry.visual);
            destroyRing(entry.ring);
        });
        extraBalls.clear();
    };

    const isExtraBallBody: MultiBallController['isExtraBallBody'] = (body) => extraBalls.has(body.id);
    const count: MultiBallController['count'] = () => extraBalls.size;

    const applyTheme: MultiBallController['applyTheme'] = (nextColors) => {
        palette = { ...palette, ...nextColors };
        extraBalls.forEach((entry) => {
            drawExtraBall(entry.visual);
            entry.ring.setPalette({
                ringColor: palette.highlight,
                haloColor: palette.aura,
            });
        });
    };

    const updateSpeedIndicators: MultiBallController['updateSpeedIndicators'] = ({ baseSpeed, maxSpeed, deltaSeconds }) => {
        extraBalls.forEach((entry) => {
            entry.ring.update({
                position: { x: entry.body.position.x, y: entry.body.position.y },
                speed: MatterVector.magnitude(entry.body.velocity),
                baseSpeed,
                maxSpeed,
                deltaSeconds,
            });
        });
    };

    return {
        spawnExtraBalls,
        promoteExtraBallToPrimary,
        removeExtraBallByBody,
        clear,
        isExtraBallBody,
        count,
        applyTheme,
        updateSpeedIndicators,
    };
};
