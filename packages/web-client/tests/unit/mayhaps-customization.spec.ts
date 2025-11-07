import { describe, expect, it } from 'vitest';
import { computeLoadoutEffects } from 'app/runtime/loadouts';
import { createGameSessionManager } from 'app/state';
import {
    defaultLoadoutSelection,
    type LoadoutSelection,
} from 'config/loadouts';

describe('Mayhaps customization', () => {
    describe('form physics effects', () => {
        it('boosts launch speed for Entropy Core while preserving higher max speed', () => {
            const baseline = computeLoadoutEffects(defaultLoadoutSelection).combined.runtime.physics;
            const entropyCoreSelection: LoadoutSelection = {
                ...defaultLoadoutSelection,
                form: 'entropy-core',
            };
            const entropyCore = computeLoadoutEffects(entropyCoreSelection).combined.runtime.physics;

            expect(entropyCore.baseSpeedMultiplier).toBeGreaterThan(baseline.baseSpeedMultiplier);
            expect(entropyCore.launchSpeedMultiplier).toBeGreaterThan(baseline.launchSpeedMultiplier);
            expect(entropyCore.maxSpeedMultiplier).toBeGreaterThan(baseline.maxSpeedMultiplier);
        });

        it('softens physics for Nebular Jelly to lower speed and restitution', () => {
            const baseline = computeLoadoutEffects(defaultLoadoutSelection).combined.runtime.physics;
            const nebularSelection: LoadoutSelection = {
                ...defaultLoadoutSelection,
                form: 'nebular-jelly',
            };
            const nebular = computeLoadoutEffects(nebularSelection).combined.runtime.physics;

            expect(nebular.baseSpeedMultiplier).toBeLessThan(baseline.baseSpeedMultiplier);
            expect(nebular.launchSpeedMultiplier).toBeLessThan(baseline.launchSpeedMultiplier);
            expect(nebular.restitutionMultiplier).toBeLessThan(baseline.restitutionMultiplier);
            expect(nebular.gravityOffset).toBeLessThanOrEqual(baseline.gravityOffset);
        });
    });

    it('applies trait scoring modifiers for Double-Edged loadouts', () => {
        const selection: LoadoutSelection = {
            ...defaultLoadoutSelection,
            trait: 'double-edged',
        };
        const bundle = computeLoadoutEffects(selection);

        const session = createGameSessionManager({ now: () => 0 });
        session.setLoadout(bundle.selection, bundle.combined.session);

        session.collectCoins(100);
        const snapshotAfterCoins = session.snapshot();
        const expectedCoinGain = Math.round(100 * bundle.combined.session.coinMultiplier);
        expect(snapshotAfterCoins.coins).toBe(expectedCoinGain);
        expect(snapshotAfterCoins.score).toBe(expectedCoinGain);

        session.recordEntropyEvent({ type: 'brick-break', impactVelocity: 0, comboHeat: 0 });
        const entropyState = session.getEntropyState();
        const expectedCharge = 2.5 * bundle.combined.session.entropyGainMultiplier;
        expect(entropyState.charge).toBeCloseTo(expectedCharge, 5);
    });

    it('boosts sigil reward bonuses when swapping auras', () => {
        const baselineRules = computeLoadoutEffects(defaultLoadoutSelection).combined.runtime.rules;

        const voidBloomSelection: LoadoutSelection = {
            ...defaultLoadoutSelection,
            sigil: 'void-bloom',
        };
        const voidBloomRules = computeLoadoutEffects(voidBloomSelection).combined.runtime.rules;
        expect(voidBloomRules.powerUpChanceMultiplier).toBeGreaterThan(baselineRules.powerUpChanceMultiplier);
        expect(voidBloomRules.coinsAlwaysDrop).toBe(false);

        const mirrorSpiralSelection: LoadoutSelection = {
            ...defaultLoadoutSelection,
            sigil: 'mirror-spiral',
        };
        const mirrorRules = computeLoadoutEffects(mirrorSpiralSelection).combined.runtime.rules;
        expect(mirrorRules.coinsAlwaysDrop).toBe(true);
        expect(mirrorRules.powerUpChanceMultiplier).toBeGreaterThan(0);
    });

    it('persists loadout selections across session snapshots', () => {
        const customSelection: LoadoutSelection = {
            form: 'd20-diceform',
            trait: 'entropy-bound',
            sigil: 'chaos-knot',
            voice: 'pulse',
        };
        const bundle = computeLoadoutEffects(customSelection);

        const session = createGameSessionManager({ now: () => 0 });
        session.setLoadout(bundle.selection, bundle.combined.session);

        const firstSnapshot = session.snapshot();
        expect(firstSnapshot.loadout).toEqual(customSelection);

        // Mutate the returned selection to ensure internal state stays immutable.
        const mutated = firstSnapshot.loadout as unknown as { form: LoadoutSelection['form'] };
        mutated.form = 'ivory-orb';

        session.collectCoins(10);
        const secondSnapshot = session.snapshot();
        expect(secondSnapshot.loadout).toEqual(customSelection);
    });
});
