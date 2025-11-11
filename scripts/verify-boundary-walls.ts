import { runHeadlessEngine, type HeadlessSimulationOptions } from 'cli/headless-engine';

/**
 * Verification script to ensure all 4 boundary walls exist for every loadout configuration.
 * This guards against the bug where certain loadouts caused the top wall to be missing.
 */

const fail = (message: string, details?: { expected?: unknown; actual?: unknown }) => {
    console.error(`[verify-boundary-walls] ${message}`);
    if (details?.expected !== undefined) {
        console.error(`[verify-boundary-walls] expected: ${JSON.stringify(details.expected, null, 2)}`);
    }
    if (details?.actual !== undefined) {
        console.error(`[verify-boundary-walls] actual: ${JSON.stringify(details.actual, null, 2)}`);
    }
    process.exit(1);
};

interface BoundaryWallCheck {
    readonly top: boolean;
    readonly right: boolean;
    readonly bottom: boolean;
    readonly left: boolean;
}

const main = async (): Promise<void> => {
    console.log('[verify-boundary-walls] Testing boundary wall existence across playfield configurations...');

    // Test different playfield dimensions and round configurations
    const testConfigurations = [
        { seed: 100, round: 1, durationMs: 100, label: 'Round 1' },
        { seed: 200, round: 5, durationMs: 100, label: 'Round 5' },
        { seed: 300, round: 10, durationMs: 100, label: 'Round 10' },
        { seed: 400, round: 15, durationMs: 100, label: 'Round 15' },
        { seed: 500, round: 20, durationMs: 100, label: 'Round 20' },
    ];

    let failureCount = 0;

    for (const config of testConfigurations) {
        console.log(`[verify-boundary-walls] Testing ${config.label} (seed: ${config.seed})...`);

        try {
            const options: HeadlessSimulationOptions = {
                seed: config.seed,
                round: config.round,
                durationMs: config.durationMs,
                telemetry: false,
            };

            const result = runHeadlessEngine(options);

            // Check physics snapshot for walls
            const { walls } = result.physics;
            const wallCheck: BoundaryWallCheck = {
                top: walls.top !== null,
                right: walls.right !== null,
                bottom: walls.bottom !== null,
                left: walls.left !== null,
            };

            if (!wallCheck.top) {
                console.error(`[verify-boundary-walls] FAIL: Missing top wall for ${config.label}`);
                failureCount++;
            }
            if (!wallCheck.right) {
                console.error(`[verify-boundary-walls] FAIL: Missing right wall for ${config.label}`);
                failureCount++;
            }
            if (!wallCheck.bottom) {
                console.error(`[verify-boundary-walls] FAIL: Missing bottom wall for ${config.label}`);
                failureCount++;
            }
            if (!wallCheck.left) {
                console.error(`[verify-boundary-walls] FAIL: Missing left wall for ${config.label}`);
                failureCount++;
            }

            if (wallCheck.top && wallCheck.right && wallCheck.bottom && wallCheck.left) {
                console.log(`[verify-boundary-walls] ✓ All 4 walls present for ${config.label}`);
                // Verify wall positions are sensible
                if (walls.top && walls.top.position.y >= 0) {
                    console.error(
                        `[verify-boundary-walls] WARN: Top wall position seems incorrect (y=${walls.top.position.y}), expected negative`,
                    );
                }
            } else {
                const missing = [];
                if (!wallCheck.top) {
                    missing.push('top');
                }
                if (!wallCheck.right) {
                    missing.push('right');
                }
                if (!wallCheck.bottom) {
                    missing.push('bottom');
                }
                if (!wallCheck.left) {
                    missing.push('left');
                }
                console.error(`[verify-boundary-walls] Missing walls: ${missing.join(', ')}`);
            }
        } catch (error) {
            console.error(`[verify-boundary-walls] ERROR running simulation for ${config.label}:`, error);
            failureCount++;
        }
    }

    if (failureCount > 0) {
        fail(
            `Found ${failureCount} wall validation failure(s) across ${testConfigurations.length} configurations`,
        );
    }

    console.log(
        `[verify-boundary-walls] ✓ All ${testConfigurations.length} configurations have complete boundary walls`,
    );
};

main().catch((error) => {
    fail(`unexpected error: ${(error as Error).message}`);
});
