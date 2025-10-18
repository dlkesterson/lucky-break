import { createEventBus, type EventEnvelope, type LuckyBreakEventBus, type LuckyBreakEventName } from 'app/events';
import { createGameSessionManager } from 'app/state';

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

export interface SimulationInput {
    readonly mode: 'simulate';
    readonly seed?: number;
    readonly round?: number;
    readonly durationSec?: number;
    readonly options?: SimulationOptions;
}

export interface SimulationResult {
    readonly ok: true;
    readonly sessionId: string;
    readonly score: number;
    readonly events: number;
    readonly volleyStats: {
        readonly longestVolley: number;
        readonly averageSpeed: number;
    };
    readonly durationMs: number;
}

interface SimulationMetrics {
    longestVolley: number;
    currentVolley: number;
    speedTotal: number;
}

const DEFAULT_SEED = 1;
const DEFAULT_ROUND = 1;
const DEFAULT_DURATION_SEC = 180;
const DEFAULT_BRICK_TOTAL = 18;
const BRICK_TYPES = ['standard', 'multi-hit', 'power-up'] as const;

const createSeededRandom = (seed: number): (() => number) => {
    let state = (seed >>> 0) || 1;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
};

const captureEvents = (eventNames: readonly LuckyBreakEventName[]) => {
    const events: EventEnvelope<LuckyBreakEventName>[] = [];
    return {
        events,
        attach(bus: LuckyBreakEventBus) {
            for (const name of eventNames) {
                bus.subscribe(name, (event) => {
                    events.push(event);
                });
            }
        },
    };
};

const updateMetrics = (metrics: SimulationMetrics, velocity: number) => {
    metrics.currentVolley += 1;
    if (metrics.currentVolley > metrics.longestVolley) {
        metrics.longestVolley = metrics.currentVolley;
    }
    metrics.speedTotal += velocity;
};

const finalizeMetrics = (metrics: SimulationMetrics, brickCount: number) => {
    const averageSpeed = brickCount > 0 ? metrics.speedTotal / brickCount : 0;
    return {
        longestVolley: metrics.longestVolley,
        averageSpeed: Number(averageSpeed.toFixed(2)),
    };
};

export const runHeadlessSimulation = (input: SimulationInput): Promise<SimulationResult> => {
    const seed = typeof input.seed === 'number' ? input.seed : DEFAULT_SEED;
    const round = typeof input.round === 'number' ? input.round : DEFAULT_ROUND;
    const durationSec = typeof input.durationSec === 'number' ? Math.max(1, input.durationSec) : DEFAULT_DURATION_SEC;
    const sessionId = `sim-${seed}-r${round}`;
    const rng = createSeededRandom(seed + round);

    const breakableBricks = DEFAULT_BRICK_TOTAL + Math.floor(rng() * 12);
    const durationMs = durationSec * 1000;
    const stepMs = durationMs / Math.max(1, breakableBricks);

    let currentTime = 0;
    const bus = createEventBus();
    const collector = captureEvents(['BrickBreak', 'RoundCompleted']);
    collector.attach(bus);

    const manager = createGameSessionManager({
        sessionId,
        now: () => currentTime,
        eventBus: bus,
    });

    manager.startRound({ breakableBricks });

    const metrics: SimulationMetrics = {
        longestVolley: 0,
        currentVolley: 0,
        speedTotal: 0,
    };

    for (let index = 0; index < breakableBricks; index += 1) {
        currentTime += stepMs;
        const velocity = 6 + rng() * 6;
        const points = 100 + Math.round(rng() * 200);
        const row = Math.floor(rng() * 8);
        const col = Math.floor(rng() * 12);
        const brickType = BRICK_TYPES[Math.floor(rng() * BRICK_TYPES.length)];

        manager.recordBrickBreak({
            points,
            event: {
                row,
                col,
                velocity,
                brickType,
            },
        });

        updateMetrics(metrics, velocity);
    }

    currentTime = durationMs;
    manager.completeRound();

    const snapshot = manager.snapshot();
    const volleyStats = finalizeMetrics(metrics, breakableBricks);

    return Promise.resolve({
        ok: true,
        sessionId,
        score: snapshot.score,
        events: collector.events.length,
        volleyStats,
        durationMs,
    });
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

        await logToStderr(io, `Running simulate command for session seed ${parsed.seed ?? DEFAULT_SEED}.`);

        const result = await runHeadlessSimulation(parsed);
        await io.writeStdout(JSON.stringify(result));

        return 0;
    };

    return {
        execute,
    };
};
