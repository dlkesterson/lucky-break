import { runHeadlessSimulation } from './simulate';

export interface CliCommand {
    readonly execute: () => Promise<number>;
}

interface ParsedOptions {
    seed?: number;
    round?: number;
    durationSec?: number;
    replayPath?: string;
    telemetry?: boolean;
}

const parseArgs = (args: string[]): ParsedOptions => {
    const options: ParsedOptions = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--seed' && i + 1 < args.length) {
            options.seed = parseInt(args[i + 1], 10);
            i++;
        } else if (arg === '--round' && i + 1 < args.length) {
            options.round = parseInt(args[i + 1], 10);
            i++;
        } else if (arg === '--duration' && i + 1 < args.length) {
            options.durationSec = parseInt(args[i + 1], 10);
            i++;
        } else if (arg === '--replay' && i + 1 < args.length) {
            options.replayPath = args[i + 1];
            i++;
        } else if (arg === '--telemetry') {
            options.telemetry = true;
        }
    }
    return options;
};

export function createCli(): CliCommand {
    const execute = async (): Promise<number> => {
        const args = process.argv.slice(2);
        if (args.length === 0 || args[0] !== 'simulate') {
            console.error('Usage: lucky-break simulate --seed <number> --round <number> --duration <seconds>');
            return 1;
        }

        const parsed = parseArgs(args.slice(1));
        const { telemetry, replayPath, ...rest } = parsed;
        const input = {
            mode: 'simulate' as const,
            ...rest,
            options: telemetry ? { telemetry: true } : undefined,
            replayPath,
        };

        if (!telemetry) {
            delete (input as { options?: { telemetry: boolean } }).options;
        }

        if (!replayPath) {
            delete (input as { replayPath?: string }).replayPath;
        }

        try {
            const result = await runHeadlessSimulation(input);
            console.log(JSON.stringify(result));
            return 0;
        } catch (error) {
            console.error(`Simulation failed: ${(error as Error).message}`);
            return 1;
        }
    };

    return {
        execute,
    };
}
