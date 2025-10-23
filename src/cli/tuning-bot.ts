import { runHeadlessSimulation, type SimulationCheatOptions, type SimulationInput, type SimulationResult } from './simulate';

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

    for (let index = 0; index < runCount; index += 1) {
        const seed = startSeed + index;
        const input: SimulationInput = {
            mode: 'simulate',
            seed,
            round: options.round,
            durationSec: options.durationSec,
            cheats: options.cheats,
        };
        const result = await runHeadlessSimulation(input);
        runs.push(result);
    }

    const totalScore = runs.reduce((sum, run) => sum + run.score, 0);
    const bestScore = runs.reduce((max, run) => Math.max(max, run.score), 0);
    const averageScore = runs.length > 0 ? totalScore / runs.length : 0;
    const averageBricksPerSecond = runs.length > 0
        ? runs.reduce((sum, run) => sum + run.metrics.bricksPerSecond, 0) / runs.length
        : 0;
    const averageLongestVolley = runs.length > 0
        ? runs.reduce((sum, run) => sum + run.volleyStats.longestVolley, 0) / runs.length
        : 0;

    const summary: TuningBotSummary = {
        runCount: runs.length,
        averageScore: Number(averageScore.toFixed(2)),
        bestScore,
        averageBricksPerSecond: Number(averageBricksPerSecond.toFixed(3)),
        averageLongestVolley: Number(averageLongestVolley.toFixed(2)),
    } satisfies TuningBotSummary;

    return {
        summary,
        runs,
    } satisfies TuningBotResult;
};
