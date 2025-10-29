import { describe, expect, it } from 'vitest';
import { runTuningBot } from 'cli/tuning-bot';

describe('tuning bot fairness metrics', () => {
    it('captures hazard exposure and deterministic parity in headless runs', async () => {
        const result = await runTuningBot({
            runs: 2,
            round: 16,
            durationSec: 45,
        });

        expect(result.summary.runCount).toBe(2);
        expect(result.summary.averageBricksBroken).toBeGreaterThan(0);
        expect(result.summary.averageLivesLost).toBeGreaterThanOrEqual(0);
        expect(result.summary.averageHazardContacts).toBeGreaterThanOrEqual(0);
        expect(result.summary.hazardContactBreakdown).toEqual({
            'gravity-well': expect.any(Number),
            'moving-bumper': expect.any(Number),
            portal: expect.any(Number),
        });
        expect(result.summary.averagePortalTransports).toBeGreaterThanOrEqual(0);
        expect(result.summary.brickClearStdDev).toBeGreaterThanOrEqual(0);
        expect(result.summary.deterministicCheck).toBe(true);

        const [firstRun] = result.runs;
        expect(firstRun?.hazards.length ?? 0).toBeGreaterThan(0);
        expect(firstRun?.metrics.hazardContactsByType).toMatchObject({
            'gravity-well': expect.any(Number),
            'moving-bumper': expect.any(Number),
            portal: expect.any(Number),
        });
    });
});
