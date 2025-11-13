import readline from 'node:readline';
import { stderr as consoleError, stdout as consoleOut } from 'node:process';
import { RLSimulator, type RLSimulatorOptions, type RLActionId } from './rl-simulator';

type RLInteractiveOptions = RLSimulatorOptions;

type IncomingCommand =
    | { readonly type: 'step'; readonly action: number }
    | { readonly type: 'reset'; readonly seed?: number }
    | { readonly type: 'close' };

const isActionId = (value: number): value is RLActionId => Number.isInteger(value) && value >= 0 && value <= 5;

const writeMessage = (payload: unknown): void => {
    consoleOut.write(`${JSON.stringify(payload)}\n`);
};

const writeError = (message: string): void => {
    consoleError.write(`${message}\n`);
};

export const runRLInteractiveCli = async (options?: RLInteractiveOptions): Promise<void> => {
    let simulator: RLSimulator;
    try {
        simulator = new RLSimulator({ ...options, telemetry: options?.telemetry ?? true });
    } catch (error) {
        writeError(`Failed to initialise simulator: ${(error as Error).message}`);
        return;
    }
    let episodeDone = false;

    const emitReset = (seed?: number) => {
        try {
            const observation = simulator.reset(seed);
            episodeDone = false;
            writeMessage({ type: 'reset', observation });
        } catch (error) {
            writeError(`Reset failed: ${(error as Error).message}`);
        }
    };

    emitReset(options?.seed);

    const rl = readline.createInterface({
        input: process.stdin,
        crlfDelay: Infinity,
        terminal: false,
    });

    await new Promise<void>((resolve) => {
        rl.on('line', (line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return;
            }

            let command: IncomingCommand;
            try {
                command = JSON.parse(trimmed) as IncomingCommand;
            } catch (error) {
                writeError(`Invalid JSON command: ${(error as Error).message}`);
                return;
            }

            if (command.type === 'reset') {
                emitReset(command.seed ?? options?.seed);
                return;
            }

            if (command.type === 'close') {
                rl.close();
                return;
            }

            if (command.type === 'step') {
                if (!isActionId(command.action)) {
                    writeError(`Invalid action id: ${command.action}`);
                    return;
                }

                if (episodeDone) {
                    writeError('Episode complete. Issue a reset command before stepping again.');
                    return;
                }

                try {
                    const result = simulator.step(command.action);
                    episodeDone = result.done;
                    const { observation, reward, done, info } = result;
                    const serialized = {
                        type: 'step',
                        observation,
                        reward,
                        done,
                        info: {
                            frame: info.frame,
                            elapsedMs: info.elapsedMs,
                            score: info.score,
                            livesRemaining: info.livesRemaining,
                            bricksRemaining: info.bricksRemaining,
                            events: info.events,
                        },
                    };
                    writeMessage(serialized);
                } catch (error) {
                    writeError(`Step failed: ${(error as Error).message}`);
                }
                return;
            }

            writeError(`Unknown command type: ${(command as { readonly type?: string }).type ?? 'unknown'}`);
        });

        rl.once('close', () => {
            resolve();
        });
    });

    simulator.close();
};
