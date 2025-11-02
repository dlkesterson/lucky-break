import type { Logger } from 'util/log';
import type { RandomManager } from 'util/random';
import type { StageHandle } from 'render/stage';
import type { BiasPhaseSessionSummary, BiasPhaseSceneOption, BiasPhasePayload } from 'scenes/bias-phase';
import type { GameConfig } from 'config/game';
import type { BiasOptionRisk, BiasPhaseOption, RoundMachine } from './round-machine';
import type { RuntimeModifiers } from './modifiers';
import type { ReplayBuffer } from 'app/replay-buffer';
import type { GameplayRuntimeState } from './types';

export interface BiasPhaseAutomation {
    select(optionId: string): void;
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
}: BiasPhaseCoordinatorDeps): BiasPhaseCoordinator => {
    const { gravity, restitution, paddleWidth, speedGovernor } = modifierConfig;

    const biasRiskOrder: readonly BiasOptionRisk[] = ['safe', 'bold', 'volatile'];

    const biasLabels: Record<BiasOptionRisk, readonly string[]> = {
        safe: ['Momentum Hedge', 'Steady Anchor', 'Measured Tilt'],
        bold: ['Double Down', 'Edge Stack', 'Tempo Spike'],
        volatile: ['Chaos Ramp', 'Glitch Push', 'Void Bet'],
    } as const;

    const biasDescriptions: Record<BiasOptionRisk, readonly string[]> = {
        safe: [
            'Pocket a modest edge while keeping the board manageable.',
            'Steady your hand with softer tweaks and steadier odds.',
        ],
        bold: [
            'Lean into the heat for fatter drops and sharper volleys.',
            'Amp the tempo to chase richer streak rewards.',
        ],
        volatile: [
            'Spin the wheel for wild payouts and relentless speed.',
            'Embrace chaos—huge upside with heavy gravity shifts.',
        ],
    } as const;

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
            return '±0';
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

        if (summary.length === 0) {
            summary.push('No material change');
        }

        return summary;
    };

    const mapBiasOptionToScene = (option: BiasPhaseOption): BiasPhaseSceneOption => ({
        id: option.id,
        label: option.label,
        description: option.description,
        risk: option.risk,
        effectSummary: describeBiasOption(option),
    });

    const generateBiasPhaseOptions = (upcomingLevelIndex: number): BiasPhaseOption[] => {
        const baseGravity = gravity.default;
        const baseRestitution = restitution.default;
        const basePaddleWidth = paddleWidth.default;
        const baseSpeedGovernor = speedGovernor.default;

        return biasRiskOrder.map((risk, order) => {
            const idSeed = random.nextInt(1_000_000);
            const modifierEntries: {
                gravity?: number;
                restitution?: number;
                paddleWidthMultiplier?: number;
                speedGovernorMultiplier?: number;
            } = {};
            let difficulty: number | undefined;
            let powerUp: number | undefined;

            if (risk === 'safe') {
                modifierEntries.paddleWidthMultiplier = roundToDecimals(
                    clampToRange(basePaddleWidth + randomBetween(0.05, 0.12), paddleWidth),
                    2,
                );
                modifierEntries.gravity = roundToDecimals(
                    clampToRange(baseGravity + randomSigned(randomBetween(0.02, 0.05)), gravity),
                    2,
                );
                difficulty = roundToDecimals(1 + randomBetween(0.04, 0.08), 3);
                powerUp = roundToDecimals(1 + randomBetween(0.06, 0.1), 3);
            } else if (risk === 'bold') {
                modifierEntries.paddleWidthMultiplier = roundToDecimals(
                    clampToRange(basePaddleWidth - randomBetween(0.05, 0.12), paddleWidth),
                    2,
                );
                modifierEntries.speedGovernorMultiplier = roundToDecimals(
                    clampToRange(baseSpeedGovernor + randomBetween(0.08, 0.15), speedGovernor),
                    2,
                );
                modifierEntries.gravity = roundToDecimals(
                    clampToRange(baseGravity + randomSigned(randomBetween(0.04, 0.08)), gravity),
                    2,
                );
                difficulty = roundToDecimals(1 + randomBetween(0.09, 0.16), 3);
                powerUp = roundToDecimals(1 + randomBetween(0.12, 0.18), 3);
            } else {
                modifierEntries.speedGovernorMultiplier = roundToDecimals(
                    clampToRange(baseSpeedGovernor + randomBetween(0.16, 0.24), speedGovernor),
                    2,
                );
                modifierEntries.restitution = roundToDecimals(
                    clampToRange(baseRestitution + randomBetween(0.02, 0.06), restitution),
                    2,
                );
                modifierEntries.gravity = roundToDecimals(
                    clampToRange(baseGravity + randomSigned(randomBetween(0.1, 0.18)), gravity),
                    2,
                );
                difficulty = roundToDecimals(1 + randomBetween(0.16, 0.24), 3);
                powerUp = roundToDecimals(1 + randomBetween(0.18, 0.26), 3);
            }

            const modifiers = Object.keys(modifierEntries).length > 0 ? modifierEntries : undefined;
            const effects = {
                modifiers,
                difficultyMultiplier: difficulty,
                powerUpChanceMultiplier: powerUp,
            } satisfies BiasPhaseOption['effects'];

            return {
                id: `bias-${upcomingLevelIndex + 1}-${risk}-${order}-${idSeed}`,
                label: pickFrom(biasLabels[risk]),
                description: pickFrom(biasDescriptions[risk]),
                risk,
                effects,
            } satisfies BiasPhaseOption;
        });
    };

    const applySelection: BiasPhaseCoordinator['applySelection'] = (selection) => {
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
        if (!modifiers) {
            return;
        }

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
    };

    let automation: BiasPhaseAutomation | null = null;

    const present: BiasPhaseCoordinator['present'] = () => {
        const upcomingLevelIndex = roundMachine.getCurrentLevelIndex() + 1;
        const options = generateBiasPhaseOptions(upcomingLevelIndex);

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
            const selection = roundMachine.commitBiasSelection(optionId);
            if (!selection) {
                logger.warn('Failed to resolve bias selection', { optionId });
                advance(null);
                return;
            }
            replayBuffer.recordBiasChoice(optionId, runtimeState.sessionElapsedSeconds);
            advance(selection);
        };

        const handleSkip = () => {
            advance(null);
        };

        const payload: BiasPhasePayload = {
            session: buildSessionSummary(upcomingLevelIndex),
            options: options.map(mapBiasOptionToScene),
            onSelect: (optionId: string) => {
                handleSelection(optionId);
            },
            onSkip: handleSkip,
        };

        automation = {
            select: (optionId: string) => {
                handleSelection(optionId);
            },
            skip: () => {
                handleSkip();
            },
        } satisfies BiasPhaseAutomation;

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

