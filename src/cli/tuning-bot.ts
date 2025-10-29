import { runHeadlessSimulation, type SimulationCheatOptions, type SimulationInput, type SimulationResult } from './simulate';
import type { HazardType } from 'physics/hazards';

export interface TuningBotOptions {
    readonly runs: number;
    readonly round: number;
    readonly durationSec: number;
    readonly seed?: number;
    readonly cheats?: SimulationCheatOptions;
}

export interface TuningBotSummary {
    readonly runCount: number;
    readonly averageScore: number;
    readonly bestScore: number;
    readonly averageBricksPerSecond: number;
    readonly averageLongestVolley: number;
    readonly averageBricksBroken: number;
    readonly averageLivesLost: number;
    readonly averageHazardContacts: number;
    readonly hazardContactBreakdown: Record<HazardType, number>;
    readonly averagePortalTransports: number;
    readonly brickClearStdDev: number;
    readonly deterministicCheck: boolean;
}

export interface TuningBotResult {
    readonly summary: TuningBotSummary;
    readonly runs: readonly SimulationResult[];
}

const clampRuns = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
        return 1;
    }
    return Math.min(50, Math.max(1, Math.floor(value)));
};

export const runTuningBot = async (options: TuningBotOptions): Promise<TuningBotResult> => {
    const runCount = clampRuns(options.runs);
    const runs: SimulationResult[] = [];
    const startSeed = typeof options.seed === 'number' ? options.seed : 1;
    let firstRunInput: SimulationInput | null = null;

    for (let index = 0; index < runCount; index += 1) {
        const seed = startSeed + index;
        const input: SimulationInput = {
            mode: 'simulate',
            seed,
            round: options.round,
            durationSec: options.durationSec,
            cheats: options.cheats,
        };
        if (index === 0) {
            firstRunInput = {
                ...input,
                cheats: input.cheats ? { ...input.cheats } : undefined,
            } satisfies SimulationInput;
        }
        const result = await runHeadlessSimulation(input);
        runs.push(result);
    }

    const safeDivisor = runs.length > 0 ? runs.length : 1;
    const totalScore = runs.reduce((sum, run) => sum + run.score, 0);
    const bestScore = runs.reduce((max, run) => Math.max(max, run.score), 0);
    const totalBricksPerSecond = runs.reduce((sum, run) => sum + run.metrics.bricksPerSecond, 0);
    const totalLongestVolley = runs.reduce((sum, run) => sum + run.volleyStats.longestVolley, 0);
    let totalBricksBroken = 0;
    let totalLivesLost = 0;
    let totalHazardContacts = 0;
    let totalPortalTransports = 0;
    const hazardTotalsByType: Record<HazardType, number> = {
        'gravity-well': 0,
        'moving-bumper': 0,
        portal: 0,
    };
    const brickBreakSamples: number[] = [];

    runs.forEach((run) => {
        totalBricksBroken += run.metrics.bricksBroken;
        totalLivesLost += run.metrics.livesLost;
        totalHazardContacts += run.metrics.hazardContacts ?? 0;
        totalPortalTransports += run.metrics.portalTransports ?? 0;
        hazardTotalsByType['gravity-well'] += run.metrics.hazardContactsByType['gravity-well'] ?? 0;
        hazardTotalsByType['moving-bumper'] += run.metrics.hazardContactsByType['moving-bumper'] ?? 0;
        hazardTotalsByType.portal += run.metrics.hazardContactsByType.portal ?? 0;
        brickBreakSamples.push(run.metrics.bricksBroken);
    });

    const computeStdDev = (values: readonly number[]): number => {
        if (values.length <= 1) {
            return 0;
        }
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        return Math.sqrt(variance);
    };

    let deterministicCheck = true;
    if (runs.length > 0 && firstRunInput) {
        const baseline = await runHeadlessSimulation(firstRunInput);
        deterministicCheck = JSON.stringify(baseline) === JSON.stringify(runs[0]);
    }

    const averageScore = runs.length > 0 ? totalScore / safeDivisor : 0;
    const averageBricksPerSecond = runs.length > 0 ? totalBricksPerSecond / safeDivisor : 0;
    const averageLongestVolley = runs.length > 0 ? totalLongestVolley / safeDivisor : 0;
    const averageBricksBroken = totalBricksBroken / safeDivisor;
    const averageLivesLost = totalLivesLost / safeDivisor;
    const averageHazardContacts = totalHazardContacts / safeDivisor;
    const averagePortalTransports = totalPortalTransports / safeDivisor;
    const hazardContactBreakdown: Record<HazardType, number> = {
        'gravity-well': Number((hazardTotalsByType['gravity-well'] / safeDivisor).toFixed(2)),
        'moving-bumper': Number((hazardTotalsByType['moving-bumper'] / safeDivisor).toFixed(2)),
        portal: Number((hazardTotalsByType.portal / safeDivisor).toFixed(2)),
    };
    const brickClearStdDev = Number(computeStdDev(brickBreakSamples).toFixed(2));

    const summary: TuningBotSummary = {
        runCount: runs.length,
        averageScore: Number(averageScore.toFixed(2)),
        bestScore,
        averageBricksPerSecond: Number(averageBricksPerSecond.toFixed(3)),
        averageLongestVolley: Number(averageLongestVolley.toFixed(2)),
        averageBricksBroken: Number(averageBricksBroken.toFixed(2)),
        averageLivesLost: Number(averageLivesLost.toFixed(2)),
        averageHazardContacts: Number(averageHazardContacts.toFixed(2)),
        hazardContactBreakdown,
        averagePortalTransports: Number(averagePortalTransports.toFixed(2)),
        brickClearStdDev,
        deterministicCheck,
    } satisfies TuningBotSummary;

    return {
        summary,
        runs,
    } satisfies TuningBotResult;
};
