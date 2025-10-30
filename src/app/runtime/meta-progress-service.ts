import { createAchievementManager, type AchievementManager, type AchievementUpgrades } from '../achievements';
import { createFateLedger, type FateLedger } from '../fate-ledger';
import { getMetaUpgradeManager } from '../metaprogression';
import type { MetaUpgradeLoadout, MetaUpgradeManager, TraitEffectSummary } from '../meta-upgrades';

export interface MetaProgressionServiceOptions {
    readonly baseComboDecayWindow: number;
    readonly baseLives: number;
}

export interface MetaProgressionService {
    readonly achievements: AchievementManager;
    readonly fateLedger: FateLedger;
    readonly metaUpgrades: MetaUpgradeManager;
    readonly getLoadout: () => MetaUpgradeLoadout;
    readonly getTraitEffects: () => TraitEffectSummary;
    readonly getComboDecayWindow: () => number;
    readonly getUpgradeSnapshot: () => AchievementUpgrades;
    readonly refreshAchievementUpgrades: () => AchievementUpgrades;
    readonly refreshMetaLoadout: () => MetaUpgradeLoadout;
    readonly resolveInitialLives: () => number;
}

const normalizePositiveNumber = (value: number, fallback: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return value;
};

export const createMetaProgressionService = (
    options: MetaProgressionServiceOptions,
): MetaProgressionService => {
    const achievements = createAchievementManager();
    const fateLedger = createFateLedger();
    const metaUpgrades = getMetaUpgradeManager();

    const baseComboDecayWindow = normalizePositiveNumber(options.baseComboDecayWindow, 1);
    const baseLives = Math.max(1, Math.floor(normalizePositiveNumber(options.baseLives, 1)));

    let upgradeSnapshot = achievements.getUpgradeSnapshot();
    let loadout = metaUpgrades.getLoadout();
    let traitEffects: TraitEffectSummary = loadout.traitEffects;

    const recomputeComboDecayWindow = (): number => {
        const multiplier = upgradeSnapshot.comboDecayMultiplier * traitEffects.comboDecayMultiplier;
        const computed = baseComboDecayWindow * multiplier;
        if (!Number.isFinite(computed) || computed <= 0) {
            return baseComboDecayWindow;
        }
        return computed;
    };

    let comboDecayWindow = recomputeComboDecayWindow();

    const applyLoadout = (nextLoadout: MetaUpgradeLoadout): MetaUpgradeLoadout => {
        loadout = nextLoadout;
        traitEffects = nextLoadout.traitEffects;
        comboDecayWindow = recomputeComboDecayWindow();
        return loadout;
    };

    const refreshAchievementUpgrades = (): AchievementUpgrades => {
        upgradeSnapshot = achievements.getUpgradeSnapshot();
        comboDecayWindow = recomputeComboDecayWindow();
        return upgradeSnapshot;
    };

    const refreshMetaLoadout = (): MetaUpgradeLoadout => {
        const nextLoadout = metaUpgrades.getLoadout();
        return applyLoadout(nextLoadout);
    };

    const resolveInitialLives = (): number => {
        const combined = baseLives + upgradeSnapshot.bonusLives + traitEffects.extraLives;
        if (!Number.isFinite(combined) || combined <= 0) {
            return baseLives;
        }
        return Math.max(1, Math.floor(combined));
    };

    return {
        achievements,
        fateLedger,
        metaUpgrades,
        getLoadout: () => loadout,
        getTraitEffects: () => traitEffects,
        getComboDecayWindow: () => comboDecayWindow,
        getUpgradeSnapshot: () => upgradeSnapshot,
        refreshAchievementUpgrades,
        refreshMetaLoadout,
        resolveInitialLives,
    } satisfies MetaProgressionService;
};
