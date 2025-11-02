import type { GameConfig } from 'config/game';
import type { MultiBallController } from '../multi-ball-controller';
import type { Logger } from 'util/log';
import type { LaserController } from './laser';
import type { LaserPaddleReward } from 'game/rewards';
import type { RuntimePowerups } from './powerups';
import { createRuntimePowerups } from './powerups';
import type { RuntimeModifiers } from './modifiers';
import { createRuntimeModifiers } from './modifiers';
import type { GameplayRuntimeState } from './types';
import type { PowerUpManager } from 'util/power-ups';

export interface ModifierPowerupDefaults {
    readonly paddleWidthMultiplier: number;
    readonly multiBallCapacity: number;
    readonly multiBallMaxDuration: number;
    readonly slowTimeMaxDuration: number;
}

export interface ModifierPowerupServicesDeps {
    readonly logger: Logger;
    readonly modifierConfig: GameConfig['modifiers'];
    readonly runtimeState: Pick<
        GameplayRuntimeState,
        'gravity' | 'ballRestitution' | 'paddleBaseWidth' | 'speedGovernorMultiplier'
    >;
    readonly basePaddleWidth: number;
    readonly defaults: ModifierPowerupDefaults;
    readonly multiBallController: MultiBallController;
    readonly flashBallLight: (intensity: number) => void;
    readonly flashPaddleLight: (intensity: number) => void;
    readonly spawnExtraBalls: (requestedCount?: number) => void;
    readonly resetGhostBricks: () => void;
    readonly applyGhostBrickReward: (duration: number, ghostCount: number) => void;
    readonly getGhostBrickRemainingDuration: () => number;
    readonly physics: { setGravity(value: number): void };
    readonly setPaddleWidth: (requestedWidth: number) => void;
    readonly setBallRestitution: (value: number) => void;
    readonly onSpeedGovernorChange?: (multiplier: number) => void;
}

export interface ModifierPowerupServicesResult {
    readonly powerups: RuntimePowerups;
    readonly powerUpManager: PowerUpManager;
    readonly runtimeModifiers: RuntimeModifiers;
    readonly bindLaserController: (controller: LaserController | null) => void;
}

export const createModifierPowerupServices = ({
    logger,
    modifierConfig,
    runtimeState,
    basePaddleWidth,
    defaults,
    multiBallController,
    flashBallLight,
    flashPaddleLight,
    spawnExtraBalls,
    resetGhostBricks,
    applyGhostBrickReward,
    getGhostBrickRemainingDuration,
    physics,
    setPaddleWidth,
    setBallRestitution,
    onSpeedGovernorChange,
}: ModifierPowerupServicesDeps): ModifierPowerupServicesResult => {
    let laserController: LaserController | null = null;
    let pendingLaserReward: LaserPaddleReward | null = null;

    const enableLaserReward = (reward: LaserPaddleReward) => {
        if (laserController) {
            laserController.activate(reward);
            return;
        }
        pendingLaserReward = reward;
    };

    const disableLaserReward = () => {
        laserController?.deactivate();
        pendingLaserReward = null;
    };

    const powerups = createRuntimePowerups({
        logger,
        multiBallController,
        flashBallLight,
        flashPaddleLight,
        spawnExtraBalls,
        resetGhostBricks,
        applyGhostBrickReward,
        getGhostBrickRemainingDuration,
        enableLaserReward,
        disableLaserReward,
        defaults,
    });

    const refreshPaddleWidth = (): void => {
        const scale = powerups.getPaddleWidthScale();
        const targetWidth = runtimeState.paddleBaseWidth * scale;
        setPaddleWidth(targetWidth);
    };

    const applyRestitution = (value: number): void => {
        const normalized = Number.isFinite(value) ? value : runtimeState.ballRestitution;
        setBallRestitution(normalized);
    };

    const runtimeModifiers = createRuntimeModifiers({
        config: modifierConfig,
        physics,
        runtimeState,
        baseValues: { paddleWidth: basePaddleWidth },
        applyRestitution: (value) => {
            applyRestitution(value);
        },
        applyPaddleBaseWidth: () => {
            refreshPaddleWidth();
        },
        onSpeedGovernorChange,
    });

    const bindLaserController = (controller: LaserController | null): void => {
        laserController = controller;
        if (!laserController) {
            pendingLaserReward = null;
            return;
        }
        if (pendingLaserReward) {
            laserController.activate(pendingLaserReward);
            pendingLaserReward = null;
        }
    };

    refreshPaddleWidth();

    return {
        powerups,
        powerUpManager: powerups.manager,
        runtimeModifiers,
        bindLaserController,
    } satisfies ModifierPowerupServicesResult;
};
