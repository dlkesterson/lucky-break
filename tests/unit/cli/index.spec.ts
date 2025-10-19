import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cli/simulate', () => ({
    runHeadlessSimulation: vi.fn(),
}));

import { createCli } from 'cli/index';
import { runHeadlessSimulation, type SimulationResult } from 'cli/simulate';

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
        expect(errorSpy).toHaveBeenCalledWith(
            'Usage: lucky-break simulate --seed <number> --round <number> --duration <seconds>',
        );

        errorSpy.mockRestore();
    });

    it('runs simulation and prints result when command succeeds', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result: SimulationResult = {
            ok: true,
            sessionId: 'sim-24-r5',
            score: 1234,
            events: 42,
            durationMs: 90_000,
            volleyStats: { longestVolley: 12, averageSpeed: 7.5 },
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
});
