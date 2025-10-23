import { afterEach, describe, expect, it } from 'vitest';
import { createSimulateCommand, runHeadlessSimulation } from 'cli/simulate';
import { getRewardOverride, setRewardOverride } from 'game/rewards';

describe('simulate CLI command', () => {
    afterEach(() => {
        setRewardOverride(null);
    });

    it('produces deterministic results for the same seed', async () => {
        const input = {
            mode: 'simulate' as const,
            seed: 21,
            round: 2,
            durationSec: 90,
            options: {
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
            durationMs: expect.any(Number),
            frames: expect.any(Number),
            metrics: {
                bricksBroken: expect.any(Number),
                averageFps: expect.any(Number),
            },
            volleyStats: {
                longestVolley: expect.any(Number),
                averageImpactSpeed: expect.any(Number),
            },
            telemetry: {
                events: expect.any(Array),
            },
        });
        expect(output).toEqual(baseline);
        expect(output.telemetry?.events).toBeDefined();
        expect(output.telemetry?.events).toHaveLength(output.events);
    });

    it('restores reward overrides after forced reward simulations', async () => {
        setRewardOverride({ type: 'ghost-brick', persist: true });
        const result = await runHeadlessSimulation({
            mode: 'simulate',
            seed: 5,
            round: 1,
            durationSec: 30,
            cheats: { forceReward: 'multi-ball' },
        });

        expect(result.cheats?.forceReward).toBe('multi-ball');
        const override = getRewardOverride();
        expect(override?.type).toBe('ghost-brick');
        expect(override?.persist).toBe(true);
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
