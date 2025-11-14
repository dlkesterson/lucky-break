/**
 * Utilities for loading and replaying ML-trained agent trajectories in e2e tests.
 * Enables deterministic, high-performance gameplay for testing combos, level completion, etc.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * RL action space mapping (must match packages/ml-trainer/lucky_break_env.py)
 * 0: No-op (hold position)
 * 1: Move left
 * 2: Move right
 * 3: Launch ball
 * 4: Move left + hold
 * 5: Move right + launch
 */
export const RL_ACTIONS = {
    NOOP: 0,
    MOVE_LEFT: 1,
    MOVE_RIGHT: 2,
    LAUNCH: 3,
    LEFT_LAUNCH: 4,
    RIGHT_LAUNCH: 5,
} as const;

export type RLAction = typeof RL_ACTIONS[keyof typeof RL_ACTIONS];

export interface TrajectoryMetadata {
    readonly type: 'metadata';
    readonly seed: number;
    readonly round: number;
    readonly steps: number;
    readonly truncated: boolean;
}

export interface TrajectoryStep {
    readonly frame: number;
    readonly elapsed_ms: number;
    readonly action: RLAction;
    readonly reward: number;
    readonly done: boolean;
    readonly observation: {
        readonly frame: number;
        readonly timeMs: number;
        readonly ball: {
            readonly attached: boolean;
            readonly position: { x: number; y: number };
            readonly velocity: { x: number; y: number };
            readonly speed: number;
        };
        readonly paddle: {
            readonly position: { x: number; y: number };
            readonly targetX: number;
            readonly width: number;
            readonly velocityX: number;
        };
        readonly session: {
            readonly score: number;
            readonly livesRemaining: number;
            readonly bricksRemaining: number;
            readonly bricksTotal: number;
            readonly comboHeat: number;
            readonly volleyLength: number;
        };
        readonly hazards: unknown[];
    };
    readonly score: number;
    readonly lives_remaining: number;
    readonly bricks_remaining: number;
    readonly events: unknown[] | null;
}

export interface Trajectory {
    readonly metadata: TrajectoryMetadata;
    readonly steps: readonly TrajectoryStep[];
}

/**
 * Load a trajectory JSONL file from the ml-trainer package.
 * @param filename - Name of the trajectory file (e.g., 'trajectory_seed1337_ep0001.jsonl')
 * @returns Parsed trajectory with metadata and steps
 */
export function loadTrajectory(filename: string): Trajectory {
    const trajectoryDir = join(__dirname, '../../../../ml-trainer/trajectories');
    const filepath = join(trajectoryDir, filename);

    if (!existsSync(filepath)) {
        throw new Error(
            `Trajectory file not found: ${filepath}\n` +
            `Make sure to train an agent first using:\n` +
            `  python packages/ml-trainer/train_agent.py`
        );
    }

    const content = readFileSync(filepath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length === 0) {
        throw new Error(`Empty trajectory file: ${filename}`);
    }

    const metadata = JSON.parse(lines[0]) as TrajectoryMetadata;
    if (metadata.type !== 'metadata') {
        throw new Error(`First line must be metadata, got: ${metadata.type}`);
    }

    const steps: TrajectoryStep[] = [];
    for (let i = 1; i < lines.length; i++) {
        const step = JSON.parse(lines[i]) as TrajectoryStep;
        steps.push(step);
    }

    return { metadata, steps };
}

/**
 * Find the latest trajectory file for a given seed.
 * @param seed - Seed number to search for (default: 1337)
 * @returns Filename of the most recent trajectory, or null if none found
 */
export function findLatestTrajectory(seed: number = 1337): string | null {
    const trajectoryDir = join(__dirname, '../../../../ml-trainer/trajectories');

    if (!existsSync(trajectoryDir)) {
        return null;
    }

    const fs = require('fs');
    const files = fs.readdirSync(trajectoryDir) as string[];

    const pattern = new RegExp(`^trajectory_seed${seed}_ep\\d+\\.jsonl$`);
    const matching = files
        .filter((f: string) => pattern.test(f))
        .sort()
        .reverse(); // Latest episode first

    return matching.length > 0 ? matching[0] : null;
}

/**
 * Convert RL actions to paddle target coordinates for replay.
 * This approximates the agent's intent based on the action space.
 * 
 * @param step - Current trajectory step
 * @param playAreaWidth - Width of the play area (default: 800)
 * @param movementSpeed - How much to move paddle per action (default: 50)
 * @returns Target X coordinate for paddle
 */
export function actionToPaddleTarget(
    step: TrajectoryStep,
    playAreaWidth: number = 800,
    movementSpeed: number = 50,
): number {
    const currentX = step.observation.paddle.position.x;
    const action = step.action;

    switch (action) {
        case RL_ACTIONS.MOVE_LEFT:
        case RL_ACTIONS.LEFT_LAUNCH:
            return Math.max(0, currentX - movementSpeed);

        case RL_ACTIONS.MOVE_RIGHT:
        case RL_ACTIONS.RIGHT_LAUNCH:
            return Math.min(playAreaWidth, currentX + movementSpeed);

        case RL_ACTIONS.NOOP:
        case RL_ACTIONS.LAUNCH:
        default:
            return currentX;
    }
}

/**
 * Check if an action includes a launch command.
 */
export function shouldLaunch(action: RLAction): boolean {
    return action === RL_ACTIONS.LAUNCH ||
        action === RL_ACTIONS.LEFT_LAUNCH ||
        action === RL_ACTIONS.RIGHT_LAUNCH;
}

/**
 * Get summary statistics from a trajectory.
 */
export function summarizeTrajectory(trajectory: Trajectory) {
    const { metadata, steps } = trajectory;

    if (steps.length === 0) {
        return {
            seed: metadata.seed,
            round: metadata.round,
            totalSteps: 0,
            finalScore: 0,
            bricksDestroyed: 0,
            maxCombo: 0,
            totalReward: 0,
            completed: false,
        };
    }

    const lastStep = steps[steps.length - 1];
    const totalReward = steps.reduce((sum, step) => sum + step.reward, 0);
    const maxCombo = Math.max(...steps.map(s => s.observation.session.volleyLength));

    return {
        seed: metadata.seed,
        round: metadata.round,
        totalSteps: steps.length,
        finalScore: lastStep.score,
        bricksDestroyed: metadata.steps > 0
            ? (steps[0].observation.session.bricksTotal - lastStep.bricks_remaining)
            : 0,
        maxCombo,
        totalReward,
        completed: lastStep.done && lastStep.bricks_remaining === 0,
        truncated: metadata.truncated,
    };
}
