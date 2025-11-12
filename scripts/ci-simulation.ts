import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
    score: 120,
    durationMs: 45358.33333333509,
    frames: 5443,
    events: 0,
    metrics: {
        bricksBroken: 12,
        paddleHits: 15,
        wallHits: 25,
        livesLost: 0,
        averageFps: 120,
        bricksPerSecond: 0.265,
        hazardContacts: 0,
        hazardContactsByType: {
            'gravity-well': 0,
            'moving-bumper': 0,
            portal: 0,
        },
        movingBumperImpacts: 0,
        portalTransports: 0,
    },
    volleyStats: {
        longestVolley: 12,
        averageImpactSpeed: 4.03,
    },
    snapshot: {
        sessionId: 'sim-17-r2',
        status: 'completed',
        score: 120,
        coins: 0,
        livesRemaining: 3,
        round: 2,
        brickTotal: 12,
        brickRemaining: 0,
        lastOutcome: {
            result: 'win',
            round: 2,
            scoreAwarded: 120,
            durationMs: 45358,
            timestamp: 45358,
        },
        momentum: {
            volleyLength: 3,
            speedPressure: 0.2782142857142861,
            brickDensity: 0,
            comboHeat: 0.375,
            comboTimer: 1.5916666666666668,
            mirageStacks: 0,
            updatedAt: 45350,
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
            charge: 31.834788422643637,
            stored: 47.752182633965454,
            trend: 'falling',
            lastEvent: 'round-complete',
            updatedAt: 45358,
        },
        preferences: {
            masterVolume: 1,
            muted: false,
            reducedMotion: false,
            controlScheme: 'keyboard',
            controlSensitivity: 0.5,
        },
        loadout: null,
        elapsedTimeMs: 45358,
        hud: {
            score: 120,
            coins: 0,
            lives: 3,
            round: 2,
            brickRemaining: 0,
            brickTotal: 12,
            momentum: {
                volleyLength: 3,
                speedPressure: 0.2782142857142861,
                brickDensity: 0,
                comboHeat: 0.375,
                comboTimer: 1.5916666666666668,
                mirageStacks: 0,
            },
            entropy: {
                charge: 31.834788422643637,
                stored: 47.752182633965454,
                trend: 'falling',
            },
            audio: {
                scene: 'calm',
                nextScene: null,
                barCountdown: 0,
            },
            prompts: [
                {
                    id: 'round-complete',
                    severity: 'info',
                    message: 'Round complete — tap to continue',
                },
            ],
            settings: {
                muted: false,
                masterVolume: 1,
                reducedMotion: false,
            },
        },
        updatedAt: 45358,
    },
    hazards: [],
};

const serialize = (value: unknown): string => JSON.stringify(value, null, 2);

const ARTIFACT_DIR = resolve(process.cwd(), 'test-results', 'artifacts');
const ARTIFACT_PATH = resolve(ARTIFACT_DIR, 'deterministic-simulation.json');

const persistReplayArtifact = async (result: SimulationResult): Promise<void> => {
    const payload = {
        version: 1,
        generatedAt: new Date().toISOString(),
        input: INPUT,
        result,
    };
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await writeFile(ARTIFACT_PATH, `${serialize(payload)}\n`, 'utf8');
    console.log(`[simulate:verify] wrote deterministic replay artifact to ${ARTIFACT_PATH}`);
};

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

    await persistReplayArtifact(first);

    console.log(
        `[simulate:verify] Deterministic simulation confirmed for seed ${INPUT.seed ?? 'default'} in round ${INPUT.round ?? 'default'
        }. score=${first.score}, events=${first.events}.`,
    );
};

main().catch((error) => {
    fail(`unexpected error: ${(error as Error).message}`);
});
