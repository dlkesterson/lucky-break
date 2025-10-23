import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cli/simulate', () => ({
    runHeadlessSimulation: vi.fn(),
}));

vi.mock('cli/tuning-bot', () => ({
    runTuningBot: vi.fn(),
}));

import { createCli } from 'cli/index';
import { runHeadlessSimulation, type SimulationResult } from 'cli/simulate';
import { runTuningBot, type TuningBotResult } from 'cli/tuning-bot';

const originalArgv = [...process.argv];

const setArgv = (...args: string[]) => {
    process.argv = ['node', 'lucky-break', ...args];
};

beforeEach(() => {
    vi.clearAllMocks();
    process.argv = [...originalArgv];
});

afterEach(() => {
    process.argv = [...originalArgv];
});

describe('createCli', () => {
    it('returns usage help for missing simulate command', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        setArgv();

        const cli = createCli();
        const exitCode = await cli.execute();

        expect(exitCode).toBe(1);
        expect(runHeadlessSimulation).not.toHaveBeenCalled();
        expect(runTuningBot).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith('Usage: lucky-break <simulate|tune> [options]');

        errorSpy.mockRestore();
    });

    it('runs simulation and prints result when command succeeds', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result: SimulationResult = {
            ok: true,
            sessionId: 'sim-24-r5',
            seed: 24,
            round: 5,
            score: 1234,
            durationMs: 90_000,
            frames: 10_800,
            events: 42,
            metrics: {
                bricksBroken: 60,
                paddleHits: 30,
                wallHits: 15,
                livesLost: 1,
                averageFps: 120,
                bricksPerSecond: 0.5,
            },
            volleyStats: { longestVolley: 12, averageImpactSpeed: 7.5 },
            snapshot: {} as SimulationResult['snapshot'],
        };
        vi.mocked(runHeadlessSimulation).mockResolvedValue(result);
        setArgv('simulate', '--seed', '24', '--round', '5', '--duration', '90');

        const cli = createCli();
        const exitCode = await cli.execute();

        expect(exitCode).toBe(0);
        expect(runHeadlessSimulation).toHaveBeenCalledWith({
            mode: 'simulate',
            seed: 24,
            round: 5,
            durationSec: 90,
        });
        expect(logSpy).toHaveBeenCalledWith(JSON.stringify(result));
        expect(errorSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('returns error code when simulation throws', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(runHeadlessSimulation).mockRejectedValue(new Error('boom'));
        setArgv('simulate');

        const cli = createCli();
        const exitCode = await cli.execute();

        expect(exitCode).toBe(1);
        expect(runHeadlessSimulation).toHaveBeenCalledWith({ mode: 'simulate' });
        expect(errorSpy).toHaveBeenCalledWith('Simulation failed: boom');
        expect(logSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('runs tuning bot when tune command is provided', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result: TuningBotResult = {
            summary: {
                runCount: 2,
                averageScore: 1500,
                bestScore: 2000,
                averageBricksPerSecond: 0.55,
                averageLongestVolley: 18,
            },
            runs: [],
        };
        vi.mocked(runTuningBot).mockResolvedValue(result);
        setArgv('tune', '--runs', '2', '--round', '3', '--duration', '60', '--force-reward', 'multi-ball');

        const cli = createCli();
        const exitCode = await cli.execute();

        expect(exitCode).toBe(0);
        expect(runTuningBot).toHaveBeenCalledWith({
            runs: 2,
            round: 3,
            durationSec: 60,
            seed: undefined,
            cheats: { forceReward: 'multi-ball' },
        });
        expect(logSpy).toHaveBeenCalledWith(JSON.stringify(result));
        expect(errorSpy).not.toHaveBeenCalled();

        logSpy.mockRestore();
        errorSpy.mockRestore();
    });
});
