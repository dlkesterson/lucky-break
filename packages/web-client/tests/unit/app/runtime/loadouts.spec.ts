import { describe, expect, it } from 'vitest';
import {
    buildLoadoutFormPresets,
    computeLoadoutEffects,
    normalizeLoadoutSelection,
} from 'app/runtime/loadouts';
import {
    defaultLoadoutSelection,
    type LoadoutFormId,
    type LoadoutSelection,
    type LoadoutTraitId,
    type LoadoutSigilId,
    type LoadoutVoiceId,
} from 'config/loadouts';

describe('runtime loadouts', () => {
    it('normalizes loadout selection when values are invalid', () => {
        const normalized = normalizeLoadoutSelection({
            form: 'entropy-core',
            trait: 'non-existent' as unknown as LoadoutTraitId,
            sigil: 'missing-sigil' as unknown as LoadoutSigilId,
            voice: undefined as unknown as LoadoutVoiceId,
        });

        expect(normalized).toEqual({ ...defaultLoadoutSelection, form: 'entropy-core' });
    });

    it('retains valid selections when normalizing', () => {
        const selection: LoadoutSelection = {
            form: 'crystal-probability',
            trait: 'stable-bias',
            sigil: 'void-bloom',
            voice: 'static-choir',
        };

        expect(normalizeLoadoutSelection(selection)).toEqual(selection);
    });

    it('builds presets that align with their declared forms', () => {
        const presets = buildLoadoutFormPresets();
        expect(presets).not.toHaveLength(0);
        for (const preset of presets) {
            expect(preset.id).toBe(preset.selection.form);
        }
    });

    it('recovers from invalid combinations when computing effects', () => {
        const corruptedSelection = {
            form: 'entropy-core',
            trait: 'invalid-trait',
            sigil: 'invalid-sigil',
            voice: 'invalid-voice',
        } as unknown as LoadoutSelection;
        const normalized = normalizeLoadoutSelection(corruptedSelection);

        const safeEffects = computeLoadoutEffects(corruptedSelection);
        const expected = computeLoadoutEffects(normalized);

        expect(safeEffects.selection).toEqual(normalized);
        expect(safeEffects.combined).toEqual(expected.combined);
    });

    it('computes distinct effects for valid selections', () => {
        const entropy = computeLoadoutEffects(defaultLoadoutSelection).combined;
        const crystal = computeLoadoutEffects({
            form: 'crystal-probability',
            trait: 'stable-bias',
            sigil: 'void-bloom',
            voice: 'static-choir',
        }).combined;

        expect(crystal.runtime.physics.gravityOffset).not.toBe(entropy.runtime.physics.gravityOffset);
        expect(crystal.session.comboWindowBonusSeconds).toBeGreaterThan(entropy.session.comboWindowBonusSeconds);
    });

    it('applies a ball palette override for each form', () => {
        const expectedBaseColors: Record<LoadoutFormId, number> = {
            'ivory-orb': 0xf0d9b5,
            'nebular-jelly': 0x7a6cff,
            'd20-diceform': 0xf4f1ff,
            'stop-sign': 0xff2f2f,
            'crystal-probability': 0x5be4ff,
            'entropy-core': 0xff6b6b,
        };

        (Object.keys(expectedBaseColors) as LoadoutFormId[]).forEach((form) => {
            const bundle = computeLoadoutEffects({ ...defaultLoadoutSelection, form }).combined;
            const ballVisuals = bundle.visuals.ball;

            expect(ballVisuals).toBeDefined();
            expect(ballVisuals?.baseColor).toBe(expectedBaseColors[form]);

            if (form === 'd20-diceform') {
                expect(ballVisuals?.shape).toBe('d20');
            }
        });
    });
});
