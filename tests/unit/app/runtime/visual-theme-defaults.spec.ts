import { describe, expect, it } from 'vitest';
import { GameTheme } from 'render/theme';
import { toColorNumber, mixColors } from 'render/playfield-visuals';
import { createVisualThemeDefaults } from 'app/runtime/visual-theme-defaults';
import type { MetaUpgradeLoadout } from 'app/meta-upgrades';

type VisualPalette = MetaUpgradeLoadout['visualPalette'];

type AudioPalette = MetaUpgradeLoadout['audioPalette'];

type TraitEffects = MetaUpgradeLoadout['traitEffects'];

const buildVisualPalette = (overrides: Partial<VisualPalette> = {}): VisualPalette => ({
    id: 'baseline',
    label: 'Unit Test Visual',
    description: 'Unit test palette',
    cost: 0,
    previewAccent: '#ffffff',
    ...overrides,
});

const buildAudioPalette = (overrides: Partial<AudioPalette> = {}): AudioPalette => ({
    id: 'baseline',
    label: 'Unit Test Audio',
    description: 'Unit test audio palette',
    cost: 0,
    config: {},
    ...overrides,
});

const baseTraitEffects: TraitEffects = {
    extraLives: 0,
    comboDecayMultiplier: 1,
};

describe('visual-theme-defaults', () => {
    it('applies meta overrides and cycles the background palette', () => {
        const currentLoadout: MetaUpgradeLoadout = {
            visualPalette: buildVisualPalette({
                ball: {
                    core: '#010101',
                    aura: '#020202',
                    highlight: '#030303',
                    baseAlpha: 0.5,
                    rimAlpha: 0.25,
                    innerAlpha: 0.2,
                },
                paddle: {
                    gradient: ['#111111', '#222222'],
                    accentColor: '#333333',
                },
                accents: {
                    combo: '#444444',
                    powerUp: '#555555',
                    background: ['#666666', '#777777', '#888888'],
                },
            }),
            audioPalette: buildAudioPalette(),
            traitEffects: baseTraitEffects,
        };
        const defaults = createVisualThemeDefaults({
            initialTheme: GameTheme,
            getMetaLoadout: () => currentLoadout,
        });

        let snapshot = defaults.getSnapshot();

        expect(snapshot.ballColors).toEqual({
            core: toColorNumber('#010101'),
            aura: toColorNumber('#020202'),
            highlight: toColorNumber('#030303'),
        });
        expect(snapshot.ballDefaults.baseAlpha).toBe(0.5);
        expect(snapshot.paddleDefaults.gradient).toEqual([
            toColorNumber('#111111'),
            toColorNumber('#222222'),
        ]);
        expect(snapshot.accents.combo).toBe(toColorNumber('#444444'));
        expect(snapshot.accents.powerUp).toBe(toColorNumber('#555555'));
        expect(snapshot.backgroundAccentPalette).toEqual([
            toColorNumber('#666666'),
            toColorNumber('#777777'),
            toColorNumber('#888888'),
        ]);
        expect(snapshot.backgroundAccentIndex).toBe(0);

        snapshot = defaults.cycleBackgroundAccent(1);
        expect(snapshot.backgroundAccentIndex).toBe(1);
        expect(snapshot.backgroundAccentColor).toBe(toColorNumber('#777777'));

        snapshot = defaults.cycleBackgroundAccent(-2);
        expect(snapshot.backgroundAccentIndex).toBe(2);
        expect(snapshot.backgroundAccentColor).toBe(toColorNumber('#888888'));
    });

    it('falls back to theme colors when overrides are missing', () => {
        let currentLoadout: MetaUpgradeLoadout = {
            visualPalette: buildVisualPalette({
                accents: {
                    combo: '#abcdef',
                    powerUp: '#135790',
                    background: ['#000000', '#111111', '#222222'],
                },
            }),
            audioPalette: buildAudioPalette(),
            traitEffects: baseTraitEffects,
        };
        const defaults = createVisualThemeDefaults({
            initialTheme: GameTheme,
            getMetaLoadout: () => currentLoadout,
        });

        // Advance the palette so we can ensure indices wrap when applying a new theme.
        defaults.cycleBackgroundAccent(5);

        currentLoadout = {
            visualPalette: buildVisualPalette({
                accents: {
                    combo: '#445566',
                    powerUp: '#778899',
                },
            }),
            audioPalette: buildAudioPalette(),
            traitEffects: baseTraitEffects,
        };

        const snapshot = defaults.applyTheme(GameTheme);

        expect(snapshot.backgroundAccentPalette).toHaveLength(3);
        expect(snapshot.backgroundAccentIndex).toBeLessThan(snapshot.backgroundAccentPalette.length);

        const expectedCombo = toColorNumber('#445566');
        const expectedAura = toColorNumber(GameTheme.ball.aura);
        const expectedHighlight = toColorNumber(GameTheme.ball.highlight);
        const expectedPowerUp = toColorNumber('#778899');
        const fallbackPalette = [
            expectedCombo,
            expectedAura,
            mixColors(expectedPowerUp, expectedHighlight, 0.45),
        ];

        expect(snapshot.backgroundAccentPalette).toEqual(fallbackPalette);
        expect(snapshot.backgroundAccentColor).toBe(
            fallbackPalette[snapshot.backgroundAccentIndex] ?? fallbackPalette[0],
        );
    });
});
