import type { PowerUpType } from 'util/power-ups';
import type { RewardType, Reward } from 'game/rewards';
import type { Logger } from 'util/log';
import type { RuntimePowerups } from './powerups';
import type { RoundMachine } from './round-machine';
import type { GameSessionManager } from 'app/state';

/**
 * Cheat power-up bindings for development/debugging.
 * Press Digit1-5 in gameplay to spawn specific power-ups.
 */
export const CHEAT_POWERUP_BINDINGS: readonly { code: KeyboardEvent['code']; type: PowerUpType }[] = [
    { code: 'Digit1', type: 'paddle-width' },
    { code: 'Digit2', type: 'ball-speed' },
    { code: 'Digit3', type: 'multi-ball' },
    { code: 'Digit4', type: 'sticky-paddle' },
    { code: 'Digit5', type: 'laser' },
] as const;

export interface DeveloperCheatDeps {
    readonly getCurrentScene: () => string | null;
    readonly getPaddlePosition: () => { readonly x: number; readonly y: number };
    readonly spawnPowerUp: (type: PowerUpType, position: { readonly x: number; readonly y: number }) => void;
    readonly powerUpRadius: number;
    readonly renderStageSoon: () => void;
    readonly runtimeLogger: Logger;
    readonly roundMachine: Pick<RoundMachine, 'getCurrentLevelIndex' | 'setPendingReward'>;
    readonly powerups: RuntimePowerups;
    readonly refreshHud: () => void;
    readonly createReward: (type: RewardType) => Reward;
    readonly session: Pick<GameSessionManager, 'completeRound'>;
    readonly handleLevelComplete: () => void;
}

export interface DeveloperCheats {
    readonly spawnPowerUpCheat: (type: PowerUpType) => void;
    readonly applyRewardCheat: (rewardType: RewardType) => void;
    readonly skipToNextLevelCheat: () => void;
}

export const createDeveloperCheats = ({
    getCurrentScene,
    getPaddlePosition,
    spawnPowerUp,
    powerUpRadius,
    renderStageSoon,
    runtimeLogger,
    roundMachine,
    powerups,
    refreshHud,
    createReward,
    session,
    handleLevelComplete,
}: DeveloperCheatDeps): DeveloperCheats => {
    const isGameplaySceneActive = () => getCurrentScene() === 'gameplay';

    const spawnPowerUpCheat = (type: PowerUpType): void => {
        if (!isGameplaySceneActive()) {
            runtimeLogger.warn('Developer cheat ignored: spawn power-up outside gameplay scene', { type });
            return;
        }
        const paddlePosition = getPaddlePosition();
        const spawnX = paddlePosition.x;
        const spawnY = Math.max(powerUpRadius, paddlePosition.y - 120);
        spawnPowerUp(type, { x: spawnX, y: spawnY });
        runtimeLogger.info('Developer cheat spawned power-up', { type, position: { x: spawnX, y: spawnY } });
        renderStageSoon();
    };

    const applyRewardCheat = (rewardType: RewardType): void => {
        if (!isGameplaySceneActive()) {
            runtimeLogger.warn('Developer cheat ignored: reward activation outside gameplay', { rewardType });
            return;
        }
        const reward = createReward(rewardType);
        roundMachine.setPendingReward(null);
        powerups.activateReward(reward);
        refreshHud();
        runtimeLogger.info('Developer cheat activated reward', { rewardType });
        renderStageSoon();
    };

    const skipToNextLevelCheat = (): void => {
        if (!isGameplaySceneActive()) {
            runtimeLogger.warn('Developer cheat ignored: skip level outside gameplay');
            return;
        }
        const currentLevel = roundMachine.getCurrentLevelIndex() + 1;
        runtimeLogger.info('Developer cheat skipping current level', { level: currentLevel });
        session.completeRound();
        handleLevelComplete();
        renderStageSoon();
    };

    return {
        spawnPowerUpCheat,
        applyRewardCheat,
        skipToNextLevelCheat,
    } satisfies DeveloperCheats;
};
