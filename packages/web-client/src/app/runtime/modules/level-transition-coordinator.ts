/**
 * Level transition coordinator
 * Handles level completion, game over, and round coordination
 */

import type { RuntimeRoundCoordinatorHandle } from './runtime-round';
import type { Logger } from 'util/log';

export interface LevelTransitionContext {
    roundCoordinator: RuntimeRoundCoordinatorHandle | null;
    logger: Logger;
}

export interface LevelTransitionCoordinator {
    handleLevelComplete: () => void;
    handleGameOver: () => void;
}

export const createLevelTransitionCoordinator = (
    context: LevelTransitionContext,
): LevelTransitionCoordinator => {
    const { roundCoordinator, logger } = context;

    const handleLevelComplete = (): void => {
        if (!roundCoordinator) {
            logger.warn('Runtime round coordinator not ready; ignoring level complete');
            return;
        }
        roundCoordinator.handleLevelComplete();
    };

    const handleGameOver = (): void => {
        if (!roundCoordinator) {
            logger.warn('Runtime round coordinator not ready; ignoring game over');
            return;
        }
        roundCoordinator.handleGameOver();
    };

    return {
        handleLevelComplete,
        handleGameOver,
    };
};
