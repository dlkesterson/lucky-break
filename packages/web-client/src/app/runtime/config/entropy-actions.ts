/**
 * Entropy Action Configuration
 *
 * Defines costs, key bindings, and execution order for entropy-based
 * player actions (reroll, shield, bailout) during reward selection.
 */

import type { RewardEntropyAction } from 'app/events';
import type { RuntimeConfigResolver } from '../config-resolver';

/**
 * Key binding configuration for an entropy action.
 */
export interface EntropyActionBinding {
    readonly key: string;
    readonly hotkey: string;
    readonly label: string;
}

/**
 * Complete entropy action configuration bundle.
 */
export interface EntropyActionConfig {
    readonly costs: Record<RewardEntropyAction, number>;
    readonly bindings: Record<RewardEntropyAction, EntropyActionBinding>;
    readonly sequence: readonly RewardEntropyAction[];
}

/**
 * Creates entropy action configuration using the runtime config resolver.
 *
 * @param configResolver - Runtime configuration resolver for accessing game config
 * @returns Fully configured entropy action settings
 */
export const createEntropyActionConfig = (
    configResolver: RuntimeConfigResolver,
): EntropyActionConfig => {
    const costs: Record<RewardEntropyAction, number> = {
        reroll: configResolver.entropyRerollCost,
        shield: configResolver.entropyShieldCost,
        bailout: configResolver.entropyBailoutCost,
    } as const;

    const bindings: Record<RewardEntropyAction, EntropyActionBinding> = {
        reroll: { key: 'KeyR', hotkey: 'R', label: 'Reroll' },
        shield: { key: 'KeyS', hotkey: 'S', label: 'Shield' },
        bailout: { key: 'KeyB', hotkey: 'B', label: 'Bailout' },
    } as const;

    const sequence: readonly RewardEntropyAction[] = ['reroll', 'shield', 'bailout'];

    return {
        costs,
        bindings,
        sequence,
    };
};
