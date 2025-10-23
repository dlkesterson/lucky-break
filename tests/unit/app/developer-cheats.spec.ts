import { afterEach, describe, expect, it } from 'vitest';
import { developerCheats } from 'app/developer-cheats';
import { getRewardOverride } from 'game/rewards';

const resetCheats = () => {
    developerCheats.resetForTests();
};

describe('developerCheats', () => {
    afterEach(() => {
        resetCheats();
    });

    it('toggles enabled state', () => {
        resetCheats();
        developerCheats.setEnabled(false);
        expect(developerCheats.isEnabled()).toBe(false);
        const next = developerCheats.toggleEnabled();
        expect(next.enabled).toBe(true);
        const final = developerCheats.toggleEnabled();
        expect(final.enabled).toBe(false);
    });

    it('applies reward override when enabled', () => {
        resetCheats();
        developerCheats.setEnabled(true);
        developerCheats.setForcedReward('multi-ball');
        expect(getRewardOverride()?.type).toBe('multi-ball');
        developerCheats.setEnabled(false);
        expect(getRewardOverride()).toBeNull();
    });

    it('cycles rewards forward and backward', () => {
        resetCheats();
        developerCheats.setEnabled(true);
        const forward = developerCheats.cycleForcedReward(1);
        expect(forward.forcedReward).toBeTruthy();
        const backward = developerCheats.cycleForcedReward(-1);
        expect(backward.forcedReward).toBeTruthy();
        expect(developerCheats.getState().forcedReward).toBe(backward.forcedReward);
    });
});
