export type LoadoutCategoryId = 'form' | 'trait' | 'sigil' | 'voice';

export type LoadoutFormId =
    | 'ivory-orb'
    | 'nebular-jelly'
    | 'd6-diceform'
    | 'crystal-probability'
    | 'entropy-core';

export type LoadoutTraitId =
    | 'fortune-favored'
    | 'entropy-bound'
    | 'double-edged'
    | 'stable-bias'
    | "drifters-calm";

export type LoadoutSigilId =
    | 'luck-rune'
    | 'mirror-spiral'
    | 'chaos-knot'
    | 'serene-eye'
    | 'void-bloom';

export type LoadoutVoiceId = 'chime' | 'whisper' | 'pulse' | 'static-choir' | 'coinfall';

export interface LoadoutSelection {
    readonly form: LoadoutFormId;
    readonly trait: LoadoutTraitId;
    readonly sigil: LoadoutSigilId;
    readonly voice: LoadoutVoiceId;
}

export interface LoadoutSessionEffects {
    coinMultiplier: number;
    entropyGainMultiplier: number;
    entropyLossMultiplier: number;
    idleGrantBonus: number;
    comboWindowBonusSeconds: number;
}

export interface LoadoutRuntimePhysicsEffects {
    baseSpeedMultiplier: number;
    maxSpeedMultiplier: number;
    launchSpeedMultiplier: number;
    gravityOffset: number;
    restitutionMultiplier: number;
    paddleWidthMultiplier: number;
    speedGovernorMultiplier: number;
}

export interface LoadoutRuntimeRuleEffects {
    coinsAlwaysDrop: boolean;
    gambleBricksMoreLikely: boolean;
    powerUpChanceMultiplier: number;
    difficultyMultiplier: number;
}

export type LoadoutVoicePaletteOverrides = Record<string, unknown>;

export interface LoadoutRuntimeAudioEffects {
    paletteOverrides?: LoadoutVoicePaletteOverrides;
}

export interface LoadoutRuntimeEffects {
    readonly physics: LoadoutRuntimePhysicsEffects;
    readonly rules: LoadoutRuntimeRuleEffects;
    readonly audio: LoadoutRuntimeAudioEffects;
}

export interface LoadoutCombinedEffects {
    readonly session: LoadoutSessionEffects;
    readonly runtime: LoadoutRuntimeEffects;
}

interface LoadoutEffectContribution {
    readonly session?: Partial<LoadoutSessionEffects>;
    readonly physics?: Partial<LoadoutRuntimePhysicsEffects>;
    readonly rules?: Partial<LoadoutRuntimeRuleEffects>;
    readonly audio?: LoadoutRuntimeAudioEffects;
}

interface LoadoutOptionDefinition<Id extends string> {
    readonly id: Id;
    readonly name: string;
    readonly description: string;
    readonly effectSummary: readonly string[];
    readonly contribution: LoadoutEffectContribution;
}

export const loadoutForms: readonly LoadoutOptionDefinition<LoadoutFormId>[] = [
    {
        id: 'ivory-orb',
        name: 'Polished Ivory Orb',
        description: 'A balanced Mayhaps that mirrors the house standard.',
        effectSummary: ['Baseline control', 'Neutral bounce profile'],
        contribution: {},
    },
    {
        id: 'nebular-jelly',
        name: 'Nebular Jelly',
        description: 'Viscous starlight suspended in motion.',
        effectSummary: ['Softer bounces', 'Slightly slower launch', 'Longer combo cushion'],
        contribution: {
            physics: {
                restitutionMultiplier: 0.96,
                baseSpeedMultiplier: 0.92,
                maxSpeedMultiplier: 0.95,
                launchSpeedMultiplier: 0.9,
                gravityOffset: -0.02,
            },
            session: {
                comboWindowBonusSeconds: 0.25,
            },
        },
    },
    {
        id: 'd6-diceform',
        name: 'D6 Diceform',
        description: 'Luck incarnate — each face nudges fate.',
        effectSummary: ['Sharper ricochets', 'Slight speed governor boost', 'Small coin surge'],
        contribution: {
            physics: {
                restitutionMultiplier: 1.08,
                speedGovernorMultiplier: 1.05,
            },
            session: {
                coinMultiplier: 1.05,
            },
            rules: {
                gambleBricksMoreLikely: true,
            },
        },
    },
    {
        id: 'crystal-probability',
        name: 'Crystal Probability',
        description: 'Refractions of chance amplify winnings and chaos.',
        effectSummary: ['Bonus coin yield', 'Higher chaos gain', 'Floatier drift'],
        contribution: {
            physics: {
                gravityOffset: -0.05,
                speedGovernorMultiplier: 1.08,
            },
            session: {
                coinMultiplier: 1.1,
                entropyGainMultiplier: 1.08,
            },
        },
    },
    {
        id: 'entropy-core',
        name: 'Entropy Core',
        description: 'A runaway singularity hungry for momentum.',
        effectSummary: ['Faster base speed', 'Unstable rebound', 'Greater stakes'],
        contribution: {
            physics: {
                baseSpeedMultiplier: 1.18,
                maxSpeedMultiplier: 1.22,
                launchSpeedMultiplier: 1.15,
                gravityOffset: -0.08,
                restitutionMultiplier: 1.04,
            },
            session: {
                entropyGainMultiplier: 1.12,
                entropyLossMultiplier: 1.08,
            },
            rules: {
                difficultyMultiplier: 1.08,
            },
        },
    },
] as const;

export const loadoutTraits: readonly LoadoutOptionDefinition<LoadoutTraitId>[] = [
    {
        id: 'fortune-favored',
        name: 'Fortune-Favored',
        description: 'Luck leans toward generosity when Mayhaps smiles.',
        effectSummary: ['+15% coin gain', '-10% entropy build'],
        contribution: {
            session: {
                coinMultiplier: 1.15,
                entropyGainMultiplier: 0.9,
            },
        },
    },
    {
        id: 'entropy-bound',
        name: 'Entropy-Bound',
        description: 'Feeds on chaos; rewards risk and disorder.',
        effectSummary: ['Heat spikes pay extra', 'Chaos surges faster'],
        contribution: {
            session: {
                entropyGainMultiplier: 1.18,
                coinMultiplier: 1.05,
            },
            rules: {
                powerUpChanceMultiplier: 1.05,
            },
        },
    },
    {
        id: 'double-edged',
        name: 'Double-Edged',
        description: 'Amplifies every outcome — boon or blunder.',
        effectSummary: ['Rewards doubled', 'Penalties doubled', 'Harder tables'],
        contribution: {
            session: {
                coinMultiplier: 1.2,
                entropyGainMultiplier: 1.25,
                entropyLossMultiplier: 1.25,
            },
            rules: {
                difficultyMultiplier: 1.12,
            },
        },
    },
    {
        id: 'stable-bias',
        name: 'Stable Bias',
        description: 'Prefers safe lines and predictable rebounds.',
        effectSummary: ['Reduced chaos growth', 'Extra combo window'],
        contribution: {
            session: {
                entropyGainMultiplier: 0.85,
                comboWindowBonusSeconds: 0.4,
            },
            rules: {
                powerUpChanceMultiplier: 0.92,
            },
        },
    },
    {
        id: "drifters-calm",
        name: "Drifter's Calm",
        description: 'Relaxes into the drift and slows entropy bleed.',
        effectSummary: ['Idle entropy trickle', 'Softer penalties'],
        contribution: {
            session: {
                idleGrantBonus: 0.18,
                entropyLossMultiplier: 0.9,
            },
        },
    },
] as const;

export const loadoutSigils: readonly LoadoutOptionDefinition<LoadoutSigilId>[] = [
    {
        id: 'luck-rune',
        name: 'Luck Rune',
        description: 'A persistent gleam tilts jackpots your way.',
        effectSummary: ['+5% coin value'],
        contribution: {
            session: {
                coinMultiplier: 1.05,
            },
        },
    },
    {
        id: 'mirror-spiral',
        name: 'Mirror Spiral',
        description: 'Deflects ill fortune back into the void.',
        effectSummary: ['Coins always drop', 'Softens entropy loss'],
        contribution: {
            session: {
                entropyLossMultiplier: 0.85,
            },
            rules: {
                coinsAlwaysDrop: true,
            },
        },
    },
    {
        id: 'chaos-knot',
        name: 'Chaos Knot',
        description: 'Compounded volatility feeds the chamber.',
        effectSummary: ['+10% entropy gain', 'Higher power-up odds'],
        contribution: {
            session: {
                entropyGainMultiplier: 1.1,
            },
            rules: {
                powerUpChanceMultiplier: 1.08,
            },
        },
    },
    {
        id: 'serene-eye',
        name: 'Serene Eye',
        description: 'Slows perception when fate brushes past.',
        effectSummary: ['Extra reaction window', 'Idle entropy sip'],
        contribution: {
            session: {
                comboWindowBonusSeconds: 0.3,
                idleGrantBonus: 0.12,
            },
        },
    },
    {
        id: 'void-bloom',
        name: 'Void Bloom',
        description: 'Explosive aura blooms on each break.',
        effectSummary: ['+8% coin value', 'More power-up sparks'],
        contribution: {
            session: {
                coinMultiplier: 1.08,
            },
            rules: {
                powerUpChanceMultiplier: 1.12,
            },
        },
    },
] as const;

type LoadoutVoiceDefinition = LoadoutOptionDefinition<LoadoutVoiceId>;

export const loadoutVoices: readonly LoadoutVoiceDefinition[] = [
    {
        id: 'chime',
        name: 'Chime',
        description: 'Glass bells shimmer with every hit.',
        effectSummary: ['Bright, airy hits', 'Baseline instrumentation'],
        contribution: {
            audio: {},
        },
    },
    {
        id: 'whisper',
        name: 'Whisper',
        description: 'Reverse pads breathe with rising entropy.',
        effectSummary: ['Soft attack tones', 'Entropy darkens timbre'],
        contribution: {
            audio: {
                paletteOverrides: {
                    brickSynth: {
                        oscillatorType: 'sine',
                        envelope: { attack: 0.04, release: 0.9 },
                        volume: -8,
                    },
                    chimeSynth: {
                        oscillatorType: 'sine',
                        envelope: { attack: 0.08, release: 1.4 },
                        volume: -6,
                    },
                    percussion: {
                        volume: -10,
                        pitchDecay: 0.08,
                    },
                },
            },
        },
    },
    {
        id: 'pulse',
        name: 'Pulse',
        description: 'Low synth throb that accelerates with combos.',
        effectSummary: ['Thicker bass accents', 'Combo-responsive tempo'],
        contribution: {
            audio: {
                paletteOverrides: {
                    brickSynth: {
                        oscillatorType: 'square',
                        envelope: { attack: 0.01, decay: 0.18, sustain: 0.22, release: 0.4 },
                        volume: -9,
                    },
                    chimeSynth: {
                        oscillatorType: 'sawtooth',
                        envelope: { attack: 0.03, decay: 0.3, sustain: 0.2, release: 0.5 },
                        volume: -4,
                    },
                    percussion: {
                        volume: -6,
                        octaves: 2.4,
                    },
                },
            },
        },
    },
    {
        id: 'static-choir',
        name: 'Static Choir',
        description: 'Ethereal chants warp with bias swings.',
        effectSummary: ['Vocoded hum layers', 'Wide stereo shimmer'],
        contribution: {
            audio: {
                paletteOverrides: {
                    chimeSynth: {
                        oscillatorType: 'triangle',
                        envelope: { attack: 0.12, release: 1.8 },
                        volume: -5,
                    },
                    brickSynth: {
                        oscillatorType: 'triangle',
                        envelope: { attack: 0.02, release: 0.9 },
                    },
                },
            },
        },
    },
    {
        id: 'coinfall',
        name: 'Coinfall',
        description: 'Metallic cascades celebrate every jackpot.',
        effectSummary: ['Sparkling overtones', 'Emphasized coin strikes'],
        contribution: {
            audio: {
                paletteOverrides: {
                    percussion: {
                        volume: -4,
                        octaves: 2.8,
                    },
                    chimeSynth: {
                        envelope: { attack: 0.015, decay: 0.22, release: 0.6 },
                        volume: -3,
                    },
                },
            },
        },
    },
] as const;

export const defaultLoadoutSelection: LoadoutSelection = {
    form: 'ivory-orb',
    trait: 'fortune-favored',
    sigil: 'luck-rune',
    voice: 'chime',
};

export const mergeLoadoutEffects = (
    contributions: readonly LoadoutEffectContribution[],
): LoadoutCombinedEffects => {
    const session: LoadoutSessionEffects = {
        coinMultiplier: 1,
        entropyGainMultiplier: 1,
        entropyLossMultiplier: 1,
        idleGrantBonus: 0,
        comboWindowBonusSeconds: 0,
    };
    const physics: LoadoutRuntimePhysicsEffects = {
        baseSpeedMultiplier: 1,
        maxSpeedMultiplier: 1,
        launchSpeedMultiplier: 1,
        gravityOffset: 0,
        restitutionMultiplier: 1,
        paddleWidthMultiplier: 1,
        speedGovernorMultiplier: 1,
    };
    const rules: LoadoutRuntimeRuleEffects = {
        coinsAlwaysDrop: false,
        gambleBricksMoreLikely: false,
        powerUpChanceMultiplier: 1,
        difficultyMultiplier: 1,
    };
    const audio: LoadoutRuntimeAudioEffects = {};

    for (const contribution of contributions) {
        if (contribution.session) {
            session.coinMultiplier *= contribution.session.coinMultiplier ?? 1;
            session.entropyGainMultiplier *= contribution.session.entropyGainMultiplier ?? 1;
            session.entropyLossMultiplier *= contribution.session.entropyLossMultiplier ?? 1;
            session.idleGrantBonus += contribution.session.idleGrantBonus ?? 0;
            session.comboWindowBonusSeconds += contribution.session.comboWindowBonusSeconds ?? 0;
        }
        if (contribution.physics) {
            physics.baseSpeedMultiplier *= contribution.physics.baseSpeedMultiplier ?? 1;
            physics.maxSpeedMultiplier *= contribution.physics.maxSpeedMultiplier ?? 1;
            physics.launchSpeedMultiplier *= contribution.physics.launchSpeedMultiplier ?? 1;
            physics.gravityOffset += contribution.physics.gravityOffset ?? 0;
            physics.restitutionMultiplier *= contribution.physics.restitutionMultiplier ?? 1;
            physics.paddleWidthMultiplier *= contribution.physics.paddleWidthMultiplier ?? 1;
            physics.speedGovernorMultiplier *= contribution.physics.speedGovernorMultiplier ?? 1;
        }
        if (contribution.rules) {
            rules.coinsAlwaysDrop = rules.coinsAlwaysDrop || contribution.rules.coinsAlwaysDrop === true;
            rules.gambleBricksMoreLikely =
                rules.gambleBricksMoreLikely || contribution.rules.gambleBricksMoreLikely === true;
            rules.powerUpChanceMultiplier *= contribution.rules.powerUpChanceMultiplier ?? 1;
            rules.difficultyMultiplier *= contribution.rules.difficultyMultiplier ?? 1;
        }
        if (contribution.audio) {
            audio.paletteOverrides = {
                ...(audio.paletteOverrides ?? {}),
                ...(contribution.audio.paletteOverrides ?? {}),
            };
        }
    }

    return {
        session,
        runtime: {
            physics,
            rules,
            audio,
        },
    } satisfies LoadoutCombinedEffects;
};
