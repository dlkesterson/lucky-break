/**
 * Smoke test for the RL simulator JSON protocol.
 * Verifies basic reset/step/close commands work correctly.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';

interface SimulatorMessage {
    type: string;
    observation?: unknown;
    reward?: number;
    done?: boolean;
    info?: unknown;
}

const sendCommand = (proc: ReturnType<typeof spawn>, command: object): void => {
    const line = JSON.stringify(command);
    proc.stdin?.write(`${line}\n`);
};

const readMessage = (proc: ReturnType<typeof spawn>): Promise<SimulatorMessage> => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for simulator response'));
        }, 5000);

        const onData = (data: Buffer) => {
            clearTimeout(timeout);
            proc.stdout?.off('data', onData);
            try {
                const message = JSON.parse(data.toString()) as SimulatorMessage;
                resolve(message);
            } catch (error) {
                reject(error);
            }
        };

        proc.stdout?.once('data', onData);
    });
};

const testResetCommand = async (): Promise<void> => {
    console.log('Testing reset command...');

    const proc = spawn('tsx', ['src/index.ts', 'simulate-rl', '--seed', '42', '--round', '1', '--no-telemetry'], {
        cwd: join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
        // Read initial reset response
        const response = await readMessage(proc);
        if (response.type !== 'reset') {
            throw new Error(`Expected 'reset', got '${response.type}'`);
        }
        if (!response.observation) {
            throw new Error('Missing observation in reset response');
        }
        console.log('  ✓ Initial reset response valid');

        // Send explicit reset
        sendCommand(proc, { type: 'reset', seed: 123 });
        const resetResponse = await readMessage(proc);
        if (resetResponse.type !== 'reset') {
            throw new Error(`Expected 'reset', got '${resetResponse.type}'`);
        }
        console.log('  ✓ Explicit reset successful');
    } finally {
        sendCommand(proc, { type: 'close' });
        proc.kill();
    }
};

const testStepCommand = async (): Promise<void> => {
    console.log('Testing step command...');

    const proc = spawn('tsx', ['src/index.ts', 'simulate-rl', '--seed', '42', '--round', '1', '--no-telemetry'], {
        cwd: join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
        // Read initial reset
        await readMessage(proc);

        // Test all actions (0-5)
        for (let action = 0; action < 6; action++) {
            sendCommand(proc, { type: 'step', action });
            const response = await readMessage(proc);

            if (response.type !== 'step') {
                throw new Error(`Expected 'step', got '${response.type}'`);
            }
            if (!response.observation) {
                throw new Error('Missing observation in step response');
            }
            if (typeof response.reward !== 'number') {
                throw new Error('Reward must be a number');
            }
            if (typeof response.done !== 'boolean') {
                throw new Error('Done must be a boolean');
            }
            if (!response.info) {
                throw new Error('Missing info in step response');
            }
        }

        console.log('  ✓ All 6 actions executed successfully');
    } finally {
        sendCommand(proc, { type: 'close' });
        proc.kill();
    }
};

const main = async (): Promise<void> => {
    console.log('='.repeat(60));
    console.log('RL Simulator Protocol Smoke Tests (TypeScript)');
    console.log('='.repeat(60));

    const tests: Array<[string, () => Promise<void>]> = [
        ['Reset Command', testResetCommand],
        ['Step Command', testStepCommand],
    ];

    let passed = 0;
    let failed = 0;

    for (const [name, testFn] of tests) {
        try {
            console.log(`\n[${name}]`);
            await testFn();
            passed += 1;
        } catch (error) {
            console.log(`  ✗ FAILED: ${(error as Error).message}`);
            failed += 1;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);
};

main().catch((error: unknown) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
