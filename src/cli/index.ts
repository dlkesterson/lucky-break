import { runHeadlessSimulation } from './simulate';

export interface CliCommand {
    readonly execute: () => Promise<number>;
}

const parseArgs = (args: string[]): { seed?: number; round?: number; durationSec?: number } => {
    const options: { seed?: number; round?: number; durationSec?: number } = {};
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

        const options = parseArgs(args.slice(1));
        const input = {
            mode: 'simulate' as const,
            ...options,
        };

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
