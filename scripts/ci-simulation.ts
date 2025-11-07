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
    score: 40,
    durationMs: 120_000,
    frames: 14_401,
    events: 0,
    metrics: {
        bricksBroken: 4,
        paddleHits: 47,
        wallHits: 47,
        livesLost: 0,
        averageFps: 120.01,
        bricksPerSecond: 0.033,
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
        longestVolley: 4,
        averageImpactSpeed: 4,
    },
    snapshot: {
        sessionId: 'sim-17-r2',
        status: 'active',
        score: 40,
        coins: 0,
        livesRemaining: 3,
        round: 2,
        brickTotal: 12,
        brickRemaining: 8,
        momentum: {
            volleyLength: 0,
            speedPressure: 0,
            brickDensity: 0.6666666666666666,
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
            charge: 58.740003034756896,
            stored: 0,
            trend: 'rising',
            lastEvent: 'wall-hit',
            updatedAt: 119_142,
        },
        preferences: {
            masterVolume: 1,
            muted: false,
            reducedMotion: false,
            controlScheme: 'keyboard',
            controlSensitivity: 0.5,
        },
        loadout: null,
        elapsedTimeMs: 120_008,
        hud: {
            score: 40,
            coins: 0,
            lives: 3,
            round: 2,
            brickRemaining: 8,
            brickTotal: 12,
            momentum: {
                volleyLength: 0,
                speedPressure: 0,
                brickDensity: 0.6666666666666666,
                comboHeat: 0,
                comboTimer: 0,
            },
            entropy: {
                charge: 58.740003034756896,
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
