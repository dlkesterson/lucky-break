import { describe, expect, it } from 'vitest';
import { createSimulateCommand, runHeadlessSimulation } from 'cli/simulate';

describe('simulate CLI command', () => {
    it('produces deterministic results for the same seed', async () => {
        const input = {
            mode: 'simulate' as const,
            seed: 21,
            round: 2,
            durationSec: 90,
            options: {
                audio: false,
                visual: false,
                telemetry: true,
            },
        };

        const first = await runHeadlessSimulation(input);
        const second = await runHeadlessSimulation(input);

        expect(second).toEqual(first);
    });

    it('writes simulation summary to stdout and returns zero exit code', async () => {
        const writes: string[] = [];
        const errors: string[] = [];
        const input = {
            mode: 'simulate' as const,
            seed: 7,
            round: 1,
            durationSec: 120,
            options: {
                audio: false,
                visual: false,
                telemetry: true,
            },
        };

        const command = createSimulateCommand({
            readStdin: async () => JSON.stringify(input),
            writeStdout: async (value: string) => {
                writes.push(value);
            },
            writeStderr: async (value: string) => {
                errors.push(value);
            },
        });

        const exitCode = await command.execute();

        expect(exitCode).toBe(0);
        expect(errors[0]).toContain('simulate');
        expect(writes).toHaveLength(1);
        const output = JSON.parse(writes[0]);
        const baseline = await runHeadlessSimulation(input);

        expect(output).toMatchObject({
            ok: true,
            sessionId: 'sim-7-r1',
            events: expect.any(Number),
            score: expect.any(Number),
            volleyStats: {
                longestVolley: expect.any(Number),
                averageSpeed: expect.any(Number),
            },
        });
        expect(output).toEqual(baseline);
    });

    it('returns non-zero exit code and logs an error for invalid input', async () => {
        const writes: string[] = [];
        const errors: string[] = [];

        const command = createSimulateCommand({
            readStdin: async () => 'not-json',
            writeStdout: async (value: string) => {
                writes.push(value);
            },
            writeStderr: async (value: string) => {
                errors.push(value);
            },
        });

        const exitCode = await command.execute();

        expect(exitCode).toBe(1);
        expect(writes).toHaveLength(0);
        expect(errors[0]).toContain('Failed to read simulation input');
    });
});
