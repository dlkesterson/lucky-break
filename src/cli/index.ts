import { runHeadlessSimulation, type SimulationCheatOptions } from './simulate';
import { runTuningBot } from './tuning-bot';
import type { RewardType } from 'game/rewards';

export interface CliCommand {
    readonly execute: () => Promise<number>;
}

interface ParsedSimulateOptions {
    seed?: number;
    round?: number;
    durationSec?: number;
    replayPath?: string;
    telemetry?: boolean;
    forceReward?: RewardType;
}

interface ParsedTuneOptions {
    runs: number;
    round: number;
    durationSec: number;
    seed?: number;
    forceReward?: RewardType;
}

const REWARD_TYPES: readonly RewardType[] = [
    'sticky-paddle',
    'double-points',
    'wide-paddle',
    'multi-ball',
    'slow-time',
    'ghost-brick',
    'laser-paddle',
];

const parseRewardType = (value: string | undefined): RewardType | undefined => {
    if (!value) {
        return undefined;
    }
    const candidate = value as RewardType;
    return REWARD_TYPES.includes(candidate) ? candidate : undefined;
};

const parseSimulateArgs = (args: string[]): ParsedSimulateOptions => {
    const options: ParsedSimulateOptions = {};
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
        } else if (arg === '--force-reward' && i + 1 < args.length) {
            const reward = parseRewardType(args[i + 1]);
            if (reward) {
                options.forceReward = reward;
            }
            i++;
        }
    }
    return options;
};

const parseTuneArgs = (args: string[]): ParsedTuneOptions => {
    let runs = 5;
    let round = 1;
    let durationSec = 180;
    let seed: number | undefined;
    let forceReward: RewardType | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--runs' && i + 1 < args.length) {
            runs = parseInt(args[i + 1], 10);
            i++;
        } else if (arg === '--round' && i + 1 < args.length) {
            round = parseInt(args[i + 1], 10);
            i++;
        } else if (arg === '--duration' && i + 1 < args.length) {
            durationSec = parseInt(args[i + 1], 10);
            i++;
        } else if (arg === '--seed' && i + 1 < args.length) {
            seed = parseInt(args[i + 1], 10);
            i++;
        } else if (arg === '--force-reward' && i + 1 < args.length) {
            const reward = parseRewardType(args[i + 1]);
            if (reward) {
                forceReward = reward;
            }
            i++;
        }
    }

    return {
        runs,
        round,
        durationSec,
        seed,
        forceReward,
    } satisfies ParsedTuneOptions;
};

export function createCli(): CliCommand {
    const execute = async (): Promise<number> => {
        const args = process.argv.slice(2);
        if (args.length === 0) {
            console.error('Usage: lucky-break <simulate|tune> [options]');
            return 1;
        }

        const command = args[0];
        const restArgs = args.slice(1);

        if (command === 'simulate') {
            const parsed = parseSimulateArgs(restArgs);
            const { telemetry, replayPath, forceReward, ...rest } = parsed;
            const cheats: SimulationCheatOptions | undefined = forceReward ? { forceReward } : undefined;
            const input = {
                mode: 'simulate' as const,
                ...rest,
                ...(telemetry ? { options: { telemetry: true } } : {}),
                ...(replayPath ? { replayPath } : {}),
                ...(cheats ? { cheats } : {}),
            } satisfies Parameters<typeof runHeadlessSimulation>[0];

            try {
                const result = await runHeadlessSimulation(input);
                console.log(JSON.stringify(result));
                return 0;
            } catch (error) {
                console.error(`Simulation failed: ${(error as Error).message}`);
                return 1;
            }
        }

        if (command === 'tune') {
            const parsed = parseTuneArgs(restArgs);
            const cheats: SimulationCheatOptions | undefined = parsed.forceReward ? { forceReward: parsed.forceReward } : undefined;
            try {
                const result = await runTuningBot({
                    runs: parsed.runs,
                    round: parsed.round,
                    durationSec: parsed.durationSec,
                    seed: parsed.seed,
                    cheats,
                });
                console.log(JSON.stringify(result));
                return 0;
            } catch (error) {
                console.error(`Tuning bot failed: ${(error as Error).message}`);
                return 1;
            }
        }

        console.error('Usage: lucky-break <simulate|tune> [options]');
        return 1;
    };

    return {
        execute,
    };
}
