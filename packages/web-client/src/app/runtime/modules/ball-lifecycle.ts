import type { MatterBody as Body } from 'physics/matter';
import { Body as MatterBodyModule } from 'physics/matter';
import type { PhysicsWorldHandle } from 'physics/world';
import type { Ball } from 'physics/contracts';
import type { Paddle } from 'render/contracts';
import { BallAttachmentController } from 'physics/ball-attachment';
import { PaddleBodyController } from 'render/paddle-body';
import type { MultiBallController } from '../../multi-ball-controller';
import type { RuntimeInput } from '../input';
import type { LoadoutBallShape } from 'config/loadouts';
import type { Container as PixiContainer } from 'pixi.js';
import { normalizeBallShape, toPhysicsBallBodyShape } from '../ball-shape';

export interface BallLifecycleContext {
    readonly ball: Ball;
    readonly paddle: Paddle;
    readonly ballGraphics: PixiContainer;
    readonly physics: PhysicsWorldHandle;
    readonly foreshadowing: ReturnType<typeof import('../foreshadowing').createForeshadowingRuntime>;
    readonly ballController: BallAttachmentController;
    readonly paddleController: PaddleBodyController;
    readonly multiBallController: MultiBallController;
    readonly inputToPhysics: {
        resetLaunchTrigger: () => void;
        syncPaddlePosition: (position: { x: number; y: number }) => void;
    };
    readonly visualBodies: Map<Body, PixiContainer>;
    readonly runtimeState: {
        previousPaddlePosition: { x: number; y: number };
        currentLaunchSpeed: number;
        ballRestitution: number;
    };
    readonly visuals: {
        ballSpeedRing?: { reset: () => void } | null;
    } | null;
}

export interface BallLifecycleManager {
    readonly reattachBallToPaddle: () => void;
    readonly promoteExtraBallToPrimary: (expiredBody: Body) => boolean;
    readonly removeExtraBallByBody: (body: Body) => void;
    readonly clearExtraBalls: () => void;
    readonly resetForeshadowing: () => void;
    readonly spawnExtraBalls: (requestedCount?: number) => void;
    readonly applyBallRestitution: (value: number) => void;
    readonly applyBallShape: (shape: LoadoutBallShape) => void;
}

export const createBallLifecycleManager = (context: BallLifecycleContext): BallLifecycleManager => {
    const {
        ball,
        paddle,
        ballGraphics,
        physics,
        foreshadowing,
        ballController,
        paddleController,
        multiBallController,
        inputToPhysics,
        visualBodies,
        runtimeState,
        visuals,
    } = context;

    let activeBallShape: LoadoutBallShape = 'sphere';

    const reattachBallToPaddle = (): void => {
        const attachmentOffset = { x: 0, y: -ball.radius - paddle.height / 2 };
        foreshadowing.cancelForBall(ball.physicsBody.id);
        physics.attachBallToPaddle(ball.physicsBody, paddle.physicsBody, attachmentOffset);
        ball.isAttached = true;
        ball.attachmentOffset = attachmentOffset;
        MatterBodyModule.setVelocity(ball.physicsBody, { x: 0, y: 0 });
        MatterBodyModule.setAngularVelocity(ball.physicsBody, 0);
        inputToPhysics.resetLaunchTrigger();
        const center = paddleController.getPaddleCenter(paddle);
        runtimeState.previousPaddlePosition = { x: center.x, y: center.y };
        inputToPhysics.syncPaddlePosition(center);
        visuals?.ballSpeedRing?.reset();
    };

    const promoteExtraBallToPrimary = (expiredBody: Body): boolean => {
        if (multiBallController.promoteExtraBallToPrimary(expiredBody)) {
            return true;
        }
        return false;
    };

    const removeExtraBallByBody = (body: Body) => {
        foreshadowing.cancelForBall(body.id);
        multiBallController.removeExtraBallByBody(body);
    };

    const clearExtraBalls = () => {
        foreshadowing
            .getActiveBallIds()
            .filter((ballId: number) => ballId !== ball.physicsBody.id)
            .forEach((ballId: number) => {
                foreshadowing.cancelForBall(ballId);
            });
        multiBallController.clear();
    };

    const resetForeshadowing = () => {
        foreshadowing.reset();
    };

    const spawnExtraBalls = (requestedCount?: number) => {
        multiBallController.spawnExtraBalls({ currentLaunchSpeed: runtimeState.currentLaunchSpeed, requestedCount });
    };

    const applyBallRestitution = (value: number) => {
        const normalized = Number.isFinite(value) ? value : runtimeState.ballRestitution;
        ball.physicsBody.restitution = normalized;
        multiBallController.setRestitution(normalized);
    };

    const applyBallShape = (shape: LoadoutBallShape): void => {
        const normalized = normalizeBallShape(shape);
        multiBallController.setShape(normalized);
        if (normalized === activeBallShape) {
            return;
        }

        const previousBody = ball.physicsBody;
        const previousVisual = visualBodies.get(previousBody) ?? null;
        const wasAttached = physics.isBallAttached(previousBody);
        const attachment = physics.getBallAttachment(previousBody);
        const previousVelocity = {
            x: previousBody.velocity.x,
            y: previousBody.velocity.y,
        } satisfies { x: number; y: number };
        const previousPosition = {
            x: previousBody.position.x,
            y: previousBody.position.y,
        } satisfies { x: number; y: number };
        const previousAngle = previousBody.angle;
        const previousAngularVelocity = previousBody.angularVelocity;
        const previousRestitution = previousBody.restitution;
        const previousLabel = previousBody.label;

        foreshadowing.cancelForBall(previousBody.id);
        physics.detachBallFromPaddle(previousBody);
        physics.remove(previousBody);
        visualBodies.delete(previousBody);

        const newBody = physics.factory.ball({
            radius: ball.radius,
            position: previousPosition,
            restitution: previousRestitution,
            velocity: previousVelocity,
            label: previousLabel,
            shape: toPhysicsBallBodyShape(normalized),
        });
        MatterBodyModule.setAngle(newBody, previousAngle);
        MatterBodyModule.setAngularVelocity(newBody, previousAngularVelocity);
        physics.add(newBody);

        if (previousVisual) {
            visualBodies.set(newBody, previousVisual);
        } else {
            visualBodies.set(newBody, ballGraphics);
        }
        ball.physicsBody = newBody;

        if (wasAttached && attachment) {
            physics.attachBallToPaddle(newBody, paddle.physicsBody, attachment.attachmentOffset);
            ball.isAttached = true;
            ball.attachmentOffset = attachment.attachmentOffset;
        } else {
            ball.isAttached = false;
            if (attachment?.attachmentOffset) {
                ball.attachmentOffset = attachment.attachmentOffset;
            }
        }

        ballGraphics.x = newBody.position.x;
        ballGraphics.y = newBody.position.y;
        ballGraphics.rotation = newBody.angle;

        activeBallShape = normalized;

        clearExtraBalls();
        applyBallRestitution(previousRestitution);
    };

    return {
        reattachBallToPaddle,
        promoteExtraBallToPrimary,
        removeExtraBallByBody,
        clearExtraBalls,
        resetForeshadowing,
        spawnExtraBalls,
        applyBallRestitution,
        applyBallShape,
    };
};
