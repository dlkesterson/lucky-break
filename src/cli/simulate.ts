import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import type { ReplayRecording } from 'app/replay-buffer';
import { runHeadlessEngine, type HeadlessSimulationResult } from './headless-engine';
import type { EventEnvelope, LuckyBreakEventName } from 'app/events';
import { getRewardOverride, setRewardOverride, type RewardType } from 'game/rewards';

export interface SimulateCommandIO {
    readonly readStdin: () => Promise<string>;
    readonly writeStdout: (output: string) => Promise<void>;
    readonly writeStderr?: (message: string) => Promise<void> | void;
}

export interface SimulationOptions {
    readonly audio?: boolean;
    readonly visual?: boolean;
    readonly telemetry?: boolean;
}

export interface SimulationCheatOptions {
    readonly forceReward?: RewardType;
}

export interface SimulationInput {
    readonly mode: 'simulate';
    readonly seed?: number;
    readonly round?: number;
    readonly durationSec?: number;
    readonly options?: SimulationOptions;
    readonly replayPath?: string;
    readonly replay?: ReplayRecording;
    readonly cheats?: SimulationCheatOptions;
}

export interface SimulationResult {
    readonly ok: true;
    readonly sessionId: string;
    readonly seed: number;
    readonly round: number;
    readonly score: number;
    readonly durationMs: number;
    readonly frames: number;
    readonly events: number;
    readonly metrics: HeadlessSimulationResult['metrics'];
    readonly volleyStats: HeadlessSimulationResult['volley'];
    readonly snapshot: HeadlessSimulationResult['snapshot'];
    readonly hazards: HeadlessSimulationResult['hazards'];
    readonly telemetry?: {
        readonly events: readonly EventEnvelope<LuckyBreakEventName>[];
    };
    readonly cheats?: {
        readonly forceReward?: RewardType | null;
    };
}

const DEFAULT_SEED = 1;
const DEFAULT_ROUND = 1;
const DEFAULT_DURATION_SEC = 180;

const resolveReplay = async (input: SimulationInput): Promise<ReplayRecording | undefined> => {
    if (input.replay) {
        return input.replay;
    }

    if (!input.replayPath) {
        return undefined;
    }

    const filePath = resolvePath(process.cwd(), input.replayPath);
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as ReplayRecording;
};

const mapResult = (
    source: HeadlessSimulationResult,
    telemetryRequested: boolean,
    cheats?: SimulationCheatOptions,
): SimulationResult => ({
    ok: true,
    sessionId: source.sessionId,
    seed: source.seed,
    round: source.round,
    score: source.score,
    durationMs: source.durationMs,
    frames: source.frames,
    events: source.events.length,
    metrics: source.metrics,
    volleyStats: source.volley,
    snapshot: source.snapshot,
    hazards: source.hazards,
    telemetry: telemetryRequested
        ? {
            events: source.events,
        }
        : undefined,
    cheats: cheats?.forceReward ? { forceReward: cheats.forceReward } : undefined,
});

export const runHeadlessSimulation = async (input: SimulationInput): Promise<SimulationResult> => {
    const seed = typeof input.seed === 'number' ? input.seed : DEFAULT_SEED;
    const round = typeof input.round === 'number' ? input.round : DEFAULT_ROUND;
    const durationSec = typeof input.durationSec === 'number' ? Math.max(1, input.durationSec) : DEFAULT_DURATION_SEC;
    const telemetryRequested = input.options?.telemetry ?? false;
    const cheatOptions = input.cheats;
    const forcedReward = cheatOptions?.forceReward;
    const previousOverride = forcedReward ? getRewardOverride() : null;

    const replay = await resolveReplay(input).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to load replay: ${message}`);
    });

    if (forcedReward) {
        setRewardOverride({ type: forcedReward, persist: true });
    }

    try {
        const result = runHeadlessEngine({
            seed,
            round,
            durationMs: durationSec * 1000,
            telemetry: telemetryRequested,
            replay,
        });

        return mapResult(result, telemetryRequested, cheatOptions);
    } finally {
        if (forcedReward) {
            setRewardOverride(previousOverride);
        }
    }
};

const logToStderr = async (io: SimulateCommandIO, message: string) => {
    await io.writeStderr?.(message);
};

export interface SimulateCommand {
    readonly execute: () => Promise<number>;
}

export const createSimulateCommand = (io: SimulateCommandIO): SimulateCommand => {
    const execute = async (): Promise<number> => {
        let raw: string;

        try {
            raw = await io.readStdin();
        } catch (error) {
            await logToStderr(io, `Failed to read simulation input: ${(error as Error).message}`);
            return 1;
        }

        let parsed: SimulationInput;
        try {
            parsed = JSON.parse(raw) as SimulationInput;
        } catch {
            await logToStderr(io, 'Failed to read simulation input: invalid JSON payload');
            return 1;
        }

        if (parsed?.mode !== 'simulate') {
            await logToStderr(io, 'Simulation command requires a payload with "mode": "simulate".');
            return 1;
        }

        await logToStderr(io, `Running simulate command for seed ${parsed.seed ?? DEFAULT_SEED} round ${parsed.round ?? DEFAULT_ROUND}.`);

        try {
            const result = await runHeadlessSimulation(parsed);
            await io.writeStdout(JSON.stringify(result));
            return 0;
        } catch (error) {
            await logToStderr(io, `Simulation failed: ${(error as Error).message}`);
            return 1;
        }
    };

    return {
        execute,
    };
};
