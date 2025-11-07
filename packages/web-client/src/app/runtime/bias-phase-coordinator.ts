import type { Container } from 'pixi.js';
import type { Logger } from 'util/log';
import type { RandomManager } from 'util/random';
import type { StageHandle } from 'render/stage';
import type { BiasPhaseSessionSummary, BiasPhaseSceneOption, BiasPhasePayload } from 'scenes/bias-phase';
import type { GameConfig } from 'config/game';
import type { BiasOptionRisk, BiasPhaseOption, BiasPhaseWager, RoundMachine } from './round-machine';
import type { RuntimeModifiers, RuntimeModifierSnapshot } from './modifiers';
import type { ReplayBuffer } from 'app/replay-buffer';
import type { GameplayRuntimeState } from './types';
import type { LuckyBreakEventBus } from 'app/events';
import type { GameSessionManager, GameSessionSnapshot } from 'app/state';

export interface BiasPhaseAutomation {
    select(optionId: string): Promise<void>;
    skip(): void;
}

export interface BiasPhaseCoordinatorDeps {
    readonly logger: Logger;
    readonly random: RandomManager;
    readonly roundMachine: RoundMachine;
    readonly runtimeModifiers: RuntimeModifiers;
    readonly modifierConfig: GameConfig['modifiers'];
    readonly stage: StageHandle;
    readonly startLoop: () => void;
    readonly startLevel: (levelIndex: number) => void;
    readonly renderStageSoon: () => void;
    readonly replayBuffer: ReplayBuffer;
    readonly runtimeState: Pick<GameplayRuntimeState, 'sessionElapsedSeconds'>;
    readonly buildSessionSummary: (upcomingLevelIndex: number) => BiasPhaseSessionSummary;
    readonly bus: Pick<LuckyBreakEventBus, 'publish'>;
    readonly hudContainer: Pick<Container, 'visible'>;
    readonly getSessionSnapshot: () => GameSessionSnapshot;
    readonly spendStoredEntropy: GameSessionManager['spendStoredEntropy'];
}

export interface BiasPhaseCoordinator {
    present(): void;
    applySelection(selection: BiasPhaseOption | null): void;
    getAutomation(): BiasPhaseAutomation | null;
}

export const createBiasPhaseCoordinator = ({
    logger,
    random,
    roundMachine,
    runtimeModifiers,
    modifierConfig,
    stage,
    startLoop,
    startLevel,
    renderStageSoon,
    replayBuffer,
    runtimeState,
    buildSessionSummary,
    bus,
    hudContainer,
    getSessionSnapshot,
    spendStoredEntropy,
}: BiasPhaseCoordinatorDeps): BiasPhaseCoordinator => {
    const { gravity, restitution, paddleWidth, speedGovernor } = modifierConfig;

    const biasLabels: Record<BiasOptionRisk, readonly string[]> = {
        tilt: ['Measured Tilt Table', 'Soft Cascade Table', 'Silver Thread Table'],
        lock: ['Vault Lock Table', 'Gilded Contract Table', 'House Edge Table'],
        reforge: ['Mirror Void Table', 'Glass Planet Table', 'Nebular Drift Table'],
    } as const;

    const biasDescriptions: Record<BiasOptionRisk, readonly string[]> = {
        tilt: [
            'Nudge Mayhaps with gentle bias and welcoming odds.',
            'Ease into the next board with subtle physics pulls.',
        ],
        lock: [
            'Strike a deal with the casino—coins guaranteed on breaks.',
            'Lock in a sure thing while the tempo hums steadily.',
        ],
        reforge: [
            'Reforge Mayhaps into a volatile comet built for streaks.',
            'All-in fabrication—heavy swings, louder rewards.',
        ],
    } as const;

    const biasWagerBlueprints: Record<BiasOptionRisk, BiasPhaseWager> = {
        tilt: {
            label: 'Wager 3 entropy',
            cost: 3,
            action: 'casino-tilt',
        },
        lock: {
            label: 'Wager 6 entropy',
            cost: 6,
            action: 'casino-lock',
        },
        reforge: {
            label: 'Wager 10 entropy',
            cost: 10,
            action: 'casino-reforge',
        },
    } as const;

    const buildBiasWager = (risk: BiasOptionRisk): BiasPhaseWager => {
        const blueprint = biasWagerBlueprints[risk];
        return {
            label: blueprint.label,
            cost: blueprint.cost,
            action: blueprint.action,
        } satisfies BiasPhaseWager;
    };

    interface ReforgeBundle {
        readonly slug: string;
        readonly label: string;
        readonly description: string;
        readonly build: () => {
            readonly modifiers: Partial<RuntimeModifierSnapshot>;
            readonly difficultyMultiplier: number;
            readonly powerUpChanceMultiplier: number;
        };
    }

    const roundToDecimals = (value: number, decimals = 3): number => {
        if (!Number.isFinite(value)) {
            return 0;
        }
        const factor = 10 ** Math.max(0, decimals);
        return Math.round(value * factor) / factor;
    };

    const formatSigned = (value: number, decimals = 2): string => {
        const rounded = roundToDecimals(value, decimals);
        if (Math.abs(rounded) <= 1e-6) {
            return '+/-0';
        }
        const formatted = Math.abs(rounded).toFixed(decimals).replace(/\.0+$/, '');
        return rounded > 0 ? `+${formatted}` : `-${formatted}`;
    };

    const formatMultiplierLabel = (value: number, decimals = 2): string => {
        const rounded = roundToDecimals(value, decimals);
        return `x${rounded.toFixed(decimals).replace(/\.0+$/, '')}`;
    };

    const clampToRange = (value: number, range: { readonly min: number; readonly max: number }): number => {
        if (!Number.isFinite(value)) {
            return range.min;
        }
        return Math.max(range.min, Math.min(range.max, value));
    };

    const randomBetween = (min: number, max: number): number => min + (max - min) * random.next();

    const randomSigned = (magnitude: number): number => (random.boolean() ? magnitude : -magnitude);

    const pickFrom = <T>(values: readonly T[]): T => {
        if (values.length === 0) {
            throw new Error('Cannot select from empty list');
        }
        const index = random.nextInt(values.length);
        return values[index] ?? values[0];
    };

    const describeBiasOption = (option: BiasPhaseOption): readonly string[] => {
        const summary: string[] = [];
        const { modifiers, difficultyMultiplier, powerUpChanceMultiplier } = option.effects;

        if (difficultyMultiplier !== undefined && Math.abs(difficultyMultiplier - 1) > 1e-3) {
            summary.push(`Difficulty ${formatMultiplierLabel(difficultyMultiplier)}`);
        }

        if (powerUpChanceMultiplier !== undefined && Math.abs(powerUpChanceMultiplier - 1) > 1e-3) {
            summary.push(`Power-Up Odds ${formatMultiplierLabel(powerUpChanceMultiplier)}`);
        }

        if (modifiers) {
            if (modifiers.gravity !== undefined) {
                const delta = modifiers.gravity - gravity.default;
                summary.push(`Gravity ${formatSigned(delta)}`);
            }
            if (modifiers.restitution !== undefined) {
                const delta = modifiers.restitution - restitution.default;
                summary.push(`Restitution ${formatSigned(delta)}`);
            }
            if (modifiers.paddleWidthMultiplier !== undefined) {
                summary.push(`Paddle Width ${formatMultiplierLabel(modifiers.paddleWidthMultiplier)}`);
            }
            if (modifiers.speedGovernorMultiplier !== undefined) {
                summary.push(`Speed Governor ${formatMultiplierLabel(modifiers.speedGovernorMultiplier)}`);
            }
        }

        if (option.effects.rules) {
            if (option.effects.rules.coinsAlwaysDrop) {
                summary.push('Coins Always Drop');
            }
            if (option.effects.rules.gambleBricksMoreLikely) {
                summary.push('Gamble Bricks Favored');
            }
        }

        if (summary.length === 0) {
            summary.push('No material change');
        }

        return summary;
    };

    const resolveStoredEntropy = (): number => {
        const snapshot = getSessionSnapshot();
        const stored = snapshot.entropy?.stored;
        if (typeof stored !== 'number' || !Number.isFinite(stored)) {
            return 0;
        }
        return Math.max(0, stored);
    };

    const mapBiasOptionToScene = (option: BiasPhaseOption, affordable: boolean): BiasPhaseSceneOption => ({
        id: option.id,
        label: option.label,
        description: option.description,
        risk: option.risk,
        wager: {
            label: option.wager.label,
            cost: option.wager.cost,
            action: option.wager.action,
        },
        effectSummary: describeBiasOption(option),
        affordable,
    });

    const generateBiasPhaseOptions = (upcomingLevelIndex: number): BiasPhaseOption[] => {
        const baseGravity = gravity.default;
        const baseRestitution = restitution.default;
        const basePaddleWidth = paddleWidth.default;
        const baseSpeedGovernor = speedGovernor.default;

        const createOptionId = (risk: BiasOptionRisk, order: number) =>
            `bias-${upcomingLevelIndex + 1}-${risk}-${order}-${random.nextInt(1_000_000)}`;

        const buildTiltOption = (order: number): BiasPhaseOption => {
            const gravityShift = randomSigned(randomBetween(0.02, 0.05));
            const difficulty = roundToDecimals(1 + randomBetween(0.05, 0.1), 3);
            const powerUp = roundToDecimals(1 + randomBetween(0.08, 0.14), 3);

            const modifiers: Partial<RuntimeModifierSnapshot> = {
                gravity: roundToDecimals(clampToRange(baseGravity + gravityShift, gravity), 2),
                paddleWidthMultiplier: roundToDecimals(
                    clampToRange(basePaddleWidth + randomBetween(0.06, 0.12), paddleWidth),
                    2,
                ),
                speedGovernorMultiplier: roundToDecimals(
                    clampToRange(baseSpeedGovernor + randomBetween(0.02, 0.06), speedGovernor),
                    2,
                ),
            };

            return {
                id: createOptionId('tilt', order),
                label: pickFrom(biasLabels.tilt),
                description: pickFrom(biasDescriptions.tilt),
                risk: 'tilt',
                wager: buildBiasWager('tilt'),
                effects: {
                    modifiers,
                    difficultyMultiplier: difficulty,
                    powerUpChanceMultiplier: powerUp,
                },
            } satisfies BiasPhaseOption;
        };

        const buildLockOption = (order: number): BiasPhaseOption => {
            const modifiers: Partial<RuntimeModifierSnapshot> = {
                restitution: roundToDecimals(
                    clampToRange(baseRestitution + randomBetween(0.02, 0.05), restitution),
                    2,
                ),
                speedGovernorMultiplier: roundToDecimals(
                    clampToRange(baseSpeedGovernor + randomBetween(0.04, 0.08), speedGovernor),
                    2,
                ),
            };
            const difficulty = roundToDecimals(1 + randomBetween(0.04, 0.08), 3);
            const powerUp = roundToDecimals(1 + randomBetween(0.1, 0.16), 3);

            return {
                id: createOptionId('lock', order),
                label: pickFrom(biasLabels.lock),
                description: pickFrom(biasDescriptions.lock),
                risk: 'lock',
                wager: buildBiasWager('lock'),
                effects: {
                    modifiers,
                    difficultyMultiplier: difficulty,
                    powerUpChanceMultiplier: powerUp,
                    rules: {
                        coinsAlwaysDrop: true,
                    },
                },
            } satisfies BiasPhaseOption;
        };

        const reforgeBundles: readonly ReforgeBundle[] = [
            {
                slug: 'mirror-void',
                label: 'Mirror Void Table',
                description: 'Combo mirrors ignite high restitution loops.',
                build: () => {
                    const gravityShift = -randomBetween(0.06, 0.1);
                    return {
                        modifiers: {
                            gravity: roundToDecimals(clampToRange(baseGravity + gravityShift, gravity), 2),
                            restitution: roundToDecimals(
                                clampToRange(baseRestitution + randomBetween(0.07, 0.11), restitution),
                                2,
                            ),
                            speedGovernorMultiplier: roundToDecimals(
                                clampToRange(baseSpeedGovernor + randomBetween(0.16, 0.22), speedGovernor),
                                2,
                            ),
                        },
                        difficultyMultiplier: roundToDecimals(1 + randomBetween(0.18, 0.26), 3),
                        powerUpChanceMultiplier: roundToDecimals(1 + randomBetween(0.16, 0.24), 3),
                    };
                },
            },
            {
                slug: 'glass-planet',
                label: 'Glass Planet Table',
                description: 'Shards of gravity crackle—razor volleys ahead.',
                build: () => ({
                    modifiers: {
                        gravity: roundToDecimals(
                            clampToRange(baseGravity + randomBetween(0.12, 0.18), gravity),
                            2,
                        ),
                        paddleWidthMultiplier: roundToDecimals(
                            clampToRange(basePaddleWidth - randomBetween(0.12, 0.18), paddleWidth),
                            2,
                        ),
                        speedGovernorMultiplier: roundToDecimals(
                            clampToRange(baseSpeedGovernor + randomBetween(0.18, 0.24), speedGovernor),
                            2,
                        ),
                    },
                    difficultyMultiplier: roundToDecimals(1 + randomBetween(0.2, 0.28), 3),
                    powerUpChanceMultiplier: roundToDecimals(1 + randomBetween(0.14, 0.2), 3),
                }),
            },
            {
                slug: 'nebular-drift',
                label: 'Nebular Drift Table',
                description: 'Float through starlit lanes—wide arcs, high stakes.',
                build: () => ({
                    modifiers: {
                        gravity: roundToDecimals(
                            clampToRange(baseGravity - randomBetween(0.08, 0.12), gravity),
                            2,
                        ),
                        paddleWidthMultiplier: roundToDecimals(
                            clampToRange(basePaddleWidth + randomBetween(0.1, 0.18), paddleWidth),
                            2,
                        ),
                        speedGovernorMultiplier: roundToDecimals(
                            clampToRange(baseSpeedGovernor + randomBetween(0.14, 0.2), speedGovernor),
                            2,
                        ),
                    },
                    difficultyMultiplier: roundToDecimals(1 + randomBetween(0.16, 0.22), 3),
                    powerUpChanceMultiplier: roundToDecimals(1 + randomBetween(0.18, 0.26), 3),
                }),
            },
        ];

        const buildReforgeOption = (order: number): BiasPhaseOption => {
            const bundle = pickFrom(reforgeBundles);
            const blueprint = bundle.build();

            return {
                id: createOptionId('reforge', order),
                label: bundle.label,
                description: bundle.description,
                risk: 'reforge',
                wager: buildBiasWager('reforge'),
                effects: {
                    modifiers: blueprint.modifiers,
                    difficultyMultiplier: blueprint.difficultyMultiplier,
                    powerUpChanceMultiplier: blueprint.powerUpChanceMultiplier,
                },
            } satisfies BiasPhaseOption;
        };

        return [
            buildTiltOption(0),
            buildLockOption(1),
            buildReforgeOption(2),
        ];
    };

    const applySelection: BiasPhaseCoordinator['applySelection'] = (selection) => {
        runtimeModifiers.setRules(null);
        roundMachine.clearRoundRules();

        if (!selection) {
            return;
        }

        const { effects } = selection;
        if (effects.difficultyMultiplier !== undefined && effects.difficultyMultiplier > 0) {
            const base = roundMachine.getLevelDifficultyMultiplier();
            const adjusted = roundToDecimals(base * effects.difficultyMultiplier, 4);
            roundMachine.setLevelDifficultyMultiplier(adjusted);
        }

        if (effects.powerUpChanceMultiplier !== undefined && effects.powerUpChanceMultiplier > 0) {
            const base = roundMachine.getPowerUpChanceMultiplier();
            const adjusted = roundToDecimals(base * effects.powerUpChanceMultiplier, 4);
            roundMachine.setPowerUpChanceMultiplier(Math.max(0.01, adjusted));
        }

        const modifiers = effects.modifiers;
        if (modifiers) {
            if (modifiers.gravity !== undefined) {
                runtimeModifiers.setGravity(modifiers.gravity);
            }
            if (modifiers.restitution !== undefined) {
                runtimeModifiers.setRestitution(modifiers.restitution);
            }
            if (modifiers.paddleWidthMultiplier !== undefined) {
                runtimeModifiers.setPaddleWidthMultiplier(modifiers.paddleWidthMultiplier);
            }
            if (modifiers.speedGovernorMultiplier !== undefined) {
                runtimeModifiers.setSpeedGovernorMultiplier(modifiers.speedGovernorMultiplier);
            }
        }

        if (effects.rules) {
            runtimeModifiers.setRules(effects.rules);
            roundMachine.setRoundRules(effects.rules);
        }
    };

    let automation: BiasPhaseAutomation | null = null;

    const present: BiasPhaseCoordinator['present'] = () => {
        const upcomingLevelIndex = roundMachine.getCurrentLevelIndex() + 1;
        const options = generateBiasPhaseOptions(upcomingLevelIndex);
        const storedEntropy = resolveStoredEntropy();
        const sessionSummary = buildSessionSummary(upcomingLevelIndex);
        const sessionWithStored: BiasPhaseSessionSummary = {
            ...sessionSummary,
            entropyStored: storedEntropy,
        };

        if (options.length === 0) {
            automation = null;
            const nextLevelIndex = roundMachine.incrementLevelIndex();
            startLevel(nextLevelIndex);
            startLoop();
            renderStageSoon();
            return;
        }

        roundMachine.setBiasPhaseOptions(options);

        const advance = (selection: BiasPhaseOption | null) => {
            automation = null;
            applySelection(selection);
            if (!selection) {
                roundMachine.setBiasPhaseOptions([]);
            }
            if (stage.getCurrentScene() === 'bias-phase') {
                stage.pop();
            }
            const nextLevelIndex = roundMachine.incrementLevelIndex();
            startLevel(nextLevelIndex);
            startLoop();
            renderStageSoon();
        };

        const handleSelection = (optionId: string) => {
            const option = options.find((candidate) => candidate.id === optionId);
            if (!option) {
                logger.warn('Bias option not found during selection', { optionId });
                throw new Error('bias-option-missing');
            }

            const availableEntropy = resolveStoredEntropy();
            if (availableEntropy < option.wager.cost) {
                logger.info('Insufficient entropy for bias wager', {
                    optionId,
                    required: option.wager.cost,
                    available: availableEntropy,
                });
                throw new Error('insufficient-entropy');
            }

            const spendResult = spendStoredEntropy({ action: option.wager.action, cost: option.wager.cost });
            if (!spendResult.success) {
                const reason = spendResult.reason ?? 'unknown';
                logger.warn('Failed to spend entropy for bias wager', { optionId, reason });
                throw new Error(`entropy-spend-${reason}`);
            }

            const selection = roundMachine.commitBiasSelection(optionId);
            if (!selection) {
                logger.warn('Failed to resolve bias selection after spending entropy', { optionId });
                advance(null);
                return;
            }
            replayBuffer.recordBiasChoice(optionId, runtimeState.sessionElapsedSeconds);
            try {
                bus.publish('MusicModeHint', { mode: selection.risk });
            } catch (error) {
                logger.warn('Failed to publish music mode hint', { error, mode: selection.risk });
            }
            advance(selection);
        };

        const handleSkip = () => {
            advance(null);
        };

        const payload: BiasPhasePayload = {
            session: sessionWithStored,
            options: options.map((option) => mapBiasOptionToScene(option, storedEntropy >= option.wager.cost)),
            onSelect: (optionId: string) => {
                handleSelection(optionId);
            },
            onSkip: handleSkip,
        };

        automation = {
            select: (optionId: string) => Promise.resolve().then(() => {
                handleSelection(optionId);
            }),
            skip: () => {
                handleSkip();
            },
        } satisfies BiasPhaseAutomation;

        hudContainer.visible = false;
        void stage.push('bias-phase', payload)
            .then(() => {
                renderStageSoon();
            })
            .catch((error) => {
                logger.error('Failed to push bias-phase scene', { error });
                handleSkip();
            });
    };

    return {
        present,
        applySelection,
        getAutomation: () => automation,
    } satisfies BiasPhaseCoordinator;
};

