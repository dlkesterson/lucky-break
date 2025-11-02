import { createMetaUpgradeManager, type MetaUpgradeManager } from './meta-upgrades';

let manager: MetaUpgradeManager | null = null;

export const getMetaUpgradeManager = (): MetaUpgradeManager => {
    manager ??= createMetaUpgradeManager();
    return manager;
};

export const setMetaUpgradeManager = (instance: MetaUpgradeManager | null): void => {
    manager = instance;
};
