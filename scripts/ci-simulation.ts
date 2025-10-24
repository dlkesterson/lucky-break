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
    seed: 17,
    round: 2,
    score: 70,
    durationMs: 120_000,
    frames: 14_401,
    events: 0,
    metrics: {
        bricksBroken: 7,
        paddleHits: 49,
        wallHits: 44,
        livesLost: 0,
        averageFps: 120.01,
        bricksPerSecond: 0.058,
    },
    volleyStats: {
        longestVolley: 7,
        averageImpactSpeed: 4,
    },
    snapshot: {
        sessionId: 'sim-17-r2',
        status: 'active',
        score: 70,
        coins: 0,
        livesRemaining: 3,
        round: 1,
        brickTotal: 24,
        brickRemaining: 17,
        momentum: {
            volleyLength: 0,
            speedPressure: 0,
            brickDensity: 0.7083333333333334,
            comboHeat: 0,
            comboTimer: 0,
            updatedAt: 120_000,
        },
        audio: {
            scene: 'calm',
            nextScene: null,
            barCountdown: 0,
            sends: {
                reverb: 0,
                delay: 0,
            },
            primaryLayerActive: false,
        },
        entropy: {
            charge: 80.8761429973538,
            stored: 0,
            trend: 'rising',
            lastEvent: 'paddle-hit',
            updatedAt: 119_858,
        },
        preferences: {
            masterVolume: 1,
            muted: false,
            reducedMotion: false,
            controlScheme: 'keyboard',
            controlSensitivity: 0.5,
        },
        elapsedTimeMs: 120_008,
        hud: {
            score: 70,
            coins: 0,
            lives: 3,
            round: 1,
            brickRemaining: 17,
            brickTotal: 24,
            momentum: {
                volleyLength: 0,
                speedPressure: 0,
                brickDensity: 0.7083333333333334,
                comboHeat: 0,
                comboTimer: 0,
            },
            entropy: {
                charge: 80.8761429973538,
                stored: 0,
                trend: 'rising',
            },
            audio: {
                scene: 'calm',
                nextScene: null,
                barCountdown: 0,
            },
            prompts: [
                {
                    id: 'round-active',
                    severity: 'info',
                    message: 'Round in progress',
                },
            ],
            settings: {
                muted: false,
                masterVolume: 1,
                reducedMotion: false,
            },
        },
        updatedAt: 120_008,
    },
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
