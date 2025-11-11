import type { GameSessionManager } from 'app/state';
import type { MultiBallColors } from '../../multi-ball-controller';
import type { PaddleVisualDefaults, BallVisualPalette } from 'render/playfield-visuals';
import type { RuntimeVisuals } from '../physics-assembly';
import type { RuntimeDebug } from '../debug';
import type { RuntimeHudCoordinator } from './runtime-hud-coordinator';
import type { RuntimeRoundCoordinatorHandle } from './runtime-round';
import type { LoadoutBallShape } from 'config/loadouts';
import type { LoadoutEffectsBundle } from '../loadouts';
import type { createGameLoop } from '../../loop';

/**
 * Simplified state holder for runtime lifecycle variables.
 * Phase 3: Consolidates scattered `let` variables into logical groups.
 * This uses a plain object approach for minimal disruption to existing code.
 */
export function createRuntimeStateHolder() {
    return {
        // Lifecycle State
        loop: null as ReturnType<typeof createGameLoop> | null,
        collisionRuntime: null as any,
        collisionDeps: null as any,
        laserController: null as any,
        isPaused: false,
        runtimeHudCoordinator: null as RuntimeHudCoordinator | null,
        roundCoordinator: null as RuntimeRoundCoordinatorHandle | null,
        runtimeDebug: null as RuntimeDebug | null,

        // HUD Bridge State
        startHudMetricsBridge: (() => { }) as () => void,
        stopHudMetricsBridge: (() => { }) as () => void,
        hudVisible: false,

        // Subscription State
        unsubscribeMeta: null as (() => void) | null,
        unsubscribeThemeChange: null as (() => void) | null,
        unsubscribeThemeSnapshot: null as (() => void) | null,
    };
}

export type RuntimeStateHolder = ReturnType<typeof createRuntimeStateHolder>;
