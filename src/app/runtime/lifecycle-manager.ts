import type { RandomManager } from 'util/random';
import type { FateLedger } from '../fate-ledger';
import type { GameSessionManager } from '../state';
import type { IdleSimulationHandle, IdleSimulationResultSummary } from './idle';
import { createIdleSimulation } from './idle';
import type { RuntimeLifecycle } from './lifecycle';
import { createRuntimeLifecycle } from './lifecycle';

export interface RuntimeLifecycleSetupDeps {
    readonly session: GameSessionManager;
    readonly random: RandomManager;
    readonly fateLedger: FateLedger;
    readonly cleanupHandlers: readonly (() => void)[];
}

export interface RuntimeLifecycleSetupResult {
    readonly lifecycle: RuntimeLifecycle;
    readonly idleSimulation: IdleSimulationHandle;
    readonly idleResumeSummary: IdleSimulationResultSummary | null;
}

export const initializeRuntimeLifecycle = ({
    session,
    random,
    fateLedger,
    cleanupHandlers,
}: RuntimeLifecycleSetupDeps): RuntimeLifecycleSetupResult => {
    const lifecycle = createRuntimeLifecycle();
    const idleSimulation = createIdleSimulation({
        session,
        random,
        fateLedger,
        lifecycle,
    });

    cleanupHandlers.forEach((handler) => {
        lifecycle.register(handler);
    });

    lifecycle.install();

    const idleResumeSummary = idleSimulation.resumeIfNeeded();
    idleSimulation.persistSnapshot();

    return {
        lifecycle,
        idleSimulation,
        idleResumeSummary,
    } satisfies RuntimeLifecycleSetupResult;
};
