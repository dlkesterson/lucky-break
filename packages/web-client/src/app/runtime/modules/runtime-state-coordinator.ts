import type { RuntimeDebug } from '../debug';
import type { RuntimeHudCoordinator } from './runtime-hud-coordinator';
import type { RuntimeRoundCoordinatorHandle } from './runtime-round';
import type { createGameLoop } from '../../loop';
import type { CollisionRuntime, CollisionRuntimeDeps } from '../collisions';
import type { LaserController } from '../laser';

/**
 * Simplified state holder for runtime lifecycle variables.
 * Phase 3: Consolidates scattered `let` variables into logical groups.
 * This uses a plain object approach for minimal disruption to existing code.
 */
export function createRuntimeStateHolder() {
    return {
        // Lifecycle State
        loop: null as ReturnType<typeof createGameLoop> | null,
        collisionRuntime: null as CollisionRuntime | null,
        collisionDeps: null as CollisionRuntimeDeps | null,
        laserController: null as LaserController | null,
        isPaused: false,
        runtimeHudCoordinator: null as RuntimeHudCoordinator | null,
        roundCoordinator: null as RuntimeRoundCoordinatorHandle | null,
        runtimeDebug: null as RuntimeDebug | null,

        // HUD Bridge State
        startHudMetricsBridge: (() => {
            // Noop placeholder
        }) as () => void,
        stopHudMetricsBridge: (() => {
            // Noop placeholder
        }) as () => void,
        hudVisible: false,

        // Subscription State
        unsubscribeMeta: null as (() => void) | null,
        unsubscribeThemeChange: null as (() => void) | null,
        unsubscribeThemeSnapshot: null as (() => void) | null,
    };
}

export type RuntimeStateHolder = ReturnType<typeof createRuntimeStateHolder>;
