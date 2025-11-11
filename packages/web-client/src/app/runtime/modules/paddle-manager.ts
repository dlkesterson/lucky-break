import { Body as MatterBodyModule } from 'physics/matter';
import type { Paddle } from 'render/contracts';

export interface PaddleManagerContext {
    readonly paddle: Paddle;
}

export interface PaddleManager {
    readonly setPaddleWidth: (requestedWidth: number) => void;
}

export const createPaddleManager = (context: PaddleManagerContext): PaddleManager => {
    const { paddle } = context;

    const setPaddleWidth = (() => {
        let lastWidth = paddle.width;
        return (requestedWidth: number): void => {
            const clampedWidth = Number.isFinite(requestedWidth) ? Math.max(24, requestedWidth) : lastWidth;
            if (Math.abs(clampedWidth - lastWidth) <= 1e-3) {
                paddle.width = clampedWidth;
                return;
            }
            const currentPosition = {
                x: paddle.physicsBody.position.x,
                y: paddle.physicsBody.position.y,
            };
            const scaleX = clampedWidth / lastWidth;
            if (Number.isFinite(scaleX) && scaleX > 0) {
                MatterBodyModule.scale(paddle.physicsBody, scaleX, 1);
                MatterBodyModule.setPosition(paddle.physicsBody, currentPosition);
            }
            lastWidth = clampedWidth;
            paddle.width = clampedWidth;
            paddle.position.x = currentPosition.x;
            paddle.position.y = currentPosition.y;
        };
    })();

    return {
        setPaddleWidth,
    };
};
