#!/usr/bin/env tsx
/**
 * Convert ML-trainer trajectory JSONL files to optimized formats for e2e testing.
 * 
 * Usage:
 *   pnpm tsx scripts/convert-trajectory.ts [trajectory-file] [--format=json|replay]
 * 
 * Formats:
 *   - json: Compact JSON array for easy import in tests
 *   - replay: Convert to replay recording format for visual playback
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';

interface TrajectoryMetadata {
    type: 'metadata';
    seed: number;
    round: number;
    steps: number;
    truncated: boolean;
}

interface TrajectoryStep {
    frame: number;
    elapsed_ms: number;
    action: number;
    reward: number;
    done: boolean;
    observation: {
        paddle: {
            position: { x: number; y: number };
            targetX: number;
        };
        ball: {
            attached: boolean;
            position: { x: number; y: number };
        };
        session: {
            score: number;
            bricksRemaining: number;
            comboHeat: number;
        };
    };
    score: number;
    bricks_remaining: number;
}

interface CompactStep {
    t: number;        // time in ms
    a: number;        // action
    px: number;       // paddle x
    bx?: number;      // ball x (if detached)
    by?: number;      // ball y (if detached)
    s?: number;       // score (only if changed)
    b?: number;       // bricks remaining (only if changed)
}

function parseArgs() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Convert ML-trainer trajectory JSONL to e2e test formats

Usage:
  pnpm tsx scripts/convert-trajectory.ts <trajectory-file> [options]

Options:
  --format=json     Compact JSON format (default)
  --format=replay   Replay recording format
  --output=<file>   Output file (default: auto-generated)

Examples:
  pnpm tsx scripts/convert-trajectory.ts packages/ml-trainer/trajectories/trajectory_seed1337_ep0001.jsonl
  pnpm tsx scripts/convert-trajectory.ts trajectory.jsonl --format=replay --output=replay.json
        `);
        process.exit(0);
    }

    const filepath = args.find(a => !a.startsWith('--'));
    if (!filepath) {
        console.error('Error: No trajectory file specified');
        process.exit(1);
    }

    const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || 'json';
    const output = args.find(a => a.startsWith('--output='))?.split('=')[1];

    return { filepath, format, output };
}

function loadTrajectory(filepath: string): { metadata: TrajectoryMetadata; steps: TrajectoryStep[] } {
    if (!existsSync(filepath)) {
        throw new Error(`File not found: ${filepath}`);
    }

    const content = readFileSync(filepath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length === 0) {
        throw new Error('Empty trajectory file');
    }

    const metadata = JSON.parse(lines[0]) as TrajectoryMetadata;
    if (metadata.type !== 'metadata') {
        throw new Error(`Expected metadata line, got: ${metadata.type}`);
    }

    const steps: TrajectoryStep[] = [];
    for (let i = 1; i < lines.length; i++) {
        steps.push(JSON.parse(lines[i]) as TrajectoryStep);
    }

    return { metadata, steps };
}

function convertToCompactJSON(
    metadata: TrajectoryMetadata,
    steps: TrajectoryStep[]
): { seed: number; round: number; steps: CompactStep[] } {
    let lastScore = 0;
    let lastBricks = steps[0]?.bricks_remaining ?? 0;

    const compactSteps: CompactStep[] = steps.map(step => {
        const compact: CompactStep = {
            t: step.elapsed_ms,
            a: step.action,
            px: Math.round(step.observation.paddle.position.x),
        };

        // Include ball position if detached
        if (!step.observation.ball.attached) {
            compact.bx = Math.round(step.observation.ball.position.x);
            compact.by = Math.round(step.observation.ball.position.y);
        }

        // Include score if changed
        if (step.score !== lastScore) {
            compact.s = step.score;
            lastScore = step.score;
        }

        // Include bricks if changed
        if (step.bricks_remaining !== lastBricks) {
            compact.b = step.bricks_remaining;
            lastBricks = step.bricks_remaining;
        }

        return compact;
    });

    return {
        seed: metadata.seed,
        round: metadata.round,
        steps: compactSteps,
    };
}

function convertToReplay(
    metadata: TrajectoryMetadata,
    steps: TrajectoryStep[]
): object {
    const events: Array<{ type: string; time: number; position?: { x: number; y: number } }> = [];
    let lastPaddleX: number | null = null;
    let lastWasAttached = true;

    for (const step of steps) {
        const timeSeconds = step.elapsed_ms / 1000;
        const paddleX = step.observation.paddle.position.x;
        const paddleY = step.observation.paddle.position.y;
        const ballAttached = step.observation.ball.attached;

        // Record paddle movements (with threshold to reduce noise)
        if (lastPaddleX === null || Math.abs(paddleX - lastPaddleX) > 5) {
            events.push({
                type: 'paddle-target',
                time: timeSeconds,
                position: { x: paddleX, y: paddleY },
            });
            lastPaddleX = paddleX;
        }

        // Detect launch
        if (lastWasAttached && !ballAttached) {
            events.push({
                type: 'launch',
                time: timeSeconds,
            });
        }

        lastWasAttached = ballAttached;
    }

    const finalTime = steps.length > 0 ? steps[steps.length - 1].elapsed_ms / 1000 : 0;

    return {
        version: 1,
        seed: metadata.seed,
        durationSeconds: finalTime,
        events,
    };
}

function main() {
    const { filepath, format, output } = parseArgs();

    console.log(`Loading trajectory: ${filepath}`);
    const { metadata, steps } = loadTrajectory(filepath);

    console.log(`  Seed: ${metadata.seed}`);
    console.log(`  Round: ${metadata.round}`);
    console.log(`  Steps: ${steps.length}`);
    console.log(`  Truncated: ${metadata.truncated}`);

    let converted: object;
    let defaultExt: string;

    if (format === 'replay') {
        console.log('\nConverting to replay format...');
        converted = convertToReplay(metadata, steps);
        defaultExt = 'replay.json';
    } else {
        console.log('\nConverting to compact JSON format...');
        converted = convertToCompactJSON(metadata, steps);
        defaultExt = 'compact.json';
    }

    // Determine output path
    const outputPath = output || join(
        dirname(filepath),
        basename(filepath, '.jsonl') + '.' + defaultExt
    );

    // Write output
    writeFileSync(outputPath, JSON.stringify(converted, null, 2), 'utf-8');

    console.log(`\n✓ Conversion complete!`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Size: ${(JSON.stringify(converted).length / 1024).toFixed(2)} KB`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
