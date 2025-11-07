import type { LoadoutBallShape } from 'config/loadouts';
import type { BallBodyShape } from 'physics/world';

export const DEFAULT_LOADOUT_BALL_SHAPE: LoadoutBallShape = 'sphere';

export const normalizeBallShape = (shape: LoadoutBallShape | null | undefined): LoadoutBallShape =>
    shape ?? DEFAULT_LOADOUT_BALL_SHAPE;

export const toPhysicsBallBodyShape = (shape: LoadoutBallShape | undefined): BallBodyShape => {
    const normalized = normalizeBallShape(shape);
    if (normalized === 'd20') {
        return { type: 'regular-polygon', sides: 20 };
    }
    return { type: 'circle' };
};
