import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMetaProgressionService } from 'app/runtime/meta-progress-service';
import { setMetaUpgradeManager } from 'app/metaprogression';

describe('createMetaProgressionService', () => {
    beforeEach(() => {
        setMetaUpgradeManager(null);
    });

    afterEach(() => {
        setMetaUpgradeManager(null);
    });

    it('combines achievements and trait effects into runtime modifiers', () => {
        const service = createMetaProgressionService({
            baseComboDecayWindow: 10,
            baseLives: 3,
        });

        expect(service.getComboDecayWindow()).toBeCloseTo(10, 5);
        expect(service.resolveInitialLives()).toBe(3);

        service.metaUpgrades.grantDust(500);
        service.metaUpgrades.purchase('trait:combo-buffer');
        service.refreshMetaLoadout();

        expect(service.getComboDecayWindow()).toBeCloseTo(11, 5);

        service.achievements.recordSessionSummary({ highestCombo: 60 });
        service.refreshAchievementUpgrades();

        expect(service.getComboDecayWindow()).toBeCloseTo(11.55, 5);

        for (let index = 0; index < 1000; index += 1) {
            service.achievements.recordBrickBreak({ combo: 1 });
        }
        const upgrades = service.refreshAchievementUpgrades();

        expect(upgrades.bonusLives).toBeGreaterThanOrEqual(1);
        expect(service.resolveInitialLives()).toBe(4);
    });
});
