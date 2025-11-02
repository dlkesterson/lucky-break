import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cli/simulate', () => ({
    runHeadlessSimulation: vi.fn(),
}));

import { runHeadlessSimulation, type SimulationResult } from 'cli/simulate';
import { runTuningBot } from 'cli/tuning-bot';

const createResult = (seed: number, score: number, bricksPerSecond: number, longestVolley: number): SimulationResult => ({
    ok: true,
    sessionId: `session-${seed}`,
    seed,
    round: 7,
    score,
    durationMs: 90_000,
    frames: 10_800,
    events: 42,
    metrics: {
        bricksBroken: 60,
        paddleHits: 30,
        wallHits: 15,
        livesLost: 1,
        averageFps: 120,
        bricksPerSecond,
        hazardContacts: 0,
        hazardContactsByType: {
            'gravity-well': 0,
            'moving-bumper': 0,
            portal: 0,
        },
        movingBumperImpacts: 0,
        portalTransports: 0,
    },
    volleyStats: { longestVolley, averageImpactSpeed: 7.5 },
    snapshot: {} as SimulationResult['snapshot'],
    hazards: [],
});

describe('runTuningBot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('aggregates simulation results into a summary', async () => {
        vi.mocked(runHeadlessSimulation).mockImplementation(async ({ seed }) =>
            createResult(seed ?? 0, (seed ?? 0) * 100, (seed ?? 0) / 10, (seed ?? 0) * 2),
        );

        const result = await runTuningBot({
            runs: 3,
            round: 7,
            durationSec: 60,
        });

        expect(runHeadlessSimulation).toHaveBeenCalledTimes(4);
        expect(runHeadlessSimulation).toHaveBeenNthCalledWith(1, {
            mode: 'simulate',
            seed: 1,
            round: 7,
            durationSec: 60,
            cheats: undefined,
        });
        expect(runHeadlessSimulation).toHaveBeenNthCalledWith(2, {
            mode: 'simulate',
            seed: 2,
            round: 7,
            durationSec: 60,
            cheats: undefined,
        });
        expect(runHeadlessSimulation).toHaveBeenNthCalledWith(3, {
            mode: 'simulate',
            seed: 3,
            round: 7,
            durationSec: 60,
            cheats: undefined,
        });
        expect(runHeadlessSimulation).toHaveBeenNthCalledWith(4, {
            mode: 'simulate',
            seed: 1,
            round: 7,
            durationSec: 60,
            cheats: undefined,
        });
        expect(result.summary).toMatchObject({
            runCount: 3,
            averageScore: 200,
            bestScore: 300,
            averageBricksPerSecond: 0.2,
            averageLongestVolley: 4,
            averageBricksBroken: 60,
            averageLivesLost: 1,
            averageHazardContacts: 0,
            averagePortalTransports: 0,
            brickClearStdDev: 0,
            deterministicCheck: true,
        });
        expect(result.summary.hazardContactBreakdown).toEqual({
            'gravity-well': 0,
            'moving-bumper': 0,
            portal: 0,
        });
        expect(result.runs).toHaveLength(3);
    });

    it('uses the provided seed and cheat options', async () => {
        vi.mocked(runHeadlessSimulation).mockImplementation(async ({ seed }) =>
            createResult(seed ?? 0, 500, 0.8, 9),
        );

        await runTuningBot({
            runs: 2,
            round: 9,
            durationSec: 75,
            seed: 10,
            cheats: { forceReward: 'multi-ball' },
        });

        expect(runHeadlessSimulation).toHaveBeenCalledTimes(3);
        expect(runHeadlessSimulation).toHaveBeenNthCalledWith(1, {
            mode: 'simulate',
            seed: 10,
            round: 9,
            durationSec: 75,
            cheats: { forceReward: 'multi-ball' },
        });
        expect(runHeadlessSimulation).toHaveBeenNthCalledWith(2, {
            mode: 'simulate',
            seed: 11,
            round: 9,
            durationSec: 75,
            cheats: { forceReward: 'multi-ball' },
        });
        expect(runHeadlessSimulation).toHaveBeenNthCalledWith(3, {
            mode: 'simulate',
            seed: 10,
            round: 9,
            durationSec: 75,
            cheats: { forceReward: 'multi-ball' },
        });
    });

    it('clamps run count to the supported range', async () => {
        vi.mocked(runHeadlessSimulation).mockResolvedValue(createResult(0, 100, 0.5, 10));

        const result = await runTuningBot({
            runs: 999,
            round: 5,
            durationSec: 30,
        });

        expect(runHeadlessSimulation).toHaveBeenCalledTimes(51);
        expect(result.summary.runCount).toBe(50);
    });

    it('ensures at least one run when the value is invalid', async () => {
        vi.mocked(runHeadlessSimulation).mockResolvedValue(createResult(0, 80, 0.4, 6));

        const result = await runTuningBot({
            runs: -4,
            round: 2,
            durationSec: 45,
        });

        expect(runHeadlessSimulation).toHaveBeenCalledTimes(2);
        expect(result.summary.runCount).toBe(1);
    });

    it('treats non-finite run requests as a single simulation', async () => {
        vi.mocked(runHeadlessSimulation).mockResolvedValue(createResult(0, 70, 0.35, 5));

        const result = await runTuningBot({
            runs: Number.NaN,
            round: 4,
            durationSec: 20,
        });

        expect(runHeadlessSimulation).toHaveBeenCalledTimes(2);
        expect(result.summary.runCount).toBe(1);
    });
});
