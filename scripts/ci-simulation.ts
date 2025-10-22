import { runHeadlessSimulation, type SimulationInput, type SimulationResult } from 'cli/simulate';

const INPUT: SimulationInput = {
    mode: 'simulate',
    seed: 17,
    round: 2,
    durationSec: 120,
};

const EXPECTED: SimulationResult = {
    ok: true,
    sessionId: 'sim-17-r2',
    score: 3715,
    events: 21,
    volleyStats: {
        longestVolley: 20,
        averageSpeed: 9.48,
    },
    durationMs: 120_000,
};

const serialize = (value: unknown): string => JSON.stringify(value, null, 2);

const fail = (message: string, details?: { expected?: unknown; actual?: unknown }) => {
    console.error(`[simulate:verify] ${message}`);
    if (details?.expected !== undefined) {
        console.error(`[simulate:verify] expected: ${serialize(details.expected)}`);
    }
    if (details?.actual !== undefined) {
        console.error(`[simulate:verify] actual: ${serialize(details.actual)}`);
    }
    process.exit(1);
};

const main = async (): Promise<void> => {
    const first = await runHeadlessSimulation(INPUT);
    const second = await runHeadlessSimulation(INPUT);

    if (serialize(first) !== serialize(second)) {
        fail('simulation produced different results across runs for the same input', {
            expected: first,
            actual: second,
        });
    }

    if (serialize(first) !== serialize(EXPECTED)) {
        fail('simulation baseline changed', {
            expected: EXPECTED,
            actual: first,
        });
    }

    console.log(
        `[simulate:verify] Deterministic simulation confirmed for seed ${INPUT.seed ?? 'default'} in round ${INPUT.round ?? 'default'
        }. score=${first.score}, events=${first.events}.`,
    );
};

main().catch((error) => {
    fail(`unexpected error: ${(error as Error).message}`);
});
